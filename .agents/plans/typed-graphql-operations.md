# Plan: kill the hand-written TS twin of every GraphQL operation

Goal: stop writing each bespoke GraphQL operation **two to three times** on the TS
side — the query string, a hand-mirrored `…Data`/`…Variables` interface, and the
call-site generics — when the backend SDL already owns the types. Generate the
operation types from the **emitted** SDL (graphql-codegen **client-preset** →
`TypedDocumentNode`, consumed natively by urql), and **derive** the trivial action
mutations so they need no document at all. After this, the only thing authored by
hand is the *field selection* — the one part that is legitimately a frontend (UX)
concern.

## Why this exists (the duplication)

Most of the seam is **already generated** and must not be touched:

| Surface | Today | Verdict |
|---|---|---|
| Schema types (scalars, enums, inputs, object types) | `@graphql-codegen/typescript` → `packages/sdk/src/__generated__/{public,console}.ts` | ✅ generated from SDL |
| CRUD operations (list/detail/create/update/delete/aggregate/groupBy) | runtime document builder `packages/sdk/src/selection.ts`, driven by `<Column field>` / `fields:[]` | ✅ never written in TS |
| Resource filter/order type map | `packages/sdk/bin/build-resource-types.mjs` → `__generated__/resource-types.ts` | ✅ derived from SDL |

The double-writing is the **bespoke (non-CRUD) tail** — the `documents.ts` files.
Main-tree counts (excluding `.angee/workspaces/*` copies): **9 files, 79 operation
consts, 68 hand-written `…Data`/`…Variables` interfaces** (so not every op carries
an interface — some reuse shared/generated types, some are inline). Each operation
is authored two-to-three times, all of which track the Python resolver by hand:

```ts
// addons/angee/agents/web/src/documents.ts
export const REFRESH_PROVIDER_MODELS_MUTATION = `                       // 1. the document string
  mutation RefreshProviderModels($id: ID!) {
    refreshProviderModels(id: $id) { ok message } }`;
export interface RefreshProviderModelsData {                            // 2. the result type — by hand
  refreshProviderModels: ActionResultData; }
// addons/angee/agents/web/src/views/InferencePage.tsx
useAuthoredMutation<RefreshProviderModelsData, IdVariables>(            // 3. the generics — by hand
  REFRESH_PROVIDER_MODELS_MUTATION);
```

The `codegen.ts` header states this was a deliberate choice:

> "Types only — urql generics plus the runtime document builder cover operations,
> so no per-op hooks are generated."

**Decision revisited.** That trade keeps codegen simple, but it pays for it in
exactly the duplication the user is feeling: the generics are *manual*, and they
cover only the tail the runtime builder can't. The cost has grown to 68 interfaces
across 9 files, and nothing catches them drifting from the SDL until runtime. The
trade now favours generating the operation types too.

## What this is NOT

- Not "generate operations from Python." A GraphQL operation's **field selection
  is the client declaring what *this screen* needs** — that is UX, and
  `docs/frontend/guidelines.md:19` already draws the line: *"Python ships schema
  and operations. TypeScript ships UX."* (The doc's "operations" means the
  backend-emitted CRUD/runtime operations; bespoke **field selections** are
  frontend-authored and stay so — reconcile the wording, below.) We generate
  everything *around* the selection — result type, variables type, the binding —
  so the hand-authored part shrinks to the selection alone.
- Not a new stack *library*, but it **is** a new stack *ownership row*:
  graphql-codegen is already installed (transitively) and urql 5 / @urql/core 6
  consume `TypedDocumentNode` natively, but `docs/stack.md` has **no** GraphQL Code
  Generator row today — one is required (below).

---

## Tier 1 — type the authored operations (client-preset)

Move the codegen from the `typescript` plugin alone to the **client-preset**
(`typescript` + `typescript-operations` + `typed-document-node` + a generated
`graphql()` tag function). Each operation is authored once as a tagged document;
codegen parses it **against the emitted SDL** and produces a `TypedDocumentNode`
carrying both result and variables types. urql infers both — the hand interface
and the call-site generics vanish, and a selected field that doesn't exist (or a
wrong variable type) becomes a `codegen`/`tsc` error. **Drift becomes impossible,
not merely discouraged.**

Before → after, one operation:

