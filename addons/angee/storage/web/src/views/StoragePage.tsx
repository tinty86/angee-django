import { useCallback, useMemo, useRef, type ReactElement } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";

import {
  Button,
  buttonVariants,
  ControlBand,
  EmptyState,
  formatSize,
  Glyph,
  LoadingPanel,
  PreviewPane,
  RecordPager,
  RelationPicker,
  recordPath,
  SelectionBarAction,
  SurfaceHeader,
  TreeView,
  useBreadcrumbLeafLabel,
  useChatterContent,
  useConfirm,
  usePrimaryPane,
  useScopedTreeExplorer,
  useAuthoredQuery,
  type ChatterTab,
  type FieldDescriptor,
  type PreviewFile,
  type RecordNavigation,
} from "@angee/ui";

import {
  StorageBackends,
  StorageDrives,
  StorageFiles,
  StorageFolders,
  type StorageDrive,
  type StorageFile,
} from "../data/documents";
import {
  ALL_SCOPE,
  STORAGE_FILE_DND,
  TRASH_SCOPE,
  fileById,
  fileRows,
  folderTreeRows,
  type FileDragData,
  type StorageFileRow,
  type StorageTreeRow,
} from "../data/file-rows";
import { useFileActions } from "../data/use-file-actions";
import { useFolderActions } from "../data/use-folder-actions";
import { useStorageUpload } from "../data/use-upload";
import { FileBrowserContent } from "./FileBrowserContent";
import { FileDetail } from "./FileDetail";
import { NewFolderControl } from "./NewFolderControl";
import { SelectedFolderControl } from "./SelectedFolderControl";
import { useStorageT } from "../i18n";

// One safety-capped read each of drives/folders/files; the browser scopes the
// set client-side so the navigator, list, and preview share one fetch.
const STORAGE_LIST_LIMIT = 500;

// Stable field projections for the drive tree roots: module-scope so the
// explorer's option list keeps a stable identity (the navigator is published
// into the shell primary pane and must not churn on every render).
const driveRootId = (drive: StorageDrive): string => drive.id;
const driveRootLabel = (drive: StorageDrive): string => drive.name || drive.slug;

/**
 * The file browser: it publishes a folder navigator into the console shell's
 * primary pane and an open file's metadata into the chatter's details tab, and
 * renders the scoped file list or the open-file preview as its content (the
 * file's download/trash/restore verbs and the record pager ride the shell's
 * control band). Drives/folders/files load once; the drive switcher and folder
 * tree drive client-side scoping, and a row click opens the file preview route.
 */
