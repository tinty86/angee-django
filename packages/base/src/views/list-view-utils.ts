import type { Row } from "@angee/sdk";

import type { DataToolbarFilterOption } from "../toolbars";
import {
  Filter,
  type DataViewFilter,
} from "./data-view-model";
import {
  groupFieldLabel,
  readPath,
  statusLabel,
} from "./ListInternals";
import type { ColumnDescriptor } from "./page";

export function buildFilterOptions<TRow extends Row>(
  columns: readonly ColumnDescriptor<TRow>[],
  rows: readonly TRow[],
): readonly DataToolbarFilterOption[] {
  return columns.flatMap((column) => {
    if (!supportsChoiceFacet(column)) return [];
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
  if (column.tone) {
    const toneValues = Object.keys(column.tone).filter(
      (key) => key === key.toUpperCase(),
    );
    if (toneValues.length > 0) return toneValues;
  }
  const values = new Set<string>();
  for (const row of rows) {
    const value = readPath(row, column.field);
    if (typeof value === "string" && value.trim()) values.add(value);
  }
  return [...values].sort((left, right) => left.localeCompare(right));
}

export function supportsChoiceFacet<TRow extends Row>(
  column: ColumnDescriptor<TRow>,
): boolean {
  if (column.tone) return true;
  // TODO: derive facet/group fields from addon/schema choices, not a
  // hardcoded lifecycle status field.
  return column.field === "status";
}

export function activeFilterIdsFor(
  filter: DataViewFilter,
  options: readonly DataToolbarFilterOption[],
): readonly string[] {
  const value = Filter.from(filter);
  return options.flatMap((option) => {
    const facet = Filter.facetFromFilter(option.filter);
    if (!facet) return [];
    return value.facetValues(facet.field).includes(facet.value)
      ? [option.id]
      : [];
  });
}

export function nextFacetFilter(
  filter: DataViewFilter,
  options: readonly DataToolbarFilterOption[],
  id: string,
): DataViewFilter {
  const option = options.find((candidate) => candidate.id === id);
  const facet = option ? Filter.facetFromFilter(option.filter) : null;
  if (!facet) return filter;
  return Filter.from(filter).toggleFacet(facet);
}

export function textFilterValue(filter: DataViewFilter): string {
  return Filter.from(filter).textTerm();
}

export function nextTextFilter(filter: DataViewFilter, value: string): DataViewFilter {
  return Filter.from(filter).withTextTerm(value);
}

export function createLabelForModel(model: string): string {
  const name = model.split(".").at(-1) ?? "record";
  return `New ${groupFieldLabel(name).toLowerCase()}`;
}
