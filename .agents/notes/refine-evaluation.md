# Refine evaluation — keep / shrink / migrate

Status: **decision-support, recommendation pending a gating answer (Hasura v2 vs
v3).** Prompted by "we lean heavily on Refine — prior art / better options?".
Backed by deep-research (14/25 claims confirmed against primary sources; killed
claims excluded). Sibling to `chat-ui-library-evaluation.md`.

## What we delegate to Refine today (`docs/stack.md`)

`@refinedev/core` (resource registry, data hooks, react-query cache/invalidation,
auth + i18n + live provider contracts) · `@refinedev/hasura` + graphql-request (the
Hasura data provider) · `@refinedev/react-hook-form` (`FormView`) ·
`@refinedev/react-table` (`ListView`/`BoardView`). The frontend is declared
"Refine-native" (one composed `<Refine>` root). Wrapped thinly in `@angee/refine`
(+ a custom Hasura dialect) and `@angee/resources` (metadata → resources/meta/
accessControl). So Refine is **load-bearing**, not a leaf dep.

## Findings (cited)

1. **Category fit, narrower charter.** Refine self-describes as "a React
   meta-framework for CRUD-heavy web applications … internal tools, admin panels,
   dashboards and B2B apps." Accurate for our CRUD surface, but a narrower charter
   than a general composition framework (no design intent for workflow/real-time/
   non-CRUD modes). <https://github.com/refinedev/refine>
2. **Governance pivot (longevity signal).** Refine's 2025 "New Chapter" post:
   "while Refine Core will continue to receive full support and maintenance, our
   primary development focus will shift toward the AI tool." YC S23; building
   "cloud-based products." Core is still actively patched (12 `@refinedev/core`
   v5.x patches Sep 2025–Apr 2026, ~monthly), but the headless roadmap is
   effectively community-driven now. <https://www.ycombinator.com/companies/refine>
3. **Hasura v3 naming bug, declined upstream.** `@refinedev/hasura` defaults to
   snake_case (`blogs_aggregate`); Hasura v3 exposes camelCase (`blogsAggregate`) →
   `useList` fails. Labeled wontfix; maintainer: "We are open to contributions …
   from the community"; closed stale, no first-party fix. *We already pin
   `namingConvention` (`docs/stack.md`), so this is handled — but it confirms we own
   Hasura fixes, not upstream.* <https://github.com/refinedev/refine/issues/6627>
4. **Any GraphQL CRUD framework needs a Hasura dialect.** `ra-data-graphql-simple`
   is also Hasura-incompatible out of the box. So `@angee/refine`'s dialect is **not
   Refine-specific overhead** — it's intrinsic to Hasura; switching frameworks
   doesn't remove it, only changes who maintains it.
   <https://github.com/hasura/ra-data-hasura>
5. **React Admin (`ra-core`) is the closest peer — and better-governed on the
   Hasura axis.** Genuinely headless (hooks), built on the *same* primitives we use
   (TanStack Query + react-hook-form + react-router), and **Hasura itself maintains
   `ra-data-hasura`** (the adapter owner is Hasura, not the framework vendor).
   Marmelab's consulting model is structurally stable.
   <https://marmelab.com/ra-core/> · <https://github.com/hasura/ra-data-hasura>
6. **No-framework path is viable but not free.** TanStack Query + Router + codegen +
   urql gives type-safe Hasura-native access, but TanStack Query has **no native
   subscriptions** — you must add `graphql-ws`/urql/Apollo for Hasura live queries
   (which Refine's live provider currently encapsulates).
   <https://hasura.io/blog/getting-started-with-react-query-and-graphql>

## Options

| | Effort | Decisive trade-off |
|---|---|---|
| **A. Keep as-is** | ~0 now; ongoing patch maintenance | Hasura issues are ours forever (upstream wontfix + AI pivot). OK **only** if pinned to Hasura v2 conventions. |
| **B. Shrink to the data provider** ⭐ | Medium (weeks) | Replace `useMenu`/`accessControl`/`auth`/router bindings with direct TanStack Router + custom hooks; keep `@refinedev/hasura` as transport only. The data-provider interface (`getList/getOne/create/update/delete`) is the most stable, most swappable seam — isolating to it removes router/auth/access lock-in and is consistent with our existing thin-wrapper strategy. |
| **C. Migrate to `ra-core` + `ra-data-hasura`** | High (months) | Same primitives + Hasura-owned adapter (solves the biggest gap), more durable governance — but touches every CRUD surface in every addon. Justified only if Hasura v3 forces it, or the Refine OSS core degrades within ~12 months. |

## Recommendation

**Option B now.** `@angee/refine` already isolates the surface; finish the isolation
— remove Refine from auth, access-control, router, and notification, leaving a clean,
swappable **data-provider seam**. That captures Refine's real value (the
provider protocol) while eliminating the lock-in surface, and makes a future Option C
a bounded, single-interface swap rather than a rewrite. Keep A only if we're pinned
to Hasura v2 and accept indefinite patch ownership; reach for C only on a forcing
function.

