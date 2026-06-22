# Frontend DRY Follow-Up Plan

Date: 2026-06-22

Goal: a focused frontend DRY plan after the data / GraphQL recomposition. This
does not reopen the closed React consistency pass or the typed GraphQL operation
work. It looks for the next owner-moving wins of the same kind: callers get
thinner because `@angee/sdk`, `@angee/base`, or an addon-local owner now answers
the repeated question.

Research inputs:

- Four read-only frontend research agents: view/page primitives, data/GraphQL
  adjacent state, forms/actions/shell, and config/testing support.
- Existing plans: `react-consistency-cleanup.md`,
  `dry-refactor-execution-todo.md`, `post-dry-audit-cleanup-findings.md`,
  `view-composition-drift-audit.md`.
- Current source shape, including the in-flight data owner files under
  `packages/sdk/src/data/` and `packages/base/src/views/scalar-facet.ts`.

## Architecture Check

Owner map:

- `@angee/sdk/src/data/*` owns headless data-query state, GraphQL document and
  variable assembly, local row querying, facets, filter algebra, and model
  invalidation registry hooks.
- `@angee/sdk` authored hooks own bespoke GraphQL query/mutation lifecycle, but
  authored documents must stay explicit and typed. They should not infer result
  shape or model side effects from arbitrary documents.
- `@angee/base` owns rendered data-view mechanics: `DataViewProvider`,
  `DataToolbar`, `ListView`, `RowsListView`, `DataPage`, `FormView`,
  `RecordView`, state surfaces, shell control bands, and row/list interaction.
- Addon web packages own domain projection, domain labels, columns, and
  addon-specific flows. When only one addon repeats a pattern, fix it inside that
  addon first.
- Project web/tooling owns app composition and generated host concerns, unless
  a framework convention would otherwise be copied by every downstream project.

Sibling inventory:

- Authored query to rows appears across platform, resources, IAM, parties,
  messaging, and storage/operator local-row pages.
- Related record tabs repeat `useResourceList(parent sqid filter) -> RowsListView`
  in messaging and parties.
- Operator snapshot sections repeat daemon snapshot, row projection, and
  list-state handoff across seven sections.
- Storage and knowledge have parallel tree-scoped explorer controllers.
- Vitest configs repeat the same addon test setup across most web packages.

Dependency check:

- `docs/stack.md` assigns GraphQL clients to urql, route/search to TanStack
  Router/nuqs, tables to TanStack Table, forms to TanStack Form, and browser
  tests to Vitest/Playwright. These wins should compose those libraries through
  Angee owners, not replace them.

Thin caller check:

- Route/page components should declare columns, filters, fields, labels, and
  actions. They should not own query invalidation, data-view isolation, toolbar
  plumbing, shell band routing, or repeated fetch/error/list handoff.

Deletion check:

- Prefer slices that delete repeated call-site glue. If a slice grows base or SDK
  code, it must unlock clear deletion in at least two sibling callers.

## Priority Slices

### F1. Isolate Embedded Data Views

Owner: `@angee/base` data-view boundary.

Evidence:

- `DataPage` wraps the whole page in one `DataViewProvider`:
  `packages/base/src/views/DataPage.tsx`.
- Nested `RowsListView` adopts the ambient provider:
  `packages/base/src/views/RowsListView.tsx`.
- Record-tab or embedded lists appear in `addons/angee/messaging/web/src/ThreadsPage.tsx`,
  `addons/angee/parties/web/src/PeoplePage.tsx`,
  `addons/angee/agents/web/src/views/AgentProvisioning.tsx`, and operator
  workspace-source rows.

Change:

- Add an explicit embedded/local data-view boundary for nested lists. Candidate
  API: `RowsListView scope="local"` or a small `EmbeddedRowsList` wrapper that
  always creates a local `DataViewProvider` and does not write URL search state.
- Make top-level `ListView` / `RowsListView` behavior unchanged.

Expected deletion/thinning:

- Related record tabs and embedded operator/agent lists stop carrying accidental
  parent list state concerns.
- This creates the safe base for F2.

Risk:

- High correctness value, medium behavior risk. Some callers may intentionally
  provide a custom `DataViewProvider`; do not break that path.

Checks:

- Base tests proving parent `?page/filter/group` does not affect an embedded
  record-tab list.
- `RowsListView`, `DataPage`, messaging, parties, and agents/operator focused
  tests.

### F2. Related Rows Record Tab

Owner: `@angee/base`, built on F1.

Evidence:

- `addons/angee/messaging/web/src/ThreadsPage.tsx` and
  `addons/angee/parties/web/src/PeoplePage.tsx` both do:
  `useResourceList(model, { filter: { relation: { sqid: recordId }}, fields })`,
  cast rows to id-bearing rows, then render `RowsListView`.

Change:

- Add a `RelatedRowsTab` or `ResourceRowsList` rendered primitive that accepts
  `model`, `fields`, `columns`, `filterFor(recordId)`, `order`, `rowHref`, and
  empty copy.
- First version should accept explicit `filterFor(recordId)`. Do not infer the
  relation lookup yet; scalar ID and relation filter shapes differ.

