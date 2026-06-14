import {
  EmptyState,
  MetricGrid,
  type MetricGridTile,
} from "@angee/base";
import { useT } from "@angee/sdk";
import type { ReactNode } from "react";

import { useOperatorSnapshot } from "../../data/transport";
import type { GitOpsLink, GitOpsSummary } from "../../data/types";
import { DaemonResourceTable } from "../parts/DaemonResourceTable";
import { OperatorSection } from "../parts/OperatorSection";
import { StateTag } from "../parts/StateTag";

interface SummaryTile {
  id: keyof GitOpsSummary;
  label: string;
}

// A read-only subset of the numeric summary fields, rendered as stat tiles.
const SUMMARY_TILES: readonly SummaryTile[] = [
  { id: "clean", label: "Clean" },
  { id: "dirty", label: "Dirty" },
  { id: "ahead", label: "Ahead" },
  { id: "behind", label: "Behind" },
  { id: "diverged", label: "Diverged" },
  { id: "unpushed", label: "Unpushed" },
];

/** GitOps pane: a read-only summary + per-link drift table from the daemon topology. */
export function GitOpsSection(): ReactNode {
  const t = useT("operator");
  const { snapshot, result } = useOperatorSnapshot({ gitOps: true });
  const gitOps = snapshot?.gitOps ?? null;

  return (
    <OperatorSection
      title={t("section.operator.gitops.title")}
      loading={result.fetching && !snapshot}
      error={result.error && !snapshot ? result.error : null}
      loadingMessage="Loading GitOps topology"
    >
      {gitOps ? (
        <GitOpsTopologyView summary={gitOps.summary} links={gitOps.links} />
      ) : (
        <EmptyState icon="activity" title="No GitOps topology" />
      )}
    </OperatorSection>
  );
}

function GitOpsTopologyView({
  summary,
  links,
}: {
  summary: GitOpsSummary;
  links: readonly GitOpsLink[];
}): ReactNode {
  const metrics: readonly MetricGridTile[] = SUMMARY_TILES.map((tile) => ({
    label: tile.label,
    value: summary[tile.id],
  }));

  return (
    <>
      <MetricGrid
        className="grid-cols-2 sm:grid-cols-3 lg:grid-cols-6"
        metrics={metrics}
      />

      <DaemonResourceTable
        columns={[
          {
            header: "Source",
            cell: (link) => <span className="font-medium text-fg">{link.source}</span>,
          },
          {
            header: "Workspace",
            cell: (link) => <span className="text-13 text-fg-muted">{link.workspace}</span>,
          },
          {
            header: "Slot",
            cell: (link) => <span className="text-13 text-fg-muted">{link.slot}</span>,
          },
          { header: "Status", cell: (link) => <StateTag state={link.state} /> },
          {
            header: "Branch",
            cell: (link) => <span className="text-13 text-fg-muted">{link.branch ?? "—"}</span>,
          },
          {
            header: "Ahead/Behind",
            align: "end",
            cell: (link) => (
              <span className="text-13 tabular-nums text-fg-muted">
                ↑{link.ahead ?? 0} ↓{link.behind ?? 0}
              </span>
            ),
          },
          {
            header: "Pushed",
            cell: (link) => (
              <span className="text-13 text-fg-muted">{link.pushed ? "yes" : "no"}</span>
            ),
          },
        ]}
        emptyMessage="No GitOps links."
        rowKey={(link) => link.id}
        rows={links}
      />
    </>
  );
}