```ts
// before: string + interface (documents.ts) + generics (call site)
export const REFRESH_PROVIDER_MODELS_MUTATION = `mutation …`;
export interface RefreshProviderModelsData { … }
useAuthoredMutation<RefreshProviderModelsData, IdVariables>(REFRESH_PROVIDER_MODELS_MUTATION);

// after: one typed document; data & variables inferred
import { graphql } from "@angee/gql/public";   // composer-wired alias — see "Schema source"
export const RefreshProviderModels = graphql(`
  mutation RefreshProviderModels($id: ID!) {
    refreshProviderModels(id: $id) { ok message } }`);
useAuthoredMutation(RefreshProviderModels);   // ← types flow from the document
```

This also deletes the **secondary copy** — hand-written entity interfaces
(`IAMUser`, `IAMRole`, `AgentSession`, …) that re-declare shapes codegen already
emits. **But keep the valibot runtime validators** (`AgentChatEndpointSchema`,
`McpServerConfigSchema`, … in `agents/web/src/documents.ts:88+`): generated types
map `JSON → unknown`, so those parsers do real boundary validation a type can't.
Delete only interfaces that duplicate SDL-readable structure, not the validators.

### Hook signatures (all three authored hooks; keep the low-level string runners)

The bespoke seam is `packages/sdk/src/authored-hooks.ts` — **three** hooks, each
taking `document: string`: `useAuthoredQuery` (L23), `useAuthoredMutation` (L43),
`useAuthoredSubscription` (L65). Type all three over a
`TypedDocumentNode<TData, TVars>` (inferring both) while keeping a `string`
overload for back-compat. **Do not** make the low-level runners
`useDocumentQuery`/`useDocumentMutation` typed-document-only: the runtime CRUD
builder (`resource-hooks.ts:345`) and auth (`auth-hooks.ts`) intentionally pass
runtime-built **strings** through them. The typed-document change lives at the
*authored* layer; the document layer stays string-compatible.

### Per-schema document routing (load-bearing decision #1)

There are **two named schemas** (`public`, `console`) and an operation must type
against the schema it hits — so this is **two codegen projects**, each with its own
`schema:` and `documents:`.

**Option A "by import" was tried and proven INFEASIBLE** (verified 2026-06-18,
client-preset 6.0.1): client-preset's `gql-tag-operations` preset scans the
`graphql(...)` identifier **globally**, regardless of which module it is imported
from. Neither lever isolates the two runs:
- `pluckConfig.modules: [{ name: "@angee/gql/console", identifier: "graphql" }]` —
  the preset ignores it; the `public` run still plucks a console operation and
  fails `Cannot query field … on type Mutation`.
- a custom `gqlTagName` (e.g. `graphqlConsole`) — renames the *generated* function
  but is **not plucked at all** (documents map comes out empty).

A single merged/superset schema (Option C) is also out: `console` is **not** a
superset of `public` (public has `connectableAccounts` / `myConnectedAccounts`
that console lacks; the two print 113 vs 231 types, so same-named types differ in
shape) — a merge would mistype real operations.

- **Resolved — Option B, route by document FILE** (user/architect, 2026-06-18).
  Each run scans a **disjoint, schema-pure** set of files, so the global
  `graphql(...)` scan can't cross-pollinate:
  - `documents.ts` / `documents.console.ts` → **console** (the default)
  - `documents.public.ts` → **public**

  An operation file targets exactly one schema; an addon that uses both (iam
  login vs admin; integrate connect vs admin) keeps a `documents.public.ts` beside
  its `documents.ts`. Each file still imports `graphql` from `@angee/gql/<name>`
  for its types — the import drives the alias/types, the *filename* drives the
  codegen run. Verified: the `public` run no longer sees agents' console
  `documents.ts`; the `console` run specializes it; both pass.

### Schema source & where codegen runs (load-bearing decision #2)

**Resolved — read the generated SDL, not a pinned copy** (user, 2026-06-18).
Today `packages/sdk/codegen.ts:32` reads `schema: "schema/contract.graphql"` — a
committed ~5.5 KB hand-maintained stand-in (the real `public.graphql` is ~1.4k
lines), i.e. a *third* copy that can drift. But the running app already loads the
**generated** SDL (`examples/notes-angee/web/src/main.tsx:18` imports
`../../runtime/schemas/{public,console}.graphql?raw`), and the docs already call
codegen output **runtime output** (`docs/glossary.md:55`,
`docs/backend/guidelines.md:152` — "codegen stubs"). So codegen reads
`runtime/schemas/<name>.graphql` — the one source of truth the app runs against —
and the pinned `contract.graphql` is the bootstrap stand-in to retire.

