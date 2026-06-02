// Leaf row/column/cell primitives for the data-view list surfaces: record rows,
// `cellContent`, column building, and the group key/label helpers. Imports only
// ui/sdk/page leaves — it must NOT import ListView or grouped-list, so both can
// depend on it without a cycle (list-internals <- grouped-list <- ListView).
import * as React from "react";
import {
  flexRender,
  type Cell as TableCellModel,
  type Column as TableColumn,
  type ColumnDef,
  type Row as TableRowModel,
} from "@tanstack/react-table";
import { useNavigate } from "@tanstack/react-router";
import type {
  AggregateBucket,
  GroupByDimension,
  Row,
} from "@angee/sdk";
import { format, formatDistanceToNow } from "date-fns";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
} from "lucide-react";

import { Badge } from "../ui/badge";
import { Checkbox } from "../ui/checkbox";
import { Chip } from "../ui/chip";
import {
  TableCell,
  TableRow,
} from "../ui/table";
import type { DataViewContextValue } from "./data-view-context";
import type { DataViewGroup } from "./data-view-model";
import type {
  ColumnDescriptor,
  PageColumnAlign,
} from "./page";

export type ColumnAlign = PageColumnAlign;
export type ListColumn<TRow extends Row = Row> = ColumnDescriptor<TRow>;

export type RowGroup<TRow extends Row> = {
  key: string;
  label: string | null;
  path: readonly string[];
  depth: number;
  rows: readonly TableRowModel<TRow>[];
  children: readonly RowGroup<TRow>[];
};

export type ListRenderItem<TRow extends Row> =
  | { kind: "group"; group: RowGroup<TRow> }
  | { kind: "row"; row: TableRowModel<TRow> };

export const ALIGN_CLASS: Record<PageColumnAlign, string> = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
};
export const LIST_VIEW_SCROLL_BUDGET = "calc(100vh - 12rem)";
export const TABLE_SCROLL_STYLE: React.CSSProperties = {
  maxHeight: LIST_VIEW_SCROLL_BUDGET,
};
export const GROUP_ROW_HEIGHT = 32;
export const RECORD_ROW_HEIGHT = 40;

export function buildColumns<TRow extends Row>(
  columns: readonly ColumnDescriptor<TRow>[],
  dataView: DataViewContextValue,
): ColumnDef<TRow>[] {
  return columns.map((column) => ({
    id: column.field,
    header: () => (
      <SortHeader column={column} dataView={dataView}>
        {column.header ?? column.field}
      </SortHeader>
    ),
    cell: ({ row }) => cellContent(column, row.original),
    meta: {
      align: column.align ?? "left",
      label: column.header ?? column.field,
    },
  }));
}

function SortHeader<TRow extends Row>({
  column,
  dataView,
  children,
}: {
  column: ColumnDescriptor<TRow>;
  dataView: DataViewContextValue;
  children: React.ReactNode;
}): React.ReactElement {
  if (column.sortable === false) return <>{children}</>;
  const sort = dataView.state.sort;
  const active = sort?.field === column.field;
  const Icon = !active ? ArrowUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <button
      type="button"
      className="inline-flex min-w-0 items-center gap-1 rounded text-left outline-none hover:text-fg focus-visible:focus-ring"
      aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
      onClick={() => dataView.setSort(nextSort(sort, column.field))}
    >
      <span className="truncate">{children}</span>
      <Icon className="size-3 text-fg-subtle" aria-hidden />
    </button>
  );
}

export function RecordRow<TRow extends Row>({
  row,
  dataView,
  interactive,
  rowHref,
  onRowClick,
}: {
  row: TableRowModel<TRow>;
  dataView: DataViewContextValue;
  interactive: boolean;
  rowHref?: (row: TRow) => string;
  onRowClick?: (row: TRow) => void;
}): React.ReactElement {
  const href = rowHref?.(row.original);
  if (href) {
    return (
      <LinkedRecordRow
        row={row}
        dataView={dataView}
        href={href}
      />
    );
  }
  return (
    <PlainRecordRow
      row={row}
      dataView={dataView}
      interactive={interactive}
      onRowClick={onRowClick}
    />
  );
}