## Gating + open questions

1. **Does Angee target Hasura v2 (snake_case) or v3 (camelCase/DDN)?** The wontfix
   aggregate bug is version-gated — it decides whether B is urgent or merely tidy.
   → **Resolved below: the gate is now "fully migrate to v3".**
2. Line-count audit of `useList|useOne|useCustom|useCustomMutation|useMenu|useAccessControl`
   across `@angee/refine` + addons → makes the B/C effort concrete.
3. Does `ra-core`'s live provider speak Hasura `graphql-ws` natively, or need its own
   dialect? (Unverified — only the CRUD adapter is Hasura-official.)

## Update (2026-06-28): "fully migrate to Hasura v3" resolves the gate

Prompted by "research alternatives for Refine when we fully migrate to Hasura
v3." Recall the architecture fact that frames everything: **Angee does not run
Hasura.** `strawberry-django-hasura` *emits* the Hasura-shaped GraphQL from
Django (`docs/stack.md`), the frontend consumes it via `@refinedev/hasura`, and
Angee already pins `namingConvention: "hasura-default"` and authors its own
documents (refine-compatible ASTs + `meta.gqlQuery`/`meta.gqlMutation`). So
"migrate to v3" = **change the wire dialect Angee emits and the frontend speaks**,
not "swap a Hasura engine."

### What v3/DDN actually breaks (cited)

- **Reads are largely v2-compatible and configurable.** DDN's generated query API
  "is compatible with v2 schemas," and naming is a supergraph `GraphqlConfig`
  choice (`graphql`/`snake_case`/`snake_case_v2`). Angee already pins snake_case,
  so the issue-#6627 camelCase `blogsAggregate` break is a **non-issue for us** —
  it only bites projects on DDN's `graphql-default`.
  <https://hasura.io/docs/3.0/help/faq/> ·
  <https://hasura.io/docs/3.0/supergraph-modeling/graphql-config/>
- **Mutations are the real divergence.** DDN mutations are connector/command-driven
  (auto-generated by the Postgres connector, but command-shaped), not v2's
  per-table `insert_x_one` / `update_x_by_pk` / `delete_x_by_pk` / `_set`. Because
  Angee *emits its own dialect*, Angee owns whether it keeps the v2 mutation
  envelope or moves to the DDN command shape — but the data provider's
  create/update/delete mapping changes regardless of frontend framework.
  <https://hasura.io/docs/3.0/graphql-api/mutations/>

### The reframe: v3 breaks the *data provider*, not Refine core

`@refinedev/core` (resource registry, `useList/useOne/useCreate/…`, react-query
cache, auth/i18n/live contracts) is **dialect-agnostic**. The only v2-coupled
piece is the `@refinedev/hasura` provider's document building. So the v3 gate does
**not** force replacing Refine — it forces rewriting/replacing the provider. That
is exactly Option **B** (shrink to the data-provider seam); v3 is the forcing
function the original note anticipated.

**New finding that resharps B:** `@refinedev/graphql` v7 runs on `@urql/core` and
is **dialect-agnostic by authored documents** — you pass `gqlQuery`/`gqlMutation`
as (Typed)DocumentNodes; the provider executes, it does not build a Hasura-v2
shape. Angee already produces TypedDocumentNodes via client-preset codegen
(`@graphql-typed-document-node/core` in `docs/stack.md`) and already authors
documents through `@refinedev/hasura`. So the cleanest in-Refine v3 path is:
**move `@angee/refine` from `@refinedev/hasura` → `@refinedev/graphql`, and let
the v3 dialect live entirely in Angee's codegen-generated documents.** Refine core
is untouched; the dialect becomes 100% Angee-owned.
<https://refine.dev/docs/data/packages/graphql/>

### Options, with v3 resolved

