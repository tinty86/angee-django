#!/usr/bin/env node
// Derive Angee's shared operation documents from emitted project artifacts.
// Action mutations come from the SDL; delete-preview mutations come from the
// backend-owned `angee.resources` artifact. The emitted registries pin
// `@angee/data` custom operations to generated documents at runtime. Written
// beside the client-preset output so `@angee/gql/<schema>/actions` resolves via
// the same alias.

import { readFileSync, writeFileSync } from "node:fs";

import {
  GraphQLObjectType,
  buildSchema,
  getNamedType,
  parse,
} from "graphql";

const SCHEMAS = ["console", "public"];
const AGGREGATE_MEASURE_OPERATORS = ["sum", "avg", "min", "max"];
const DELETE_PREVIEW_SELECTION =
  "totalDeletedCount hasBlockers " +
  "deleted { label count } updated { label count } blocked { label count } " +
  "root { label objectLabel objectId " +
  "children { label objectLabel objectId " +
  "children { label objectLabel objectId } } }";

function actionFields(sdlPath) {
  const schema = buildSchema(readFileSync(sdlPath, "utf8"));
  const mutation = schema.getMutationType();
  if (!mutation) return [];
  const fields = mutation.getFields();
  return Object.keys(fields)
    .filter((name) => {
      const field = fields[name];
      if (field.args.length !== 1) return false;
      const arg = field.args[0];
      if (arg.name !== "id" || String(arg.type) !== "ID!") return false;
      const returned = getNamedType(field.type);
      return returned instanceof GraphQLObjectType && returned.name === "ActionResult";
    })
    .sort();
}

