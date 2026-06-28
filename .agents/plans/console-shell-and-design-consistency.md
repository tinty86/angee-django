# Console-shell workbench + net-new design-DRY + widget-control tv-extend

> **STATUS: COMPLETE (2026-06-27), unverified visually.** Implemented on branch
> `ds-consistency-workbench` via two adversarial workflows (A: design-DRY +
> widget-control + radius; B: Workbench). **Gate green:** `@angee/ui`
> typecheck/build clean, **283 tests pass**, `@angee/storage|knowledge|iam|agents`
> typecheck clean, storybook build clean. Drift greps 0/0/0/0 (`text-brand-text`,
> `*-text`-as-bg, `ChatterResizeHandle`/width consts, residual `rounded-sm/md/lg/xl`).
> Reviewers' findings fixed (speculative bottom/primary-controller removed;
> useInitialCollapse timing bug, conditional-panel persistence, controller
> identity churn, dead grid utilities). **Not yet committed** (repo policy: commit
> only when asked). **Remaining: manual `angee dev` visual check** of the console
> shell (2-col grid, resizable/collapsible sub-nav + Chatter, Chatter width
> persists on reload) and the sign-off visual deltas below.
>
> **Visual deltas for sign-off:** (1) the bug fixes recolor progressBar/statusbar/
> AppRail/AppChooser where a `*-text` token was wrongly a background (now correct
> solid tones); (2) select invalid+focus border now red (consistent with the other
> controls); (3) readOnly suppresses the danger ring; (4) button `iconLg` 8px→6px;
> (5) settings sub-nav + Chatter become resizable/collapsible panes; SchemaPage is
> now an always-horizontal 3-pane (was xl-only 3-col).
>
> **Deferred (flagged follow-ups):** caption/meta typography sweep (~278 sites);
> avatar-gradient token hygiene (D9); disabled-opacity convergence; Bottom panel /
> primary-sidebar toggle (add with a real adopter); deleting the kept
> storybook-only layouts (needs `console-design-system.md` reconciliation).



**Branch / worktree:** `ds-consistency-workbench` at
`/Users/alexis/Work/angee/angee-django-ds-workbench` (off `main@22972870`, clean).
**Origin:** architect ask — "identify design inconsistencies and make the design
more DRY and consistent" + "right owners for the console shell layout
(collapsible panels all the way)" + "lift prior art instead of hand-rolling."
**Method:** seven research/audit agents + an adversarial design workflow
(`wf_14406661-855`, three specs each `plan-reviewer`-vetted + synthesized).

## Reconciliation (do NOT redo / relitigate)

The `workspace/react-consistency` effort is **merged into main**
(`react-consistency-todo.md`). The big design-DRY surface is already done:
two-axis `tone × fill`, the token matrix, `default→neutral` / `error→danger`,
`INTENT_GLYPHS`, the `<Glyph>` icon registry, state-surface vocabulary,
`iconSm/iconMd/iconLg`, the primitive export convention, `toneGlyph`/`toneSolidBg`,
`createLayoutBand` (the two portal bands share one owner). **Consciously
left-separate there (untouched here):** Badge vs Chip sizing; the 3 storybook-only
header fragments; the layout-frame merge ("no addon consumers yet"); switch/
toggle-group default sizes; MetricStrip vs MetricGrid. `console-design-system.md`
owns the page-preset / View vocabulary (Shell→Page→View→Element→Widget) — this
plan **composes with it, never conflicts**.

This plan is only the genuinely **net-new** work the merged effort did not cover.

## Decisions (resolving the design-phase open questions)

- **D1 — One inner-shell owner = new `Workbench.tsx`, which REPLACES `Explorer`
  everywhere (architect decision).** Create `layouts/Workbench.tsx` as the single
  collapsible/resizable multi-pane owner over `SplitPanes` (v4), with a **props
  API matching Explorer's** for a mechanical migration: `primary?` (= Explorer
  `navigator`), `children` (content), `secondary?` (= Explorer `aside`),
  `bottom?` (optional, unused until an adopter — zero machinery when absent),
  `autoSave`, `primarySize`/`secondarySize`, `primaryCollapsible`/
  `secondaryCollapsible`, and surfaced collapse controllers so chrome toggles can
  drive a pane. Then **migrate every Explorer consumer to Workbench** (storage
  `StoragePage`, knowledge `KnowledgePage`, `ConsoleLayout`, iam `SchemaPage`,
  agents `AgentSessionsPage`) and **delete `Explorer.tsx`** + its export. This
  makes Workbench the one owner (no two-composer duplication). `navigator→primary`,
  `aside→secondary`. Keep it a single PROPS API — no slot sub-components.