export function StoragePage(): ReactElement {
  const t = useStorageT();
  const variables = useMemo(
    () => ({ offset: 0, limit: STORAGE_LIST_LIMIT }),
    [],
  );
  const drivesQuery = useAuthoredQuery(StorageDrives, variables);
  const foldersQuery = useAuthoredQuery(StorageFolders, variables);
  const filesQuery = useAuthoredQuery(StorageFiles, variables);
  // Admin-only catalogue for the inline drive-create form's backend picker.
  const backendsQuery = useAuthoredQuery(StorageBackends, variables);

  const drives = drivesQuery.data?.drives ?? [];
  const folders = foldersQuery.data?.folders ?? [];
  const files = filesQuery.data?.files ?? [];
  const backends = backendsQuery.data?.backends ?? [];

  // The open file is route state: `/storage/$id` swaps the content to the large
  // preview and the aside to editable metadata; `/storage` is the list.
  const navigate = useNavigate();
  const params = useParams({ strict: false });
  const openFileId =
    "id" in params && typeof params.id === "string" ? params.id : null;
  const closeDetail = useCallback(() => {
    void navigate({ to: "/storage" });
  }, [navigate]);

  const openFile = useMemo(
    () => fileById(files, openFileId),
    [files, openFileId],
  );
  useBreadcrumbLeafLabel(openFile ? openFile.title || openFile.filename : null);
  const explorer = useScopedTreeExplorer({
    roots: drives,
    getRootId: driveRootId,
    getRootLabel: driveRootLabel,
    getTreeRows: useCallback(
      (rootId: string) => folderTreeRows(folders, rootId, openFile),
      [folders, openFile],
    ),
    defaultSelectedId: ALL_SCOPE,
    selectedRootId: openFile?.drive ?? null,
    isSelectedIdValid: (id, rows) =>
      id === ALL_SCOPE || id === TRASH_SCOPE || rows.some((row) => row.id === id),
  });
  const driveId = explorer.rootId;
  const driveOptions = explorer.rootOptions;
  // The inline drive-create form. `name` is the record title (prefilled with the
  // typed query); `backend` is the required FK, picked from the catalogue above.
  // This stays a passed `fields` (not a `forms:` registration) because its
  // `backend` options are fetched at runtime — a static module-scope form override
  // cannot carry them (cf. the static `Vault` form in the knowledge manifest).
  const driveCreateFields = useMemo<readonly FieldDescriptor[]>(
    () => [
      { name: "name", label: "Name" },
      { name: "slug", label: "Slug", placeholder: "assets" },
      {
        // A bare-ID FK (DriveType.backend is `ID`, not an object), so this is a
        // plain `select` — `many2one` would make the form select `backend.id`,
        // which the scalar field has no subfield for.
        name: "backend",
        label: "Backend",
        widget: "select",
        options: backends.map((backend) => ({
          value: backend.id,
          label: backend.label || backend.slug,
        })),
      },
      { name: "prefix", label: "Prefix", placeholder: "optional key prefix" },
      { name: "description", label: "Description", widget: "textarea" },
    ],
    [backends],
  );
  const treeRows = explorer.treeRows;
  const effectiveScope = explorer.selectedId ?? ALL_SCOPE;
  const rows = useMemo(
    () => fileRows(files, { driveId, scope: effectiveScope }),
    [files, driveId, effectiveScope],
  );
  const fileNavigation = useMemo<RecordNavigation | null>(() => {
    if (!openFileId) return null;
    const currentIndex = rows.findIndex((row) => row.id === openFileId);
    const openAt = (index: number): void => {
      const row = rows[index];
      if (row) void navigate({ to: recordPath("/storage", row.id) });
    };
    return {
      total: rows.length,
      ...(currentIndex >= 0 ? { current: currentIndex + 1 } : {}),
      ...(currentIndex > 0 ? { onPrev: () => openAt(currentIndex - 1) } : {}),
      ...(currentIndex >= 0 && currentIndex < rows.length - 1
        ? { onNext: () => openAt(currentIndex + 1) }
        : {}),
    };
  }, [navigate, openFileId, rows]);
  const rowHref = useCallback(
    (row: StorageFileRow) => recordPath("/storage", row.id),
    [],
  );
  const uploads = useStorageUpload({ onUploaded: () => filesQuery.refetch() });
  const fileActions = useFileActions({ onChanged: () => filesQuery.refetch() });
  const folderActions = useFolderActions({
    // A folder write can move files (delete falls them back to the root), so
    // refetch both trees.
    onChanged: () => {
      void foldersQuery.refetch();
      void filesQuery.refetch();
    },
  });
  const confirm = useConfirm();
  // The action hooks return a fresh object each render; the navigator is
  // published into the shell primary pane, so its callbacks read the live
  // actions through a ref and stay referentially stable across renders.
  const fileActionsRef = useRef(fileActions);
  fileActionsRef.current = fileActions;
  const folderActionsRef = useRef(folderActions);
  folderActionsRef.current = folderActions;
  // Dropping a file on a navigator node moves it: the Trash node trashes, All
  // files moves to the drive root, any folder node moves into that folder.
  const handleFileDrop = useCallback(
    (nodeId: string, file: FileDragData) => {
      const actions = fileActionsRef.current;
      if (nodeId === TRASH_SCOPE) void actions.trash(file.id);
      else if (nodeId === ALL_SCOPE) void actions.move(file.id, null);
      else void actions.move(file.id, nodeId);
    },
    [],
  );
  // New folders land under the active folder scope (or the drive root).
  const handleNewFolder = useCallback(
    (name: string) => {
      if (!driveId) return;
      const parent =
        effectiveScope === ALL_SCOPE || effectiveScope === TRASH_SCOPE
          ? null
          : effectiveScope;
      void folderActionsRef.current.create({ drive: driveId, name, parent });
    },
    [driveId, effectiveScope],
  );
  // The active folder scope (a real folder, not the All/Trash pseudo-nodes); its
  // navigator footer offers rename + delete.
  const selectedFolder =
    effectiveScope !== ALL_SCOPE && effectiveScope !== TRASH_SCOPE
      ? explorer.selectedRow
      : undefined;
  const setSelectedId = explorer.setSelectedId;
  const handleRenameFolder = useCallback(
    (name: string): void => {
      void folderActionsRef.current.rename(effectiveScope, name);
    },
    [effectiveScope],
  );
  const handleDeleteFolder = useCallback(async (): Promise<void> => {
    if (!selectedFolder) return;
    const ok = await confirm({
      title: t("storage.folder.deleteTitle", { name: selectedFolder.name }),
      body: t("storage.folder.deleteBody"),
      confirm: t("storage.folder.deleteConfirm"),
      danger: true,
    });
    if (!ok) return;
    void folderActionsRef.current
      .remove(effectiveScope)
      .then(() => setSelectedId(ALL_SCOPE));
  }, [selectedFolder, confirm, t, effectiveScope, setSelectedId]);
  // The selection bar's bulk verbs: Restore in the Trash scope, else Trash.
  const renderBulkActions = (ids: ReadonlySet<string>, clear: () => void) =>
    effectiveScope === TRASH_SCOPE ? (
      <SelectionBarAction
        surface="brand"
        pending={fileActions.busy}
        onClick={() => void fileActions.restoreMany(ids).then(clear)}
      >
        <Glyph name="restore" />
        {t("storage.bulk.restore")}
      </SelectionBarAction>
    ) : (
      <SelectionBarAction
        surface="brand"
        pending={fileActions.busy}
        onClick={() => void fileActions.trashMany(ids).then(clear)}
      >
        <Glyph name="trash" />
        {t("storage.bulk.trash")}
      </SelectionBarAction>
    );
  // Uploads land in the active drive, into the current folder (or its root); the
  // Trash scope is not an upload target.
  const canUpload = driveId !== "" && effectiveScope !== TRASH_SCOPE;
  const uploadTarget = useMemo(
    () => ({
      driveId,
      folderId:
        effectiveScope === ALL_SCOPE || effectiveScope === TRASH_SCOPE
          ? null
          : effectiveScope,
    }),
    [driveId, effectiveScope],
  );

  // The folder navigator, published into the console shell's primary pane. Memoized
  // so the published node only changes when its inputs do (an inline node would
  // republish — and re-render — on every commit).
  const setRootId = explorer.setRootId;
  const navigator = useMemo(
    () => (
      <div className="flex h-full flex-col gap-2 p-2">
        <RelationPicker
          aria-label={t("storage.drive.label")}
          value={driveId}
          options={driveOptions}
          placeholder={t("storage.drive.placeholder")}
          searchPlaceholder={t("storage.drive.searchPlaceholder")}
          onChange={(value) => {
            setRootId(value);
            closeDetail();
          }}
          create={{ resource: "Drive", fields: driveCreateFields }}
          onCreated={() => drivesQuery.refetch()}
        />
        <TreeView<StorageTreeRow>
          rows={treeRows}
          parent="parent"
          label="name"
          rowKey="id"
          icon="icon"
          selectedId={openFile?.id ?? effectiveScope}
          onSelect={(row) => {
            if (row.kind === "file") {
              void navigate({ to: recordPath("/storage", row.id) });
              return;
            }
            setSelectedId(row.id);
            closeDetail();
          }}
          dropAccept={STORAGE_FILE_DND}
          canDropOnNode={(_nodeId, row) => row.kind !== "file"}
          onNodeDrop={(nodeId, payload) =>
            handleFileDrop(nodeId, payload.data as FileDragData)
          }
          className="min-h-0 flex-1 overflow-auto"
        />
        {selectedFolder ? (
          <SelectedFolderControl
            key={selectedFolder.id}
            name={selectedFolder.name}
            busy={folderActions.busy}
            onRename={handleRenameFolder}
            onDelete={handleDeleteFolder}
          />
        ) : null}
        <NewFolderControl busy={folderActions.busy} onCreate={handleNewFolder} />
      </div>
    ),
    [
      t,
      driveId,
      driveOptions,
      setRootId,
      setSelectedId,
      closeDetail,
      driveCreateFields,
      drivesQuery.refetch,
      treeRows,
      openFile,
      effectiveScope,
      navigate,
      handleFileDrop,
      selectedFolder,
      folderActions.busy,
      handleRenameFolder,
      handleDeleteFolder,
      handleNewFolder,
    ],
  );
  // No navigator until drives exist (loading/empty states own the whole surface).
  usePrimaryPane(drives.length === 0 ? null : navigator);

  // The open file's metadata, published as an additive `details` tab into the
  // chatter; nothing published renders the default chatter tabs.
  const detailsTab = useMemo<readonly ChatterTab[]>(
    () =>
      openFile
        ? [
            {
              id: "details",
              label: t("storage.file.detailsTab"),
              icon: "info",
              children: (
                <FileDetail
                  file={openFile}
                  onChanged={() => filesQuery.refetch()}
                  compact
                />
              ),
            },
          ]
        : [],
    [openFile, t, filesQuery.refetch],
  );
  const chatter = useMemo(() => ({ tabs: detailsTab }), [detailsTab]);
  useChatterContent(chatter);

  if (drivesQuery.fetching && drives.length === 0) {
    return <LoadingPanel message={t("storage.loading")} />;
  }
  if (drives.length === 0) {
    return (
      <EmptyState
        fill
        icon="drive"
        title={
          drivesQuery.error
            ? t("storage.drives.unavailableTitle")
            : t("storage.drives.emptyTitle")
        }
        description={
          drivesQuery.error?.message ?? t("storage.drives.emptyDescription")
        }
      />
    );
  }

  return (
    <>
      {openFile ? (
        <ControlBand>
          {!openFile.is_trashed && openFile.url !== "" ? (
            <a
              className={buttonVariants({ variant: "secondary", size: "sm" })}
              href={openFile.url}
              download={openFile.filename}
            >
              <Glyph name="download" />
              {t("storage.file.download")}
            </a>
          ) : null}
          {openFile.is_trashed ? (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              loading={fileActions.busy}
              onClick={() => void fileActions.restore(openFile.id)}
            >
              <Glyph name="restore" />
              {t("storage.file.restore")}
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              loading={fileActions.busy}
              onClick={() =>
                void fileActions.trash(openFile.id).then(closeDetail)
              }
            >
              <Glyph name="trash" />
              {t("storage.file.trash")}
            </Button>
          )}
          {fileNavigation ? (
            <div className="ml-auto">
              <RecordPager navigation={fileNavigation} />
            </div>
          ) : null}
        </ControlBand>
      ) : null}
      {openFileId ? (
        openFile ? (
          <FilePreviewFrame file={openFile} />
        ) : filesQuery.fetching ? (
          <LoadingPanel message={t("storage.loadingFile")} />
        ) : (
          <EmptyState
            fill
            icon="file"
            title={t("storage.file.notFoundTitle")}
            description={t("storage.file.notFoundDescription")}
          />
        )
      ) : (
        <FileBrowserContent
          rows={rows}
          fetching={filesQuery.fetching}
          error={filesQuery.error}
          rowHref={rowHref}
          bulkActions={renderBulkActions}
          uploads={uploads}
          uploadTarget={uploadTarget}
          canUpload={canUpload}
        />
      )}
    </>
  );
}

