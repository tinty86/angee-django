# Frontend Stack Upgrade + Popover/Data-View Event-Ordering DRY Refactor

This plan covers two coupled workstreams: (1) **upgrade the frontend stack** off the
**deprecated** `@base-ui-components/react@1.0.0-rc.0` and the other lagging majors, and
(2) **kill the event-ordering freeze** in the Base UI popover binding by deleting our
hand-rolled scheduling and deferring to the primitives the stack already owns.

The stack upgrade is folded in **first** because the popover fix depends on getting off
the deprecated, pre-1.0 Base UI RC — the bespoke `PopoverTrigger` hack we want to delete
is almost certainly an rc-era workaround.

**North star:** less code, defer to the stack, find the owner. Three hand-rolled defers
(`setTimeout`-based) collapse into one React `useTransition` + library options + a version
bump. No new bespoke wrapper.

> **Reconcile with the single source of truth.** `.agents/plans/notes-auth-lift.md` is
> "the one plan." This file is a focused sub-plan for one workstream; it must not
> contradict it. In particular it is **gated by that plan's open decision D-A — view-state
> store: `nuqs` vs TanStack Router search.** The `useTransition` fix below lands regardless
> of D-A; the nuqs-specific option wiring only applies if D-A keeps nuqs.

---

## 0. Status ledger

- ✅ **Stage 0 — frontend inventory** (research done; table in §4).
- ✅ **REAL freeze root cause found (NOT Base UI).** The popover/Base-UI theory was
  **wrong**. The freeze is **TanStack Table `autoResetPageIndex`**: ListView passes
  `data: rows` to `useReactTable`, and `rows` (from urql) churns identity across renders, so
  the table auto-resets its page index → `setPagination` → `onStateChange` → setState →
  re-render → new `data` identity → reset again = infinite loop. It hard-locks **WebKit/
  Safari** (deterministic; racy/often-survivable in Chromium). Found via CPU profile call
  tree: top-level trigger task `table.resetPageIndex → setPagination → setState →
  onStateChange`. Needs all of: list view (TanStack Virtual present) + an active group +
  opening the filter popover — the grouped re-render storm keeps the reset loop fed.
- ✅ **FIX (one change):** `autoResetPageIndex: false` + `autoResetExpanded: false` on
  `useReactTable` in `ListView.tsx`. Pagination/sort/filter/group are owned by the
  data-view/URL state, never the table, so auto-reset must be off. Verified in **WebKit**
  (`?group=updatedAt:year|day|year&then=status`, all RESPONSIVE, stable ×3); typecheck +
  26 unit tests green. Repros: `examples/notes-angee/e2e/test-results/{check,repro*}.mjs`.
- ✅ **Follow-up stabilization (owner-level):** `useResourceList` re-derived `rows` via
  `extractPage(run.data)` every render (fresh array even on a urql cache hit) — the churn
  that fed the reset. Memoized on `run.data` identity in `packages/sdk/src/resource-hooks.ts`,
  so every consumer gets a stable `rows`. Workspace typecheck + 113 SDK / 26 base tests green;
  WebKit re-verified RESPONSIVE. Base UI upgrade (Stage 1) **kept** per architect.
- ⚠️ **Earlier false-positive:** my first Playwright pass tested *incrementally adding* a
  group (popover already open) — which dodges the loop — and wrongly concluded Base UI fixed
  it. The deterministic repro is **loading `/notes` with group state in the URL, then
  opening the popover**, and it must be checked in **WebKit**, not Chromium.
- ✅ **Stage 1 — Base UI rename + upgrade** done (`@base-ui-components/react@1.0.0-rc.0` →
  `@base-ui/react@1.5.0`, 14 import sites, 3 ref-type drifts, `PopoverTrigger` rc.0 hack
  deleted, `docs/stack.md` updated; typecheck + 26 tests green). **Independent of the freeze**
  — a legitimate cleanup (off a deprecated dep), but it did **not** fix the freeze.
- ⛔ **Stage 2 — data-view `useTransition`** — **not a free `setTimeout`→`useTransition`
  swap; reverted.** nuqs already owns the deferral (above). Removing the `setTimeout(0)`
  reintroduces the **stale-closure batch drop**: the dispatch builds a *full* query-state
  snapshot via `dataViewReducer`, so two dispatches batched in one commit (the pageSize-sync
  and defaultGroup-seeding effects fire together) each read the same stale `current` and
  clobber each other — the `setTimeout(0)` was serializing them. Belongs to **D-A** (store
  redesign to partial patches), not the freeze fix.