for (const name of SCHEMAS) {
  const sdlPath = new URL(`../../runtime/schemas/${name}.graphql`, import.meta.url);
  const metadataPath = new URL(
    `../../runtime/schemas/${name}.metadata.json`,
    import.meta.url,
  );
  const outPath = new URL(`../../runtime/gql/${name}/actions.ts`, import.meta.url);
  const names = actionFields(sdlPath);
  const aggregateResources = aggregateFields(metadataPath);
  const deletePreviewResources = deletePreviewFields(metadataPath);
  const groupResources = groupFields(metadataPath);
  const revisionResources = revisionFields(metadataPath);
  const union = names.length > 0 ? names.map((n) => `"${n}"`).join(" | ") : "never";
  const aggregateUnion = aggregateResources.length > 0
    ? aggregateResources.map((resource) => JSON.stringify(resource.modelLabel)).join(" | ")
    : "never";
  const deletePreviewUnion = deletePreviewResources.length > 0
    ? deletePreviewResources.map((resource) => JSON.stringify(resource.modelLabel)).join(" | ")
    : "never";
  const groupUnion = groupResources.length > 0
    ? groupResources.map((resource) => JSON.stringify(resource.modelLabel)).join(" | ")
    : "never";
  const revisionUnion = revisionResources.length > 0
    ? revisionResources.map((resource) => JSON.stringify(resource.modelLabel)).join(" | ")
    : "never";
  const documents = names.map((field) => {
    const ast = JSON.stringify(actionDocument(field), null, 2);
    return `  ${JSON.stringify(field)}: ${ast} as ActionDocument<${JSON.stringify(field)}>,`;
  });
  const aggregateDocuments = aggregateResources.map((resource) => {
    const ast = JSON.stringify(
      aggregateDocument(resource.aggregateRoot, resource.filterType, resource.measures),
      null,
      2,
    );
    return (
      `  ${JSON.stringify(resource.modelLabel)}: ` +
      `${ast} as AggregateDocument,`
    );
  });
  const deletePreviewDocuments = deletePreviewResources.map((resource) => {
    const ast = JSON.stringify(
      deletePreviewDocument(resource.deletePreviewRoot),
      null,
      2,
    );
    return (
      `  ${JSON.stringify(resource.modelLabel)}: ` +
      `${ast} as DeletePreviewDocument,`
    );
  });
  const groupDocuments = groupResources.map((resource) => {
    const ast = JSON.stringify(
      groupDocument(resource),
      null,
      2,
    );
    return (
      `  ${JSON.stringify(resource.modelLabel)}: ` +
      `${ast} as GroupDocument,`
    );
  });
  const revisionDocuments = revisionResources.map((resource) => {
    const ast = JSON.stringify(
      revisionDocument(resource.revisionsRoot, resource.fields),
      null,
      2,
    );
    return (
      `  ${JSON.stringify(resource.modelLabel)}: ` +
      `${ast} as RevisionDocument,`
    );
  });
  const body = [
    `// Generated from runtime/schemas/${name}.graphql — do not edit by hand.`,
    "// Run `pnpm codegen` to regenerate.",
    "//",
    "// Mutation fields shaped `<field>(id: ID!): ActionResult` — the",
    "// compile-time allow-list and runtime document registry for",
    "// `useActionMutation` (@angee/data).",
    "",
    "import type { TypedDocumentNode } from \"@graphql-typed-document-node/core\";",
    "",
    "export interface ActionResult {",
    "  ok: boolean;",
    "  message: string;",
    "}",
    "",
    "export interface ActionVariables {",
    "  id: string;",
    "}",
    "",
    `export type ActionFieldName = ${union};`,
    "",
    "export type ActionDocument<",
    "  TField extends ActionFieldName = ActionFieldName,",
    "> = TypedDocumentNode<Record<TField, ActionResult>, ActionVariables>;",
    "",
    "export const actionDocuments: {",
    "  readonly [Field in ActionFieldName]: ActionDocument<Field>;",
    "} = {",
    ...documents,
    "};",
    "",
    `export type AggregateResource = ${aggregateUnion};`,
    "",
    "export interface AggregateVariables {",
    "  where?: Record<string, unknown>;",
    "}",
    "",
    "export type AggregateDocument = TypedDocumentNode<",
    "  Record<string, { aggregate: Record<string, unknown> }>,",
    "  AggregateVariables",
    ">;",
    "",
    "export const aggregateDocuments: {",
    "  readonly [Resource in AggregateResource]: AggregateDocument;",
    "} = {",
    ...aggregateDocuments,
    "};",
    "",
    `export type DeletePreviewResource = ${deletePreviewUnion};`,
    "",
    "export interface DeletePreviewVariables {",
    "  id: string;",
    "  confirm?: boolean;",
    "}",
    "",
    "export interface DeletePreviewGroup {",
    "  label: string;",
    "  count: number;",
    "}",
    "",
    "export interface DeletePreviewNode {",
    "  label: string;",
    "  objectLabel: string;",
    "  objectId: string | null;",
    "  children: DeletePreviewNode[];",
    "}",
    "",
    "export interface DeletePreview {",
    "  totalDeletedCount: number;",
    "  hasBlockers: boolean;",
    "  deleted: DeletePreviewGroup[];",
    "  updated: DeletePreviewGroup[];",
    "  blocked: DeletePreviewGroup[];",
    "  root: DeletePreviewNode;",
    "}",
    "",
    "export type DeletePreviewDocument = TypedDocumentNode<",
    "  Record<string, DeletePreview>,",
    "  DeletePreviewVariables",
    ">;",
    "",
    "export const deletePreviewDocuments: {",
    "  readonly [Resource in DeletePreviewResource]: DeletePreviewDocument;",
    "} = {",
    ...deletePreviewDocuments,
    "};",
    "",
    `export type GroupResource = ${groupUnion};`,
    "",
    "export interface GroupVariables {",
    "  group_by: readonly Record<string, unknown>[];",
    "  where?: Record<string, unknown>;",
    "  order_by?: readonly Record<string, unknown>[];",
    "  limit?: number;",
    "  offset?: number;",
    "}",
    "",
    "export type GroupDocument = TypedDocumentNode<",
    "  Record<string, { key: Record<string, unknown>; aggregate: Record<string, unknown> }[]>,",
    "  GroupVariables",
    ">;",
    "",
    "export const groupDocuments: {",
    "  readonly [Resource in GroupResource]: GroupDocument;",
    "} = {",
    ...groupDocuments,
    "};",
    "",
    `export type RevisionResource = ${revisionUnion};`,
    "",
    "export interface RevisionVariables {",
    "  id: string;",
    "}",
    "",
    "export type RevisionRecord = Record<string, unknown> & {",
    "  id: string;",
    "  createdAt?: string;",
    "  comment?: string | null;",
    "};",
    "",
    "export type RevisionDocument = TypedDocumentNode<",
    "  Record<string, RevisionRecord[]>,",
    "  RevisionVariables",
    ">;",
    "",
    "export const revisionDocuments: {",
    "  readonly [Resource in RevisionResource]: RevisionDocument;",
    "} = {",
    ...revisionDocuments,
    "};",
    "",
  ].join("\n");
  writeFileSync(outPath, body);
  console.log(
    `operation documents [${name}]: ` +
      `${names.length} action(s), ` +
      `${aggregateResources.length} aggregate query(ies), ` +
      `${deletePreviewResources.length} delete-preview mutation(s), ` +
      `${groupResources.length} group query(ies), ` +
      `${revisionResources.length} revision query(ies)`,
  );
}