- **D2 — `barVariants` owner created first (Stage 0).** A new `tv` recipe
  (`layouts/bar.ts` or beside `layout-band.ts`) owning bar chrome
  (height/edge/pad/tone/justify); `TopBar`/`Breadcrumb`/`ControlBand`/
  `PageToolbar`/`PageHeader`/`PageFooter`/`Statusline`/`ChatBar` compose it.
  `createLayoutBand` stays for the two portal bands. Resolves the typecheck
  blocker. State which existing recipe (`pageToolbarVariants`/`pageHeaderVariants`)
  it subsumes vs composes.
- **D3 — Chatter folds into a collapsible Explorer pane.** Delete
  `ChatterResizeHandle` + the ephemeral `width` state in `chatter-context.tsx`;
  demote that context to a cross-tree collapse bridge so the `TopBar` toggle
  drives the secondary pane controller. **Fixes the real bug**: Chatter width now
  persists across reload like Explorer's panes.
- **D4 — Keep all layouts; do not delete `CanvasPage`/`RecordView`/`SplitView`.**
  `console-design-system.md` commits these presets; deletion would require
  reconciling that doc. De-scoped to a flagged follow-up.
- **D5 — Console chrome rows stay full-width above the pane region.** Rail +
  TopBar + Breadcrumb + ControlBand + Statusline remain fixed chrome;
  `ConsoleLayout` hands only content+sidebars to Explorer. Visible change:
  `ConsoleSubNav` (settings sidebar) and `Chatter` become resizable/collapsible
  panes (the requested "panels all the way").
- **D6 — widget-control via tv `extend`, byte-equivalent.** Make
  `widgetControlSurfaceVariants` the owner; controls `extend` it. Keep
  `invalid`/`readOnly` as **inert pass-through variants** on slotted controls
  (`select`/`number-field`) so their Pick types still resolve (blocker fix). Fix
  variant order (`disabled` before `readOnly`). **Preserve** the 50/40 disabled-
  opacity exceptions via slot overrides (zero visual change); convergence to 60 is
  a flagged sign-off, not done here. Extract one `interactiveSurfaceVariants` base
  (focus-ring + disabled) for button/toggle/collapsible/toolbar.
- **D7 — `toneText(tone)` added to `lib/tones.ts` and wired INTO `toneFill`** so
  each tone's `text-*-text` literal lives once (mirrors how `SOLID_BG` feeds
  `toneFill.solid`); collapse the 5 duplicate maps onto it.
- **D8 — Radius unified to the `rounded-N` token scale** (canonical), via a
  **committed codemod script** with the pixel-equivalent mapping
  `bare→6, sm→4, md→6, lg→8, xl→12`, an explicit exclusion list, and an
  enumerated file set (~78 files / ~131 occurrences). Runs **after** widget-control
  (Stage 3). Pixel-preserving; select trigger `rounded`→`rounded-6` is fine
  (same pixels). *(High-churn / low-behavior — candidate to defer; see Forks.)*
- **D9 — Avatar gradients deferred.** They currently render via hex fallback, so
  this is token-hygiene, not a rendering bug; remap-vs-add-ramps is its own slice.
- **D10 — New owners stay internal** (like `toneSolidBg`/`toneGlyph`); export from
  the public barrel only when an addon/story needs them.

## Net-new work by stream

### Stream A — design-DRY (mostly disjoint)
- **Bugs:** `text-brand-text` phantom → `text-brand`/`text-brand-soft-text`
  (`upload-drop-target.tsx:52`, `RelationField.tsx:142`); `*-text`-as-background
  → `toneSolidBg`/`bg-<tone>` (`progressBar.tsx:16,130-132`, `statusbar.tsx:111`,
  `AppRail.tsx:460`, `AppChooser.tsx:259`); rename `progressBar` local `toneClass`.
- `toneText` + collapse 5 maps (D7); migrate `field.tsx:65` `text-danger-text`.
- `IconTile` recipe (route tone via `toneClass(tone,'soft')`/`toneText`, not
  hand-typed) applied at LIVE consumers only (MetricStrip/MetricGrid/MiniCard/
  AppChooser/CollectionHeader — verify); storybook-only headers untouched.
- Text-role recipe (`title`=15 / `heading`=18 / `caption` / `meta`) + the 4 title
  sites now; the ~278-site caption/meta sweep is its own reviewed slice.
- Arbitrary→token (~20 real sites).
- Radius codemod (D8).

### Stream B — widget-control (serialized block; D6)
`widget-control.ts` L0 `interactiveSurfaceVariants` + L1
`widgetControlSurfaceVariants`; then input/textarea/number-field/select/field/
checkbox(+toggle/collapsible/toolbar for the base) `extend` it; delete dead
`INPUT_SHELL`/flatten exports; class-string equivalence harness as the gate.

