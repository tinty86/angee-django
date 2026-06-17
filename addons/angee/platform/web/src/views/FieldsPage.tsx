import { useMemo, type ReactElement } from "react";
import { parseAsString, useQueryState } from "nuqs";

import {
  RowsListView,
  type DataToolbarGroupOption,
  type ListColumn,
} from "@angee/base";
import { useAuthoredQuery } from "@angee/sdk";

import { PLATFORM_EXPLORER_QUERY, type PlatformExplorerResult } from "../documents";
import { TextRouteLink } from "../lib/cells";
import { addonDetailPath, modelDetailPath } from "../lib/paths";
import { fieldRows, type FieldRow } from "../lib/rows";

const columns: readonly ListColumn<FieldRow>[] = [
  {
    field: "field",
    header: "Field",
    render: (row) => <span className="font-medium text-fg">{row.field}</span>,
  },
  {
    field: "model",
    header: "Model",
    render: (row) => (
      <TextRouteLink href={modelDetailPath(row.model)}>{row.model}</TextRouteLink>
    ),
  },
  {
    field: "addon",
    header: "Addon",
    render: (row) => (
      <TextRouteLink href={addonDetailPath(row.addonId)}>{row.addon}</TextRouteLink>
    ),
  },
  { field: "kind", header: "Type" },
  {
    field: "relationTarget",
    header: "Relation target",
    render: (row) =>
      row.relationTarget ? (
        <TextRouteLink href={modelDetailPath(row.relationTarget)}>
          {row.relationTarget}
        </TextRouteLink>
      ) : null,
  },
];

const groupOptions: readonly DataToolbarGroupOption[] = [
  { id: "addon", label: "Addon", group: { field: "addon" }, type: "value" },
  { id: "model", label: "Model", group: { field: "model" }, type: "value" },
  { id: "kind", label: "Type", group: { field: "kind" }, type: "value" },
  { id: "relationTarget", label: "Relation target", group: { field: "relationTarget" }, type: "value" },
];

export function FieldsPage(): ReactElement {
  const query = useAuthoredQuery<PlatformExplorerResult>(PLATFORM_EXPLORER_QUERY);
  const [modelScope] = useQueryState("model", parseAsString);
  const [addonScope] = useQueryState("addon", parseAsString);
  const rows = useMemo(() => {
    let all = fieldRows(query.data?.platformExplorer?.models ?? []);
    if (modelScope) all = all.filter((row) => row.model === modelScope);
    if (addonScope) all = all.filter((row) => row.addonId === addonScope);
    return all;
  }, [query.data, modelScope, addonScope]);

  return (
    <RowsListView
      rows={rows}
      columns={columns}
      groupOptions={groupOptions}
      fetching={query.fetching}
      error={query.error}
      defaultGroup={modelScope ? null : { field: "model" }}
      pageSize={100}
      emptyMessage="No fields."
    />
  );
}
