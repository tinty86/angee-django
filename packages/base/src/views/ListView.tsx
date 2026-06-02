import * as React from "react";
import type { Row as TableRowModel } from "@tanstack/react-table";
import { useNavigate } from "@tanstack/react-router";
import {
  type ResourceTypeName,
  type Row,
  type UseResourceListOptions,
} from "@angee/sdk";

import {
  DataToolbar,
  type DataToolbarFilterOption,
  type DataToolbarGroupOption,
} from "../toolbars";
import { CountBadge, type BadgeVariant } from "../ui/badge";
import { Button } from "../ui/button";
import type { PagerState } from "../ui/pager";
import { Spinner } from "../ui/spinner";
import { StatusDot } from "../ui/status-icon";
import {
  DataViewProvider,
  useDataView,
  useDataViewMaybe,
  type DataViewContextValue,
} from "./data-view-context";
import {
  dataViewGroupsEqual,
  type DataViewFilter,
  type DataViewGroup,
} from "./data-view-model";
import {
  useDataViewSurface,
  type ListViewState,
} from "./data-view-surface";
import {
  GroupedListBody,
  groupPagerStatesEqual,
  type GroupPagerState,
} from "./grouped-list";
import {
  FlatListBody,
  LIST_VIEW_SCROLL_BUDGET,
  cellContent,
  dataViewGroupToAggregateDimension,
  groupFieldLabel,
  looksLikeDateField,
  readPath,
  statusLabel,
  type RowGroup,
} from "./list-internals";
import type { ColumnDescriptor } from "./page";

export type { ListViewState } from "./data-view-surface";
export type {
  ColumnAlign,
  ListColumn,
} from "./list-internals";

export interface ListViewProps<TRow extends Row = Row> {
  model: string;
  columns: readonly ColumnDescriptor<TRow>[];
  fields?: readonly string[];
  filter?: UseResourceListOptions<ResourceTypeName>["filter"];
  order?: UseResourceListOptions<ResourceTypeName>["order"];
  pageSize?: number;
  defaultGroup?: DataViewGroup | null;
  onCreate?: () => void;
  createLabel?: React.ReactNode;
  onRowClick?: (row: TRow) => void;
  onListStateChange?: (state: ListViewState<TRow>) => void;
  rowHref?: (row: TRow) => string;
  emptyMessage?: React.ReactNode;
  className?: string;
}

const BOARD_SCROLL_STYLE: React.CSSProperties = {
  height: LIST_VIEW_SCROLL_BUDGET,
  maxHeight: LIST_VIEW_SCROLL_BUDGET,
};
const BOARD_CARD_SHELL_CLASS =
  "block w-full rounded-lg text-left text-inherit outline-none focus-visible:focus-ring";

export function ListView<TRow extends Row = Row>(
  props: ListViewProps<TRow>,
): React.ReactElement {
  const dataView = useDataViewMaybe();
  const initialState = React.useMemo(
    () => ({
      pageSize: props.pageSize,
    }),
    [props.pageSize],
  );
  if (dataView) return <ListViewBody {...props} dataView={dataView} />;
  return (
    <DataViewProvider initialState={initialState}>
      <ListViewBound {...props} />
    </DataViewProvider>
  );
}

function ListViewBound<TRow extends Row = Row>(
  props: ListViewProps<TRow>,
): React.ReactElement {
  return <ListViewBody {...props} dataView={useDataView()} />;
}