- ⬜ **Stage 3 — build/test toolchain** (vite · @vitejs/plugin-react · vitest · happy-dom · TS).
- ⬜ **Stage 4 — urql data layer** (`@urql/core` + `@urql/exchange-graphcache`).
- ⬜ **Stage 5 — lucide-react** (icon-set major; audit the name-referenced registry).
- ⬜ **Stage 6 — dev types/tooling** (`@types/node`, `@graphql-codegen/cli` patch).
- ⬜ **Backend stack** — separate `uv` inventory pass; **not yet run** (see §8).

---

## 1. Root cause (why this refactor exists)

When the filter popover is open and you click a toolbar chip that lives in the
`PopoverRoot` subtree but **outside** the portaled popup (the active-filter `FacetChip`
"Remove Draft", `DataToolbar.tsx:207-215`), one trusted native click drives three things
in the same tick:

1. **Base UI dismissal** — outside-press teardown runs **synchronously** (portal unmount,
   positioner cleanup, focus return). `PopoverRoot` is exported raw (`popover.tsx:75`).
2. **The chip's `onClick`** → `onFilterToggle` (`DataToolbar.tsx:300-307`) →
   `dataView.setFilter` (`ListView.tsx:320-324`).
3. That cascades to a query/URL write + a urql reload + virtualizer recompute.

The synchronous teardown reenters mid-commit alongside the heavy reload → renderer lock.
It only shows up on this branch because view-state went **URL/query-backed**, making
filter/group/page clicks heavy and synchronous.

**The DRY smell — three hand-rolled defers, none delegating to the owner:**

- `PopoverTrigger` (`popover.tsx:83-149`): ~65 lines of capture-phase event archaeology —
  swallow the trusted press, `setTimeout(0)`-re-dispatch `trigger.click()`. Reinvents Base
  UI's controlled `open`/`onOpenChange`. Smells like an rc.0 trigger-press bug workaround.
- `data-view-context.tsx:89-125`: every dispatch wrapped in `setTimeout(0)` + a
  `scheduledDispatchesRef` Set + `mountedRef` cleanup. Reinvents `useTransition` +
  nuqs's `startTransition`/`limitUrlUpdates`. `useQueryStates(..., { history })` passes
  **none** of nuqs's perf options.
- **The outside-press path has no defer at all** — the hole the chip falls through.

## 2. Prior art / owners (defer to the stack)

| Concern | Owner in our stack | What we do |
| --- | --- | --- |
| "Heavy update must not block/tear urgent UI work" | **React 19.2 `useTransition`/`startTransition`** | Mark the view-state→reload update as a transition so React commits the urgent popover teardown first and renders the reload interruptibly. |
| URL/query write timing | **nuqs 2.8.9** (`startTransition`, `limitUrlUpdates: throttle/debounce`, `shallow`) | Pass the transition's `startTransition` + a throttle to `useQueryStates`; nuqs already updates state instantly and rate-limits only the history write. **Contingent on D-A.** |
| Popover dismissal timing | **Base UI** controlled `open`/`onOpenChange(open, eventDetails)` — `reason` (`outside-press`/`trigger-press`/…), native `event`, `cancel()`, `actionsRef` | Upgrade off rc.0; keep `PopoverRoot`/`PopoverTrigger` thin re-exports; delete the bespoke trigger hack. |

