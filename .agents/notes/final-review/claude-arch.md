# Architectural Review — `src/angee/` (compose, base, resources)

Reviewer: independent adversarial Django-architecture review.
Branch: `wip-base-lift-refactor`. Date: 2026-05-30.
Bar: this repo's own docs (`AGENTS.md`, `docs/guidelines.md`,
`docs/backend/guidelines.md`, `docs/stack.md`, `docs/glossary.md`), then
idiomatic Django where no rule applies.

## Summary

The tree is in good overall shape: layering is genuinely one-way and a test
enforces it (`tests/test_layering.py`), behavior largely lives on the classes
that own the data (`AngeeRuntime`, `ResourceQuerySet`, `ResourceEntry`,
`ChangeReadGate`, `DeletionPreview`), and the build path is deterministic and
sentinel-guarded. mypy is clean and the test suite passes (63 tests). The
single biggest structural problem is a **documented-contract contradiction**:
`docs/backend/guidelines.md` states "there is no 'is a build running' flag,"
yet `BaseAddonConfig.import_models` reconstructs exactly such a flag by sniffing
`INSTALLED_APPS` for `angee.compose`/`angee.resources` strings — and in doing so
`angee.base` reaches *up* to know about its sibling packages by literal name.
Two smaller but real issues undercut the "verify before claiming done" rule: a
ruff `I001` import-order failure ships in the resources command, and a
Python-2-shaped `except E, F:` clause sits in the most-copied module. The code
does not fully live up to its constitution: AGENTS.md says a code/doc mismatch
"is a bug that requires reconciliation," and the build-flag case is exactly that.

## Findings

### 1. `import_models` reconstructs the "is a build running" flag the docs forbid
- **Lens(es):** Boundaries & layering; DRY (doc vs code, AGENTS.md "constitution").
- **Location:** `src/angee/base/apps.py:211` (`import_models`) and
  `src/angee/base/apps.py:394` (`_compose_build_app_set_installed`).
- **Severity:** High
- **Problem:** `docs/backend/guidelines.md:69-73` is explicit: "Because the
  build process never loads the runtime apps, there is no 'is a build running'
  flag." `import_models` does the opposite — after `super().import_models()` it
  early-returns when `_compose_build_app_set_installed()` is true, and that
  helper inspects `settings.INSTALLED_APPS` for the literal strings
  `"angee.compose"`, `"angee.compose.apps.ComposeConfig"`,
  `"angee.resources"`, and `"angee.resources.apps.ResourcesConfig"`. This is a
  build-detection flag in all but name. It also breaks the package-layering
  intent: `angee.base` is the lowest layer, yet it now hardcodes knowledge of
  the existence and exact dotted paths of `angee.compose` and `angee.resources`
  (the very packages forbidden from being imported here). `tests/test_layering.py`
  only forbids `import`, so this string-coupling passes the guard while
  violating its spirit. The decision "do not import the emitted concrete models
  in this process" is owned by settings: `_build_installed_apps`
  (`settings.py:89`) already chooses the source-only app set, so the build
  process should simply not produce a code path that tries to import
  `runtime.<label>.models`. (Uncertainty: the guard may be defending against a
  stale `runtime/` on disk during a build; if so, the defense belongs at the
  settings/app-set seam that the docs designate as the owner, not as a
  runtime sniff inside `base`.)
- **Recommendation:** Move the build/run decision back to its documented owner.
  Either have the settings helper emit an explicit, base-owned setting (a single
  fact base may read, e.g. `ANGEE_ADOPT_RUNTIME_MODELS`) instead of base
  re-deriving it from sibling app names, or gate concrete-model adoption purely
  on `ANGEE_RUNTIME_MODULE` presence + `_module_exists(...)` (already computed at
  `apps.py:217-222`) so no compose/resources awareness lives in `base`. Then
  reconcile the doc sentence with whatever flag actually exists.

### 2. ruff `I001` import-order failure ships in the resources command
- **Lens(es):** Imports; "verify before claiming done."
- **Location:** `src/angee/resources/management/commands/resources.py:8`.
- **Severity:** Medium
- **Problem:** `from angee.base.discovery import discover_addons` is placed
  *above* `from django.apps import apps` and the `django.core.management`
  import, so the third-party/first-party blocks are interleaved.
  `uv run ruff check --no-cache src/angee/` reports
  `I001 [*] Import block is un-sorted or un-formatted`. `docs/backend/guidelines.md`
  lists `uv run ruff check .` as a required check and `pyproject.toml` selects
  `I`. (A stale `.ruff_cache` masks this — `ruff check src/angee/` with a warm
  cache prints "All checks passed!", which is how it slipped through.)
- **Recommendation:** `ruff check --fix` to reorder; routinely run with
  `--no-cache` (or clear the cache) before declaring the check green.

