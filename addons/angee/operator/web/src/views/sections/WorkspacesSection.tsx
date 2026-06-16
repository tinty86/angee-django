import { Button, Skeleton, useConfirm } from "@angee/base";
import { useState, type ReactNode } from "react";

import {
  WORKSPACE_DESTROY_MUTATION,
  WORKSPACE_SYNC_BASE_MUTATION,
} from "../../data/documents";
import { useOperatorT } from "../../i18n";
import { useOperatorAction, useOperatorSnapshot } from "../../data/transport";
import type { WorkspaceRef } from "../../data/types";
import {
  DaemonResourceTable,
  DaemonResourceTableSkeleton,
  type DaemonResourceAction,
} from "../parts/DaemonResourceTable";
import { OperatorSection } from "../parts/OperatorSection";
import { runDaemonAction, type DaemonActionData } from "../parts/run-action";

interface WorkspaceActionVars extends Record<string, unknown> {
  name: string;
}
interface WorkspaceAction {
  field: string;
  label: string;
  variant: "secondary" | "ghost";
  /** Destructive — require a styled confirmation naming the workspace first. */
  dangerous?: boolean;
  run: (variables: WorkspaceActionVars) => Promise<DaemonActionData>;
}

export interface WorkspacesSectionProps {
  /** Restrict the table to these workspace names; omit to show every workspace. */
  names?: readonly string[];
  /** Override the pane title (e.g. when embedded for one agent's workspace). */
  title?: ReactNode;
}

/** Workspaces pane: the daemon's worktree workspaces with sync/destroy actions. */
export function WorkspacesSection({ names, title }: WorkspacesSectionProps = {}): ReactNode {
  const {
    actionError,
    actions,
    busy,
    result,
    snapshot,
    t,
    workspaces,
  } = useWorkspaceControls(names);

  return (
    <OperatorSection
      title={title === undefined ? t("section.operator.workspaces.title") : title}
      loading={result.fetching && !snapshot}
      error={result.error && !snapshot ? result.error : null}
      loadingMessage={t("operator.workspaces.loading")}
      loadingContent={<DaemonResourceTableSkeleton columnCount={5} actions />}
      actionError={actionError}
    >
      <DaemonResourceTable
        actions={actions}
        actionsLabel={t("operator.table.actions")}
        busy={busy}
        columns={[
          {
            header: t("operator.workspaces.column.name"),
            cell: (workspace) => <span className="font-medium text-fg">{workspace.name}</span>,
          },
          {
            header: t("operator.workspaces.column.template"),
            cell: (workspace) => (
              <span className="text-13 text-fg-muted">{workspace.template}</span>
            ),
          },
          {
            header: t("operator.workspaces.column.path"),
            cell: (workspace) => (
              <span className="font-mono text-13 text-fg-muted">{workspace.path}</span>
            ),
          },
          {
            header: t("operator.workspaces.column.port"),
            align: "end",
            cell: (workspace) => (
              <span className="text-13 tabular-nums text-fg-muted">
                {workspace.processComposePort ?? "—"}
              </span>
            ),
          },
          {
            header: t("operator.workspaces.column.ttl"),
            cell: (workspace) => <span className="text-13 text-fg-muted">{workspace.ttl ?? "—"}</span>,
          },
        ]}
        emptyMessage={t("operator.workspaces.empty")}
        rowKey={(workspace) => workspace.name}
        rows={workspaces}
      />
    </OperatorSection>
  );
}

export interface WorkspaceRowProps {
  /** The single workspace name owned by the embedding object. */
  name: string;
  /** Optional empty-state text when the daemon has not rendered the workspace yet. */
  emptyMessage?: ReactNode;
}

/** Compact single-workspace row for views that already own the workspace identity. */
export function WorkspaceRow({ name, emptyMessage }: WorkspaceRowProps): ReactNode {
  const {
    actionError,
    actions,
    busy,
    result,
    snapshot,
    t,
    workspaces,
  } = useWorkspaceControls([name]);
  const workspace = workspaces[0] ?? null;

  return (
    <OperatorSection
      loading={result.fetching && !snapshot}
      error={result.error && !snapshot ? result.error : null}
      loadingMessage={t("operator.workspaces.loading")}
      loadingContent={<WorkspaceRowSkeleton />}
      actionError={actionError}
    >
      {workspace ? (
        <WorkspaceControlRow
          actions={actions}
          busy={busy}
          workspace={workspace}
        />
      ) : (
        <p className="border-y border-border-subtle py-3 text-13 text-fg-muted">
          {emptyMessage ?? t("operator.workspaces.empty")}
        </p>
      )}
    </OperatorSection>
  );
}