function deletePreviewFields(metadataPath) {
  const metadata = JSON.parse(readFileSync(metadataPath, "utf8"));
  const resources = metadata?.angee?.resources;
  if (!Array.isArray(resources)) return [];
  return resources
    .flatMap((resource) => {
      const modelLabel = resource?.modelLabel;
      const deletePreviewRoot = resource?.roots?.deletePreview;
      if (
        typeof modelLabel !== "string" ||
        typeof deletePreviewRoot !== "string" ||
        deletePreviewRoot === ""
      ) {
        return [];
      }
      return [{ modelLabel, deletePreviewRoot }];
    })
    .sort((left, right) => left.modelLabel.localeCompare(right.modelLabel));
}

function aggregateFields(metadataPath) {
  const metadata = JSON.parse(readFileSync(metadataPath, "utf8"));
  const resources = metadata?.angee?.resources;
  if (!Array.isArray(resources)) return [];
  return resources
    .flatMap((resource) => {
      const modelLabel = resource?.modelLabel;
      const aggregateRoot = resource?.roots?.aggregate;
      const filterType = resource?.typeNames?.filter;
      if (
        typeof modelLabel !== "string" ||
        typeof aggregateRoot !== "string" ||
        aggregateRoot === "" ||
        typeof filterType !== "string" ||
        filterType === ""
      ) {
        return [];
      }
      return [{
        modelLabel,
        aggregateRoot,
        filterType,
        measures: Array.isArray(resource?.aggregateMeasures)
          ? resource.aggregateMeasures
          : [],
      }];
    })
    .sort((left, right) => left.modelLabel.localeCompare(right.modelLabel));
}

function groupFields(metadataPath) {
  const metadata = JSON.parse(readFileSync(metadataPath, "utf8"));
  const resources = metadata?.angee?.resources;
  if (!Array.isArray(resources)) return [];
  return resources
    .flatMap((resource) => {
      const modelLabel = resource?.modelLabel;
      const groupsRoot = resource?.roots?.groups;
      const filterType = resource?.typeNames?.filter;
      const groupByType = resource?.typeNames?.groupBySpec;
      const groupOrderType = resource?.typeNames?.groupOrder;
      const keyFields = groupKeyFields(resource);
      if (
        typeof modelLabel !== "string" ||
        typeof groupsRoot !== "string" ||
        groupsRoot === "" ||
        typeof filterType !== "string" ||
        filterType === "" ||
        typeof groupByType !== "string" ||
        groupByType === "" ||
        typeof groupOrderType !== "string" ||
        groupOrderType === "" ||
        keyFields.length === 0
      ) {
        return [];
      }
      return [{
        modelLabel,
        groupsRoot,
        filterType,
        groupByType,
        groupOrderType,
        keyFields,
        measures: Array.isArray(resource?.aggregateMeasures)
          ? resource.aggregateMeasures
          : [],
      }];
    })
    .sort((left, right) => left.modelLabel.localeCompare(right.modelLabel));
}

function revisionFields(metadataPath) {
  const metadata = JSON.parse(readFileSync(metadataPath, "utf8"));
  const resources = metadata?.angee?.resources;
  if (!Array.isArray(resources)) return [];
  return resources
    .flatMap((resource) => {
      const modelLabel = resource?.modelLabel;
      const revisionsRoot = resource?.roots?.revisions;
      const revisionFields = resource?.revisionFields;
      if (
        typeof modelLabel !== "string" ||
        typeof revisionsRoot !== "string" ||
        revisionsRoot === "" ||
        !Array.isArray(revisionFields) ||
        revisionFields.length === 0
      ) {
        return [];
      }
      return [{
        modelLabel,
        revisionsRoot,
        fields: uniqueNames(["id", ...revisionFields]),
      }];
    })
    .sort((left, right) => left.modelLabel.localeCompare(right.modelLabel));
}

