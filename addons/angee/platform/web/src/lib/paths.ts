// The one owner of platform-console hrefs + scope params, so every linked cell,
// stat tile, and graph node builds the same routes. Detail routes are `$id`
// children of the list routes; `?model=`/`?addon=` scope the Fields/Models/Graph
// pages from a link (read back with nuqs).

const BASE = "/platform";

export interface PlatformScope {
  model?: string;
  addon?: string;
}

function withScope(base: string, scope?: PlatformScope): string {
  const params = new URLSearchParams();
  if (scope?.model) params.set("model", scope.model);
  if (scope?.addon) params.set("addon", scope.addon);
  const query = params.toString();
  return query ? `${base}?${query}` : base;
}

export const modelDetailPath = (label: string): string =>
  `${BASE}/models/${encodeURIComponent(label)}`;

export const addonDetailPath = (id: string): string =>
  `${BASE}/addons/${encodeURIComponent(id)}`;

export const modelsPath = (scope?: PlatformScope): string =>
  withScope(`${BASE}/models`, scope);

export const fieldsPath = (scope?: PlatformScope): string =>
  withScope(`${BASE}/fields`, scope);

export const graphPath = (model?: string): string =>
  withScope(BASE, model ? { model } : undefined);