**Consequence — resolved: composer-emitted runtime** (user/architect, 2026-06-18).
`runtime/schemas/` is **per-project**; `packages/sdk` is the **project-neutral
shared package** whose `package.json` exports only `"."` (`packages/sdk/package.json:8`),
so the typed `graphql()` entry and generated operation types **cannot live at
`@angee/sdk/gql/*`** — those artifacts are project-specific. The owner is the
**composer/project output**:

- `angee build` emits `runtime/gql/<schema>/` from the **same step** that emits
  `runtime/schemas/<schema>.graphql` (codegen runs per-project, after SDL emission).
- The composer wires a **stable alias** `@angee/gql/<schema>` → `<project>/runtime/gql/<schema>`
  in the project's **tsconfig path *and* Vite resolve.alias** (both — tsc and the
  bundler each need it). A *shared* addon's `documents.ts` imports `@angee/gql/<schema>`,
  which resolves to the composed project's real generated types — per-project truth,
  no drift. This is the documented "codegen stubs are runtime output" model.
- The committed `packages/sdk/src/__generated__/*` and pinned `contract.graphql`
  are the stand-ins this retires; if the SDK still needs to typecheck in isolation,
  that's a *separate, explicitly representative* schema — never claimed as project truth.

New composer work this implies: `angee/compose/` (or the build command) must invoke
graphql-codegen per-project as a build phase downstream of SDL emission, and the
project templates (`templates/`, the example `web/` tsconfig + vite config) must
carry the `@angee/gql/*` alias. That wiring is the bulk of the non-mechanical effort.

### Operator console is not one clean daemon project

`addons/angee/operator/web/codegen.ts:8` points only at `schema/operator.graphql`
(the daemon schema), but `addons/angee/operator/web/src/data/documents.ts` is
**mixed**: `OPERATOR_CONNECTION_QUERY` (L9) targets Django's **console** schema,
while the service/workspace/stack/source ops target the **daemon**. Worse, those
daemon ops are **assembled by TS interpolation** — `${MUTATION_RESULT}` (L190),
`${SOURCE_FIELDS}` (L197), snapshot-root interpolation — which client-preset's
**static** pluck cannot parse. So operator is **not** a drop-in "same upgrade":
1. Split `OPERATOR_CONNECTION_QUERY` onto the console-schema project.
2. Make daemon ops **static** `graphql()` documents; replace `MUTATION_RESULT` /
   `SOURCE_FIELDS` / snapshot interpolation with **GraphQL fragments**, or leave
   those operations deliberately **outside** client-preset (string + typed-by-hand).
3. Set `presetConfig.fragmentMasking: false` for this migration (or adopt the
   generated `useFragment` pattern explicitly) so fragments don't force masking.
Daemon success is **"non-null payload, errors throw"**, *not* a `{status}`/`{ok}`
contract — see Tier 2.

---

## Tier 2 — derive the trivial action mutations (no document at all)

A large share of the **Django** bespoke tail is one uniform shape — a single-id
action returning the SDK's action contract:

```graphql
mutation X($id: ID!) { someAction(id: $id) { ok message } }   # → ActionOutcome
```

`action-result.ts` already owns the contract (`ActionOutcome {ok,message}` /
`ByIdVariables {id}` / `runActionResult()`), and `selection.ts::assembleMutationDocument`
already builds CRUD documents from metadata. Parallel that builder:

```ts
const refresh = useActionMutation("refreshProviderModels");
await refresh(record.id);   // typed; runActionResult applied; ok:false → throws
```

**Correction to the earlier draft (metadata reality).** The plan previously said
`action()` "reads the return type from SDL metadata." It **cannot today**:
`schema-object-types.ts:7` *excludes* the operation root types, and
`model-metadata.tsx:49` (`ModelRootFieldMetadata`) carries only CRUD roots
(`detail/list/aggregate/groupBy/create/update/delete`) — **no action field**. So:

1. **Scope to Django.** `useActionMutation` covers Django-schema mutation fields
   whose args are exactly `id: ID!` and whose return is the `ActionOutcome`
   contract. The **operator daemon is *not* a proof case** — its actions take
   `name`/`input` (not `id`) and use payload-or-throw (`operator.graphql:132`,
   `views/parts/run-action.ts:16`); keep them on `useOperatorAction`/`runDaemonAction`.