function useWorkspaceControls(names?: readonly string[]): {
  actionError: string | null;
  actions: readonly DaemonResourceAction<WorkspaceRef>[];
  busy: boolean;
  result: ReturnType<typeof useOperatorSnapshot>["result"];
  snapshot: ReturnType<typeof useOperatorSnapshot>["snapshot"];
  t: ReturnType<typeof useOperatorT>;
  workspaces: readonly WorkspaceRef[];
} {
  const t = useOperatorT();
  const confirm = useConfirm();
  const { snapshot, result, refetch } = useOperatorSnapshot({ workspaces: true });
  const [actionError, setActionError] = useState<string | null>(null);

  const syncBase = useOperatorAction<DaemonActionData, WorkspaceActionVars>(WORKSPACE_SYNC_BASE_MUTATION);
  const destroy = useOperatorAction<DaemonActionData, WorkspaceActionVars>(WORKSPACE_DESTROY_MUTATION);
  const busy = syncBase.result.fetching || destroy.result.fetching;

  const workspaces = (snapshot?.workspaces ?? []).filter(
    (workspace) => names === undefined || names.includes(workspace.name),
  );
  const actions: readonly WorkspaceAction[] = [
    { field: "workspaceSyncBase", label: t("operator.workspaces.syncBase"), variant: "secondary", run: syncBase.run },
    { field: "workspaceDestroy", label: t("operator.workspaces.destroy"), variant: "ghost", dangerous: true, run: destroy.run },
  ];

  function handle(action: WorkspaceAction, workspace: WorkspaceRef): void {
    void (async () => {
      if (action.dangerous) {
        const ok = await confirm({
          title: t("operator.workspaces.destroy.confirm.title"),
          body: t("operator.workspaces.destroy.confirm.body", { name: workspace.name }),
          confirm: action.label,
          danger: true,
        });
        if (!ok) return;
      }
      await runDaemonAction({
        run: action.run,
        field: action.field,
        variables:
          action.field === "workspaceDestroy"
            ? { name: workspace.name, purge: false }
            : { name: workspace.name },
        label: action.label,
        setError: setActionError,
        refetch,
      });
    })();
  }

  return {
    actionError,
    actions: actions.map(
      (action): DaemonResourceAction<WorkspaceRef> => ({
        label: action.label,
        variant: action.variant,
        run: (workspace) => handle(action, workspace),
      }),
    ),
    busy,
    result,
    snapshot,
    t,
    workspaces,
  };
}

function WorkspaceControlRow({
  actions,
  busy,
  workspace,
}: {
  actions: readonly DaemonResourceAction<WorkspaceRef>[];
  busy: boolean;
  workspace: WorkspaceRef;
}): ReactNode {
  return (
    <div
      className={
        "grid min-w-0 grid-cols-[minmax(0,1fr)_10rem_minmax(0,1.4fr)_max-content] " +
        "items-center gap-6 border-y border-border-subtle py-2 text-13"
      }
    >
      <span className="min-w-0 truncate font-medium text-fg">
        {workspace.name}
      </span>
      <span className="min-w-0 truncate text-fg-muted">
        {workspace.template}
      </span>
      <span className="min-w-0 truncate font-mono text-fg-muted" title={workspace.path}>
        {workspace.path}
      </span>
      <div className="flex shrink-0 justify-end gap-1 whitespace-nowrap">
        {actions.map((action, index) => (
          <Button
            disabled={busy}
            key={index}
            onClick={() => void action.run(workspace)}
            size="sm"
            variant={action.variant}
          >
            {action.label}
          </Button>
        ))}
      </div>
    </div>
  );
}

function WorkspaceRowSkeleton(): ReactNode {
  return (
    <div
      aria-hidden="true"
      className={
        "grid min-w-0 grid-cols-[minmax(0,1fr)_10rem_minmax(0,1.4fr)_max-content] " +
        "items-center gap-6 border-y border-border-subtle py-2"
      }
    >
      <Skeleton shape="text" size="sm" className="h-5" />
      <Skeleton shape="text" size="sm" className="h-5" />
      <Skeleton shape="text" size="sm" className="h-5" />
      <div className="flex shrink-0 justify-end gap-1">
        <Skeleton className="h-btn-sm w-20" />
        <Skeleton className="h-btn-sm w-16" />
      </div>
    </div>
  );
}
