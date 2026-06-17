import type { GraphViewEdge, GraphViewNode } from "@angee/base";

import type {
  PlatformAddonData,
  PlatformEdgeData,
  PlatformModelData,
} from "../documents";

function pushInto(index: Map<string, string[]>, key: string, value: string): void {
  const bucket = index.get(key);
  if (bucket) bucket.push(value);
  else index.set(key, [value]);
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

export interface AddonRow extends Record<string, unknown> {
  id: string;
  addon: string;
  fullName: string;
  namespace: string;
  kind: string;
  models: number;
  fields: number;
  resources: number;
  dependsOn: string;
  dependsOnList: readonly string[];
  dependedBy: string;
  dependedByList: readonly string[];
}

export function addonRows(addons: readonly PlatformAddonData[]): AddonRow[] {
  // Only addon-to-addon edges link (a raw `depends_on` also names django/library
  // apps, which have no detail page); reverse them into a depended-by index.
  const ids = new Set(addons.map((addon) => addon.id));
  const dependedBy = new Map<string, string[]>();
  for (const addon of addons) {
    for (const dep of addon.dependsOn) {
      if (ids.has(dep)) pushInto(dependedBy, dep, addon.id);
    }
  }
  return addons.map((addon) => {
    const dependsOnList = sortedUnique(addon.dependsOn.filter((dep) => ids.has(dep)));
    const dependedByList = sortedUnique(dependedBy.get(addon.id) ?? []);
    return {
      id: addon.id,
      addon: addon.label,
      fullName: addon.id,
      namespace: addon.namespace,
      kind: addon.kind,
      models: addon.modelCount,
      fields: addon.fieldCount,
      resources: addon.resourceCount,
      dependsOn: dependsOnList.join(", "),
      dependsOnList,
      dependedBy: dependedByList.join(", "),
      dependedByList,
    };
  });
}

export interface ModelRow extends Record<string, unknown> {
  id: string;
  model: string;
  addon: string;
  addonId: string;
  table: string;
  fields: number;
  relations: number;
  resourceType: string;
  dependsOn: string;
  dependsOnList: readonly string[];
  dependedBy: string;
  dependedByList: readonly string[];
}

export function modelRows(models: readonly PlatformModelData[]): ModelRow[] {
  const dependedBy = new Map<string, string[]>();
  for (const model of models) {
    for (const dep of model.dependsOn) pushInto(dependedBy, dep, model.label);
  }
  return models.map((model) => {
    const dependsOnList = sortedUnique(model.dependsOn);
    const dependedByList = sortedUnique(dependedBy.get(model.label) ?? []);
    return {
      id: model.label,
      model: model.modelName,
      addon: model.addonLabel,
      addonId: model.addonId,
      table: model.dbTable,
      fields: model.fieldCount,
      relations: model.relationCount,
      resourceType: model.resourceType ?? "",
      dependsOn: dependsOnList.join(", "),
      dependsOnList,
      dependedBy: dependedByList.join(", "),
      dependedByList,
    };
  });
}

export interface FieldRow extends Record<string, unknown> {
  id: string;
  field: string;
  model: string;
  addon: string;
  addonId: string;
  kind: string;
  relationTarget: string;
}

export function fieldRows(models: readonly PlatformModelData[]): FieldRow[] {
  const rows: FieldRow[] = [];
  for (const model of models) {
    for (const field of model.fields) {
      rows.push({
        id: `${model.label}.${field.name}`,
        field: field.name,
        model: model.label,
        addon: field.addon,
        addonId: model.addonId,
        kind: field.kind,
        relationTarget: field.relationTarget ?? "",
      });
    }
  }
  return rows;
}

export function modelGraphNodes(
  models: readonly PlatformModelData[],
  highlightId?: string | null,
): GraphViewNode<"model">[] {
  return models.map((model) => ({
    id: model.label,
    kind: "model",
    title: model.modelName,
    code: model.label,
    detail: model.addonLabel,
    highlighted: highlightId ? model.label === highlightId : undefined,
  }));
}

export function modelGraphEdges(
  edges: readonly PlatformEdgeData[],
): GraphViewEdge[] {
  return edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    kind: edge.kind,
    label: edge.fieldName,
  }));
}