2. **Emit action metadata at build time** — extend the `build-resource-types.mjs`
   derivation to emit, per schema, the **`ActionFieldName` union** *plus* each
   action field's selection and normalizer, since runtime metadata doesn't model
   operation roots. `useActionMutation(name)` is then constrained to real action
   fields at compile time — fail-fast, symmetric with `ResourceTypeMap`.
3. Build `mutation <field>($id: ID!) { <field>(id:$id){ <leaves> } }` at runtime
   (like `assembleMutationDocument`) and thread `runActionResult`.

**What stays a Tier-1 authored document:** any op with a non-trivial selection,
custom args beyond `id`, or a non-action payload (login, REBAC grant/revoke, the
agent chat-endpoint query, anything returning real records). Those keep a
`graphql()` document. The split mirrors the existing CRUD-vs-authored split.

---

## Docs to update (where knowledge lives)

- `docs/frontend/guidelines.md:19` — keep the "Python ships schema and operations;
  TS ships UX" rule but make it concrete and reconcile it: backend-emitted
  CRUD/runtime operations are Python's; **bespoke field selections are
  frontend-authored and typed by codegen** — *never hand-write an operation's
  result/variables type; author the document with `graphql()`; use
  `action()`/`useActionMutation` for single-id Django actions*. Update the
  `codegen.ts` header that rationalises "types only."
- `docs/stack.md` — **add a Tooling row**: GraphQL Code Generator (client-preset /
  `typed-document-node`) owns generated TypeScript schema **and operation** types;
  note urql consumes `TypedDocumentNode`. (There is no codegen row today — this is
  new, not an edit to the urql row.)

---

## Resolved / open decisions

- **Mechanism:** graphql-codegen **client-preset** → `TypedDocumentNode`, urql-native. (resolved)
- **Scope:** framework-wide migration of authored ops **plus** the `action()` helper. (resolved — user)
- **Per-schema routing:** Option A (by import) proven infeasible (client-preset
  scans `graphql` globally); **Option B — by document file** (`documents.ts` →
  console, `documents.public.ts` → public), each codegen run globs a schema-pure
  file set. (resolved — architect, 2026-06-18; verified)
- **Schema source:** codegen reads generated `runtime/schemas/<name>.graphql`; pinned
  `contract.graphql` + committed `__generated__` are stand-ins to retire. (resolved — user)
- **gql resolution (verified):** `@angee/gql/<schema>` via `tsconfig.base.json`
  relative `paths` (no `baseUrl` — TS6 deprecates it) resolves in isolated addon
  typecheck; web tsconfigs drop the (noEmit-useless) `rootDir` so the path-mapped
  source isn't a TS6059 cross-rootDir input; Vite gets a matching `resolve.alias`.
  `@graphql-typed-document-node/core` is a **root** dep so the generated gql's import
  resolves from the project's `runtime/` location. (resolved — verified)
- **Codegen execution (verified):** no Python→node shell-out (`angee build` never
  shells out; production serve must not need node). Codegen is a JS step reading the
  emitted SDL, ordered by a **root** `pretypecheck`/`pretest`/`prebuild → pnpm codegen`
  so gql exists before the recursive fan-out. (resolved — verified)
- **Generated-operations owner / import path:** composer-emitted
  `runtime/gql/<schema>` behind a wired `@angee/gql/<schema>` alias (tsconfig +
  Vite); `angee build` runs codegen per-project after SDL emission. (resolved —
  architect, 2026-06-18)
- **Authored-hook signatures:** type all three (`useAuthoredQuery/Mutation/Subscription`)
  over `TypedDocumentNode` with a `string` back-compat overload; low-level
  `useDocument*` stay string-compatible. (resolved)
- **Operator:** split console vs daemon docs; daemon interpolation → fragments or
  out-of-codegen; `fragmentMasking: false`. (resolved — needs the split work)
- **Deps + versions:** declare `@graphql-codegen/client-preset` where invoked (it's
  only transitive now); installed versions support the route — urql 5.0.2,
  @urql/core 6.0.1, graphql 16.14.0, @graphql-codegen/cli 7.1.1, client-preset 6.0.1.
  (resolved)

## Risks / verify

