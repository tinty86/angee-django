# Notes UI — visual parity vs mockups (2026-06-03)

Captured live (`.agents/tools/fidelity-capture.mjs`, 1440×900) and compared to
`.playwright-mcp/visual/mockup-{list,form}.png`. Live captures:
`examples/notes-angee/e2e/test-results/fidelity/{live-list,admin-list}.png` and
`.playwright-mcp/visual/live-form.png`. Functional e2e is comprehensive and green
(69 tests); these are visual/UX gaps, each needing a design decision.

## List

- ~~**Default grouping is `Updated · Day` → 1100+ folded single-day groups**~~
  **FIXED (`da4ff76`)**: `NotePage` now opens flat, `order={{ updatedAt: "DESC" }}`
  (records visible, recent-first); grouping stays on the toolbar. Reviewed
  (react+arch, clean) + 54 notes/login e2e green. Did NOT add relative-bucket
  grouping (would be a framework feature) — a flat recent list matches the
  mockup's "rows visible" intent with a one-prop change.
- **New note button is indigo**; the mockup's is green. Brand decision (indigo may
  be the intended Angee brand and the mockup the older palette).
- **Owner column absent**; the mockup shows Owner (avatar + name). Columns decision.
- Otherwise structurally faithful: same toolbar (group/filter/sort), columns
  (Title · Tags · Status · Word Count · Updated At), pager, list/board switcher,
  and the right-side chatter panel are all present and well-placed.

## Form

- ~~**Owner renders the raw sqid `usrgbHJdmfr`**~~ **FIXED (`352127e`)**: notes
  now expose `created_by_label`/`updated_by_label` (`get_full_name() or username`)
  resolved under `system_context` by FK id — owner shows "alice" + avatar. NOT
  via `select_related` (that broke the live query — see
  [[rebac-select-related-actor-scope-trap]]). **IAM grants list FIXED too
  (`7e4c20a`)**: `IAMGrantType.principal_label` delegates to `_user_principal`
  (the owner of subject-id→user); grants show "admin" + muted `auth/user:1`. The
  "user refs as raw ids" theme is now fully resolved.
- **Record pager shows "of 0"** (mockup "1 / 245") — looks broken; likely because
  the record was opened from a folded group so the pager has no sequence.
- Missing vs mockup (aspirational / not-yet-built): the Actions menu, the
  "Linked notes / Comments / Attachments / Versions" count band, the tab strip
  (Description / Linked notes / Attachments / Permissions / History), and the
  Visibility field. The core sheet (inline title, status stepper, star/share,
  Owner/Tags/Reminder, markdown body editor + toolbar) matches the mockup.

## Form — dead star button (confirmed defect, 2026-06-03)

The star record-action (`@angee/base`, `aria-label="Star"`) renders enabled in the
note sheet but is **not wired**: clicking it (verified: button enabled, click
lands) produces no DOM/aria change and fires no GraphQL mutation. The note model
has `is_starred` (zed `read__is_starred = owner`) and the mockup shows a filled
star, so starring is intended — the action just isn't connected to the field.
Decision needed: wire the star action to toggle `is_starred` (framework: how a
generic record "star" action maps to a model field — a convention or per-record
config), or remove the button until built. Same bucket as the other mockup-only
form features (tabs / linked notes / attachments / versions).

## Recommendation order
1. Fix the default list grouping (highest impact — the list is unusable on load).
2. Resolve user refs to display names (owner field + IAM grants).
3. Brand: confirm New-note button colour (green vs indigo).
4. Columns/tabs/features (Owner column, form tabs, linked/attachments/versions) —
   scope as product work.
