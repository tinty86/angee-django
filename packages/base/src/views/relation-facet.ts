import * as React from "react";
import {
  useModelMetadata,
  useSchemaFieldMetadata,
} from "@angee/sdk";

import type {
  DataToolbarFilterField,
  DataToolbarFilterOption,
  DataToolbarGroupOption,
} from "../toolbars";
import type { DataViewGroup } from "./data-view-model";
import {
  relationFieldInfo,
  type RelationFieldInfo,
} from "./model-metadata-defaults";
import { useRelationOptions } from "./relation-options";

const RELATION_FACET_OPTION_LIMIT = 200;
const EMPTY_FILTER_OPTIONS: readonly DataToolbarFilterOption[] = [];
const EMPTY_FILTER_FIELDS: readonly DataToolbarFilterField[] = [];

export interface RelationFacetOptions {
  /** Relation field on the current model, e.g. `provider`. */
  field: string;
  /** Toolbar label; defaults to the relation field name. */
  label?: React.ReactNode;
  /** Filter lookup field accepted by the current model filter input. */
  filterField: string;
  /** Aggregate bucket key returned by the API; defaults to `filterField`. */
  aggregateKey?: string;
  /** Related-record display field; defaults to the related model representation. */
  labelField?: string;
  /** Related rows fetched for the facet picker. */
  pageSize?: number;
  /** Custom group axis; `false` suppresses group option generation. */
  group?: DataViewGroup | false;
}

export interface RelationFacet {
  filters: readonly DataToolbarFilterOption[];
  filterFields: readonly DataToolbarFilterField[];
  groupOption?: DataToolbarGroupOption;
}

/** Build toolbar filters/groups for a to-one relation using schema metadata. */
export function useRelationFacet(
  model: string,
  options: RelationFacetOptions,
): RelationFacet {
  const {
    aggregateKey: optionAggregateKey,
    field,
    filterField,
    group,
    label: optionLabel,
    labelField: optionLabelField,
    pageSize = RELATION_FACET_OPTION_LIMIT,
  } = options;
  const schemaMetadata = useSchemaFieldMetadata();
  const modelMetadata = useModelMetadata(model);
  const relation = React.useMemo(
    () => relationFieldInfo(field, modelMetadata, schemaMetadata),
    [field, modelMetadata, schemaMetadata],
  );
  const labelField = optionLabelField ?? relation?.labelField ?? "id";
  const { options: choiceOptions } = useRelationOptions(relation, {
    labelField,
    pageSize,
    sort: true,
  });
  const aggregateKey = optionAggregateKey ?? filterField;
  const label = optionLabel ?? relationLabel(field);
  const filters = React.useMemo<readonly DataToolbarFilterOption[]>(
    () =>
      relation
        ? choiceOptions.map((option) => ({
            id: `${filterField}:${option.value}`,
            label: option.label,
            chipLabel: option.label,
            filter: { [filterField]: { exact: option.value } },
          }))
        : EMPTY_FILTER_OPTIONS,
    [choiceOptions, filterField, relation],
  );
  const filterFields = React.useMemo<readonly DataToolbarFilterField[]>(
    () =>
      relation
        ? [{
            id: filterField,
            field: filterField,
            label,
            type: "selection",
            options: choiceOptions,
          }]
        : EMPTY_FILTER_FIELDS,
    [choiceOptions, filterField, label, relation],
  );
  const groupOption = React.useMemo(
    () =>
      relationGroupOption({
        aggregateKey,
        field,
        group,
        labelField: optionLabelField,
        relation,
        label,
      }),
    [aggregateKey, field, group, label, optionLabelField, relation],
  );

  return React.useMemo(
    () => ({
      filters,
      filterFields,
      ...(groupOption ? { groupOption } : {}),
    }),
    [filterFields, filters, groupOption],
  );
}

function relationGroupOption({
  aggregateKey,
  field,
  group,
  label,
  labelField,
  relation,
}: {
  aggregateKey: string;
  field: string;
  group: DataViewGroup | false | undefined;
  label: React.ReactNode;
  labelField: string | undefined;
  relation: RelationFieldInfo | null;
}): DataToolbarGroupOption | undefined {
  if (!relation || group === false) return undefined;
  const resolvedGroup = group ?? {
    field: `${field}.${labelField ?? relation.labelField}`,
    aggregateField: field,
    aggregateKey,
  };
  return {
    id: resolvedGroup.field,
    label,
    group: resolvedGroup,
  };
}

function relationLabel(field: string): string {
  return field.charAt(0).toUpperCase() + field.slice(1);
}
