import * as React from "react";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from "@tanstack/react-table";
import {
  useResourceList,
  type ResourceTypeName,
  type Row,
  type UseResourceListOptions,
  type UseResourceListResult,
} from "@angee/sdk";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";

import { Badge, type BadgeVariant } from "../ui/badge";
import { Button } from "../ui/button";
import { Spinner } from "../ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";

/** How a cell's value lines up within its column. */
export type ColumnAlign = "left" | "center" | "right";

/** One displayed column: where its value comes from and how it renders. */
export interface ListColumn<TRow extends Row = Row> {
  /** Dotted field path read for the cell value and the requested selection. */
  field: string;
  /** Header label; defaults to the field path. */
  header?: React.ReactNode;
  /** Custom cell renderer; receives the whole row. Falls back to the raw value. */
  render?: (row: TRow) => React.ReactNode;
  /** Horizontal alignment of the header and cells. */
  align?: ColumnAlign;
  /**
   * Render the value as a status `Badge`. The map turns an enum value into a
   * badge tone; unmapped values use `"default"`.
   */
  status?: Record<string, BadgeVariant>;
}

export interface ListViewProps<TRow extends Row = Row> {
  /** Model label, e.g. `"notes.Note"`. */
  model: string;
  /** Displayed columns; their field paths also seed the selection. */
  columns: readonly ListColumn<TRow>[];
  /** Extra field paths to select beyond the visible columns (e.g. `"id"`). */
  fields?: readonly string[];
  filter?: UseResourceListOptions<ResourceTypeName>["filter"];
  order?: UseResourceListOptions<ResourceTypeName>["order"];
  pageSize?: number;
  /** Called when a row is activated. */
  onRowClick?: (row: TRow) => void;
  /** Builds a link target for a row; renders cells as anchors when set. */
  rowHref?: (row: TRow) => string;
  /** Message shown when the query returns no rows. */
  emptyMessage?: React.ReactNode;
  className?: string;
}

const ALIGN_CLASS: Record<ColumnAlign, string> = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
};

/** Read a dotted path (`"author.name"`) out of a row, or `undefined`. */
function readPath(row: Row, path: string): unknown {
  let current: unknown = row;
  for (const key of path.split(".")) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

/** A plain, printable form of a scalar cell value. */
function displayValue(value: unknown): React.ReactNode {
  if (value == null) return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function defaultCell<TRow extends Row>(
  column: ListColumn<TRow>,
  row: TRow,
): React.ReactNode {
  if (column.render) return column.render(row);
  const value = readPath(row, column.field);
  if (column.status) {
    const key = value == null ? "" : String(value);
    const tone = column.status[key] ?? "default";
    return <Badge variant={tone}>{key || "—"}</Badge>;
  }
  return displayValue(value);
}

function buildColumns<TRow extends Row>(
  columns: readonly ListColumn<TRow>[],
): ColumnDef<TRow>[] {
  return columns.map((column, index) => ({
    id: `${column.field}#${index}`,
    header: () => column.header ?? column.field,
    cell: ({ row }) => defaultCell(column, row.original),
    meta: { align: column.align ?? "left" },
  }));
}

function alignOf<TRow extends Row>(column: ColumnDef<TRow>): ColumnAlign {
  const meta = column.meta as { align?: ColumnAlign } | undefined;
  return meta?.align ?? "left";
}

/** First/prev/next/last controls plus a page-of-pages and total readout. */
function Pager({ list }: { list: UseResourceListResult }): React.ReactElement {
  const pageCount = list.pageCount ?? 1;
  return (
    <div className="flex items-center justify-between gap-3 border-t border-border px-3 py-2 text-13 text-fg-muted">
      <span>
        {list.total ?? 0} total
      </span>
      <div className="flex items-center gap-2">
        <span>
          Page {list.page} of {pageCount}
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="iconSm"
            aria-label="First page"
            disabled={!list.hasPrev}
            onClick={list.firstPage}
          >
            <ChevronsLeft className="glyph" aria-hidden />
          </Button>
          <Button
            variant="ghost"
            size="iconSm"
            aria-label="Previous page"
            disabled={!list.hasPrev}
            onClick={list.prevPage}
          >
            <ChevronLeft className="glyph" aria-hidden />
          </Button>
          <Button
            variant="ghost"
            size="iconSm"
            aria-label="Next page"
            disabled={!list.hasNext}
            onClick={list.nextPage}
          >
            <ChevronRight className="glyph" aria-hidden />
          </Button>
          <Button
            variant="ghost"
            size="iconSm"
            aria-label="Last page"
            disabled={!list.hasNext}
            onClick={list.lastPage}
          >
            <ChevronsRight className="glyph" aria-hidden />
          </Button>
        </div>
      </div>
    </div>
  );
}

/** A paginated table of records, selecting exactly the columns' fields. */
export function ListView<TRow extends Row = Row>({
  model,
  columns,
  fields,
  filter,
  order,
  pageSize,
  onRowClick,
  rowHref,
  emptyMessage = "No records.",
  className,
}: ListViewProps<TRow>): React.ReactElement {
  const selection = React.useMemo(() => {
    const paths = new Set<string>(["id"]);
    for (const column of columns) paths.add(column.field);
    for (const extra of fields ?? []) paths.add(extra);
    return [...paths];
  }, [columns, fields]);

  const list = useResourceList(model, {
    fields: selection,
    filter,
    order,
    pageSize,
  });

  const tableColumns = React.useMemo(() => buildColumns(columns), [columns]);
  const data = list.rows as readonly TRow[];
  const table = useReactTable<TRow>({
    data: data as TRow[],
    columns: tableColumns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row, index) =>
      typeof row.id === "string" ? row.id : String(index),
  });

  const interactive = Boolean(onRowClick || rowHref);
  const headerGroups = table.getHeaderGroups();
  const rows = table.getRowModel().rows;

  return (
    <div
      className={["overflow-hidden rounded-md border border-border bg-sheet", className]
        .filter(Boolean)
        .join(" ")}
    >
      {list.error ? (
        <div className="px-3 py-6 text-13 text-danger-text">
          {list.error.message}
        </div>
      ) : (
        <>
          <Table>
            <TableHeader>
              {headerGroups.map((group) => (
                <TableRow key={group.id}>
                  {group.headers.map((header) => (
                    <TableHead
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
            <TableBody>
              {rows.length === 0 && !list.fetching ? (
                <TableRow>
                  <TableCell
                    colSpan={Math.max(1, columns.length)}
                    className="py-8 text-center text-fg-muted"
                  >
                    {emptyMessage}
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => (
                  <TableRow
                    key={row.id}
                    interactive={interactive}
                    onClick={
                      onRowClick ? () => onRowClick(row.original) : undefined
                    }
                  >
                    {row.getVisibleCells().map((cell) => {
                      const href = rowHref?.(row.original);
                      const content = flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      );
                      return (
                        <TableCell
                          key={cell.id}
                          className={ALIGN_CLASS[alignOf(cell.column.columnDef)]}
                        >
                          {href ? (
                            <a href={href} className="block text-inherit no-underline">
                              {content}
                            </a>
                          ) : (
                            content
                          )}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          {list.fetching ? (
            <div className="flex items-center justify-center gap-2 border-t border-border px-3 py-4 text-13 text-fg-muted">
              <Spinner size="sm" />
              Loading…
            </div>
          ) : (
            <Pager list={list} />
          )}
        </>
      )}
    </div>
  );
}
