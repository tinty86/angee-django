import { useMemo, type ReactElement } from "react";
import { parseAsString, useQueryState } from "nuqs";

import {
  Code,
  RowsListView,
  type DataToolbarGroupOption,
  type ListColumn,
} from "@angee/base";
import { useAuthoredQuery } from "@angee/sdk";

import { PLATFORM_EXPLORER_QUERY, type PlatformExplorerResult } from "../documents";
import { LinkedChips, TextRouteLink } from "../lib/cells";
import { addonDetailPath, fieldsPath, modelDetailPath } from "../lib/paths";
import { modelRows, type ModelRow } from "../lib/rows";

const columns: readonly ListColumn<ModelRow>[] = [
  {
    field: "model",
    header: "Model",
    render: (row) => (
      <span className="flex min-w-0 flex-col">
        <TextRouteLink href={modelDetailPath(row.id)} className="font-medium">
          {row.model}
        </TextRouteLink>
        <span className="truncate text-2xs text-fg-muted">{row.id}</span>
      </span>
    ),
  },
  {
    field: "addon",
    header: "Addon",
    render: (row) => (
      <TextRouteLink href={addonDetailPath(row.addonId)}>{row.addon}</TextRouteLink>
    ),
  },
  { field: "table", header: "Table", render: (row) => <Code truncate>{row.table}</Code> },
  {
    field: "fields",
    header: "Fields",
    render: (row) => (
      <TextRouteLink href={fieldsPath({ model: row.id })}>{row.fields}</TextRouteLink>
    ),
  },
  { field: "relations", header: "Relations" },
  {
    field: "resourceType",
    header: "Resource type",
    render: (row) => (row.resourceType ? <Code truncate>{row.resourceType}</Code> : null),
  },
  {
    field: "dependsOn",
    header: "Depends on",
    sortable: false,
    render: (row) => <LinkedChips items={row.dependsOnList} href={modelDetailPath} />,
  },
  {
    field: "dependedBy",
    header: "Depended by",
    sortable: false,
    render: (row) => <LinkedChips items={row.dependedByList} href={modelDetailPath} />,
  },
];

const groupOptions: readonly DataToolbarGroupOption[] = [
  { id: "addon", label: "Addon", group: { field: "addon" }, type: "value" },
  { id: "dependsOn", label: "Depends on", group: { field: "dependsOn" }, type: "value" },
  { id: "dependedBy", label: "Depended by", group: { field: "dependedBy" }, type: "value" },
];

export function ModelsPage(): ReactElement {
  const query = useAuthoredQuery<PlatformExplorerResult>(PLATFORM_EXPLORER_QUERY);
  const [addonScope] = useQueryState("addon", parseAsString);
  const rows = useMemo(() => {
    const all = modelRows(query.data?.platformExplorer?.models ?? []);
    return addonScope ? all.filter((row) => row.addonId === addonScope) : all;
  }, [query.data, addonScope]);

  return (
    <RowsListView
      rows={rows}
      columns={columns}
      groupOptions={groupOptions}
      fetching={query.fetching}
      error={query.error}
      defaultGroup={{ field: "addon" }}
      pageSize={50}
      emptyMessage="No models."
    />
  );
}