Expected deletion/thinning:

- Delete local tab components and repeated row casts/filter/query/list handoff in
  messaging and parties.

Risk:

- Medium. The relation filter shape is the trap; make it explicit.

Checks:

- Base mocked tests for the filter handoff and isolated state.
- Messaging and parties tests/typecheck.

### F3. Authored Query To Rows Adapter

Owner: split owner:

- `@angee/sdk` owns query lifecycle and optional invalidation registration.
- `@angee/base` owns rendered `RowsListView` handoff if a rendered helper is
  introduced.
- Addons own typed result selection and row projection.

Evidence:

- Repeated `useAuthoredQuery -> useMemo(rowRows(data)) -> RowsListView` in
  platform pages (`AddonsPage`, `ModelsPage`, `FieldsPage`), resources
  (`ResourcesPage`), IAM (`RolesPage`, `GrantsPage`), and similar local-row
  pages.

Change:

- Start with a headless `useAuthoredRows(document, variables?, { select, map,
  models? })` only if it deletes repeated hook glue cleanly.
- If rendered deletion is stronger, add `AuthoredRowsList` in `@angee/base` that
  takes a typed document plus selector/projector and forwards to `RowsListView`.
- Never infer GraphQL result shape. The caller supplies the typed selector.

Expected deletion/thinning:

- Around seven pages lose repeated `useAuthoredQuery`, `useMemo`, fetching/error
  handoff, and list wiring.

Risk:

- Medium. A too-clever generic can obscure typed document intent. Keep the
  projector explicit and test type inference.

Checks:

- SDK authored-hook tests if adding a headless hook.
- Platform, resources, IAM tests and typecheck.

### F4. Register Authored Reads With Invalidation

Owner: `@angee/sdk` authored hooks plus relay invalidation registry.

Evidence:

- Resource hooks now register model refetches, but bespoke authored reads still
  need manual refetch wiring in storage, knowledge, IAM grants, and some
  integrate/parties flows.
- Examples: `addons/angee/storage/web/src/views/StoragePage.tsx`,
  `addons/angee/knowledge/web/src/views/KnowledgePage.tsx`,
  `addons/angee/iam/web/src/views/GrantsPage.tsx`,
  `addons/angee/integrate/web/src/views/AddRepositoryControl.tsx`.

Change:

- Add explicit model registration to authored reads:
  `useAuthoredQuery(doc, vars, { models: ["app.Model"] })`.
- Consider a matching authored mutation option:
  `useAuthoredMutation(doc, { invalidateModels: [...] })`, or keep invalidation
  as a small explicit wrapper if that fits the existing SDK hook shape better.

Expected deletion/thinning:

- Pages declare affected models once instead of threading `query.refetch()` into
  action hooks and callbacks.

Risk:

- Medium. Authored documents may read multiple models or aggregates. Model lists
  must be explicit.

Checks:

- `authored-hooks`, `relay-invalidation`, `resource-invalidation` tests.
- Storage, knowledge, IAM, integrate focused tests.

### F5. Shared List Shell For Model And Local Rows

Owner: `@angee/base` internal list surface.

Evidence:

- `ListView.tsx` and `RowsListView.tsx` duplicate toolbar prop plumbing,
  selection bars, error display, body branching, and loading footers.
- Recent data recomposition already split model data (`useDataViewSurface`) from
  local rows (`useRowsDataViewSurface`), so the next owner is the rendered shell.

Change:

- Extract an internal `DataViewListShell` that accepts a prepared surface,
  toolbar model, body renderer, and source-specific options.
- Keep server-only grouped/aggregate behavior explicit; do not force every mode
  through one huge prop bag.

Expected deletion/thinning:

- Delete duplicated shell code in `ListView` and `RowsListView`; future sources
  can plug into the same shell.

Risk:

- High blast radius. Do after F1-F4 have tests pinning the current state model.

Checks:

- `RowsListView`, `ListView`, `DataPage`, grouped list, board, gallery, bulk
  delete, facets, and scalar facets tests.

### F6. Operator Snapshot Rows Owner

Owner: `@angee/operator` data/view helper, not framework core.

Evidence:

- `ServicesSection`, `WorkspacesSection`, `SourcesSection`, `SecretsSection`,
  `OperationsSection`, `GitOpsSection`, and `TemplatesSection` repeat
  `useOperatorSnapshot -> project rows -> RowsListView`, with the same
  `snapshot ? null : result.error` semantics.

Change:

- Add `useOperatorRows(...)` or `OperatorSnapshotRowsList` inside the operator
  addon. Columns, grouping, row links, and actions stay section-owned.

Expected deletion/thinning:

- Remove repeated snapshot/result/error/list handoff across seven sections.

Risk:

- Medium-low. Keep daemon transport separate from Django GraphQL data owners.

Checks:

- Operator section tests, daemon transport tests, no-poll/live-subscription
  regression.

### F7. Platform Explorer Data Owner

Owner: `@angee/platform` addon data helper.

Evidence:

- Platform pages repeatedly call `useAuthoredQuery(PlatformExplorer)` and then
  unwrap/scope rows/details in `GraphPage`, `ModelsPage`, `FieldsPage`,
  `AddonsPage`, `AddonDetail`, and `ModelDetail`.

Change:

- Add platform-local hooks such as `usePlatformExplorer`,
  `usePlatformModelRows({ addon })`, `usePlatformFieldRows({ model, addon })`,
  `usePlatformAddon(id)`, and `usePlatformModel(id)`.

Expected deletion/thinning:

- Pages become render-only: columns, links, and copy stay local; query/loading
  and scoped projection move once.

Risk:

- Low-medium. Do not push platform vocabulary into SDK/base.

Checks:

- Platform row tests plus platform page tests/typecheck.

### F8. Tree-Scoped Explorer Controller

Owner: likely `@angee/base` headless/controller hook first; rendered component
only if the hook earns it.

Evidence:

- `StoragePage` and `KnowledgePage` have parallel tree/root/open-state explorer
  composition, including root loading/empty states and navigator sections.

Change:

- Start with a narrow `useScopedTreeExplorer` or `TreeScopedExplorer`
  controller. It should own selected root/item routing and tree state, while
  storage upload/preview and knowledge editor/backlinks stay addon-owned.

Expected deletion/thinning:

- Thin both rich pages without flattening their domain-specific bodies into a
  generic component.

Risk:

- High. A broad component would overfit two complex pages.

Checks:

- Storage and knowledge browser checks for tree selection, route open/close,
  create/upload/editor flows.

### F9. Metadata Detail Surface

Owner: `@angee/base` detail/state fragments, with addon-local fields/actions.

Evidence:

- Repeated loading/not-found/header/metrics/metagrid scaffolds in platform
  `AddonDetail` / `ModelDetail` and operator `SourceDetail` / `ServiceDetail` /
  `WorkspaceDetail`.

Change:

- Add a detail surface that owns loading/not-found frame, header slots, and
  metagrid/metric layout. Avoid `DataPage` semantics because operator daemon
  objects are not model records.

Expected deletion/thinning:

- Delete page padding, state-surface, and header/metagrid ceremony across five
  detail pages.

Risk:

- Medium. The primitive must remain slots-first.

Checks:

- Platform/operator detail tests and visual smoke.

## Opportunistic Addon / Shell Slices

These are useful but should not block the data-view follow-up.

- Route declaration helper: `consolePage` / record-route pair shapes repeat in
  IAM, parties, messaging, integrate, and agents. Candidate owner:
  `@angee/base` route declaration helper. Verify addon composition tests.
- Integrate source page primitive: generic sources, agent skill sources, and
  template sources all render `integrate.Source` similarly. Candidate owner:
  `@angee/integrate`, not base.
- OAuth connect flow runner: extract `useOAuthConnectFlow` from
  `ConnectOAuthButton` so button and record action share the browser/manual-code
  flow. Candidate owner: `@angee/integrate/connect`.
- Dialog submit shell: adopt existing `DialogForm` for CardDAV, repository
  import, and IAM grant dialogs where the flow is actually form-shaped.
- Nested `DataPage` control-band API: replace addon-level
  `ControlBandProvider host={undefined}` wrappers with an explicit base prop or
  wrapper.
- Row action column: operator's `RowActions` and IAM/operator manual action
  cells point toward a base row-action primitive, but keep it local until a
  narrow cross-addon API is obvious.
- Record breadcrumb helper: notes, storage, and knowledge have repeated
  record-loading crumb components. Candidate owner: base chrome/route helper.

## Tooling / Support Lane

These are good low-risk slices after or between runtime work:

- Shared Vitest config helper in `vitest.shared.ts` so addon configs stop
  repeating `gqlAlias`, node environment, include globs, and
  `@angee/logo-react` inlining.
- Compose or generate Tailwind `@source` roots from the app/addon composition
  owner rather than manually listing addon web packages in host CSS.
- Move project-local action type generation behind an SDK/codegen helper so
  downstream projects do not copy `build-action-types.mjs`.
- Expand `@angee/base/testing` only if it deletes repeated provider/router
  wrappers in addon tests without making pure tests heavy.
- Use pnpm catalogs for repeated JS version literals only with a deliberate
  stack/lockfile update; keep peer ranges intentional.

## Suggested Order

1. F1 embedded data-view isolation.
2. F2 related rows tab.
3. F4 authored read invalidation.
4. F3 authored query rows adapter.
5. F6 operator snapshot rows and F7 platform explorer hooks, in either order.
6. Shared Vitest config helper.
7. F5 shared list shell after the above tests pin behavior.
8. F8 tree-scoped explorer and F9 metadata detail surface as larger follow-ups.

## Do Not Reopen Without New Evidence

- Raw table/grid rewrites: the scan found add-on pages already composing base
  views, not hand-rolling tables.
- Command palette: current command surfaces are centralized enough for now.
- Closed React consistency spine: tone/glyph/i18n/design-system decisions are
  already covered by the earlier pass.
- Typed GraphQL operation migration: already has its own workstream; these slices
  should build on it, not restart it.