- **Composer codegen wiring** (now the main non-mechanical risk) — `angee build`
  must run graphql-codegen per-project *after* SDL emission and wire `@angee/gql/*`
  into **both** tsconfig paths and Vite `resolve.alias`; a miss yields ENOENT/unresolved
  imports (cf. the `runtime/schemas` ENOENT pitfall in `docs/backend/guidelines.md`).
- **Schema-pure files** — routing is by file, so an operation must live in the file
  named for its schema (`documents.ts`=console, `documents.public.ts`=public); a
  console op placed in a `documents.public.ts` fails codegen against the public
  schema (loud, at build). Operations must live in a `documents*.ts` file, not
  inline in a page, or the file-glob won't scan them.
- **Operator interpolation** — `${MUTATION_RESULT}`/`${SOURCE_FIELDS}` can't be
  statically plucked; fragments or leave-out, not a naive migrate.
- **`action()` metadata** — runtime metadata lacks operation roots; must be emitted
  at build time. Django-only; operator stays on its own daemon-action helper.
- **SDL drift gate** — codegen runs *after* SDL emission; drive it from the same
  `angee build` / dev-emit step (see the `schema --check` pitfall in
  `docs/backend/guidelines.md`), never against a stale pinned copy.
- **Fragment masking / cache** — set `fragmentMasking: false` (or adopt `useFragment`);
  confirm `@urql/exchange-graphcache` keying is unaffected (typed documents are still
  plain `DocumentNode`s to the cache).
- **Migration is mechanical but wide** — 79 ops / 9 files; addon-by-addon behind the
  unchanged hook names so each addon is independently green.

## Phasing

1. **Composer wiring (the new seam).** Make `angee build` run graphql-codegen
   per-project after SDL emission, emitting `runtime/gql/<schema>/`; wire the
   `@angee/gql/<schema>` alias into the project tsconfig + Vite config (example +
   `templates/`). This is the foundation everything else imports.
2. **Tier 1 pilot — agents addon.** Stand up the two client-preset projects against
   `runtime/schemas/{public,console}.graphql` with `pluckConfig.modules`; migrate
   `agents/web/src/documents.ts` to `graphql()` documents importing `@angee/gql/*`;
   delete its `…Data`/`…Variables` interfaces (keep valibot); type the three authored
   hooks. Proves the composer wiring + two-schema pluck + hook change end-to-end.
3. **Tier 1 rollout.** Migrate the remaining `documents.ts` (iam, integrate ×2,
   knowledge, platform, resources, storage), then **operator** with its console/daemon
   split + fragment work. Delete hand-mirrored entity interfaces.
4. **Tier 2 — `action()`/`useActionMutation`.** Action builder beside `selection.ts`;
   `ActionFieldName` + selection/normalizer metadata emitted beside
   `build-resource-types.mjs`; wire `runActionResult`; convert single-id Django actions.
5. **Docs + retire stand-ins.** Update `docs/frontend/guidelines.md`, add the
   `docs/stack.md` Tooling row, fix the `codegen.ts` header; retire pinned
   `contract.graphql` + committed `__generated__`.

## Files

- Edit: `packages/sdk/codegen.ts` (per-schema client-preset projects + `pluckConfig`),
  `packages/sdk/package.json` & `addons/angee/operator/web/package.json` (declare
  `@graphql-codegen/client-preset`; lockfile via pnpm), `packages/sdk/src/authored-hooks.ts`
  (all three hooks), `addons/angee/operator/web/codegen.ts` (+ console split),
  `docs/frontend/guidelines.md`, `docs/stack.md`, the `codegen.ts` header comment.
- New: composer build phase that runs graphql-codegen per-project after SDL emission
  (`angee/compose/` or the `angee build` command) emitting `runtime/gql/<schema>/`;
  the `@angee/gql/<schema>` alias in the project tsconfig + Vite config (example +
  `templates/`); `action()`/`useActionMutation` beside `packages/sdk/src/selection.ts`;
  `ActionFieldName` + action metadata extending `packages/sdk/bin/build-resource-types.mjs`.
- Migrate (delete strings + redundant interfaces, keep selections + valibot): all 9
  main-tree `**/web/src/**/documents.ts`; operator needs the console/daemon split first.
- Retire: pinned `packages/sdk/schema/contract.graphql` as codegen input; committed
  `packages/sdk/src/__generated__/*` (move under per-project `runtime/`).

## Review log