function actionDocument(field) {
  return parse(
    `mutation ${actionOperationName(field)}($id: ID!) { ` +
      `${field}(id: $id) { ok message } }`,
    { noLocation: true },
  );
}

function aggregateDocument(root, filterType, measures) {
  return parse(
    `query ${actionOperationName(root)}($where: ${assertGraphQLName(filterType)}) { ` +
      `${root}(where: $where) { aggregate { ${aggregateSelection(measures)} } } }`,
    { noLocation: true },
  );
}

function groupDocument(resource) {
  return parse(
    `query ${actionOperationName(resource.groupsRoot)}(` +
      `$group_by: [${assertGraphQLName(resource.groupByType)}!]!, ` +
      `$where: ${assertGraphQLName(resource.filterType)}, ` +
      `$order_by: [${assertGraphQLName(resource.groupOrderType)}!], ` +
      "$limit: Int, $offset: Int) { " +
      `${assertGraphQLName(resource.groupsRoot)}(` +
      "group_by: $group_by, where: $where, order_by: $order_by, " +
      "limit: $limit, offset: $offset" +
      `) { key { ${groupKeySelection(resource.keyFields)} } ` +
      `aggregate { ${aggregateSelection(resource.measures)} } } }`,
    { noLocation: true },
  );
}

function deletePreviewDocument(root) {
  return parse(
    `mutation ${actionOperationName(root)}($id: ID!, $confirm: Boolean) { ` +
      `${root}(id: $id, confirm: $confirm) { ${DELETE_PREVIEW_SELECTION} } }`,
    { noLocation: true },
  );
}

function revisionDocument(root, fields) {
  return parse(
    `query ${actionOperationName(root)}($id: ID!) { ` +
      `${root}(id: $id) { ${fields.join(" ")} } }`,
    { noLocation: true },
  );
}

function groupKeyFields(resource) {
  const seen = new Set();
  const fields = [];
  for (const dimension of resource?.groupDimensions ?? []) {
    addGroupKeyField(fields, seen, dimension?.key, false);
    for (const extraction of dimension?.extractions ?? []) {
      addGroupKeyField(fields, seen, extraction?.key, false);
      addGroupKeyField(fields, seen, extraction?.rangeKey, true);
    }
  }
  return fields;
}

function addGroupKeyField(fields, seen, name, range) {
  if (typeof name !== "string" || name === "") return;
  const key = `${range ? "range" : "value"}:${name}`;
  if (seen.has(key)) return;
  seen.add(key);
  fields.push({ name: assertGraphQLName(name), range });
}

function groupKeySelection(fields) {
  return fields
    .map((field) => field.range ? `${field.name} { from to }` : field.name)
    .join(" ");
}

function aggregateSelection(measures) {
  const fieldsByOp = new Map();
  for (const measure of measures) {
    if (!measure || measure.op === "count") continue;
    const op = measure.op;
    if (!AGGREGATE_MEASURE_OPERATORS.includes(op)) {
      throw new Error(`Unsupported aggregate measure op in metadata: ${op}`);
    }
    const field = assertGraphQLName(measure.input ?? measure.field);
    const fields = fieldsByOp.get(op) ?? [];
    if (!fields.includes(field)) fields.push(field);
    fieldsByOp.set(op, fields);
  }
  return [
    "count",
    ...AGGREGATE_MEASURE_OPERATORS.flatMap((op) => {
      const fields = fieldsByOp.get(op);
      return fields && fields.length > 0
        ? [`${op} { ${fields.join(" ")} }`]
        : [];
    }),
  ].join(" ");
}

function actionOperationName(field) {
  return `Angee${field[0].toUpperCase()}${field.slice(1)}`;
}

function uniqueNames(fields) {
  return [...new Set(fields)].map(assertGraphQLName);
}

function assertGraphQLName(name) {
  if (typeof name !== "string" || !/^[_A-Za-z][_0-9A-Za-z]*$/.test(name)) {
    throw new Error(`Invalid GraphQL field name in operation document metadata: ${name}`);
  }
  return name;
}
