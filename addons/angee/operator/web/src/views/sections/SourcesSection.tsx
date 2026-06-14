import { useT } from "@angee/sdk";
import { useState, type ReactNode } from "react";

import {
  SOURCE_FETCH_MUTATION,
  SOURCE_PULL_MUTATION,
  SOURCE_PUSH_MUTATION,
} from "../../data/documents";
import { useOperatorAction, useOperatorSnapshot } from "../../data/transport";
import type { SourceState } from "../../data/types";
import { DaemonResourceTable, type DaemonResourceAction } from "../parts/DaemonResourceTable";
import { OperatorSection } from "../parts/OperatorSection";
import { StateTag } from "../parts/StateTag";
import { runDaemonAction, type DaemonActionData } from "../parts/run-action";

interface SourceActionVars extends Record<string, unknown> {
  name: string;
}
interface SourceAction {
  field: string;
  label: string;
  variant: "secondary" | "ghost";
  run: (variables: SourceActionVars) => Promise<DaemonActionData>;
}

/** Sources pane: cached git/local sources with fetch/pull/push + drift readout. */
export function SourcesSection(): ReactNode {
  const t = useT("operator");
  const { snapshot, result, refetch } = useOperatorSnapshot({ sources: true });
  const [actionError, setActionError] = useState<string | null>(null);

  const fetchSource = useOperatorAction<DaemonActionData, SourceActionVars>(SOURCE_FETCH_MUTATION);
  const pull = useOperatorAction<DaemonActionData, SourceActionVars>(SOURCE_PULL_MUTATION);
  const push = useOperatorAction<DaemonActionData, SourceActionVars>(SOURCE_PUSH_MUTATION);
  const busy = fetchSource.result.fetching || pull.result.fetching || push.result.fetching;

  const sources = snapshot?.sources ?? [];
  const actionDefs: readonly SourceAction[] = [
    { field: "sourceFetch", label: "Fetch", variant: "secondary", run: fetchSource.run },
    { field: "sourcePull", label: "Pull", variant: "ghost", run: pull.run },
    { field: "sourcePush", label: "Push", variant: "ghost", run: push.run },
  ];
  const actions: readonly DaemonResourceAction<SourceState>[] = actionDefs.map((action) => ({
    label: action.label,
    variant: action.variant,
    run: (source) =>
      runDaemonAction({
        run: action.run,
        field: action.field,
        variables: { name: source.name },
        label: action.label,
        setError: setActionError,
        refetch,
      }),
  }));

  return (
    <OperatorSection
      title={t("section.operator.sources.title")}
      loading={result.fetching && !snapshot}
      error={result.error && !snapshot ? result.error : null}
      loadingMessage="Loading sources"
      actionError={actionError}
    >
      <DaemonResourceTable
        actions={actions}
        busy={busy}
        columns={[
          {
            header: "Name",
            cell: (source) => <span className="font-medium text-fg">{source.name}</span>,
          },
          {
            header: "Kind",
            cell: (source) => <span className="text-13 text-fg-muted">{source.kind}</span>,
          },
          { header: "Status", cell: (source) => <StateTag state={source.state ?? "unknown"} /> },
          {
            header: "Branch",
            cell: (source) => <span className="text-13 text-fg-muted">{source.branch ?? "—"}</span>,
          },
          {
            header: "Ahead/Behind",
            align: "end",
            cell: (source) => (
              <span className="text-13 tabular-nums text-fg-muted">
                ↑{source.ahead ?? 0} ↓{source.behind ?? 0}
              </span>
            ),
          },
          {
            header: "Dirty",
            cell: (source) => (
              <span className="text-13 text-fg-muted">{source.dirty ? "dirty" : "clean"}</span>
            ),
          },
        ]}
        emptyMessage="No sources."
        rowKey={(source) => source.name}
        rows={sources}
      />
    </OperatorSection>
  );
}
