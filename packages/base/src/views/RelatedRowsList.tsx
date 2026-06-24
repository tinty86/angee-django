import * as React from "react";
import type {
  Row,
} from "@angee/resources";
import {
  useList,
  type BaseRecord,
  type HttpError,
  } from "@refinedev/core";
import {
  crudFiltersFromFilterRecord,
  DEFAULT_PAGE_SIZE,
  refineFieldsFromPaths,
  refineSortersFromAngeeOrder,
  } from "@angee/refine";
import {
  refineResourceName,
  useModelMetadata,
} from "@angee/resources";

import {
  RowsListView,
  type RowsListViewProps,
} from "./RowsListView";
import type { StringIdRow } from "./resource-view-surface";

type RelatedRowsFilter = Record<string, unknown>;
type RelatedRowsOrder = Record<string, unknown>;

export interface RelatedRowsListProps<
  TRow extends StringIdRow = StringIdRow,
> extends Omit<
    RowsListViewProps<TRow>,
    "rows" | "fetching" | "error" | "scope"
  > {
  resource: string;
  recordId: string;
  fields: readonly string[];
  filterFor: (recordId: string) => RelatedRowsFilter;
  order?: RelatedRowsOrder;
  enabled?: boolean;
}

export function RelatedRowsList<
  TRow extends StringIdRow = StringIdRow,
>({
  resource,
  recordId,
  fields,
  filterFor,
  order,
  enabled = true,
  pageSize,
  ...rowsListProps
}: RelatedRowsListProps<TRow>): React.ReactElement {
  const queryFields = React.useMemo(
    () => (fields.includes("id") ? fields : ["id", ...fields]),
    [fields],
  );
  const filter = React.useMemo(
    () => filterFor(recordId),
    [filterFor, recordId],
  );
  const metadata = useModelMetadata(resource);
  const dataResource = metadata?.resource ?? null;
  const listMeta = React.useMemo(
    () => ({ fields: refineFieldsFromPaths(queryFields) }),
    [queryFields],
  );
  const refineFilters = React.useMemo(
    () => crudFiltersFromFilterRecord(filter),
    [filter],
  );
  const refineSorters = React.useMemo(
    () => refineSortersFromAngeeOrder(order),
    [order],
  );
  const run = useList<RowRecord, HttpError>({
    resource: dataResource ? refineResourceName(dataResource) : "__angee_disabled__",
    dataProviderName: dataResource?.schemaName,
    pagination: {
      mode: "server",
      currentPage: 1,
      pageSize: pageSize ?? DEFAULT_PAGE_SIZE,
    },
    filters: refineFilters,
    sorters: refineSorters,
    meta: listMeta,
    queryOptions: {
      enabled: enabled && Boolean(recordId) && dataResource !== null,
    },
  });
  const rows = (run.result.data ?? []) as readonly TRow[];

  return (
    <RowsListView<TRow>
      {...rowsListProps}
      rows={rows}
      fetching={run.query.isFetching}
      error={errorFromUnknown(run.query.error)}
      pageSize={pageSize}
      scope="local"
    />
  );
}

type RowRecord = BaseRecord & Row;

function errorFromUnknown(error: unknown): Error | null {
  if (!error) return null;
  if (error instanceof Error) return error;
  if (typeof error === "object" && "message" in error) {
    return new Error(String((error as { message?: unknown }).message));
  }
  return new Error(String(error));
}
