// Server-driven grouped list body: folded group buckets (top pager pages the
// groups) whose rows are fetched lazily per group via the bucket filter echo.
// Imports the shared seam from ./list-internals and Pager from ../ui/pager;
// must NOT import ListView (ListView depends on this module, not vice versa).
import * as React from "react";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type Table as TableModel,
  type VisibilityState,
} from "@tanstack/react-table";
import {
  useResourceGroupBy,
  useResourceList,
  type AggregateBucket,
  type GroupByDimension,
  type ResourceTypeName,
  type Row,
  type UseResourceListOptions,
} from "@angee/sdk";
import {
  ChevronDown,
  ChevronRight,
} from "lucide-react";

import { cn } from "../lib/cn";
import { CountBadge } from "../ui/badge";
import { Pager } from "../ui/pager";
import { Spinner } from "../ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";
import type { DataViewContextValue } from "./data-view-context";
import type {
  DataViewGroup,
  DataViewResourceOrder,
} from "./data-view-model";
import {
  ALIGN_CLASS,
  RecordRow,
  TABLE_SCROLL_STYLE,
  alignOf,
  bucketValueLabels,
  groupFieldLabel,
} from "./list-internals";

const GROUPED_LIST_ITEM_PAGE_SIZE = 20;

function formatPagerNumber(value: number): string {
  return value.toLocaleString();
}

export interface GroupPagerState {
  total: number;
  fetching: boolean;
  error: Error | null;
}

export function groupPagerStatesEqual(
  left: GroupPagerState | null,
  right: GroupPagerState,
): boolean {
  return (
    left !== null &&
    left.total === right.total &&
    left.fetching === right.fetching &&
    left.error === right.error
  );
}

export interface GroupedListBodyProps<TRow extends Row> {
  model: string;
  table: TableModel<TRow>;
  tableColumns: readonly ColumnDef<TRow>[];
  columnVisibility: VisibilityState;
  visibleColumnCount: number;
  dataView: DataViewContextValue;
  groupDimensions: readonly GroupByDimension[];
  requestedFields: readonly string[];
  mergedFilter: UseResourceListOptions<ResourceTypeName>["filter"];
  sortOrder: DataViewResourceOrder | undefined;
  order: UseResourceListOptions<ResourceTypeName>["order"];
  interactive: boolean;
  rowHref?: (row: TRow) => string;
  onRowClick?: (row: TRow) => void;
  emptyMessage: React.ReactNode;
  onPagerStateChange: (state: GroupPagerState) => void;
}

