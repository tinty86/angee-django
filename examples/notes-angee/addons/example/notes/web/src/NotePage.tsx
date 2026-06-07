import * as React from "react";
import {
  DataPage,
  Form,
  Glyph,
  GroupListView,
  List,
  Column,
  Field,
  Group,
  NEW_RECORD_ID,
  Spinner,
  type DataViewDefaultGroups,
  type RecordSmartButtonDescriptor,
  useChatterContent,
} from "@angee/base";
import { useAuthoredQuery, useModelMetadata, useResourceRecord } from "@angee/sdk";
import { useParams } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";

const MODEL = "notes.Note";
const NOTE_REVISIONS_QUERY = `
  query NoteRevisions($id: ID!) {
    noteRevisions(id: $id) {
      id
      createdAt
      comment
      body
    }
  }
`;

interface NoteRevision {
  id: string;
  createdAt: string;
  comment: string | null;
  body: string;
}

interface NoteRevisionsData {
  noteRevisions: NoteRevision[];
}

type NoteRevisionsVariables = Record<string, unknown> & {
  id: string;
};

const NOTE_DEFAULT_GROUPS = {
  list: { field: "updatedAt", granularity: "month" },
  board: { field: "status" },
} satisfies DataViewDefaultGroups;

// Created/updated timestamps + word count feed the record subtitle (id · created
// · updated · words); they are queried but kept out of the field grid.
const RECORD_SUBTITLE_FIELDS: readonly string[] = [
  "createdAt",
  "updatedAt",
  "wordCount",
];

const noteList = (
  <List
    model={MODEL}
    list={GroupListView}
    defaultGroups={NOTE_DEFAULT_GROUPS}
    pageSize={50}
    order={{ updatedAt: "DESC" }}
  >
    <Column field="title" />
    <Column field="tags" sortable={false} />
    <Column field="status" widget="statusBadge" />
    <Column field="wordCount" align="right" aggregate="sum" />
    <Column field="updatedAt" />
  </List>
);

const noteForm = (
  <Form model={MODEL} returning={RECORD_SUBTITLE_FIELDS}>
    <Field name="title" widget="text" title />
    <Field name="status" widget="statusbar" />
    <Group label="Details" columns={2}>
      <Field name="createdByLabel" label="Owner" widget="userRef" readOnly />
      <Field name="reminderAt" label="Reminder" widget="datetime" />
      <Field name="tags" widget="tagInput" />
    </Group>
    <Field name="body" widget="markdown.editor" />
  </Form>
);

const recordSmartButtons = [
  { id: "linked", icon: "plus", count: 7, label: "Linked notes" },
  { id: "comments", icon: "comments", count: 12, label: "Comments" },
  { id: "attachments", icon: "attachment", count: 4, label: "Attachments" },
  { id: "versions", icon: "versions", count: 23, label: "Versions" },
] satisfies readonly RecordSmartButtonDescriptor[];

/** The record crumb for `/notes/$id` — resolves the note title from the cache. */
export function NoteCrumb({ id }: { id: string }): React.ReactElement {
  const isNew = id === NEW_RECORD_ID;
  const metadata = useModelMetadata(MODEL);
  const representationField = metadata?.recordRepresentation ?? "title";
  const { fetching, record } = useResourceRecord(MODEL, isNew ? null : id, {
    enabled: !isNew && id !== "",
    fields: [representationField],
  });
  const value = record?.[representationField];
  const title = typeof value === "string" ? value.trim() : "";
  if (isNew) return <>New</>;
  if (fetching) return <>…</>;
  return <>{title || "Note"}</>;
}

/** The notes console page: a count-by-status panel above the data table. */
export function NotePage(): React.ReactElement {
  // The nested record route (`notes.record`) carries no component; this parent
  // surface reads its `$id` param directly.
  const params = useParams({ strict: false });
  const routeId =
    "id" in params && typeof params.id === "string" ? params.id : undefined;
  const creating = routeId === NEW_RECORD_ID;
  const recordId = creating ? null : routeId;

  return (
    <div className="flex flex-col gap-4">
      <NoteChatter recordId={recordId} creating={creating} />
      {/* Open as a month-grouped list; board view switches to status lanes. */}
      <DataPage
        model={MODEL}
        recordSmartButtons={recordSmartButtons}
        placement="inline"
        routed
      >
        {noteList}
        {noteForm}
      </DataPage>
    </div>
  );
}