### Stream C — console-shell workbench (D1–D5)
Create `layouts/Workbench.tsx` (collapse-controller surfacing) → `bar.ts`
(`barVariants`, D2) → migrate ALL Explorer consumers to Workbench (storage
`StoragePage`, knowledge `KnowledgePage`) and **delete `Explorer.tsx`** →
`ConsoleLayout` composes Workbench → fold Chatter (D3) → `chatter-context` bridge
→ `TopBar` toggle → simplify `styles/index.css` console grid (3→2 cols, drop
`area-chatter`/`area-sidebar`/`console-grid-sidebar`) → migrate `SchemaPage` &
`AgentSessionsPage` onto Workbench → naming normalization (`Symbol.for("@angee/ui.*")`,
Pane/Aside/primary-secondary rule; record in guidelines Pitfalls). Any rewritten
markup uses the canonical `rounded-N` radius scale (D8).

## Implementation order (single shared worktree — serialized to avoid write races)

0. **Stage 0 (blockers, no production writes):** create `barVariants` owner;
   make widget-control invalid/readOnly inert pass-through; write + enumerate the
   radius codemod script.
1. **Stage 1:** widget-control block (B) → `pnpm --filter @angee/ui typecheck` +
   equivalence harness.
2. **Stage 2:** design-dry color/typography/IconTile (A, the non-form-control,
   non-radius edits) → typecheck/test.
3. **Stage 3:** radius codemod (A, D8) — AFTER Stage 1 so it edits the
   restructured form controls → pixel-equivalence + drift greps.
4. **Stage 4:** workbench (C) → typecheck.
5. **Stage 5:** reconcile the 3 cross-stream files sequentially —
   `styles/index.css` (gradients then grid), `Statusline.tsx` (toneText then bar),
   `PageHeader.tsx` (title-role then bar).
6. **Stage 6:** full gate — `pnpm --filter @angee/ui typecheck && test && build`,
   storybook build, drift greps (`text-brand-text`, radius, `*-text`-bg), adversarial
   review, `angee dev` visual checks (Chatter persistence, 2-col grid, form-control
   invalid/readOnly/disabled). Repair loop on failure.

## Verification
`pnpm --filter @angee/ui typecheck` · `pnpm --filter @angee/ui test` ·
`pnpm --filter @angee/ui build` · storybook build · class-string equivalence
harness (widget-control) · pixel-equivalence + greps (radius) ·
`text-brand-text`/`*-text`-bg greps clean · visual checks via `angee dev`.

## Flagged for architect (forks)
- **F1 — Inner-shell owner:** D1 extends Explorer (recommended) vs a new Workbench.
- **F2 — Radius codemod (D8):** include now (one scale, ~131 sites, pixel-safe) vs
  defer (high churn, no behavior change).
- **F3 — CanvasPage/RecordView/SplitView:** keep (D4) vs delete + reconcile
  `console-design-system.md`.
- Deferred slices: caption/meta typography sweep; avatar gradients (D9);
  disabled-opacity convergence; Bottom panel + primary-sidebar toggle.

## Prior art — claude.ai / Anthropic Console (researched 2026-06-27, primary evidence)

Anthropic's own web apps **use no panel/split library** (no react-resizable-panels/
allotment/mosaic — confirmed by exhaustive grep of live Console chunks). Their
Workbench right pane is a **custom Framer-Motion drawer + zustand** state; the
sidebar is custom collapsible/resizable/pinnable, persisted to localStorage +
user settings. Per our Constitution that hand-roll is the anti-pattern, not the
model — so **keep the Workbench on `react-resizable-panels` v4** (the maintained,
accessible owner shadcn also wraps; already in-stack, no new dep). The research
**validates our foundation**: the Console is **migrating Radix → Base UI** (our
exact choice), on **Tailwind v4**, **lucide**, **cmdk**, and a tailwind-merge/cva
family — plus a single shared design-system package across two app shells (Vite
SPA claude.ai + Next.js Console), which is what `@angee/ui` is. Reference set for
the Chatter pane if rich rendering is added later (each a `docs/stack.md` row):
CodeMirror 6, react-markdown + remark/rehype, refractor (Prism), TanStack Virtual.

## Capture on completion
Encode the durable rules in `docs/frontend/guidelines.md` (per "Where Knowledge
Lives"): `barVariants` owns bar chrome; controls `extend` `widget-control` (never
re-hand-roll invalid/readOnly/disabled); `toneText` owns per-tone text; one radius
scale (`rounded-N`); Explorer is the collapsible inner-shell owner; the
Pane/Aside/sidebar naming rule.
