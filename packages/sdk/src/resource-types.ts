// The resource filter/order type contract for the resource hooks and aggregates.
//
// `ResourceTypeMap` is an OPEN interface. By default it is empty, so any model
// name is accepted (`ResourceTypeName` widens to `string`) and a model's filter /
// order type loosely as `Record<string, unknown>` — which is exactly what the
// hooks already widen to. A downstream project can register a model's generated
// `Filter`/`Order` inputs by declaration-merging this interface (the per-project
// gql codegen can emit the augmentation) to get strict per-model typing:
//
//   declare module "@angee/sdk" {
//     interface ResourceTypeMap {
//       Note: { Filter: NoteFilter; Order: NoteOrder };
//     }
//   }
//
// This replaces the former bootstrap stand-in — a pinned `schema/contract.graphql`
// codegen'd into a `__generated__` map with one representative `Sale` model that
// no real call site used.

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- augmentation target
export interface ResourceTypeMap {}

export type ResourceTypeName = keyof ResourceTypeMap extends never
  ? string
  : keyof ResourceTypeMap;

export type ResourceFilter<TName extends ResourceTypeName> =
  TName extends keyof ResourceTypeMap
    ? ResourceTypeMap[TName] extends { Filter: infer F }
      ? F
      : Record<string, unknown>
    : Record<string, unknown>;

export type ResourceOrder<TName extends ResourceTypeName> =
  TName extends keyof ResourceTypeMap
    ? ResourceTypeMap[TName] extends { Order: infer O }
      ? O
      : Record<string, unknown>
    : Record<string, unknown>;