Sources: Base UI Popover docs + releases (now **1.2.0**, package renamed
`@base-ui-components/react` → `@base-ui/react`); base-ui #1744 (`onOpenChange` event-detail
change); nuqs options docs ("state is always updated instantly … only URL changes are
throttled/debounced").

## 3. Locked constraints (apply to every stage)

- **Each changed/added dep carries a `docs/stack.md` owner-row update in the same change**
  (repo rule). The Base UI rename row is mandatory in Stage 1.
- **Remove dead code before the structural refactor** — delete the hacks, don't wrap them.
- **Re-read a file before editing and after; verify before claiming done.** Drift is a bug.
- **One stage = one commit** for clean bisect/revert. **Checkpoint the dirty tree first**
  (36 files dirty on `wip-base-lift-refactor`, incl. `@angee/sdk` — upgrading deps on top
  of uncommitted work hurts reversibility).
- **Run from the root.** Stack via `angee dev`; unit via `vitest run`; e2e via Playwright
  (`docs/testing/e2e.md`).
- **Do not contradict `notes-auth-lift.md`.** Resolve **D-A** before wiring nuqs options.

---

## 4. Stage 0 — Inventory (`pnpm -r outdated`, June 2026)

| Package | Current | Latest | Bump | Stage |
| --- | --- | --- | --- | --- |
| `@base-ui-components/react` | 1.0.0-rc.0 | **Deprecated** → `@base-ui/react` ≥1.2 | rename + pre-1.0→1.2 | **1** |
| `@urql/core` | 5.2.0 | 6.0.1 | major | 4 |
| `@urql/exchange-graphcache` | 7.2.4 | 9.0.0 | 2 majors | 4 |
| `vite` (dev) | 6.4.2 | 8.0.14 | 2 majors | 3 |
| `@vitejs/plugin-react` (dev) | 4.7.0 | 6.0.2 | 2 majors | 3 |
| `vitest` (dev) | 3.2.4 | 4.1.7 | major | 3 |
| `happy-dom` (dev) | 16.8.1 | 20.9.0 | 4 majors | 3 |
| `typescript` (dev) | 5.9.3 | 6.0.3 | major | 3 |
| `lucide-react` | 0.469.0 | 1.17.0 | major (icon set) | 5 |
| `@types/node` (dev) | 22.19.19 | 25.9.1 | major (types only) | 6 |
| `@graphql-codegen/cli` (dev) | 7.1.0 | 7.1.1 | patch | 6 |

React (`19.2.6`) and nuqs (`2.8.9`) are **current** — the concurrency + URL-state owners we
rely on are already in place; no bump needed for the bug fix.

---

## 5. Staged upgrade plan (dependency-ordered)

### Stage 1 — Base UI rename + upgrade ✅ *(done; freeze fix pending e2e)*
- Renamed `@base-ui-components/react@1.0.0-rc.0` → `@base-ui/react@^1.5.0` (latest 1.5.0)
  in `packages/base/package.json`; rewrote **14 import sites** under `packages/base/src/ui/*`
  + `packages/base/src/lib/slot.ts` (subpaths unchanged).
- Fixed 3 ref-type drifts (1.5 narrowed part ref element types): `SelectContent`→
  `HTMLDivElement`, `TabsTab`→`HTMLElement`, `ToolbarGroup`→`HTMLDivElement`. v1.0 release
  notes confirm the rename is the only breaking change; the rest is non-breaking.
- **Deleted the `PopoverTrigger` rc.0 hack** (`shouldDeferPopoverPress`, `stopPopoverPress`,
  `pendingPointerPressRef`, the `setTimeout` re-dispatch) → `export const PopoverTrigger =
  BasePopover.Trigger`.
- Updated the `docs/stack.md` row to `@base-ui/react`.
- ✅ Workspace typecheck clean; 26 `@angee/base` unit tests green.
- ⬜ **Remaining gate:** e2e/live — confirm (a) the outside-press freeze is gone and (b)
  trigger open/close works by pointer **and** keyboard. Unit tests can't reproduce
  floating-ui teardown.

### Stage 2 — data-view dispatch ⛔ *(reverted; folded into D-A)*
**Finding:** nuqs's react-router adapter already wraps every URL-state update in React
`startTransition` *and* an internal throttle queue, so the heavy reload is already deferred
and de-prioritized — there is nothing for us to add. The `setTimeout(0)` in
`data-view-context.tsx` is **not** a stray defer to delete: it serializes dispatches so the
*full-state-snapshot* updater (`dataViewReducer` over the whole state) doesn't clobber a
sibling dispatch batched in the same commit (pageSize-sync + defaultGroup-seeding effects).
Removing it (whether direct or `useTransition`) reintroduces the **stale-closure batch
drop** — three `DataPage.test.tsx` cases fail (`Remove group`, `Records 1-2 / 4`, `Month`).
- **Proper fix lives in D-A:** redesign the dispatch to emit **partial** query patches
  (per-key), not full snapshots — then batching is safe and the `setTimeout`/`mountedRef`
  bookkeeping drops out for free. Do it with the store decision, not the freeze fix.
- Keep `PopoverRoot`/`PopoverContent` as thin styled re-exports; **no bespoke defer wrapper**
  anywhere (nuqs + Base UI own the timing).

### Stage 3 — build/test toolchain (coupled)
- Bump together (they constrain each other): `vite 6→8`, `@vitejs/plugin-react 4→6`,
  `vitest 3→4`, `happy-dom 16→20`, `typescript 5.9→6`.
- Expect: Vitest 4 config/API shifts; TS 6 surfacing new strictness; happy-dom DOM-API
  deltas affecting `@vitest-environment happy-dom` tests.
- Gate: full `vitest run` across `@angee/base` + `@angee/sdk` green; `tsc` clean; example
  web build (`vite build`) succeeds.

### Stage 4 — urql data layer (coupled, higher risk)
- `@urql/core 5→6` + `@urql/exchange-graphcache 7→9` together. Touches `@angee/sdk`
  (`resource-hooks`, `document-query`, `aggregates`, invalidation wiring) — note these are
  **already dirty** in the working tree; reconcile, don't clobber.
- `docs/stack.md`: confirm the urql rows still describe the wiring accurately.
- Gate: `@angee/sdk` tests green; live reads/subscriptions verified via `angee dev` + e2e.

### Stage 5 — lucide-react `0.469 → 1.17` (icon set)
- Major icon-set bump; names can change/deprecate. Audit the **name-referenced icon
  registry** (`docs/stack.md` lucide row; `Glyph`/icon usage in chrome + toolbars).
- Gate: no missing-icon fallbacks; visual smoke of nav/toolbar/menus.

### Stage 6 — dev types/tooling (low risk)
- `@types/node 22→25`, `@graphql-codegen/cli 7.1.0→7.1.1`.
- Gate: typecheck + codegen (if used) clean.

---

## 6. Verification — the freeze regression

- **Unit (`DataPage.test.tsx` conventions):** open the filter popover, activate a filter,
  then with the popover open click the outside `Remove <label>` chip; assert the filter is
  removed and the popover closes (flush with `nextTask()`, `DataPage.test.tsx:371`). This
  guards behavior but **cannot** reproduce the lock (no real floating-ui in happy-dom).
- **E2E (Playwright, the real gate):** the lock only reproduces with live floating-ui +
  router. Script: open filter popover → click outside "Remove Draft" → assert page stays
  responsive and filter/URL updated. Per `docs/testing/e2e.md`. **This is the gate that
  confirms the Stage 1 upgrade actually fixed the freeze.**

## 7. Sequencing & gates

1. Checkpoint the dirty tree (done — committed) so each upgrade is revertible.
2. **Stage 1 ✅ (the freeze fix)** → run the §6 e2e repro to confirm the lock is gone.
3. Stages 3 → 4 → 5 → 6 (toolchain → urql → icons → dev types), each its own commit,
   each gate green before the next.
4. **D-A** (architect) → the data-view dispatch redesign (former Stage 2): partial
   query patches, which also retires the `setTimeout`/`mountedRef` bookkeeping.
5. Per-stage gate: `tsc` clean · `vitest run` green · example `vite build` ok ·
   relevant e2e subset green against `angee dev` · `docs/stack.md` row updated for any
   dep whose name/ownership changed.

## 8. Open decisions / not-yet-scoped

- **D-A (from `notes-auth-lift.md`):** nuqs vs TanStack Router search as the view-state
  owner. **Now owns the data-view dispatch redesign** (former Stage 2). The `setTimeout(0)`
  is load-bearing because the dispatch emits *full-state snapshots*: confirmed by reverting
  it and watching `Remove group` / `Records 1-2 / 4` / `Month` drop (the M3 P1-review
  "stale-closure batch drop"). Fix = per-key **partial** patches (then the timer bookkeeping
  drops out), decided alongside the store. nuqs already provides `startTransition` + throttle
  internally, so no explicit transition is needed either way.
- **TS 6 / Vite 8 / Vitest 4 compatibility:** verify peer ranges at run time; may need
  lockstep or a held-back pin if an ecosystem plugin lags.
- **Backend stack ("entire stack"):** Python deps (`pyproject.toml` + `uv.lock`) are **not
  inventoried here.** Needs its own pass (`uv tree --outdated` / `uv lock --upgrade` dry
  run) and its own plan section before touching — Django/Strawberry/zed-rebac majors carry
  migration + SDL-emit risk. Flag to architect: in scope now, or separate?

## 9. Pointers (kept, not duplicated)

- Bug owner: `packages/base/src/ui/popover.tsx` (`PopoverTrigger` now a thin re-export).
- Deferral owner: **nuqs** (react-router adapter: `startTransition` + throttle queue) — not
  our code. `data-view-context.tsx` `setTimeout(0)` only serializes full-snapshot dispatches.
- Toolbar chips (the outside-press source): `packages/base/src/toolbars/DataToolbar.tsx`.
- Adapter wiring: `packages/base/src/createApp.tsx:213` (`NuqsAdapter`).
- Single-source plan + D-A: `.agents/plans/notes-auth-lift.md` (§2).
- Stack ownership table: `docs/stack.md`.