function LinkedRecordRow<TRow extends Row>({
  row,
  dataView,
  href,
}: {
  row: TableRowModel<TRow>;
  dataView: DataViewContextValue;
  href: string;
}): React.ReactElement {
  const id = row.id;
  const selected = dataView.state.selectedIds.has(id);
  const navigate = useNavigate();
  const openHref = React.useCallback(
    (event: React.MouseEvent<HTMLTableRowElement>) => {
      if (isInteractiveTarget(event.target)) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        window.open(href, "_blank", "noopener");
        return;
      }
      event.preventDefault();
      void navigate({ to: href });
    },
    [href, navigate],
  );
  return (
    <TableRow
      interactive
      role="link"
      tabIndex={0}
      data-selected={selected ? "" : undefined}
      onClick={openHref}
      onKeyDown={(event) => {
        if (event.key !== "Enter" || event.target !== event.currentTarget) {
          return;
        }
        event.preventDefault();
        void navigate({ to: href });
      }}
    >
      <TableCell className="w-8">
        <Checkbox
          size="sm"
          aria-label="Select row"
          checked={selected}
          onClick={(event) => event.stopPropagation()}
          onCheckedChange={(checked) =>
            dataView.toggleSelectedId(id, checked)
          }
        />
      </TableCell>
      {row.getVisibleCells().map((cell) => (
        <TableCell
          key={cell.id}
          className={ALIGN_CLASS[alignOf(cell.column.columnDef)]}
        >
          {renderCell(cell)}
        </TableCell>
      ))}
    </TableRow>
  );
}

function PlainRecordRow<TRow extends Row>({
  row,
  dataView,
  interactive,
  onRowClick,
}: {
  row: TableRowModel<TRow>;
  dataView: DataViewContextValue;
  interactive: boolean;
  onRowClick?: (row: TRow) => void;
}): React.ReactElement {
  const id = row.id;
  const selected = dataView.state.selectedIds.has(id);
  return (
    <TableRow
      interactive={interactive}
      data-selected={selected ? "" : undefined}
      onClick={onRowClick ? () => onRowClick(row.original) : undefined}
    >
      <TableCell className="w-8">
        <Checkbox
          size="sm"
          aria-label="Select row"
          checked={selected}
          onClick={(event) => event.stopPropagation()}
          onCheckedChange={(checked) =>
            dataView.toggleSelectedId(id, checked)
          }
        />
      </TableCell>
      {row.getVisibleCells().map((cell, index) => (
        <TableCell
          key={cell.id}
          className={ALIGN_CLASS[alignOf(cell.column.columnDef)]}
        >
          {interactive && index === 0 && onRowClick ? (
            <button
              type="button"
              className="block w-full min-w-0 rounded-sm text-left text-inherit outline-none focus-visible:focus-ring"
              aria-label={`Open ${rowActionLabelForTableColumn(cell.column, row.original)}`}
              onClick={(event) => {
                event.stopPropagation();
                onRowClick(row.original);
              }}
            >
              {renderCell(cell)}
            </button>
          ) : (
            renderCell(cell)
          )}
        </TableCell>
      ))}
    </TableRow>
  );
}

export function dataViewGroupToAggregateDimension(
  group: DataViewGroup,
): GroupByDimension {
  return {
    field: graphQLEnumValue(group.field),
    key: aggregateKeyField(group),
    ...(group.granularity
      ? { granularity: group.granularity.toUpperCase() }
      : {}),
  };
}

function aggregateKeyField(group: DataViewGroup): string {
  return group.granularity
    ? `${group.field}${titleCase(group.granularity).replace(/\s+/g, "")}`
    : group.field;
}

export function bucketValueLabels(
  bucket: AggregateBucket,
  groupStack: readonly DataViewGroup[],
): string[] {
  return groupStack.map((group) => {
    const value = bucket.key?.[aggregateKeyField(group)];
    return groupKey(value, group);
  });
}

