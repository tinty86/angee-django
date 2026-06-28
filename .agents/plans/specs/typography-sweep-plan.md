# Caption/meta/description typography sweep — signed-off plan

Near-zero-visual-change DRY sweep onto the `textRoleVariants` recipe
(`packages/ui/src/ui/text.tsx`). Architect signed off: keep caption=11/meta=13,
ADD a `description` role, remap the 2 text-xs strays, defer eyebrow consolidation.

## Recipe change (do first)
Add a `description` role to `textRoleVariants`:
```
description: "text-13 text-fg-2",   // secondary/body-2 (non-muted): dialog/drawer/accordion bodies, panel & page descriptions, subtitles
```
Final roles: `title`=text-15 font-semibold text-fg · `heading`=text-lg font-semibold text-fg ·
`caption`=text-2xs text-fg-muted (11) · `meta`=text-13 text-fg-muted (13) ·
`description`=text-13 text-fg-2 (NEW).

Then compose `layouts/bar.ts`'s inline `text` variant (`"13-muted"`→meta, `"2xs-muted"`→caption)
onto the recipe so the bar stops being a second source of truth.

## Migration rule
Replace ONLY the size+color(+redundant-leading) fragment with the recipe className,
keeping every layout/spacing class via `cn(textRoleVariants({ role, truncate? }), "<rest>")`.
Use the `truncate` variant where a `truncate` class is present (mirror `ListPanel.tsx:47`).
There is NO `<Text>` component — apply the className recipe (the established `title` pattern).

## Buckets

### → `role:"caption"` (≈28; 11→11, 0 change). Pattern: `text-2xs text-fg-muted` static secondary.
Representative: fragments/ListPanel.tsx:51,92 · MiniCard.tsx:34 · MetricGrid.tsx:32 ·
MetricStrip.tsx:50 · SurfacePanel.tsx:35 · RecordHeader.tsx:12 (crumbs; also drop leading-4) ·
TimelineEntry.tsx:36 · views/GalleryView.tsx:281 · views/GraphView.tsx:268 ·
chrome/UserMenu.tsx:59 · chrome/AppChooser.tsx:268 (keep line-clamp-2 text-center + the
deliberate leading-[1.125rem]) · communication/chat/index.tsx:61,226,372,477,490 ·
ui/switch.tsx:18 · addons: iam/OverviewPage.tsx:247,275 · platform/ModelsPage.tsx:42 ·
platform/AddonsPage.tsx:43 · resources/ResourcesPage.tsx:37,49 · knowledge/BacklinksPanel.tsx:52 ·
storage/file-columns.tsx:78. (Grep `text-2xs[^"]*text-fg-muted` / `text-fg-muted[^"]*text-2xs` to find all.)

### → `role:"meta"` (≈60; 13→13, 0 change). Pattern: `text-13 text-fg-muted` static muted meta.
Representative: toolbars/ResourceToolbar.tsx:869 · views/RecordPager.tsx:25 ·
views/GroupedList.tsx:597,746,1107 · views/ListInternals.tsx:1493,1593 · views/AggregatePanel.tsx:100 ·
fragments/SurfacePanel.tsx:120 · FocusPanel.tsx:37 · LoadingPanel.tsx:24 · InlineEmpty.tsx:9 ·
RailPanel.tsx:44 · ListPanel.tsx:62 · RecordHeader.tsx:15 · page/PageHeader.tsx:20 (crumbs) ·
ui/command.tsx:27,32 · ui/table.tsx:15 · ui/card.tsx:63 (description base) · addons: operator
data-cell renderers (WorkspacesSection/SecretsSection/Operations/Services/GitOps/SourcesSection ~24) ·
iam/SchemaPage.tsx:128,292,318,363,491,505 · agents/AgentProvisioning.tsx:105,127,131,200,241 ·
agents/AgentChat.tsx:189 · AgentsPage.tsx:97 · AgentChatterPane.tsx:123 ·
integrate/AddRepositoryControl.tsx:212,259 · storage/PdfPreview.tsx:52.
(Grep `text-13[^"]*text-fg-muted` / `text-fg-muted[^"]*text-13`.)

### → `role:"description"` (≈17; 13→13, fg-2→fg-2, 0 change). Pattern: `text-13 text-fg-2`.
dialog/drawer/accordion bodies, panel/page descriptions, subtitles.
(Grep `text-13[^"]*text-fg-2` / `text-fg-2[^"]*text-13` across packages/ui + addons; classify each
as the description role; LEAVE any that are a distinct role.)

### Remap the 2 text-xs strays → `role:"caption"` (12→11, −1px — the ONLY visual change)
chrome/AppChooser.tsx:126 · chrome/TopMenu.tsx:219 (truncated muted dropdown subtitles;
matches sibling UserMenu email at text-2xs).

### Redundant `leading-*` cleanup (0 change — value equals token default). Remove ONLY these:
`text-13 leading-5` (both 20px): communication/Chatter.tsx:60 · TimelineEntry.tsx:39 ·
page/PageHeader.tsx:23 · ui/table.tsx:7 · ui/collapsible.tsx:17 · ui/accordion.tsx:21.
`text-2xs leading-4` (both 16px): RecordHeader.tsx:12 · ui/field.tsx:51,52 · ui/radio-group.tsx:46.
Do NOT remove leading-snug/relaxed/6/none/[1.125rem] — those are deliberate overrides.

## LEAVE (do not sweep)
Eyebrows (`SectionEyebrow` owns the uppercase+tracking variant; ~19 inline copies — separate sweep) ·
all `text-fg` body/control text (~64, the 13px body size) · all size-token recipes
(badge/chip/kbd/code/tooltip/avatar/card/input/button/toolbar/select/table/menu/field-sm) ·
`text-danger-text` errors (11) · `text-on-rail-mut` rail labels (5) · `text-fg-subtle` ·
`tabular-nums` numeric · `font-mono` values · ALL `text-xs`/12px except the 2 named strays
(it is the control "sm" size scale) · storybook-only header fragments.

## Verify
`@angee/ui` typecheck/test/build · storage/knowledge/iam/agents typecheck · storybook build ·
greps: no remaining bare `text-2xs text-fg-muted` / `text-13 text-fg-muted` / `text-13 text-fg-2`
static-text occurrences outside the recipe + the LEAVE set. Adversarial review: confirm only the
2 strays change pixels, no layout class dropped, `truncate` preserved.

## Deferred (flag, not now)
~~Eyebrow inline→`SectionEyebrow` consolidation; mono/numeric muted modifiers on the recipe.~~
DONE (2026-06-28): `textRoleVariants` gained `numeric` (tabular-nums) + `mono`
(font-mono) boolean modifiers; the operator data cells route through them. The 5
inline eyebrow copies (storage `FileBrowserContent`, knowledge `BacklinksPanel`,
chrome `AppChooser`/`ConsoleSubNav`, `TimelineView`) now compose `<SectionEyebrow>`
(tracking/spacing preserved per-site). LEFT as-is (different intent / already
centralized): recipe-internal eyebrow slots (`PageHeader`/`select`/`menu-parts`/
`separator`/`command` cmdk-heading), `userRef` avatar initials, `number-field`
stepper, and `progressBar`'s own value slot.
