# Platform Cluster + Console Sub-nav + Studio (schema console) lift

Three coupled workstreams that together give Angee a **platform cluster** at the
bottom of the app rail, a **settings-style left sub-nav** for platform consoles,
and a lifted **schema/metadata console** (p1's `Graph · Models · Fields ·
Addons · Assets`).

> **Status: PROPOSAL — not started.** Driven by three scout passes (current
> chrome/rail, current GraphQL/compose/resources, and the p1 source console);
> file refs are folded in below under §7. Settle the open decisions in §6 before
> building Workstream C.

---

## 0. The shape

```
APP RAIL                     CONSOLE (a platform app open)
┌────┐                       ┌──────────┬───────────────────────┬─────────┐
│ ▦  │ Notes (domain)        │ Overview │  Operator / Services  │ Angee   │
│ …  │  …      ↑ top zone     │ Services │  ┌─────────────────┐  │ (chat-  │
│    │         draggable      │ Workspc  │  │  services grid  │  │  ter)   │
│────│  ── cluster divider    │ Sources  │  │                 │  │         │
│ 🔌 │ Integrate  ↓ bottom    │ GitOps   │  └─────────────────┘  │         │
│ 🛡 │ IAM         platform   │ …        │                       │         │
│ ▤  │ Studio      cluster    └──────────┴───────────────────────┴─────────┘
│ >_ │ Operator   (group:        ↑ NEW area-subnav        ↑ area-content   ↑ area-chatter
└────┘             "platform")     (settings-style)         (existing)       (existing)
```

- **Workstream A — Platform cluster** (framework/base): the rail splits into a
  top zone (`group:"domain"`, draggable as today) and a **bottom cluster**
  (`group:"platform"`), driven by the **existing** `group` field. Order in the
  cluster: Integrate directly above Operator (`>_`); IAM and Studio above.
- **Workstream B — Console left sub-nav** (framework/base): platform consoles
  render their sections as a **left settings-style sub-nav** (new `area-subnav`
  in `console-grid`), replacing the top-bar section dropdowns for console routes.
- **Workstream C — Studio lift** (new base addon): reconstruct p1's
  schema/introspection console (`Graph · Models · Fields · Addons · Assets`) as a
  new `group:"platform"` rail app, backed by GraphQL introspection over the
  current composer/model toolkit, with its **Assets** tab reading the existing
  `resources` ledger.

A and B are framework-level and **inherited by every project** — highest bar
(`AGENTS.md` → Repository Role). C is a base addon that *consumes* A and B.

---

## 1. Locked decisions

- **D-A1 — rail zones from `group`, not a new field.** Reuse `BaseMenuItem.group`
  (`"domain" | "platform"`, `menu-tree.ts:5,20`) — the same field that already
  splits the AppChooser into "Apps"/"Platform" (`AppChooser.tsx:295-303`). No new
  menu field; rail and chooser stay consistent by construction. (DRY: one fact,
  one owner.)
- **D-A2 — no prefs migration.** Keep the single `AppRailPreferences.order`
  array; filter it per-zone through the existing `orderedRailItems`
  (`app-rail-model.ts:12`), which already tolerates ids absent from a zone. DnD
  is two `SortableContext`s (one per zone) inside one `DndContext` so apps can't
  be dragged across the divider.
- **D-A3 — cluster order:** default bottom-zone order `[Integrate, IAM, Studio,
  Operator]` (Integrate immediately above Operator per the brief); draggable
  within the zone. Operator stays bottom-most (the `>_` anchor).
- **D-B1 — sub-nav replaces top-bar sections for console routes.** Sections move
  from `area-topbar` (TopMenu dropdowns) to a new `area-subnav` left column. The
  top bar keeps brand + global search + systray + user only (matches Image #2).
- **D-B2 — sub-nav data source is unchanged.** It renders the active app root's
  sections via the existing `MenuTree.appSectionItems(pathname)`
  (`menu-tree.ts:186`); nested groups (e.g. IAM "Roles", Integrate "Connections")
  render as sub-nav section headers with indented children.
- **D-C1 — Studio is its own base addon, not part of `resources`.** Schema/model
  introspection is owned by the composer + GraphQL layer; the `resources` addon
  owns only the import/export ledger. Putting introspection inside `resources`
  would break find-the-owner. Studio reads from *several* owners (see §5.2).
- **D-C2 — name `studio` (working id), to avoid the `resources` collision.** The
  p1 addon was literally `angee`; "resources" collides with the existing
  import/export addon (`addons/angee/resources`). Working id/dir: `studio`. The
  **user-facing label** is open (§6 D1) — "Resources", "Schema", or "Studio".
- **D-C3 — Assets tab = the existing `resources` ledger.** `resources.Resource`
  fields map 1:1 onto p1's `assetLedger` (`source_addon, source_path, tier,
  content_hash, target_model, target_id, loaded_at` — verified `models.py`). No
  new Asset model; Studio queries the `resources` ledger.
- **D-C4 — reconcile with existing introspection before reconstructing.** The
  current repo already has `angee/graphql/introspection.py` and the addon
  dependency graph in `angee/compose/appgraph.py`. The `modelExplorer` /
  `addonCatalog` resolvers must extend/ask those owners, not re-derive ORM/addon
  facts from scratch.

---

## 2. Repo-grounded constraints

- **GraphQL is hand-written strawberry here.** Addons add a `schema.py` of
  `@strawberry_django.type` + `crud()`/`changes()` (see `iam/schema.py`,
  `operator/schema.py`). p1's model-`Meta` machinery
  (`queryable/mutable/subscribable/search_fields/graphql_private_fields`) has
  **no consumers here** — the composer reads only `rebac_resource_type` /
  `rebac_id_attr` (`iam-roles-lift.md` §1). So Studio's `AngeeOrmModel`/`...Field`
  projection must be **rebuilt against the meta this repo actually exposes**
  (verify the real surface: `runtime`, `rebac_resource_type`, `rebac_id_attr`,
  Django `_meta`), not copied from p1's 33-field projection.
- **Lift hygiene (`/lift`):** reconstruct, never copy; no file byte-identical to
  p1; strip all provenance/comments referencing p1; reuse local primitives. **p1
  paths in §7 are feature references, not sources.**
- **New deps carry a `docs/stack.md` owner row.** Workstream C's Graph view needs
  `@xyflow/react` + `@dagrejs/dagre` (p1 `package.json`). Confirm `docs/stack.md`
  has no existing owner for graph-canvas/graph-layout before adding; add the rows
  if accepted (§6 D2 — Graph view may be deferred).
- **Compose at build time; don't edit generated `runtime/`.** Studio's models (if
  any beyond reading `resources`) are abstract source models the composer emits.
- **Per-area gates green before commit** (backend + frontend guideline Checks);
  `manage.py schema --check` after any new GraphQL.

---

## 3. Workstream A — Platform cluster (bottom rail zone)

**Level: framework/base.** Single file of real logic.

- `packages/base/src/chrome/AppRail.tsx`
  - Split `items` (already `orderedRailItems(tree.railMenuItems(), order)`,
    line 66-69) into `domainItems = group !== "platform"` and `platformItems =
    group === "platform"`.
  - Render two `SortableRail` groups in the `<nav>`: domain on top, a
    `flex-1` spacer, then the platform cluster pinned to the bottom with a thin
    divider (`h-px w-6 bg-border-on-rail`, mirroring the AngeeMark divider at
    line 102). Each group is its own `SortableContext` (D-A2).
  - Keep long-press-default + keyboard-move per item; they operate within a zone.
- `app-rail-model.ts` / `app-rail-preferences.ts`: **no change** (D-A2).
- Default cluster order (D-A3): seed `platformItems` order so Integrate sits
  directly above Operator when the user has no saved order — apply a stable
  default sort (operator last) inside the platform zone before `orderedRailItems`.

**Done when:** rail shows Notes (etc.) on top, the four platform apps clustered at
the bottom with Integrate just above Operator, DnD reorders within each zone but
not across, and the AppChooser still groups Apps/Platform unchanged.

---

## 4. Workstream B — Console left sub-nav (settings-style)

**Level: framework/base.** Net-new component (no left-sub-nav exists today; the
chrome has only `navigation-menu.tsx` for top-bar dropdowns).

- **`console-grid` template:** add an `area-subnav` column between `area-rail` and
  `area-content` (find the grid template in the base CSS; `ConsoleShell.tsx`
  consumes named areas `area-rail/topbar/crumbs/control/content/chatter/status`).
- **New `packages/base/src/chrome/ConsoleSubNav.tsx`:** renders
  `MenuTree.appSectionItems(pathname)` (D-B2) as a vertical list; nested groups
  → section headers + indented `NavLink`s; active state via
  `ChromeMenuNode.isActive(pathname)` (`menu-tree.ts:97`). Reuse `NavLink`,
  `Glyph`, `Tooltip`.
- **`ConsoleShell.tsx`:** place `<ConsoleSubNav />` in `area-subnav`; stop passing
  section items to `TopBar.topMenu` for console routes (top bar keeps brand +
  search + systray + user). `TopMenu.tsx` stays for any non-console shell that
  still wants top sections (verify Notes/domain shell).
- **Empty state:** a single-section app (root with no children) renders no
  sub-nav and the column collapses (mirror the `area-status` collapse pattern,
  `ConsoleShell.tsx:57-58`).

**Done when:** opening any platform app (Operator/IAM/Integrate/Studio) shows its
sections in a left settings-style column (per Image #2), the top bar no longer
shows section dropdowns, and breadcrumbs still read `App / Section`.

---

## 5. Workstream C — Studio (schema/metadata console) lift

**Level: new base addon `addons/angee/studio/`** (working id; label per §6 D1),
mirroring the operator addon's split (`web/` frontend + Python backend), with
`group:"platform"` so it lands in the cluster (Workstream A) and uses the console
sub-nav (Workstream B).

### 5.1 Menu / routes (reconstruct p1 `ui/base/src/index.ts:34-68`)
- Rail root `{ id:"studio", label:<D1>, icon:<D3 glyph>, group:"platform",
  route:"studio.graph" }` with 5 children → routes `shell:"console"`:
  `studio.graph` `/studio`, `studio.models` `/studio/models`(+`/$id`),
  `studio.fields` `/studio/fields`, `studio.addons` `/studio/addons`(+`/$id`),
  `studio.assets` `/studio/assets`. Role-gate on the platform-admin role.

### 5.2 Backend — three introspection queries, **reconstructed against current owners**
Hand-written strawberry (`§2`), contributed the way `iam/schema.py` /
`operator/schema.py` do. **Reconcile with `angee/graphql/introspection.py` first
(D-C4).**

| Query | Current owner to ask (don't re-derive) | Produces |
|---|---|---|
| `modelExplorer` → `{addons, models, edges}` | `angee/compose/composer.py` + `appgraph.py` (addon graph), Django `apps`/`_meta`, the model toolkit meta this repo exposes (`runtime`, `rebac_resource_type`, `rebac_id_attr`) | models + fields + relation edges, model→addon, dependency labels |
| `addonCatalog` → `[AddonInfo]` | `angee/compose/appgraph.py` (the dependency graph **owns** "depends on"/"depended by"); discovery for kind/namespace/status | addon rows + model/field/asset counts |
| `assetLedger` → `[ResourceEntry]` | **`resources.Resource` ledger** (D-C3) — read via its manager, scoped | ledger rows for the Assets tab |

- **Permission gate:** one action over a synthetic resource type (p1 used
  `inspect` on `core/explorer:default`). Pick the current idiom — a const-backed
  `admin` relation on a table-less type anchor, exactly like
  `operator/models.py`'s `OperatorConnection`/`OperatorRole` anchors. Add a
  `studio/explorer` (or reuse a platform-admin) anchor + `permissions.zed`.
- **Field projection:** rebuild `AngeeOrmField`/`AngeeOrmModel` to the meta that
  exists here (verify against `compose/runtime.py` + the model toolkit) — drop
  p1's `queryable/mutable/subscribable/search_fields` unless this repo exposes
  them.

### 5.3 Frontend — five sections, reconstructed to `@angee/base` + the local query hook
- Reconstruct `GraphPage / ModelsPage(+Detail) / FieldsPage / AddonsPage(+Detail)
  / AssetsPage` against **this repo's** `@angee/base` (`DataPage`, `ListView`,
  `ResourcePage`, `FormView`, `Relation`, `Tag`, `NavLink`, …) and **this repo's**
  GraphQL client pattern (operator/web uses urql + `graphql-codegen`; verify
  whether a `usePersistedQuery`-style typed registry exists or wire codegen
  queries). Port the client-side row projectors (`system-rows.ts`: `modelRows,
  fieldRows, ormAddonRows, assetRows`) as local lib.
- **Graph view deps:** `@xyflow/react` + `@dagrejs/dagre` (§2; §6 D2 — defer the
  Graph tab to ship the four grid tabs first if we don't want the new deps yet).

### 5.4 Lift hygiene
Reconstruct only; strip every p1 reference; reuse local primitives; no
byte-identical files. p1 `addons/angee/ui/base` + `addons/angee/angee/core` are
**feature references** (§7), not copy sources.

**Done when:** Studio appears in the platform cluster, opens with the left
sub-nav (Graph/Models/Fields/Addons/Assets), the four grid tabs render real data
from the current composer/model/resources owners, `schema --check` passes, and
per-area gates are green.

---

## 6. Open decisions (need you)

- **D1 — Studio's user-facing label + rail position.** "Resources" (your term,
  but collides with the import/export `resources` addon — confusing for
  maintainers), "Schema", or "Studio"? Recommend **"Schema"** label with dir id
  `studio`. Position in the cluster is fixed by D-A3 (above Operator) unless you
  want otherwise.
- **D2 — ship the Graph tab now, or defer?** The Graph tab pulls in
  `@xyflow/react` + `@dagrejs/dagre` (two new `docs/stack.md` owner rows). Ship
  all five tabs, or land Models/Fields/Addons/Assets first and add Graph later?
- **D3 — Studio glyph.** A new platform glyph (e.g. a graph/cube/database mark).
  Reuse an existing registry icon or author a `StudioGlyph` like `OperatorGlyph`?
- **D4 — backend scope confidence.** The introspection backend is the heaviest,
  most repo-specific part (D-C4). Want a focused spike to confirm
  `appgraph.py`/`introspection.py` already expose enough before committing the
  full resolver?

## Risks
- **Backend introspection drift** — p1's resolver assumed p1 meta; this repo's
  meta surface differs (§2). Mitigated by D-C4 + D4 spike.
- **Sub-nav vs domain shells** — confirm domain apps (Notes) don't rely on the
  top-bar section dropdowns we're removing for console routes (Workstream B).
- **GraphQL client mismatch** — confirm the typed-query mechanism (codegen vs
  registry hook) before porting the five pages.

---

## 7. Research provenance (scout file refs)

**Current chrome/rail:** `AppRail.tsx:66-69,103-114,305-336` (flat list, no zones);
`AppChooser.tsx:295-303` (group split); `menu-tree.ts:5,20,147-189` (group field,
railMenuItems, appSectionItems); `ConsoleShell.tsx` (grid areas);
`TopMenu.tsx:141-162` (top-bar section dropdowns); no left-sub-nav component.
operator `group:"platform"` `operator/web/src/index.ts:106-154`, glyph `>_`
`OperatorGlyph.tsx:14-28`; integrate "Integrations"/Cable `integrate/web/src/index.tsx:174-197`
`group:"platform"`; iam "IAM"/Shield `iam/web/src/index.ts:29-49` `group:"platform"`;
iam_integrate_oidc + resources have no `web/`.

**Current backend:** GraphQL = hand-written strawberry (`angee/graphql/schema.py`,
`iam/schema.py`); existing `angee/graphql/introspection.py`; addon graph
`angee/compose/appgraph.py` + `composer.py`; `resources.Resource` ledger fields
`addons/angee/resources/models.py`; REBAC type anchors `operator/models.py`.

**p1 source (feature reference only):** addon `angee`
(`p1/addons/angee/ui/base/src/index.ts:34-68`); views `GraphPage/ModelsPage/
ModelDetailView/FieldsPage/AddonsPage/AddonDetailView/AssetsPage`; lib
`system-rows.ts`, `model-graph.ts`, `data-view-utils.tsx`; backend
`p1/addons/angee/angee/core/graphql.py:55-142` (modelExplorer/addonCatalog/
assetLedger) + `model_explorer.py:118-234` (ORM introspection); deps
`@xyflow/react`, `@dagrejs/dagre`.
