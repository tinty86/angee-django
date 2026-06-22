import * as React from "react";
import {
  useGraphQLProviderAvailable,
  useResourceFacets,
  type ModelFieldMetadata,
  type ModelMetadata,
  type ResourceFacetOption,
  type ResourceFacetSpec,
} from "@angee/sdk";

import type {
  DataToolbarFilterField,
  DataToolbarFilterOption,
} from "../toolbars";
import type { DataViewFilter, DataViewGroup } from "./data-view-model";
import {
  dataViewGroupToAggregateDimension,
  groupKey,
} from "./ListInternals";
import { groupLabel } from "./model-metadata-defaults";
import type { ColumnDescriptor } from "./page";

const SCALAR_FACET_OPTION_LIMIT = 200;
const EMPTY_FILTER_OPTIONS: readonly DataToolbarFilterOption[] = [];
const EMPTY_FILTER_FIELDS: readonly DataToolbarFilterField[] = [];
const EMPTY_SCALAR_FACETS: ScalarFacets = {
  filters: EMPTY_FILTER_OPTIONS,
  filterFields: EMPTY_FILTER_FIELDS,
};

export interface ScalarFacets {
  filters: readonly DataToolbarFilterOption[];
  filterFields: readonly DataToolbarFilterField[];
}

export interface ScalarFacetDeclaration {
  id: string;
  field: string;
  label: React.ReactNode;
  group: DataViewGroup;
  spec: ResourceFacetSpec;
}

/** Build server-backed scalar choice facets from the model's data-query metadata. */
export function useScalarFacets<TRow extends object>(
  model: string,
  columns: readonly ColumnDescriptor<TRow>[],
  metadata: ModelMetadata | null,
  activeFilter?: DataViewFilter,
): ScalarFacets {
  const canQueryFacets = useGraphQLProviderAvailable();
  const facets = React.useMemo(
    () => scalarFacetDeclarations(columns, metadata),
    [columns, metadata],
  );
  const facetSpecs = React.useMemo(
    () => facets.map((facet) => facet.spec),
    [facets],
  );
  const facetQuery = useResourceFacets(model, {
    facets: facetSpecs,
    ...(activeFilter !== undefined ? { filter: activeFilter } : {}),
    enabled: canQueryFacets && facetSpecs.length > 0,
  });
  const filters = React.useMemo<readonly DataToolbarFilterOption[]>(
    () =>
      canQueryFacets
        ? facets.flatMap((facet) => {
            const result = facetQuery.facets[facet.id];
            return (result?.options ?? []).map((option) =>
              scalarFilterOption(facet, option, metadata),
            );
          })
        : EMPTY_FILTER_OPTIONS,
    [canQueryFacets, facetQuery.facets, facets, metadata],
  );
  const filterFields = React.useMemo<readonly DataToolbarFilterField[]>(
    () =>
      canQueryFacets
        ? facets.flatMap((facet) => {
            const result = facetQuery.facets[facet.id];
            if (!result || result.options.length === 0) return [];
            return [{
              id: facet.field,
              field: facet.field,
              label: facet.label,
              type: "selection",
              options: result.options.map((option) => ({
                value: option.value,
                label: scalarFacetOptionLabel(facet, option, metadata),
              })),
            }];
          })
        : EMPTY_FILTER_FIELDS,
    [canQueryFacets, facetQuery.facets, facets, metadata],
  );

  return React.useMemo(
    () =>
      facets.length > 0
        ? { filters, filterFields }
        : EMPTY_SCALAR_FACETS,
    [facets.length, filterFields, filters],
  );
}

function scalarFilterOption(
  facet: ScalarFacetDeclaration,
  option: ResourceFacetOption,
  metadata: ModelMetadata | null,
): DataToolbarFilterOption {
  const label = scalarFacetOptionLabel(facet, option, metadata);
  return {
    id: `${facet.field}:${option.value}`,
    label,
    chipLabel: label,
    filter: option.filter
      ? (option.filter as DataViewFilter)
      : { [facet.field]: { exact: option.value } },
  };
}

function scalarFacetOptionLabel(
  facet: ScalarFacetDeclaration,
  option: ResourceFacetOption,
  metadata: ModelMetadata | null,
): React.ReactNode {
  const value = option.key[facet.spec.valueKey ?? facet.field] ?? option.value;
  return groupKey(value, facet.group, metadata);
}

export function scalarFacetDeclarations<TRow extends object>(
  columns: readonly ColumnDescriptor<TRow>[],
  metadata: ModelMetadata | null,
): readonly ScalarFacetDeclaration[] {
  if (!metadata?.dataQuery) return [];
  const filterable = new Set(metadata.dataQuery.filterFields);
  const groupable = new Set(metadata.dataQuery.groupByFields);
  const columnsByField = new Map(columns.map((column) => [column.field, column]));
  const facets: ScalarFacetDeclaration[] = [];
  const seen = new Set<string>();

  for (const alias of metadata.dataQuery.groupAliases ?? []) {
    if (!filterable.has(alias.aggregateField)) continue;
    if (!groupable.has(alias.aggregateField)) continue;
    const field = metadata.fields[alias.aggregateField];
    if (!isCategoricalScalar(field, columnsByField.get(alias.field))) continue;
    const group = {
      field: alias.field,
      aggregateField: alias.aggregateField,
      aggregateKey: alias.aggregateKey,
    };
    addScalarFacet(facets, seen, metadata, alias.aggregateField, group, {
      labelField: alias.field,
    });
  }

  for (const fieldName of metadata.dataQuery.filterFields) {
    if (!groupable.has(fieldName) || seen.has(fieldName)) continue;
    const field = metadata.fields[fieldName];
    if (!isCategoricalScalar(field, columnsByField.get(fieldName))) continue;
    addScalarFacet(facets, seen, metadata, fieldName, { field: fieldName });
  }

  return facets;
}

function addScalarFacet(
  facets: ScalarFacetDeclaration[],
  seen: Set<string>,
  metadata: ModelMetadata,
  fieldName: string,
  group: DataViewGroup,
  options: { labelField?: string } = {},
): void {
  const identity = dataViewGroupToAggregateDimension(group);
  const labelField = options.labelField ?? fieldName;
  const label = groupLabel(labelField, metadata.fields[labelField]);
  seen.add(fieldName);
  facets.push({
    id: fieldName,
    field: fieldName,
    label,
    group,
    spec: {
      id: fieldName,
      groups: [identity],
      ...(identity.key ? { valueKey: identity.key } : {}),
      neutralizeFilterFields: [fieldName],
      pageSize: SCALAR_FACET_OPTION_LIMIT,
    },
  });
}

function isCategoricalScalar<TRow extends object>(
  field: ModelFieldMetadata | undefined,
  column: ColumnDescriptor<TRow> | undefined,
): boolean {
  if (field?.kind === "enum") return true;
  if (field?.kind !== "scalar" || field.scalar !== "String") return false;
  if (column?.options && column.options.length > 0) return true;
  if (column?.tone) return true;
  return column?.widget === "statusBadge" || field.name === "status";
}