function ListViewBody<TRow extends Row = Row>({
  model,
  columns,
  fields,
  filter,
  order,
  pageSize,
  defaultGroup,
  onCreate,
  createLabel,
  onRowClick,
  onListStateChange,
  rowHref,
  emptyMessage = "No records.",
  className,
  dataView,
}: ListViewProps<TRow> & {
  dataView: DataViewContextValue;
}): React.ReactElement {
  const handledDefaultGroupRef = React.useRef<DataViewGroup | null>(null);
  React.useEffect(() => {
    if (!defaultGroup) {
      handledDefaultGroupRef.current = null;
      return;
    }
    if (
      handledDefaultGroupRef.current
      && dataViewGroupsEqual(handledDefaultGroupRef.current, defaultGroup)
    ) {
      return;
    }
    handledDefaultGroupRef.current = defaultGroup;
    if (dataView.state.group === null) dataView.setGroup(defaultGroup);
  }, [dataView.setGroup, dataView.state.group, defaultGroup]);

  const groupDimensions = React.useMemo(
    () => dataView.state.groupStack.map(dataViewGroupToAggregateDimension),
    [dataView.state.groupStack],
  );
  const groupedListMode =
    dataView.state.view === "list" && groupDimensions.length > 0;
  const surface = useDataViewSurface({
    model,
    columns,
    fields,
    filter,
    order,
    pageSize,
    dataView,
    enabled: !groupedListMode,
    onListStateChange,
  });
  const [groupPagerState, setGroupPagerState] =
    React.useState<GroupPagerState | null>(null);
  const handleGroupPagerStateChange = React.useCallback(
    (next: GroupPagerState) => {
      setGroupPagerState((current) =>
        groupPagerStatesEqual(current, next) ? current : next,
      );
    },
    [],
  );
  const toolbarPager = React.useMemo<PagerState>(() => {
    if (!groupedListMode) {
      return {
        total: surface.list.total,
        page: surface.list.page,
        pageSize: surface.list.pageSize,
        hasPrev: surface.list.hasPrev,
        hasNext: surface.list.hasNext,
      };
    }
    // Group-level pager: Pager derives hasPrev/hasNext from page/total.
    return {
      total: groupPagerState?.total ?? 0,
      page: dataView.state.page,
      pageSize: dataView.state.pageSize,
    };
  }, [
    dataView.state.page,
    dataView.state.pageSize,
    groupPagerState?.total,
    groupedListMode,
    surface.list.hasNext,
    surface.list.hasPrev,
    surface.list.page,
    surface.list.pageSize,
    surface.list.total,
  ]);
  const groupOptions = React.useMemo(
    () => buildGroupOptions(columns, defaultGroup),
    [columns, defaultGroup],
  );
  const filterOptions = React.useMemo(
    () => buildFilterOptions(columns, surface.rows),
    [columns, surface.rows],
  );
  const activeFilterIds = activeFilterIdsFor(
    dataView.state.filter,
    filterOptions,
  );

  const setPage = React.useCallback(
    (page: number) => {
      dataView.setPage(page);
    },
    [dataView.setPage],
  );

  const filterText = textFilterValue(dataView.state.filter);
  const interactive = Boolean(onRowClick || rowHref);

  return (
    <div
      className={[
        "overflow-hidden rounded-md border border-border bg-sheet",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <DataToolbar
        pager={toolbarPager}
        view={dataView.state.view}
        group={dataView.state.group}
        groupStack={dataView.state.groupStack}
        groupOptions={groupOptions}
        filterOptions={filterOptions}
        visibleFields={surface.visibleFields}
        activeFilterIds={activeFilterIds}
        filterText={filterText}
        createLabel={createLabel ?? createLabelForModel(model)}
        onCreate={onCreate}
        onClearGroup={() => dataView.setGroupStack([])}
        onGroupStackChange={dataView.setGroupStack}
        onVisibleFieldToggle={surface.toggleVisibleField}
        onViewChange={dataView.setView}
        onPageChange={setPage}
        pagerSubject={groupedListMode ? "Groups" : undefined}
        pagerTotalUnit={groupedListMode ? "groups" : undefined}
        onFilterToggle={(id) =>
          dataView.setFilter(
            nextFacetFilter(dataView.state.filter, filterOptions, id),
          )
        }
        onFilterTextChange={(value) =>
          dataView.setFilter(nextTextFilter(dataView.state.filter, value))
        }
      />
      {surface.selectedIds.size > 0 ? (
        <SelectionBar
          count={surface.selectedIds.size}
          onClear={dataView.clearSelectedIds}
        />
      ) : null}
      {groupedListMode ? (
        <GroupedListBody
          model={model}
          table={surface.table}
          tableColumns={surface.tableColumns}
          columnVisibility={surface.columnVisibility}
          visibleColumnCount={surface.visibleColumnCount}
          dataView={dataView}
          groupDimensions={groupDimensions}
          requestedFields={surface.requestedFields}
          mergedFilter={surface.mergedFilter}
          sortOrder={surface.sortOrder}
          order={order}
          interactive={interactive}
          rowHref={rowHref}
          onRowClick={onRowClick}
          emptyMessage={emptyMessage}
          onPagerStateChange={handleGroupPagerStateChange}
        />
      ) : surface.list.error ? (
        <div className="px-3 py-6 text-13 text-danger-text">
          {surface.list.error.message}
        </div>
      ) : dataView.state.view === "board" ? (
        <BoardRows
          columns={columns}
          groups={surface.groupedRows}
          groupStack={dataView.state.groupStack}
          emptyMessage={emptyMessage}
          rowHref={rowHref}
          onRowClick={onRowClick}
        />
      ) : (
        <FlatListBody
          table={surface.table}
          rowModels={surface.rowModels}
          listItems={surface.listItems}
          tableScrollRef={surface.tableScrollRef}
          rowVirtualizer={surface.rowVirtualizer}
          visibleColumnCount={surface.visibleColumnCount}
          allPageSelected={surface.allPageSelected}
          somePageSelected={surface.somePageSelected}
          onPageSelectionChange={surface.setPageSelection}
          dataView={dataView}
          interactive={interactive}
          rowHref={rowHref}
          onRowClick={onRowClick}
          emptyMessage={emptyMessage}
          fetching={surface.list.fetching}
        />
      )}
      {!groupedListMode && surface.list.fetching ? (
        <div className="flex items-center justify-center gap-2 border-t border-border px-3 py-4 text-13 text-fg-muted">
          <Spinner size="sm" />
          Loading...
        </div>
      ) : null}
    </div>
  );
}

function BoardRows<TRow extends Row>({
  columns,
  groups,
  groupStack,
  emptyMessage,
  rowHref,
  onRowClick,
}: {
  columns: readonly ColumnDescriptor<TRow>[];
  groups: readonly RowGroup<TRow>[];
  groupStack: readonly DataViewGroup[];
  emptyMessage: React.ReactNode;
  rowHref?: (row: TRow) => string;
  onRowClick?: (row: TRow) => void;
}): React.ReactElement {
  const leaves = groups.flatMap(flattenLeaves);
  const groupFields = new Set(groupStack.map((group) => group.field));
  if (leaves.every((group) => group.rows.length === 0)) {
    return <div className="px-3 py-8 text-center text-fg-muted">{emptyMessage}</div>;
  }
  // Kanban is most useful with an active group axis; with no group-by applied a single lane is shown.
  // The board renders the current page only (bounded by the page-size cap, MAX_PAGE_SIZE), grouped into lanes; no row virtualization is used here.
  return (
    <div
      className="flex gap-3 overflow-x-auto overflow-y-hidden p-3"
      style={BOARD_SCROLL_STYLE}
    >
      {leaves.map((group) => (
        <BoardLane
          key={group.key}
          columns={columns}
          group={group}
          groupStack={groupStack}
          groupFields={groupFields}
          rowHref={rowHref}
          onRowClick={onRowClick}
        />
      ))}
    </div>
  );
}

function BoardLane<TRow extends Row>({
  columns,
  group,
  groupStack,
  groupFields,
  rowHref,
  onRowClick,
}: {
  columns: readonly ColumnDescriptor<TRow>[];
  group: RowGroup<TRow>;
  groupStack: readonly DataViewGroup[];
  groupFields: ReadonlySet<string>;
  rowHref?: (row: TRow) => string;
  onRowClick?: (row: TRow) => void;
}): React.ReactElement {
  const headingId = React.useId();
  const tone = laneDotTone(group, groupStack, columns);
  return (
    <section
      aria-labelledby={headingId}
      className="flex max-h-full min-h-0 w-[300px] flex-none flex-col rounded-[10px] border border-border-subtle bg-inset"
    >
      <div className="sticky top-0 z-10 flex items-center gap-2 rounded-t-[10px] bg-inset px-3 pt-3 pb-2">
        {tone ? <StatusDot tone={tone} /> : null}
        <h3
          id={headingId}
          className="min-w-0 flex-1 truncate text-13 font-semibold text-fg"
        >
          {group.label ?? "All records"}
        </h3>
        <CountBadge value={group.rows.length} />
      </div>
      <div className="flex min-h-0 flex-col gap-2 overflow-y-auto px-2 pb-2">
        {group.rows.map((row) => (
          <BoardRowCard
            key={row.id}
            columns={columns}
            groupFields={groupFields}
            row={row}
            rowHref={rowHref}
            onRowClick={onRowClick}
          />
        ))}
      </div>
    </section>
  );
}

function BoardRowCard<TRow extends Row>({
  columns,
  groupFields,
  row,
  rowHref,
  onRowClick,
}: {
  columns: readonly ColumnDescriptor<TRow>[];
  groupFields: ReadonlySet<string>;
  row: TableRowModel<TRow>;
  rowHref?: (row: TRow) => string;
  onRowClick?: (row: TRow) => void;
}): React.ReactElement {
  const href = rowHref?.(row.original);
  const cardColumns = columns
    .filter((column) => !groupFields.has(column.field))
    .slice(0, 4);
  const [titleColumn, ...detailColumns] = cardColumns;
  return (
    <BoardCardShell
      href={href}
      onClick={onRowClick ? () => onRowClick(row.original) : undefined}
    >
      <article className="grid gap-2 rounded-lg border border-border-subtle bg-sheet p-3 shadow-xs transition hover:-translate-y-0.5 hover:border-border hover:shadow-md">
        {titleColumn ? (
          <span className="block min-w-0 truncate text-sm font-semibold text-fg">
            {cellContent(titleColumn, row.original)}
          </span>
        ) : null}
        {detailColumns.map((column) => (
          <div
            key={column.field}
            className="flex min-w-0 items-start justify-between gap-3 text-13"
          >
            <span className="shrink-0 text-fg-muted">
              {column.header ?? column.field}
            </span>
            <span className="min-w-0 text-right text-fg">
              {cellContent(column, row.original)}
            </span>
          </div>
        ))}
      </article>
    </BoardCardShell>
  );
}

function BoardCardShell({
  href,
  onClick,
  children,
}: {
  href?: string;
  onClick?: () => void;
  children: React.ReactNode;
}): React.ReactElement {
  const navigate = useNavigate();
  const handleClick = React.useCallback(() => {
    if (href) {
      void navigate({ to: href });
      return;
    }
    onClick?.();
  }, [href, navigate, onClick]);
  return (
    <button
      type="button"
      role={href ? "link" : undefined}
      className={BOARD_CARD_SHELL_CLASS}
      onClick={handleClick}
    >
      {children}
    </button>
  );
}

function laneDotTone<TRow extends Row>(
  group: RowGroup<TRow>,
  groupStack: readonly DataViewGroup[],
  columns: readonly ColumnDescriptor<TRow>[],
): BadgeVariant | undefined {
  const groupField = groupStack[group.depth]?.field;
  const column = groupField
    ? columns.find((candidate) => candidate.field === groupField)
    : undefined;
  if (!groupField || !column?.tone) return undefined;
  const row = group.rows[0]?.original;
  const value = row ? readPath(row, groupField) : undefined;
  const label = value == null ? "" : String(value);
  return column.tone[label] ?? "default";
}

function SelectionBar({
  count,
  onClear,
}: {
  count: number;
  onClear: () => void;
}): React.ReactElement {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border-subtle bg-brand px-3 py-2 text-13 text-on-brand">
      <span>{count} selected</span>
      <Button type="button" variant="ghost" size="sm" onClick={onClear}>
        Clear
      </Button>
    </div>
  );
}

function flattenLeaves<TRow extends Row>(group: RowGroup<TRow>): RowGroup<TRow>[] {
  if (group.children.length === 0) return [group];
  return group.children.flatMap(flattenLeaves);
}

function buildGroupOptions<TRow extends Row>(
  columns: readonly ColumnDescriptor<TRow>[],
  defaultGroup: DataViewGroup | null | undefined,
): readonly DataToolbarGroupOption[] {
  const options: DataToolbarGroupOption[] = [];
  const seen = new Set<string>();
  const addOption = (option: DataToolbarGroupOption) => {
    if (seen.has(option.id)) return;
    seen.add(option.id);
    options.push(option);
  };

  if (defaultGroup) {
    addOption({
      id: defaultGroup.field,
      label: groupFieldLabel(defaultGroup.field),
      group: defaultGroup,
      type: looksLikeDateField(defaultGroup.field) ? "date" : "value",
    });
  }

  for (const column of columns) {
    if (looksLikeDateField(column.field)) {
      addOption({
        id: column.field,
        label: groupFieldLabel(column.field),
        group: { field: column.field, granularity: "day" },
        type: "date",
      });
      continue;
    }
    if (column.field === "status" || column.tone) {
      addOption({
        id: column.field,
        label: column.header ?? groupFieldLabel(column.field),
        group: { field: column.field },
        type: "value",
      });
    }
  }

  return options;
}

function buildFilterOptions<TRow extends Row>(
  columns: readonly ColumnDescriptor<TRow>[],
  rows: readonly TRow[],
): readonly DataToolbarFilterOption[] {
  return columns.flatMap((column) => {
    if (column.field !== "status" && !column.tone) return [];
    return statusValues(column, rows).map((value) => ({
      id: `${column.field}:${value}`,
      label: statusLabel(value),
      chipLabel: statusLabel(value),
      filter: { [column.field]: { exact: value } },
    }));
  });
}

function statusValues<TRow extends Row>(
  column: ColumnDescriptor<TRow>,
  rows: readonly TRow[],
): string[] {
  const values = new Set<string>();
  if (column.tone) {
    for (const key of Object.keys(column.tone)) {
      if (key === key.toUpperCase()) values.add(key);
    }
  }
  if (values.size === 0) {
    for (const row of rows) {
      const value = readPath(row, column.field);
      if (typeof value === "string" && value.trim()) values.add(value);
    }
  }
  return [...values].sort(compareStatusValue);
}

const STATUS_ORDER = ["DRAFT", "IN_REVIEW", "ACTIVE", "ARCHIVED"];

function compareStatusValue(left: string, right: string): number {
  const leftIndex = STATUS_ORDER.indexOf(left.toUpperCase());
  const rightIndex = STATUS_ORDER.indexOf(right.toUpperCase());
  if (leftIndex !== -1 || rightIndex !== -1) {
    return (leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex)
      - (rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex);
  }
  return left.localeCompare(right);
}

function activeFilterIdsFor(
  filter: DataViewFilter,
  options: readonly DataToolbarFilterOption[],
): readonly string[] {
  return options.flatMap((option) => {
    const facet = facetFilter(option);
    if (!facet) return [];
    return statusFilterValues(filter, facet.field).includes(facet.value)
      ? [option.id]
      : [];
  });
}

function nextFacetFilter(
  filter: DataViewFilter,
  options: readonly DataToolbarFilterOption[],
  id: string,
): DataViewFilter {
  const option = options.find((candidate) => candidate.id === id);
  const facet = option ? facetFilter(option) : null;
  if (!facet) return filter;
  const current = statusFilterValues(filter, facet.field);
  const nextValues = current.includes(facet.value)
    ? current.filter((value) => value !== facet.value)
    : [...current, facet.value];
  const next = { ...filter };
  if (nextValues.length === 0) {
    delete next[facet.field];
  } else if (nextValues.length === 1) {
    next[facet.field] = { exact: nextValues[0] };
  } else {
    next[facet.field] = { inList: nextValues };
  }
  return next;
}

function facetFilter(
  option: DataToolbarFilterOption,
): { field: string; value: string } | null {
  const entry = Object.entries(option.filter)[0];
  if (!entry) return null;
  const [field, lookup] = entry;
  if (!field || !lookup || typeof lookup !== "object" || Array.isArray(lookup)) {
    return null;
  }
  const exact = (lookup as Record<string, unknown>).exact;
  return typeof exact === "string" ? { field, value: exact } : null;
}

function statusFilterValues(filter: DataViewFilter, field: string): readonly string[] {
  const lookup = filter[field];
  if (!lookup || typeof lookup !== "object" || Array.isArray(lookup)) return [];
  const exact = (lookup as Record<string, unknown>).exact;
  if (typeof exact === "string") return [exact];
  const inList = (lookup as Record<string, unknown>).inList;
  return Array.isArray(inList)
    ? inList.filter((value): value is string => typeof value === "string")
    : [];
}

function textFilterValue(filter: DataViewFilter): string {
  const title = filter.title;
  if (!title || typeof title !== "object" || Array.isArray(title)) return "";
  const value = (title as Record<string, unknown>).iContains;
  return typeof value === "string" ? value : "";
}

function nextTextFilter(filter: DataViewFilter, value: string): DataViewFilter {
  const next = { ...filter };
  const trimmed = value.trim();
  if (trimmed) next.title = { iContains: trimmed };
  else delete next.title;
  return next;
}

function createLabelForModel(model: string): string {
  const name = model.split(".").at(-1) ?? "record";
  return `New ${groupFieldLabel(name).toLowerCase()}`;
}
