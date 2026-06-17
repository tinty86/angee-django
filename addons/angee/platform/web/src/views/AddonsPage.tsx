import { useMemo, type ReactElement } from "react";

import {
  Badge,
  Code,
  RowsListView,
  type DataToolbarGroupOption,
  type ListColumn,
} from "@angee/base";
import { useAuthoredQuery } from "@angee/sdk";

import { PLATFORM_EXPLORER_QUERY, type PlatformExplorerResult } from "../documents";
import { LinkedChips, TextRouteLink } from "../lib/cells";
import { addonDetailPath, fieldsPath, modelsPath } from "../lib/paths";
import { addonRows, type AddonRow } from "../lib/rows";

const shortName = (id: string): string => id.split(".").pop() ?? id;

const columns: readonly ListColumn<AddonRow>[] = [
  {
    field: "addon",
    header: "Addon",
    render: (row) => (
      <span className="flex min-w-0 flex-col">
        <TextRouteLink href={addonDetailPath(row.id)} className="font-medium">
          {row.addon}
        </TextRouteLink>
        <span className="truncate text-2xs text-fg-muted">{row.fullName}</span>
      </span>
    ),
  },
  {
    field: "namespace",
    header: "Namespace",
    render: (row) => <Code truncate>{row.namespace}</Code>,
  },
  {
    field: "kind",
    header: "Kind",
    render: (row) => (
      <Badge tone={row.kind === "required" ? "info" : "neutral"}>{row.kind}</Badge>
    ),
  },
  {
    field: "models",
    header: "Models",
    render: (row) =>
      row.models ? (
        <TextRouteLink href={modelsPath({ addon: row.id })}>{row.models}</TextRouteLink>
      ) : (
        <span className="text-fg-muted">0</span>
      ),
  },
  {
    field: "fields",
    header: "Fields",
    render: (row) =>
      row.fields ? (
        <TextRouteLink href={fieldsPath({ addon: row.id })}>{row.fields}</TextRouteLink>
      ) : (
        <span className="text-fg-muted">0</span>
      ),
  },
  { field: "resources", header: "Resources" },
  {
    field: "dependsOn",
    header: "Depends on",
    sortable: false,
    render: (row) => <LinkedChips items={row.dependsOnList} href={addonDetailPath} format={shortName} />,
  },
  {
    field: "dependedBy",
    header: "Depended by",
    sortable: false,
    render: (row) => <LinkedChips items={row.dependedByList} href={addonDetailPath} format={shortName} />,
  },
];

const groupOptions: readonly DataToolbarGroupOption[] = [
  { id: "namespace", label: "Namespace", group: { field: "namespace" }, type: "value" },
  { id: "kind", label: "Kind", group: { field: "kind" }, type: "value" },
  { id: "dependsOn", label: "Depends on", group: { field: "dependsOn" }, type: "value" },
  { id: "dependedBy", label: "Depended by", group: { field: "dependedBy" }, type: "value" },
];

export function AddonsPage(): ReactElement {
  const query = useAuthoredQuery<PlatformExplorerResult>(PLATFORM_EXPLORER_QUERY);
  const rows = useMemo(
    () => addonRows(query.data?.platformExplorer?.addons ?? []),
    [query.data],
  );

  return (
    <RowsListView
      rows={rows}
      columns={columns}
      groupOptions={groupOptions}
      fetching={query.fetching}
      error={query.error}
      defaultGroup={{ field: "namespace" }}
      pageSize={50}
      emptyMessage="No addons."
    />
  );
}