### 3. Python-2-shaped `except E, F:` in the most-copied module
- **Lens(es):** Readability; Naming/PEP-8 ("Follow Proven Best Practices").
- **Location:** `src/angee/base/models.py:87` and `src/angee/base/models.py:110`
  (`except TypeError, ValueError:`).
- **Severity:** Medium
- **Problem:** Python 3.14 now parses an unparenthesized `except A, B:` as the
  tuple `(A, B)` (verified: it catches both `TypeError` and `ValueError`), so
  this is not a runtime bug — but it is visually identical to the Python-2
  `except E, name:` binding form and reads as a latent error to every future
  reader. ruff's selected rule set (`E,F,I` only) does not flag it. This is
  framework foundation code that addons copy; `docs/guidelines.md` ("Follow
  Proven Best Practices and Patterns", "Name So Code Can Be Found, Not Guessed")
  argues for the unambiguous form.
- **Recommendation:** Write `except (TypeError, ValueError):` with explicit
  parentheses in both places. Consider widening the ruff selection (`UP`, `B`)
  so this class of footgun is caught mechanically.

### 4. `change_group` is a derived model fact living away from its owner
- **Lens(es):** Decomposition (find-the-owner).
- **Location:** `src/angee/base/signals.py:30` (`change_group`), consumed at
  `src/angee/base/signals.py:125` and `src/angee/base/graphql/subscriptions.py:52`.
- **Severity:** Medium
- **Problem:** `change_group(model)` is a module-level function that takes a
  model and reads two `_meta` fields (`app_label`, `model_name`) to compute the
  channel-layer group name. `docs/backend/guidelines.md:122-123` is precise: a
  pure renderer "may stay a module-level function in the owner's module; make it
  a method only when it reads more than one field of the owner." It reads two
  fields, and it is shared across `signals.py` and `subscriptions.py`, so the
  channel-naming convention currently has no clear home — it is duplicated as an
  import dependency between a publisher module and a subscriber module.
- **Recommendation:** Give the change-stream concept an owner. The cleanest
  Django-native shape is a small `ChangeStream`/`ChangeChannel` class (or a
  cohesive publisher object) that owns `group_name(model)`, `connect(model)`,
  and the `_connected` registry together, replacing the loose
  `change_group` / `connect_publishers` / `_connected` triple that
  `subscriptions.py` and `signals.py` both reach into.

### 5. `signals.py` is a module of loose functions over module-global state
- **Lens(es):** Decomposition (compose behavior onto a class); Spaghetti red flag.
- **Location:** `src/angee/base/signals.py:18` (`_connected` module global),
  `:21` `register_revision_models`, `:36` `connect_publishers`, `:86` `_publish`,
  `:118` `_broadcast`.
- **Severity:** Medium
- **Problem:** `docs/backend/guidelines.md:96-106` calls for composing related
  behavior onto a class and warns specifically against "a module of loose
  functions" with shared state — "a class is a fixed home that forces related
  behavior together and resists the drift that loose, scattered functions
  invite." `signals.py` is precisely that: change-publishing behavior keyed on a
  model, threaded through a module-level mutable `_connected: set` that the test
  suite has to poke directly (`tests/test_signals_access.py:64`
  `signals._connected.discard(Group)`). The naming compounds it: `change_group`,
  `connect_publishers`, and `register_revision_models` are public (no underscore)
  but are not Django's signal-handler convention and read as ad-hoc API.
- **Recommendation:** Fold publishing into the same owner proposed in Finding 4
  (a `ChangePublisher` that holds the connected-set and the `_on_save`/`_on_delete`
  handlers as methods). `register_revision_models` is genuinely ownerless
  app-population orchestration and can stay a function, but it belongs with the
  reversion concern, not bundled with channel publishing.

### 6. Resource-tier source of truth is duplicated across the layer boundary
- **Lens(es):** DRY (one source of truth per fact); Boundaries & layering.
- **Location:** Owner: `src/angee/resources/tiers.py:9-14` (`ResourceTier` enum)
  and `:17` (`from_value` + its error message). Copy: `src/angee/base/apps.py:36`
  (`RESOURCE_TIER_VALUES = ("master", "install", "demo")`), `:340`
  (`_resource_tier_value`) and `:347` (the byte-identical "Unknown resource tier
  {raw!r}; expected one of {expected}" message).
- **Severity:** Medium
- **Problem:** The set of valid tier values and the validation message exist in
  two places with no link between them; AGENTS.md DRY says "Same rule in two
  places: choose the owner, delete the copy." The owner is clearly
  `ResourceTier` in `angee.resources`. The duplication is *forced* by the
  layering rule (`base` must not import `resources`), which surfaces the deeper
  question: why does `angee.base.apps` own resource-tier validation at all?
  Resource manifest normalization (`_resource_tier_value`, `_resource_entry`,
  `_resource_entries`, the `FROZEN_TIERS`/`RESERVED_ROW_KEYS` concepts) is a
  resource concern, but it lives on `BaseAddonConfig` in `base` because that is
  where `AppConfig.resources` is declared. The fact is being validated twice
  because it is owned in the wrong layer.
- **Recommendation:** Pick one owner for "what tiers exist." Either (a) keep the
  tuple of tier *strings* as the single base-level primitive and have
  `ResourceTier` build itself from it (so the enum references the base fact), or
  (b) move tier normalization out of `BaseAddonConfig` into the resource
  subsystem and have `base` store the raw declared manifest uninterpreted. Do
  not keep two independent inventories of `("master","install","demo")`.

### 7. `_NativeJSONWidget` is named private but is part of a cross-module contract
- **Lens(es):** Naming ("one concept, one name"; `_leading_underscore` = internal).
- **Location:** Declared `src/angee/resources/widgets.py:75`; imported and used
  by sibling `src/angee/resources/loader.py:31` and `:47`.
- **Severity:** Low
- **Problem:** `docs/backend/guidelines.md:211` reserves `_leading_underscore`
  for "internal." `_NativeJSONWidget` is imported across module boundaries and
  wired into `AngeeResource.WIDGETS_MAP`, so it is part of the resource
  subsystem's internal contract, not a module-private helper. Its three
  siblings in the same file (`XrefForeignKeyWidget`, `XrefManyToManyWidget`,
  `XrefWidgetMixin`) are public; the lone underscore is an inconsistent naming
  signal that makes the symbol look more private than it is.
- **Recommendation:** Drop the underscore (`NativeJSONWidget`) to match the
  other widgets, or, if it is truly meant to be file-private, inline the lambda
  factory and stop importing it from `loader.py`.

### 8. `AngeeModel.public_id` delegates its own shape-read to a module helper
- **Lens(es):** Decomposition (put behavior on the owning object).
- **Location:** `src/angee/base/models.py:68` (`public_id` property) →
  `:146` `_public_id_value` → `:137` `_has_model_field`; same `_has_model_field`
  is re-called from `:95` `_public_id_lookup`.
- **Severity:** Low
- **Problem:** `public_id` is an instance property on the owning class, yet it
  forwards to the module-level `_public_id_value(self)`, which re-introspects
  `type(instance)` via `_has_model_field`. The class reaches *outward* to a loose
  function to read its own field shape, the opposite of "put behavior on the
  object that owns the data." Note the genuinely-ownerless functions
  `instance_from_public_id` and `public_id_of` are defensible — they must also
  dispatch on plain `models.Model` instances where no method can be added, which
  the docs explicitly bless (the `DateField.to_python`/`parse_date` precedent at
  `docs/guidelines.md:104-106`). The avoidable part is the AngeeModel-internal
  delegation.
- **Recommendation:** Let `public_id` / `_public_id_lookup` read `self.sqid`
  vs `self.pk` directly (a single `_meta.get_field`/`hasattr` check the model
  owns), and keep only the truly cross-type `public_id_of` /
  `instance_from_public_id` as loose orchestration.

## Patterns & inconsistencies

- **`base` knows about its siblings by string.** Findings 1 and 6 are the same
  shape: a fact owned higher up (build-vs-run selection; tier validation) is
  re-derived inside `angee.base` either by sniffing sibling app names or by
  duplicating a sibling's inventory. The layering test passes because it only
  checks `import` statements, so string-level upward coupling is invisible to
  it. Worth strengthening the layering test to also flag literal
  `"angee.compose"` / `"angee.resources"` references in `base`.
- **Loose-function modules over shared mutable state.** `signals.py` (Findings
  4-5) is the clearest case the backend guidelines warn against; the
  model-id helpers (Finding 8) are a milder echo. The framework otherwise
  models the right shape (`AngeeRuntime`, `ResourceQuerySet`, `ChangeReadGate`),
  so these stand out as the un-refactored remnants.
- **Verification gaps.** The shipped `I001` failure (Finding 2) and the
  unconventional `except` form that the narrow ruff selection misses (Finding 3)
  both indicate the "verify before claiming done" / Checks discipline was run
  against a warm cache and a thin lint profile.

## Top recommendations

1. Reconcile Finding 1: remove the `INSTALLED_APPS` sniff from
   `base.import_models`; let the settings layer own the build/run model-adoption
   decision and fix the doc sentence to match the real mechanism.
2. Fix the ruff `I001` failure in `resources.py` and run checks with a cold
   cache before handoff.
3. Replace `except TypeError, ValueError:` with the parenthesized form in
   `models.py`, and widen ruff (`UP`, `B`) to catch the class mechanically.
4. Give change-publishing a single class owner (group naming + connect +
   `_connected`), collapsing the `signals.py`/`subscriptions.py` split.
5. Pick one owner for the resource-tier inventory and delete the `base`-side copy
   of the values and validation message.