function FilePreviewFrame({ file }: { file: StorageFile }): ReactElement {
  const t = useStorageT();
  // The file's verbs (download, trash/restore) live in the shell control band,
  // beside the preview; this frame just titles and renders the content.
  return (
    <div className="flex h-full min-h-0 flex-col bg-canvas">
      <SurfaceHeader
        density="compact"
        headingLevel={2}
        icon={file.mime_type?.icon_key || "file"}
        title={file.title || file.filename}
        subtitle={t("storage.file.subtitle", {
          type:
            file.mime_type?.label ||
            file.mime_type?.mime_type ||
            t("storage.file.unknownType"),
          size: formatSize(file.size_bytes),
        })}
      />
      <div className="min-h-0 flex-1 overflow-hidden p-3">
        <FilePreview file={file} />
      </div>
    </div>
  );
}

function FilePreview({ file }: { file: StorageFile }): ReactElement {
  const t = useStorageT();
  const previewFile: PreviewFile = {
    url: file.url,
    name: file.filename,
    mime: file.mime_type?.mime_type ?? null,
    size: file.size_bytes,
  };
  return (
    <PreviewPane
      file={previewFile}
      fallback={
        <EmptyState
          icon="file"
          title={file.title || file.filename}
          description={t("storage.preview.unsupported")}
        />
      }
    />
  );
}