| | What it is | Verdict under "fully migrate to v3" |
|---|---|---|
| **B1. Keep Refine, swap provider to `@refinedev/graphql` (urql) + codegen documents** ⭐ | Dialect moves out of the provider into Angee codegen; rewrite `createAngeeHasura*DataProvider`'s create/update/delete to the v3 mutation shape | **Lowest-risk, most aligned.** Captures Refine's real value (resource registry + hooks + cache + live/auth contracts), removes the v2-coupled provider, makes the dialect Angee-owned. Live queries stay on Angee's existing `graphql-ws`. |
| **C. Migrate to `ra-core` + `ra-data-hasura`** | Same primitives (TanStack Query + RHF + router), Hasura-official adapter | **Weaker than before.** `ra-data-hasura` targets the **v2** endpoint shape; search found **no DDN/v3 support** — so it needs the same v3 provider work, minus Refine's live/i18n encapsulation. The "Hasura-owned adapter" advantage evaporates on v3. Months-long rewrite of every CRUD surface for no v3 payoff. |
| **D. No-framework: urql/Apollo + TanStack Query/Table + RHF + TanStack Router + codegen** | Own the resource registry + data hooks as thin Angee code generated from `angee.resources` metadata | **Most constitutionally pure, highest build cost.** Angee already uses Table/RHF/Router/codegen directly; Refine is the orchestration glue. Cost: Angee must own cache invalidation, optimistic updates, and live wiring that Refine's providers currently encapsulate. Note D and B1 share a client (urql) — B1 is D with Refine's orchestration kept. |
| **A. Keep `@refinedev/hasura` as-is** | — | **Dead under v3.** It builds the v2 document shape; only viable if pinned to v2. |

### Recommendation

**B1.** The v3 migration is fundamentally a *dialect* migration owned by
`strawberry-django-hasura` (backend) + Angee codegen (frontend documents), not a
*framework* migration. Swapping `@refinedev/hasura` → `@refinedev/graphql` makes
the dialect fully Angee-owned while keeping Refine's dialect-agnostic
orchestration, and it positions a future Option D (drop Refine) as a bounded swap
behind the same urql client + codegen documents rather than a rewrite. Reach for
D only if Refine's OSS core degrades post-AI-pivot (still ~monthly patched as of
Apr 2026); C has no remaining advantage once v3 strands `ra-data-hasura`.

### Remaining verify-items for an execution plan

1. **DDN mutation envelope decision — RESOLVED (2026-06-28), code-grounded.** Do
   **not** reshape `strawberry-django-hasura` mutations to the DDN shape: it is
   *heavier*, not simpler. DDN's auto-generated Postgres mutations are the **bulk**
   envelope (`insert_<t>(objects, on_conflict)` / `update_<t>(where, _set, _inc)` /
   `delete_<t>(where)` → `{ affected_rows, returning }`), which adds list inputs,
   affected-rows counting, returning projection, upsert, `_inc`, and set-based
   update/delete vs. today's single-row `insert_x_one` / `update_x_by_pk(pk_columns,
   _set)` / `delete_x_by_pk(id)`.
   <https://hasura.io/docs/3.0/graphql-api/mutations/> ·
   <https://hasura.io/docs/3.0/connectors/postgresql/>
   - The mutation surface in `strawberry-django-hasura` is **already minimal and
     dialect-agnostic**: `mutations.py` (31 lines, `input_to_dict`, self-described
     dialect-agnostic) + thin pass-through resolvers (`resource.py:521-587` → call
     `write_backend.create/update/delete`) + input-type generation
     (`resource.py:345-393`). Real write behavior lives in Angee's
     `AngeeHasuraWriteBackend`, not the library. Total mutation code ≈ 130 lines.
   - The `_insert_input` (required-on-create) vs `_set_input` (optional patch)
     split is **CRUD-intrinsic** — survives any dialect.
   - The library's *value* is the **read dialect** (~1000+ lines: `comparisons`,
     `filtering`, `aggregation`, `grouping`, the `_bool_exp`/`_order_by` builders,
     `connection`). v3 does **not** touch it (reads v2-compatible + snake pinned);
     grouping already tracks NDC (`ROADMAP.md` / `graphql-engine#10786`).
   - **The real lever is decoupling, not the dialect.** `CONTRACT.md` pins the
     mutation shape to satisfy the *stock* `@refinedev/hasura` provider. B1 (move
     frontend to `@refinedev/graphql` authored/codegen documents) removes that pin,
     after which writes can be: (1) kept as-is (zero change); (2) flattened (drop
     `_pk_columns_input`, ~10-15 lines); or (3) **relocated** to stock
     `strawberry_django.mutations`, deleting ~130 lines here and making this a
     read-dialect-only library — done *jointly* with the `crud.py` consolidation in
     `crud-upstream-candidates.md` so writes have one owner. Sequence: B1 first,
     then the write decision; leave the read dialect alone.
2. **`@refinedev/graphql` TypedDocumentNode maturity** (issue #5904) — confirm the
   v7 provider consumes Angee's client-preset `TypedDocumentNode`s cleanly,
   including `meta.gqlVariables`/result typing, before committing B1.
3. **Live/subscription parity:** B1 keeps Angee's `graphql-ws` transport, but
   confirm Refine's live-provider contract binds to it unchanged once the request
   path is urql rather than graphql-request.