export function GroupedListBody<TRow extends Row>({
  model,
  table,
  tableColumns,
  columnVisibility,
  visibleColumnCount,
  dataView,
  groupDimensions,
  requestedFields,
  mergedFilter,
  sortOrder,
  order,
  interactive,
  rowHref,
  onRowClick,
  emptyMessage,
  onPagerStateChange,
}: GroupedListBodyProps<TRow>): React.ReactElement {
  const groupAggregation = useResourceGroupBy(model, {
    dimensions: groupDimensions,
    filter: mergedFilter,
    page: dataView.state.page,
    pageSize: dataView.state.pageSize,
    withFilterEcho: true,
  });
  React.useEffect(() => {
    onPagerStateChange({
      total: groupAggregation.totalCount,
      fetching: groupAggregation.fetching,
      error: groupAggregation.error,
    });
  }, [
    groupAggregation.error,
    groupAggregation.fetching,
    groupAggregation.totalCount,
    onPagerStateChange,
  ]);

  // stableBucketKey maps are intentionally not pruned; old entries restore state when groups reappear.
  const [expandedKeys, setExpandedKeys] = React.useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [pageByKey, setPageByKey] = React.useState<Record<string, number>>({});
  const toggleExpanded = React.useCallback((key: string) => {
    setExpandedKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);
  const setGroupPage = React.useCallback((key: string, page: number) => {
    setPageByKey((current) => ({
      ...current,
      [key]: normaliseLocalPage(page),
    }));
  }, []);
  const colSpan = Math.max(1, visibleColumnCount + 1);
  const hasBuckets = groupAggregation.buckets.length > 0;

  return (
    <>
      <div className="overflow-auto" style={TABLE_SCROLL_STYLE}>
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id}>
                {/* Grouped mode omits page-level select-all; per-row selection still works. */}
                <TableHead sticky className="w-8" />
                {group.headers.map((header) => (
                  <TableHead
                    sticky
                    key={header.id}
                    className={ALIGN_CLASS[alignOf(header.column.columnDef)]}
                  >
                    {flexRender(
                      header.column.columnDef.header,
                      header.getContext(),
                    )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          {groupAggregation.error ? (
            <TableBody>
              <TableRow>
                <TableCell
                  colSpan={colSpan}
                  className="py-6 text-danger-text"
                >
                  {groupAggregation.error.message}
                </TableCell>
              </TableRow>
            </TableBody>
          ) : !hasBuckets && !groupAggregation.fetching ? (
            <TableBody>
              <TableRow>
                <TableCell
                  colSpan={colSpan}
                  className="py-8 text-center text-fg-muted"
                >
                  {emptyMessage}
                </TableCell>
              </TableRow>
            </TableBody>
          ) : (
            groupAggregation.buckets.map((bucket) => {
              const key = stableBucketKey(bucket);
              return (
                <GroupSection
                  key={key}
                  model={model}
                  bucket={bucket}
                  bucketKey={key}
                  groupStack={dataView.state.groupStack}
                  tableColumns={tableColumns}
                  columnVisibility={columnVisibility}
                  colSpan={colSpan}
                  dataView={dataView}
                  requestedFields={requestedFields}
                  sortOrder={sortOrder}
                  order={order}
                  interactive={interactive}
                  rowHref={rowHref}
                  onRowClick={onRowClick}
                  expanded={expandedKeys.has(key)}
                  page={pageByKey[key] ?? 1}
                  onToggle={toggleExpanded}
                  onPageChange={setGroupPage}
                />
              );
            })
          )}
        </Table>
      </div>
      {groupAggregation.fetching ? (
        <div className="flex items-center justify-center gap-2 border-t border-border px-3 py-4 text-13 text-fg-muted">
          <Spinner size="sm" />
          Loading...
        </div>
      ) : null}
    </>
  );
}

function GroupSection<TRow extends Row>({
  model,
  bucket,
  bucketKey,
  groupStack,
  tableColumns,
  columnVisibility,
  colSpan,
  dataView,
  requestedFields,
  sortOrder,
  order,
  interactive,
  rowHref,
  onRowClick,
  expanded,
  page,
  onToggle,
  onPageChange,
}: {
  model: string;
  bucket: AggregateBucket;
  bucketKey: string;
  groupStack: readonly DataViewGroup[];
  tableColumns: readonly ColumnDef<TRow>[];
  columnVisibility: VisibilityState;
  colSpan: number;
  dataView: DataViewContextValue;
  requestedFields: readonly string[];
  sortOrder: DataViewResourceOrder | undefined;
  order: UseResourceListOptions<ResourceTypeName>["order"];
  interactive: boolean;
  rowHref?: (row: TRow) => string;
  onRowClick?: (row: TRow) => void;
  expanded: boolean;
  page: number;
  onToggle: (key: string) => void;
  onPageChange: (key: string, page: number) => void;
}): React.ReactElement {
  const headerId = React.useId();
  const regionId = React.useId();
  const expandable = bucket.filter !== undefined && bucket.filter !== null;
  const label = bucketLabel(bucket, groupStack);
  const pageCount = Math.max(
    1,
    Math.ceil(bucket.count / GROUPED_LIST_ITEM_PAGE_SIZE),
  );
  const currentPage = Math.min(page, pageCount);
  const list = useResourceList(model, {
    fields: requestedFields,
    filter: bucket.filter ?? undefined,
    order: sortOrder ?? order,
    page: currentPage,
    pageSize: GROUPED_LIST_ITEM_PAGE_SIZE,
    enabled: expanded && expandable,
  });
  const rows = list.rows as readonly TRow[];
  // Lazy per-group fetches need row models here; onColumnVisibilityChange is omitted because parent visibility is read-only.
  const table = useReactTable<TRow>({
    data: rows as TRow[],
    columns: tableColumns as ColumnDef<TRow>[],
    state: { columnVisibility },
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row, index) =>
      typeof row.id === "string" ? row.id : String(index),
    autoResetPageIndex: false,
    autoResetExpanded: false,
  });
  const rowModels = table.getRowModel().rows;

  return (
    <>
      <TableBody>
        <TableRow>
          <TableCell colSpan={colSpan} className="h-9 bg-sheet-2 p-0">
            <button
              id={headerId}
              type="button"
              className={cn(
                "flex min-h-9 w-full min-w-0 items-center gap-3 px-3 py-1.5 text-left text-13 outline-none focus-visible:focus-ring",
                expandable
                  ? "text-fg hover:bg-inset"
                  : "cursor-not-allowed text-fg-muted",
              )}
              aria-expanded={expandable ? expanded : false}
              aria-controls={expandable ? regionId : undefined}
              aria-disabled={!expandable}
              onClick={() => {
                if (expandable) onToggle(bucketKey);
              }}
            >
              {expanded && expandable ? (
                <ChevronDown className="size-3.5 shrink-0 text-fg-muted" aria-hidden />
              ) : (
                <ChevronRight className="size-3.5 shrink-0 text-fg-muted" aria-hidden />
              )}
              <span className="min-w-0 flex-1 truncate font-semibold">
                {label}
              </span>
              <span className="inline-flex shrink-0 items-center gap-2">
                <CountBadge value={bucket.count} />
                {!expandable ? (
                  <span className="text-13 font-normal text-fg-muted">
                    Items unavailable
                  </span>
                ) : null}
              </span>
            </button>
          </TableCell>
        </TableRow>
      </TableBody>
      {expanded && expandable ? (
        <TableBody id={regionId}>
          {list.error ? (
            <TableRow>
              <TableCell colSpan={colSpan} className="py-4 text-danger-text">
                {list.error.message}
              </TableCell>
            </TableRow>
          ) : list.fetching ? (
            <TableRow>
              <TableCell colSpan={colSpan} className="py-4 text-fg-muted">
                <span className="inline-flex items-center gap-2">
                  <Spinner size="sm" />
                  Loading...
                </span>
              </TableCell>
            </TableRow>
          ) : rowModels.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={colSpan}
                className="py-4 text-center text-fg-muted"
              >
                No records in this group.
              </TableCell>
            </TableRow>
          ) : (
            rowModels.map((row) => (
              <RecordRow
                key={row.id}
                row={row}
                dataView={dataView}
                interactive={interactive}
                rowHref={rowHref}
                onRowClick={onRowClick}
              />
            ))
          )}
          {!list.error && !list.fetching && bucket.count > 0 ? (
            <TableRow>
              <TableCell colSpan={colSpan} className="bg-sheet py-2">
                <nav
                  aria-label={`${label} records`}
                  className="flex items-center justify-end gap-2 text-13 text-fg-muted"
                >
                  <Pager
                    page={currentPage}
                    pageSize={GROUPED_LIST_ITEM_PAGE_SIZE}
                    total={bucket.count}
                    onPageChange={(next) => onPageChange(bucketKey, next)}
                    labelElement="span"
                    previousLabel={`Previous ${label} records`}
                    nextLabel={`Next ${label} records`}
                    formatNumber={formatPagerNumber}
                  />
                </nav>
              </TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      ) : null}
    </>
  );
}

function stableBucketKey(bucket: AggregateBucket): string {
  return stableSerialize(bucket.key ?? null);
}

function bucketLabel(
  bucket: AggregateBucket,
  groupStack: readonly DataViewGroup[],
): string {
  const labels = bucketValueLabels(bucket, groupStack);
  if (labels.length === 0) return "All records";
  if (labels.length === 1) return labels[0] ?? "All records";
  return labels
    .map((label, index) => {
      const group = groupStack[index];
      return group ? `${groupFieldLabel(group.field)}: ${label}` : label;
    })
    .join(" / ");
}

function normaliseLocalPage(page: number): number {
  if (!Number.isFinite(page)) return 1;
  return Math.max(1, Math.floor(page));
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`)
      .join(",")}}`;
  }
  if (value === undefined) return "undefined";
  return JSON.stringify(value);
}
