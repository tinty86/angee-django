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
2. Line-count audit of `useList|useOne|useCustom|useCustomMutation|useMenu|useAccessControl`
   across `@angee/refine` + addons → makes the B/C effort concrete.
3. Does `ra-core`'s live provider speak Hasura `graphql-ws` natively, or need its own
   dialect? (Unverified — only the CRUD adapter is Hasura-official.)