function NoteChatter({
  recordId,
  creating,
}: {
  recordId: string | null | undefined;
  creating: boolean;
}): null {
  const activeRecordId =
    !creating && typeof recordId === "string" ? recordId : null;
  const revisions = useAuthoredQuery<NoteRevisionsData, NoteRevisionsVariables>(
    NOTE_REVISIONS_QUERY,
    { id: activeRecordId ?? "" },
    { enabled: activeRecordId !== null },
  );
  const tabs = React.useMemo(() => {
    const revisionCount = revisions.data?.noteRevisions.length;
    return [
      {
        id: "angee",
        label: "Angee",
        icon: "agent",
        children: (
          <RailEmptyState
            icon="agent"
            title="No agent yet"
            body="Set up your assistant"
          />
        ),
      },
      {
        id: "comments",
        label: "Comments",
        icon: "comments",
        children: (
          <RailEmptyState
            icon="comments"
            title="No comments yet"
            body="Comments will appear here."
          />
        ),
      },
      {
        id: "activity",
        label: "Activity",
        icon: "activity",
        ...(revisionCount !== undefined ? { count: revisionCount } : {}),
        children: (
          <NoteActivityPanel
            activeRecordId={activeRecordId}
            revisions={revisions.data?.noteRevisions ?? []}
            fetching={revisions.fetching}
            error={revisions.error}
          />
        ),
      },
    ];
  }, [
    activeRecordId,
    revisions.data?.noteRevisions,
    revisions.error,
    revisions.fetching,
  ]);
  const content = React.useMemo(() => ({ tabs }), [tabs]);
  useChatterContent(content);
  return null;
}

function NoteActivityPanel({
  activeRecordId,
  revisions,
  fetching,
  error,
}: {
  activeRecordId: string | null;
  revisions: readonly NoteRevision[];
  fetching: boolean;
  error: Error | null;
}): React.ReactElement {
  if (!activeRecordId) {
    return (
      <RailEmptyState
        icon="activity"
        title="No record selected"
        body="Open a note to view activity."
      />
    );
  }
  if (error) {
    return (
      <div role="alert" className="text-13 text-danger-text">
        {error.message}
      </div>
    );
  }
  if (fetching) {
    return (
      <div className="flex items-center gap-2 text-13 text-fg-muted">
        <Spinner size="sm" />
        Loading activity...
      </div>
    );
  }
  if (revisions.length === 0) {
    return (
      <RailEmptyState
        icon="activity"
        title="No revisions yet"
        body="Body changes will appear here."
      />
    );
  }
  return (
    <ol className="flex flex-col gap-3">
      {revisions.map((revision) => (
        <li
          key={revision.id}
          className="rounded-md border border-border-subtle bg-sheet-2 p-3"
        >
          <div className="flex min-w-0 items-start justify-between gap-2">
            <p className="truncate text-13 font-semibold text-fg">
              {revision.comment ?? "Body updated"}
            </p>
            <time
              dateTime={revision.createdAt}
              className="shrink-0 text-2xs tabular-nums text-fg-muted"
            >
              {relativeTime(revision.createdAt)}
            </time>
          </div>
          <p className="mt-2 line-clamp-3 text-13 leading-5 text-fg-2">
            {excerpt(revision.body)}
          </p>
        </li>
      ))}
    </ol>
  );
}

function RailEmptyState({
  icon,
  title,
  body,
}: {
  icon: string;
  title: React.ReactNode;
  body: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="grid min-h-48 place-content-center gap-2 text-center">
      <div className="mx-auto grid size-10 place-content-center rounded-md bg-accent-soft text-accent-soft-text [&_.glyph]:size-5">
        <Glyph name={icon} />
      </div>
      <p className="text-sm font-semibold text-fg">{title}</p>
      <p className="text-13 text-fg-muted">{body}</p>
    </div>
  );
}

function relativeTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return formatDistanceToNow(date, { addSuffix: true });
}

function excerpt(value: string): string {
  const text = value.replace(/\s+/g, " ").trim();
  if (!text) return "No body snapshot.";
  return text.length > 160 ? `${text.slice(0, 157)}...` : text;
}