- **Codex plan review (2026-06-18)** — verdict *needs-rework*, all six blocking
  findings verified against code and **incorporated above**: (1) generated-ops owner
  contradiction (`@angee/sdk/gql/*` not buildable — `package.json:8` exports only
  `"."`); (2) Option A needs `pluckConfig.modules`, not import-glob; (3) operator
  file mixes console+daemon and uses interpolation client-preset can't pluck; (4)
  `action()` overstated metadata (only CRUD roots exist) and wrongly used operator
  as proof; (5) hooks omitted subscriptions / must keep string runners; (6) deps +
  `docs/stack.md` ownership incomplete. Non-blocking (fragment masking, keep valibot,
  guideline wording, record versions) folded in too.
- **Codex implementation review (2026-06-18)** — *cut off mid-investigation* (rescue
  runtime hit its turn budget; no final verdict). Partial findings, all real and
  non-blocking, captured here: (a) codegen `documents` roots are monorepo-layout-only
  — a downstream consumer pulls addons from `node_modules`, so the project template
  must repoint the roots (noted in `codegen.shared.ts`); (b) the old SDK codegen
  (`packages/sdk/codegen.ts` + `__generated__` from `contract.graphql`) still coexists
  — retire in cleanup once nothing depends on it; (c) no CI enforces SDL→codegen
  ordering — `manage.py schema` must precede `pnpm codegen`; (d) hook generics "still
  checking" — resolved empirically (full-workspace typecheck green exercises typed-doc
  + raw-string callers). The highest runtime risk I raised (urql graphcache +
  `skipTypename`) is a **non-issue**: graphcache injects `__typename` at runtime and
  the existing SDK codegen already ships `skipTypename: true` with graphcache
  (`packages/sdk/codegen.ts:26`, `graphql-client.ts:164`) — our config matches.

## Build status — 2026-06-18 (branch `typed-graphql-operations`)

**Committed: `72041f85`** — Phases 1–3 (foundation + agents reference + 7-addon
rollout) + the architecture/react/codex review fixes. 81 files, +1153/−1178
(net ~1000 hand-written interface lines deleted). Full-workspace typecheck +
per-addon tests green; the one failing `iam/IdentityViews.test.tsx` is
pre-existing on HEAD. Not pushed. Review fixes folded in: `stack.md` codegen row;
`frontend/guidelines.md` route-by-filename rule; `@angee/gql/*` resolvers labeled
dev-only + cross-referenced; `OperatorConnection` document renamed to
`OperatorConnectionQuery` (value/type collision); operator `documents.ts` daemon
convention note; agents action-ops flagged pending Phase 4.

**Done & verified (full-workspace `pnpm typecheck` green):**
- **Phase 1 — foundation.** Per-project client-preset codegen → `runtime/gql/{public,console}/`
  from the emitted SDL; `examples/notes-angee/web/codegen.{shared,public,console}.ts`.
  `@angee/gql/<schema>` resolves in isolated addon typecheck (`tsconfig.base.json`
  relative `paths`, no `baseUrl`; `rootDir` dropped from the app-composition web
  tsconfigs) and at runtime (Vite `resolve.alias`). `@graphql-typed-document-node/core`
  hoisted to root. Codegen ordered via root `pretypecheck/pretest/prebuild → pnpm codegen`
  (no Python→node shell-out).
- **Schema routing = by document file** (Option A "by import" proven infeasible).
  `documents.ts`/`documents.console.ts` → console, `documents.public.ts` → public.
- **Authored hooks typed.** `useAuthoredQuery/Mutation/Subscription` +
  `useDocument{Query,Mutation}` accept `string | TypedDocumentNode` (urql `DocumentInput`);
  raw-string CRUD/auth callers still compile.
- **Phase 2 — agents addon fully migrated (Tier 1 reference).** The 3 custom ops
  (`ResolveSessionForView`, `AgentChatEndpointMutation`, `RenderAgentPrompt`) are
  `graphql()` documents; hand `…Data` interfaces deleted; result types derived via
  client-preset `DocumentType`; valibot JSON-boundary validators kept. The 4
  action-shaped ops (`refreshProviderModels`/`refreshSource`/`provisionAgent`/
  `deprovisionAgent`) are intentionally **left for Phase 4** (`action()`).

