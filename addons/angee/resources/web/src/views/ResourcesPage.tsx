import { useMemo, type ReactElement } from "react";

import { Code, RowsListView, type ListColumn } from "@angee/base";
import { useAuthoredQuery } from "@angee/sdk";

import { ResourceLedger } from "../documents";
import { useResourcesT } from "../i18n";
import { resourceRows, type ResourceRow } from "../lib/rows";

function columns(t: (key: string) => string): readonly ListColumn<ResourceRow>[] {
  return [
  {
    field: "source",
    header: t("resources.col.source"),
    render: (row) => (
      <span className="flex min-w-0 flex-col">
        <span className="font-medium text-fg">{row.source}</span>
        <span className="truncate text-2xs text-fg-muted">{row.path}</span>
      </span>
    ),
  },
  { field: "tier", header: t("resources.col.tier") },
  {
    field: "target",
    header: t("resources.col.target"),
    render: (row) => (
      <span className="flex min-w-0 flex-col">
        <Code truncate>{row.target}</Code>
        {row.targetId ? (
          <span className="truncate text-2xs text-fg-muted">{row.targetId}</span>
        ) : null}
      </span>
    ),
  },
  {
    field: "hash",
    header: t("resources.col.hash"),
    sortable: false,
    render: (row) => <Code truncate tone="muted">{row.hash}</Code>,
  },
  { field: "loaded", header: t("resources.col.loaded") },
  ];
}

export function ResourcesPage(): ReactElement {
  const t = useResourcesT();
  const query = useAuthoredQuery(ResourceLedger);
  const rows = useMemo(
    () => resourceRows(query.data?.resourceLedger ?? []),
    [query.data],
  );

  return (
    <RowsListView
      rows={rows}
      columns={columns(t)}
      fetching={query.fetching}
      error={query.error}
      defaultGroup={{ field: "tier" }}
      pageSize={100}
      emptyMessage={t("resources.empty.ledger")}
    />
  );
}