export function groupKey(value: unknown, group: DataViewGroup): string {
  if (value == null) return "No value";
  const date = parseDate(value);
  if (!date) return typeof value === "string" ? statusLabel(value) : String(value);
  if (group.granularity === "year") return String(date.getFullYear());
  if (group.granularity === "quarter") {
    const quarter = Math.floor(date.getMonth() / 3) + 1;
    return `Q${quarter} ${date.getFullYear()}`;
  }
  if (group.granularity === "month") {
    return format(date, "MMMM yyyy");
  }
  if (group.granularity === "week") {
    return `Week of ${format(date, "MMMM d, yyyy")}`;
  }
  return format(date, "MMMM d, yyyy");
}

export function cellContent<TRow extends Row>(
  column: ColumnDescriptor<TRow>,
  row: TRow,
): React.ReactNode {
  if (column.render) return column.render(row);
  const value = readPath(row, column.field);
  if (column.tone) {
    const label = value == null ? "" : String(value);
    const tone = column.tone[label] ?? "default";
    return <Badge variant={tone}>{label ? statusLabel(label) : "-"}</Badge>;
  }
  if (Array.isArray(value)) {
    return (
      <span className="inline-flex min-w-0 flex-wrap items-center gap-1">
        {value.map((item, index) => (
          <Chip key={`${String(item)}:${index}`} tone="info" size="sm">
            {String(item)}
          </Chip>
        ))}
      </span>
    );
  }
  const date = looksLikeDateField(column.field) ? parseDate(value) : null;
  if (date) return formatDistanceToNow(date, { addSuffix: true });
  return displayValue(value);
}

function renderCell<TRow extends Row>(
  cell: TableCellModel<TRow, unknown>,
): React.ReactNode {
  return flexRender(cell.column.columnDef.cell, cell.getContext());
}

export function tableColumnLabel<TRow extends Row>(
  column: TableColumn<TRow, unknown>,
): React.ReactNode {
  return columnMeta(column.columnDef).label ?? column.id;
}

function rowActionLabelForTableColumn<TRow extends Row>(
  column: TableColumn<TRow, unknown>,
  row: TRow,
): string {
  const value = readPath(row, column.id);
  if (Array.isArray(value)) {
    const label = value.map((item) => String(item)).join(", ").trim();
    return label || "record";
  }
  if (typeof value === "string" && value.trim()) return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return "record";
}

export function readPath(row: Row, path: string): unknown {
  let current: unknown = row;
  for (const key of path.split(".")) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function displayValue(value: unknown): React.ReactNode {
  if (value == null) return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function alignOf<TRow extends Row>(column: ColumnDef<TRow>): PageColumnAlign {
  return columnMeta(column).align ?? "left";
}

function columnMeta<TRow extends Row>(
  column: ColumnDef<TRow>,
): { align?: PageColumnAlign; label?: React.ReactNode } {
  return (
    column.meta as
      | { align?: PageColumnAlign; label?: React.ReactNode }
      | undefined
  ) ?? {};
}

function nextSort(
  current: DataViewContextValue["state"]["sort"],
  field: string,
): DataViewContextValue["state"]["sort"] {
  if (current?.field !== field) return { field, dir: "asc" };
  if (current.dir === "asc") return { field, dir: "desc" };
  return null;
}

function isInteractiveTarget(target: EventTarget): boolean {
  return target instanceof HTMLElement
    && Boolean(
      target.closest(
        "a,button,input,select,textarea,label,[role='button'],[role='menuitem'],[role='checkbox']",
      ),
    );
}

function graphQLEnumValue(field: string): string {
  return field
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[-\s]+/g, "_")
    .toUpperCase();
}

export function groupFieldLabel(field: string): string {
  const label = titleCase(field);
  return label.endsWith(" At") ? label.slice(0, -3) : label;
}

export function statusLabel(value: string): string {
  return titleCase(value.toLowerCase());
}

function titleCase(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function looksLikeDateField(field: string): boolean {
  return /(?:At|Date|On)$/.test(field);
}

function parseDate(value: unknown): Date | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? null : date;
}
