import { describe, expect, test } from "vitest";
import type { ModelMetadata, Row } from "@angee/sdk";

import {
  buildFilterFields,
  buildFilterOptions,
  buildGroupOptions,
} from "./list-view-utils";
import {
  columnsWithMetadataDefaults,
  fieldsWithMetadataDefaults,
} from "./model-metadata-defaults";
import type { ColumnDescriptor, FieldDescriptor } from "./page";

const NOTE_METADATA: ModelMetadata = {
  typeName: "NoteType",
  recordRepresentation: "title",
  fields: {
    title: { name: "title", kind: "scalar", scalar: "String", label: "Title" },
    status: {
      name: "status",
      kind: "enum",
      enumName: "NoteStatus",
      label: "Status",
      values: [
        { value: "DRAFT", label: "Draft" },
        { value: "IN_REVIEW", label: "In Review" },
        { value: "ACTIVE", label: "Active" },
      ],
    },
    updatedAt: { name: "updatedAt", kind: "scalar", scalar: "DateTime" },
    wordCount: { name: "wordCount", kind: "scalar", scalar: "Int" },
  },
};

const STATUS_VALUES = required(NOTE_METADATA.fields.status).values;

describe("SDL metadata defaults", () => {
  const columns: readonly ColumnDescriptor<Row>[] = [
    { field: "title" },
    { field: "status", widget: "statusBadge" },
    { field: "updatedAt" },
    { field: "wordCount" },
  ];

  test("applies column and field labels plus enum options without overwriting props", () => {
    const resolvedColumns = columnsWithMetadataDefaults(
      [
        ...columns,
        {
          field: "status",
          header: "Lifecycle",
          widget: "statusBadge",
          options: [{ value: "CUSTOM", label: "Custom" }],
        },
      ],
      NOTE_METADATA,
    );

    expect(resolvedColumns[0]?.header).toBe("Title");
    expect(resolvedColumns[1]?.header).toBe("Status");
    expect(resolvedColumns[1]?.options).toEqual(STATUS_VALUES);
    expect(resolvedColumns[2]?.header).toBe("Updated At");
    expect(resolvedColumns[4]?.header).toBe("Lifecycle");
    expect(resolvedColumns[4]?.options).toEqual([
      { value: "CUSTOM", label: "Custom" },
    ]);

    const fields: readonly FieldDescriptor[] = [
      { name: "title", widget: "text" },
      { name: "status", widget: "statusbar" },
      {
        name: "status",
        widget: "select",
        label: "State",
        options: [{ value: "CUSTOM", label: "Custom" }],
      },
    ];
    const resolvedFields = fieldsWithMetadataDefaults(fields, NOTE_METADATA);

    expect(resolvedFields[0]?.label).toBe("Title");
    expect(resolvedFields[1]?.label).toBe("Status");
    expect(resolvedFields[1]?.options).toEqual(STATUS_VALUES);
    expect(resolvedFields[2]?.label).toBe("State");
    expect(resolvedFields[2]?.options).toEqual([
      { value: "CUSTOM", label: "Custom" },
    ]);
  });

  test("resolves the default widget for a bare field from its SDL kind/scalar", () => {
    const policyMetadata: ModelMetadata = {
      typeName: "OAuthClientType",
      fields: {
        isEnabled: { name: "isEnabled", kind: "scalar", scalar: "Boolean" },
        environment: { name: "environment", kind: "scalar", scalar: "String" },
        status: {
          name: "status",
          kind: "enum",
          enumName: "ConfigState",
          values: [{ value: "READY", label: "Ready" }],
        },
        defaultScopes: { name: "defaultScopes", kind: "list", scalar: "String" },
        vendor: { name: "vendor", kind: "relation", relationTarget: "VendorType" },
      },
    };
    const resolved = fieldsWithMetadataDefaults(
      [
        { name: "isEnabled" },
        { name: "environment" },
        { name: "status" },
        { name: "defaultScopes" },
        { name: "vendor" },
        { name: "isEnabled", widget: "booleanBadge" },
      ],
      policyMetadata,
    );
    expect(resolved[0]?.widget).toBe("switch"); // Boolean → switch (was text → submitted "")
    expect(resolved[1]?.widget).toBeUndefined(); // plain String → FormView text fallback
    expect(resolved[2]?.widget).toBe("select"); // enum → select, with options
    expect(resolved[2]?.options).toHaveLength(1);
    expect(resolved[3]?.widget).toBe("tagInput"); // string list → tag input
    expect(resolved[4]?.widget).toBe("many2one"); // relation → picker
    expect(resolved[5]?.widget).toBe("booleanBadge"); // explicit widget is preserved
  });

  test("derives list filter fields, enum filter chips, and group options", () => {
    const resolvedColumns = columnsWithMetadataDefaults(columns, NOTE_METADATA);
    const filterFields = buildFilterFields(resolvedColumns, [], NOTE_METADATA);

    expect(filterFields).toEqual([
      {
        id: "title",
        field: "title",
        label: "Title",
        type: "text",
      },
      {
        id: "status",
        field: "status",
        label: "Status",
        type: "selection",
        options: STATUS_VALUES,
      },
      {
        id: "updatedAt",
        field: "updatedAt",
        label: "Updated At",
        type: "datetime",
      },
    ]);

    expect(buildFilterOptions(resolvedColumns, [], filterFields)).toEqual([
      {
        id: "status:DRAFT",
        label: "Draft",
        chipLabel: "Draft",
        filter: { status: { exact: "DRAFT" } },
      },
      {
        id: "status:IN_REVIEW",
        label: "In Review",
        chipLabel: "In Review",
        filter: { status: { exact: "IN_REVIEW" } },
      },
      {
        id: "status:ACTIVE",
        label: "Active",
        chipLabel: "Active",
        filter: { status: { exact: "ACTIVE" } },
      },
    ]);

    expect(buildGroupOptions(resolvedColumns, NOTE_METADATA, null)).toEqual([
      {
        id: "status",
        label: "Status",
        group: { field: "status" },
        type: "value",
      },
      {
        id: "updatedAt",
        label: "Updated",
        group: { field: "updatedAt", granularity: "day" },
        type: "date",
        granularities: ["year", "quarter", "month", "week", "day"],
      },
    ]);
  });
});

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("Expected fixture value to exist.");
  return value;
}