- **Phase 3 rollout — 6 addons DONE & verified (typecheck + tests green).** iam,
  integrate, knowledge, storage, platform, resources migrated to the agents pattern
  (delegated, then centrally regenerated + typechecked + tested). Public ops split
  into `documents.public.ts` (iam login/connections; integrate `connect/` account
  start+complete) vs console `documents.ts`/`documents.console.ts` (integrate
  `connect/documents.console.ts` for the console-only `revealCredential`). Regen
  routing self-check clean: 5 public docs + ~39 console docs, no cross-schema errors.
  Action-shaped `{ok,message}` ops left as strings for Phase 4 (iam OIDC discover;
  integrate sync/test/refresh). Result types re-derived via `DocumentType`. **vitest
  needs the alias too** — added `vitest.shared.ts` (`gqlAlias`) + `resolve.alias` to
  each migrated addon's `vitest.config.ts` (+ created agents'); vitest doesn't read
  tsconfig `paths`. One small fix: a re-derived list type is mutable, so a platform
  test fixture's `readonly string[]` param was loosened.
  - **Pre-existing, NOT this change:** `iam/.../IdentityViews.test.tsx` (2 tests) fails
    on the Revoke row button — **verified identical on HEAD** (happy-dom virtualizer
    quirk per `packages/base/.../RowsListView.test.tsx:54`). Out of scope here.

**Remaining:**
- **Phase 3 — operator** (the special one): split `OPERATOR_CONNECTION_QUERY` (Django
  console) from daemon ops; daemon interpolation (`MUTATION_RESULT`/`SOURCE_FIELDS`)
  → GraphQL fragments or leave out-of-codegen; `fragmentMasking:false`; operator has
  its OWN `operator.graphql` daemon schema + codegen (`operator/web/codegen.ts`).
- **Phase 4 — `action()`/`useActionMutation` ✅ DONE & verified.** SDK
  `useActionMutation<ActionFieldName>("field")` (`packages/sdk/src/action-hooks.ts`)
  builds the `<field>(id:ID!){ok message}` document at runtime and applies
  `runActionResult`; returns `[run, {fetching,error}]` where `run(id)` → message.
  `ActionFieldName` is generated per schema (`bin/build-action-types.mjs` →
  `runtime/gql/<schema>/actions.ts`; console = 10 fields, public = `never`) — a
  compile-time allow-list (verified: valid field passes, typo rejected TS2345). The
  `@angee/gql/*` alias is now a single **wildcard** (collapses the triplicated
  exact entries the reviewers flagged + resolves `…/actions`). All 10 action ops
  converted (agents 4, iam 1, integrate 5); the agents `actionMessage` helper and
  every action string/`…Data`/`IdVariables` deleted. Typecheck + tests green.
- **Composer/template emission for downstream projects — NOT YET IMPLEMENTED**
  (accuracy correction, reviewers 2026-06-18). What ships today is the
  **framework-repo dev wiring only**: the `@angee/gql/*` alias is example-pinned in
  three resolvers (`tsconfig.base.json` `paths`, example `vite.config.ts`,
  `vitest.shared.ts`) and the codegen `documents` roots are monorepo-layout globs.
  A rendered downstream project (addons from `node_modules`, its own `runtime/gql`)
  needs the composer/`templates/` to **emit** the per-project alias (all three
  resolvers) + the per-project `documents` roots + a codegen config. The "Where
  codegen runs / composer-emitted runtime" decisions above describe the *intended*
  end state; the composer/`angee build`/`templates/` changes for it are still TODO
  (no `angee/compose/` change is in this work). The three dev resolvers carry
  cross-referencing "dev wiring" comments until then.
- **Phase 5** — docs (`frontend/guidelines.md` ✅ route-by-filename rule, `stack.md`
  ✅ codegen row, fix `codegen.ts` header); retire pinned `contract.graphql` + SDK
  `__generated__`.
  - **`angee dev` codegen ordering ✅ FIXED** — `angee build`'s reset clears
    `runtime/gql`, and the dev SDL hook only re-emits `schemas/`, so Vite failed to
    resolve `@angee/gql/*`. Added a `codegen` job (`pnpm --filter
    @angee-example/notes-host codegen`, `depends_on: [deps, schema]`) mirroring
    `operator-codegen`, and added it to `frontend.after`, in both the dev stack
    template (`templates/stacks/dev/.../angee.yaml.jinja`) and the rendered
    `.angee/angee.yaml`. (One-shot at bring-up like `operator-codegen`; a schema
    change mid-session still needs a manual `pnpm codegen` or a future `--watch`.)
