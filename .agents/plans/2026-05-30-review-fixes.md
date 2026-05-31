# Review-Fixes Implementation Plan

> **For the executor (Codex):** Implement slice by slice, in order. Reconstruct
> each change from the contract below and the surrounding code — do not paste
> from anywhere. Keep behaviour identical except where a slice explicitly
> changes a contract. After each slice run the per-slice checks; after the last
> slice run the full gate. Commit per slice with a clean, descriptive message
> (state the fix, not its origin — no "reviewer", "finding", "lifted", or plan
> numbers). Steps use `- [ ]` for tracking.

**Goal:** Resolve the catalogued correctness, layering, and quality issues in
`.agents/plans/2026-05-30-followups.md` §1, including three architectural
decisions taken by the architect (below).

**Architecture decisions (locked):**
1. **Invert Resource ownership via the composer.** `BaseConfig` stops declaring
   `source_model_modules`; the composer contributes the resource ledger model
   under the `base` label at build time. `angee.base` names nothing in
   `angee.resources`.
2. **Compose is build-only.** Remove the compose command host from the run app
   set. Move GraphQL SDL rendering/checking to `angee.base` and host the SDL
   command there; the compose `angee` command keeps only `build` and `clean`.
   Replace the `INSTALLED_APPS` string-sniff with an explicit `ANGEE_BUILD`
   settings flag.
3. **Xref identity is `(source_addon, xref)`.** Drop the `__endswith` suffix
   match; resolve by exact `source_addon` + `xref`; add a unique constraint and
   index; fail fast on ambiguity.

**Tech stack:** Python 3.14, Django 6, strawberry-django, channels/daphne,
django-import-export, django-zed-rebac, simple-history, reversion. Tests live in
`tests/` and `src/angee/resources/tests/` (pytest, `python_files = test_*.py`).

**Full gate (run before final handoff; per-slice subset noted in each slice):**
```sh
uv run ruff check . --no-cache      # --no-cache is mandatory: a warm cache has masked I001
uv run mypy src/
uv run pytest
uv run examples/notes-angee/manage.py angee build --check
```

---

## Slice 1 — Correctness & gate fixes

Independent, safe, highest value. Land first.

### Task 1.1: Fix `DeletionPreview.from_instance` for Django 6 collector shapes

**Files:**
- Modify: `src/angee/base/deletion.py`
- Test: `tests/test_deletion.py`

**Contract:** `from_instance` must not crash on `SET_NULL`/`SET_DEFAULT`
cascades, must report `RESTRICT` blockers, and must count fast-deletes.

- [ ] **Verify the installed Django 6 `Collector` API first.** Confirm in
  `.venv/.../django/db/models/deletion.py` that `field_updates` is a
  `defaultdict(list)` keyed by `(field, value)` with instance-list values, that
  `fast_deletes` is a list of querysets each carrying `.model`, and that
  `RestrictedError` exposes `.restricted_objects`. Implement against what you
  confirm.

- [ ] **Step 1: failing tests.** Add three `@pytest.mark.django_db(transaction=True)`
  tests mirroring the existing on-the-fly-model style (`schema_editor.create_model`,
  `app_label = "auth"`, teardown in `finally`):
  - `test_deletion_preview_counts_set_null_updates`: parent + child with
    `models.SET_NULL` FK (`null=True`); deleting the parent previews the child
    under `updated` with count 1 and does **not** raise.
  - `test_deletion_preview_reports_restricted_blockers`: child FK with
    `models.RESTRICT`; deleting the parent sets `has_blockers` and reports the
    child under `blocked`.
  - `test_deletion_preview_counts_fast_deletes`: a simple child with a plain
    `models.CASCADE` FK and no signals (fast-delete path) is counted under
    `deleted`.

- [ ] **Step 2: run, expect the SET_NULL test to error** with
  `AttributeError` (`.values()` on a list) on current code.

- [ ] **Step 3: implement.** Replace the body of `from_instance`:
  - Import `RestrictedError` alongside `ProtectedError`.
  - Catch both, mapping `error.protected_objects` / `error.restricted_objects`
    to `blocked`.
  - `deleted_counts` from `collector.data` (`len(rows)`), then add
    `fast_deletes`: for each queryset `qs`, add `qs.count()` to
    `deleted_counts[qs.model]`.
  - `updated_counts` by iterating `collector.field_updates.items()` as
    `(field, _value), instances`, accumulating `len(instances)` keyed by
    `field.model`.

```python
from django.db.models.deletion import Collector, ProtectedError, RestrictedError
...
        collector = Collector(using=instance._state.db or "default")
        blocked: tuple[DeletionPreviewGroup, ...] = ()
        try:
            collector.collect([instance])
        except ProtectedError as error:
            blocked = _groups(_count_by_model(error.protected_objects))
        except RestrictedError as error:
            blocked = _groups(_count_by_model(error.restricted_objects))

        deleted_counts: dict[type[models.Model], int] = {
            model: len(rows) for model, rows in collector.data.items()
        }
        for queryset in collector.fast_deletes:
            model = queryset.model
            deleted_counts[model] = deleted_counts.get(model, 0) + queryset.count()

        updated_counts: dict[type[models.Model], int] = {}
        for (field, _value), instances in collector.field_updates.items():
            model = field.model
            updated_counts[model] = updated_counts.get(model, 0) + len(instances)

        return cls(
            total_deleted_count=sum(deleted_counts.values()),
            deleted=_groups(deleted_counts),
            updated=_groups(updated_counts),
            blocked=blocked,
        )
```

- [ ] **Step 4: run** `uv run pytest tests/test_deletion.py -q` → all pass.

### Task 1.2: Fix import ordering in the `resources` command (ruff I001)

**Files:** Modify `src/angee/resources/management/commands/resources.py`

- [ ] Move `from angee.base.discovery import discover_addons` and
  `from angee.resources.models import Resource` into the local-import group,
  **after** the django third-party imports (`django.apps`,
  `django.core.management.base`). Group order: stdlib → third-party (django) →
  first-party (`angee.*`).
- [ ] Run `uv run ruff check src/angee/resources/management/commands/resources.py --no-cache`
  → clean.

### Task 1.3: Make `angee clean` idempotent (no permanently-uncleanable runtime)

**Files:**
- Modify: `src/angee/compose/runtime.py` (`_ensure_cleanable`)
- Test: `tests/test_compose.py`

**Contract:** After `clean()` deletes the generated root `__init__.py` (which
carries the sentinel) but preserves `*/migrations/`, a subsequent
`emit()`/`reset()`/`clean()` must succeed instead of raising "not an Angee
runtime directory".

- [ ] **Step 1: failing test.** Add `test_clean_then_emit_is_idempotent`: build
  an `AngeeRuntime` against a `tmp_path` runtime dir with `ANGEE_RUNTIME_DIR`
  set (use the existing test fixtures/patterns in `test_compose.py`), `emit()`,
  write a dummy `base/migrations/0001_initial.py`, `clean()`, then `emit()`
  again — expect no exception and the sentinel `__init__.py` present again. Also
  assert `clean()` called twice in a row does not raise.

- [ ] **Step 2: implement** in `_ensure_cleanable`: after the sentinel check,
  before raising, accept a migrations-only remainder. The directory is cleanable
  if every remaining **file** is a preserved migration path:

```python
        if init_path.exists() and GENERATED_SENTINEL in init_path.read_text(
            encoding="utf-8"
        ):
            return
        remaining_files = [
            path for path in self.runtime_dir.rglob("*") if path.is_file()
        ]
        if remaining_files and all(
            self._is_preserved_migration_path(path) for path in remaining_files
        ):
            return
        raise RuntimeError(
            f"{self.runtime_dir} is not an Angee runtime directory"
        )
```
  (The `ANGEE_RUNTIME_DIR`-match guard above this block already prevents
  operating on an unconfigured directory, so accepting a pure-migrations
  remainder is safe.)

- [ ] **Step 3: run** `uv run pytest tests/test_compose.py -q` → pass.

### Task 1.4: Treat a string `depends_on` as one dependency

**Files:**
- Modify: `src/angee/base/apps.py` (`_resource_entry`, ~line 336)
- Modify: `src/angee/resources/entries.py` (`from_declaration`, ~line 141)
- Test: `tests/test_apps.py`

**Contract:** `depends_on: "seed.csv"` is one dependency `("seed.csv",)`, not the
character tuple `("s", "e", ...)`. A list/tuple is unchanged.

- [ ] **Step 1: failing test** in `tests/test_apps.py`: a resource declaration
  with `depends_on="seed.csv"` normalizes to `("seed.csv",)`; with
  `depends_on=["a", "b"]` normalizes to `("a", "b")`.

- [ ] **Step 2: implement** a shared normalizer. In `apps.py`, replace the
  `if "depends_on" in entry: entry["depends_on"] = tuple(entry["depends_on"])`
  block with a call to a small module-level helper:

```python
def _normalize_depends_on(value: object) -> tuple[str, ...]:
    """Return resource dependency keys, treating a string as one key."""

    if isinstance(value, str):
        return (value,)
    return tuple(str(item) for item in value)
```
  and `entry["depends_on"] = _normalize_depends_on(entry["depends_on"])`.

- [ ] In `entries.py` `from_declaration`, change
  `depends_on=tuple(str(item) for item in raw.get("depends_on", ()))` to handle
  a bare string the same way (reuse the same logic; a string → single element).
  Keep one definition of the rule — import the helper from `apps.py` is **not**
  allowed (would couple resources→base.apps internals unnecessarily, and the
  string case is the only subtlety); inline the identical two-line guard with a
  comment, or factor a tiny `angee.resources` helper. Prefer: handle it inline
  in `from_declaration` since the value there is already the normalized entry.

- [ ] **Step 3: run** `uv run pytest tests/test_apps.py -q` → pass.

### Task 1.5: Make the GraphQL delete mutation atomic

**Files:**
- Modify: `src/angee/base/graphql/crud.py` (`_delete_resolver`)
- Test: `tests/test_crud.py`

**Contract:** Preview + delete happen in one transaction so the previewed
forecast matches the executed deletion.

- [ ] **Step 1:** wrap the resolver body in `django.db.transaction.atomic`:

```python
from django.db import models, transaction
...
    def delete(id: strawberry.ID) -> DeletePreview:
        """Delete one model instance by public id when unblocked."""

        with transaction.atomic():
            instance = _resolve_for_delete(model, str(id))
            preview = DeletionPreview.from_instance(instance)
            if not preview.has_blockers:
                instance.delete()
        return DeletePreview.from_domain(preview)
```

- [ ] **Step 2:** add/extend a `test_crud.py` test asserting a blocked delete
  leaves the instance present and an unblocked delete removes it (behaviour
  unchanged; this guards the atomic wrapper).

### Task 1.6: Reject reserved keys inside structured `fields`

**Files:**
- Modify: `src/angee/resources/entries.py` (`ResourceRow._values_for`,
  `ResourceRow.dataset_row`)
- Test: `src/angee/resources/tests/test_resources.py`

**Contract:** A structured row's `fields` map must not carry loader-reserved
keys (`_xref`, `xref`, `model`, `_meta`); the canonical row identity cannot be
overridden.

- [ ] **Step 1: failing test:** a YAML/JSON structured row whose
  `fields` contains `_xref` raises `ImproperlyConfigured`.

- [ ] **Step 2: implement** in `_values_for`, the `fields` branch:

```python
        if "fields" in payload:
            fields_value = payload["fields"]
            if not isinstance(fields_value, Mapping):
                raise ImproperlyConfigured("resource row fields must map names")
            reserved = RESERVED_ROW_KEYS & set(fields_value)
            if reserved:
                raise ImproperlyConfigured(
                    "resource row fields cannot contain reserved keys: "
                    f"{', '.join(sorted(reserved))}"
                )
            return dict(fields_value)
```
  and harden `dataset_row` so identity always wins:
  `return {**self.values, "_xref": self.xref}`.

- [ ] **Step 3: run** `uv run pytest src/angee/resources/tests/test_resources.py -q`.

**Slice 1 checks:** `uv run ruff check . --no-cache && uv run mypy src/ && uv run pytest`.

---

## Slice 2 — Refactors (behaviour-preserving)

### Task 2.1: One JSON serializer in `angee.base`

**Files:**
- Create: `src/angee/base/serialization.py`
- Modify: `src/angee/base/signals.py` (drop `_json_safe`)
- Modify: `src/angee/resources/loader.py` (drop `_json_default`)
- Test: `tests/test_signals_access.py` (or a new `tests/test_serialization.py`)

**Contract:** A single recursive `json_safe(value)` owns scalar coercion
(`datetime`/`date`/`time` → `isoformat`, `Decimal` → `str`, recurse into
list/tuple/Mapping, `str()` fallback for anything else — keep the defensive
fallback; do **not** raise, since this runs in a post-commit signal handler).

- [ ] Create `angee/base/serialization.py` with `json_safe(value: Any) -> Any`
  (move the recursive logic from `signals._json_safe`, add `time` to the
  datetime branch and a `Decimal` branch).
- [ ] `signals.py`: import and use `json_safe`; delete `_json_safe`.
- [ ] `loader.py`: replace `_json_default` and the
  `json.dumps(..., default=self._json_default)` call with
  `json.dumps(json_safe(payload), sort_keys=True, separators=(",", ":"))`.
  Delete `_json_default`. (`json_safe` is in `angee.base`; resources may import
  base.)
- [ ] Add a unit test covering datetime/date/time/Decimal/nested structures.
- [ ] Run `uv run pytest -q` and `uv run ruff check . --no-cache`.

### Task 2.2: Parenthesize multi-exception `except` clauses

**Files:** Modify `src/angee/base/models.py` (lines ~87 and ~110)

- [ ] Change `except TypeError, ValueError:` → `except (TypeError, ValueError):`
  in both `from_public_id` and `instance_from_public_id`. Semantics are
  identical under PEP 758; the parenthesized form is the conventional, scannable
  one. No behaviour change.

### Task 2.3: Decompose `AngeeResource.import_row`

**Files:** Modify `src/angee/resources/loader.py`

**Contract:** Behaviour identical; the method reads as a short sequence of
named decisions. Existing `test_resources.py` is the regression guard.

- [ ] Extract private helpers on `AngeeResource`, e.g.
  `_record_row_state(xref, row_hash, ledger)` (the bookkeeping writes),
  `_skip_decision(ledger, instance, row_hash)` (returns the skip `RowResult` or
  `None`), and `_adopt_for_row(xref, row, row_hash)` (the adoption + frozen-tier
  upsert branch). `import_row` becomes: resolve xref/hash/ledger → record state →
  try adopt → skip decision → delegate to `super().import_row`.
- [ ] Run `uv run pytest src/angee/resources/tests/test_resources.py -q`.

**Slice 2 checks:** full `ruff --no-cache`, `mypy`, `pytest`.

---

## Slice 3 — Xref identity = `(source_addon, xref)`

**Files:**
- Modify: `src/angee/resources/models.py` (`Resource.Meta`)
- Modify: `src/angee/resources/widgets.py` (`resolve_xref`)
- Modify: `src/angee/resources/loader.py` (`_ledger_for_xref`, `_upsert_ledger`)
- Modify: `src/angee/resources/managers.py` (`_check_xref_collisions` — keep)
- Test: `src/angee/resources/tests/test_resources.py`

**Contract:** An xref `<addon>.<xref>` resolves to exactly one ledger row by
`source_addon == addon AND xref == xref`. The pair is unique in the ledger and
indexed. Ambiguity or absence fails fast.

- [ ] **Constraint + index** on `Resource.Meta`: replace the
  `(source_addon, source_path, xref, target_model)` `UniqueConstraint` with
  `UniqueConstraint(fields=("source_addon", "xref"), name="%(app_label)s_resource_addon_xref")`.
  A unique constraint provides the index; no separate `indexes` entry needed.
  Keep `ordering`.
- [ ] **`resolve_xref`:** drop the `Q(... __endswith ...)` branch; filter
  `source_addon=addon_ref, xref=xref`, `.exclude(target_id="")`. Resolve via
  `.get()`-style fail-fast: if zero rows → `ValueError(f"unresolved xref {value!r}")`;
  if `MultipleObjectsReturned`/more than one → `ValueError(f"ambiguous xref {value!r}")`.
  Use `list(qs[:2])` and branch on length to avoid a second query.
- [ ] **`_ledger_for_xref`:** filter by `source_addon=self.entry.addon.name,
  xref=xref` only (drop `source_path` / `target_model` from the lookup);
  `.first()` is now the unique row.
- [ ] **`_upsert_ledger`:** key `update_or_create` on
  `source_addon=..., xref=...`; move `source_path`, `target_model` into
  `defaults` alongside `content_hash`, `target_id`, `tier`.
- [ ] **`_check_xref_collisions`** already keys on `(addon.name, xref)` — keep
  it for the pre-DB fail-fast message.
- [ ] **Tests:** update any test asserting same-xref-across-files; add a test
  that an ambiguous resolution (two ledger rows, same addon+xref, distinct
  target_model) raises `ambiguous xref`. Regenerate the example migration in the
  e2e step (do **not** hand-edit migrations).
- [ ] Run `uv run pytest -q`.

---

## Slice 4 — Resource validate, loading performance, explicit adoption

### Task 4.1: `resources validate` exercises row cleaning

**Files:** Modify `src/angee/resources/managers.py`

**Contract:** `validate_addons` must surface widget cleaning, FK xref
resolution, and model-validation errors — not only header errors — by running a
rolled-back dry-run import of all selected groups in dependency order.

- [ ] Extract the shared loop from `load_addons` into a private
  `_import_groups(groups, *, dry_run, allow_non_dev=False)` that runs under
  `system_context(reason=...)` + `transaction.atomic()`, imports each group
  with `raise_errors=True, rollback_on_validation_errors=True,
  use_transactions=False`, and rolls back when `dry_run` (via the existing
  `DryRunRollback`). `load_addons` calls it with `dry_run` from its argument.
- [ ] `validate_addons` calls `_import_groups(groups, dry_run=True)` (so
  cross-group FK xrefs resolve against earlier groups within the rolled-back
  transaction), then returns `ValidationResult(checked_files=len(groups),
  checked_rows=sum(len(g.rows) for g in groups))`. Drop the `before_import`-only
  path.
- [ ] Add a test: a file with an unresolvable FK xref fails `validate`, not just
  `load`.
- [ ] Run `uv run pytest src/angee/resources/tests/test_resources.py -q`.

### Task 4.2: Remove the per-row ledger query (bulk-prime)

**Files:** Modify `src/angee/resources/loader.py`

**Contract:** Behaviour identical; the per-row `_ledger_for_xref` query is
replaced by one query per import run.

- [ ] Add `AngeeResource.before_import` (already overridden) or a new hook that,
  given the dataset, bulk-loads existing ledger rows for this entry into
  `self._existing_ledgers` keyed by xref in **one** query:
  `filter(source_addon=entry.addon.name, target_model=..., xref__in=[...])`.
  `_ledger_for_xref` then reads the primed cache (falling back to a single query
  only on a miss). Keep `instance_for_xref` working.
- [ ] No new test required if `test_resources.py` covers load idempotency; add
  one asserting a second load of the same file performs no creates/updates
  (already-skipped path) to guard the cache.
- [ ] Run `uv run pytest src/angee/resources/tests/test_resources.py -q`.

### Task 4.3: Explicit adoption key, fail fast on ambiguity

**Files:**
- Modify: `src/angee/resources/entries.py` (`ResourceEntry.adopt`,
  `from_declaration`)
- Modify: `src/angee/resources/loader.py` (`_adopt_existing_target`)

**Contract:** `adopt` accepts an explicit unique-field name (preferred) or
`True`. With an explicit name, adopt by that field. With `True`, infer the
single unique field present in the row and **raise** `ImproperlyConfigured` if
more than one unique candidate is present (was: silently disabled). Zero
candidates → no adoption (returns `None`).

- [ ] `adopt: str | bool = False` on `ResourceEntry`; `from_declaration` keeps a
  string as-is and coerces other truthy/falsy to bool.
- [ ] `_adopt_existing_target`: if `adopt` is a field name, use it directly
  (validate it is a unique field on the model, else raise); if `adopt is True`,
  infer and raise on `len(candidates) > 1`.
- [ ] Update/keep tests; document the two forms in the `adopt` docstring.
- [ ] Run `uv run pytest src/angee/resources/tests/test_resources.py -q`.

**Slice 4 checks:** full `ruff --no-cache`, `mypy`, `pytest`.

---

## Slice 5 — WebSocket REBAC context & field-gate cost

### Task 5.1: Off-load synchronous REBAC checks in the subscription generator

**Files:** Modify `src/angee/base/graphql/subscriptions.py`

**Contract:** The synchronous `_gate_event` (which calls the REBAC backend) must
not run inline in the async generator.

- [ ] In `resolve`, wrap the call:
  `from asgiref.sync import sync_to_async` (top of module) and
  `event = await sync_to_async(_gate_event, thread_sensitive=True)(model, actor, payload)`.
- [ ] Extend `tests/test_subscriptions.py` to assert gated events still stream
  (behaviour unchanged).

### Task 5.2: Enter the django-zed-rebac actor context for WS operations

**Files:** Modify `src/angee/base/consumers.py` (and `subscriptions.py` if the
generator needs the context active per-iteration)

**Contract:** WS GraphQL operations execute within the same ambient REBAC actor
context that `ActorMiddleware` installs for HTTP, so strict-mode ORM access and
write signals see the connection actor.

- [ ] Inspect django-zed-rebac for the context manager / contextvar that
  `ActorMiddleware` sets (e.g. an `actor_context(actor)` or equivalent in
  `rebac`). Bracket WS operation execution in it: prefer overriding the
  consumer's operation execution so each operation runs inside
  `actor_context(scope_actor(self.scope))`. If strawberry-channels exposes no
  clean per-operation hook, at minimum enter the context around the subscription
  stream (the generator) and document the boundary in a module docstring.
- [ ] If the library exposes **no** usable ambient-context API, do not invent
  one — `log` the limitation in this plan's notes and leave 5.1 as the shipped
  improvement. Report which path you took.

### Task 5.3: Field-gate read check — bulk if available

**Files:** Modify `src/angee/base/access.py`

- [ ] Check `rebac.field_visibility` for a multi-field / bulk read-check API. If
  one exists, replace the per-field loop in `_redact` with a single bulk call.
  If not, leave the per-field loop and add a one-line docstring note that each
  gated field costs one backend check (so the cost is visible). Report which.

**Slice 5 checks:** `uv run pytest tests/test_subscriptions.py tests/test_signals_access.py -q`, then full gate.

---

## Slice 6 — Fetch hardening, dead REBAC wrapper, strict-mode pin

### Task 6.1: Validate redirect scheme in `fetch_url`

**Files:** Modify `src/angee/resources/fetch.py`

- [ ] Build an opener with a redirect handler that re-validates the target
  scheme against `ALLOWED_SCHEMES`, and use `opener.open(request)` instead of
  `urllib.request.urlopen`:

```python
class _SchemeCheckedRedirectHandler(urllib.request.HTTPRedirectHandler):
    """Reject redirects to schemes outside ``ALLOWED_SCHEMES``."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if urlparse(newurl).scheme not in ALLOWED_SCHEMES:
            raise ResourceLoadError(
                f"{newurl!r}: redirect to a disallowed scheme"
            )
        return super().redirect_request(req, fp, code, msg, headers, newurl)
```
  Keep the `# noqa: S310` (trusted build-time path). Add a test that a redirect
  to a `file://` URL raises `ResourceLoadError` (mock the handler chain or use a
  local server fixture; a unit test calling `redirect_request` directly with a
  `file://` `newurl` is sufficient).

### Task 6.2: Delete the unused `sync_permissions` wrapper

**Files:** Modify `src/angee/compose/rebac.py`; grep for callers first.

- [ ] Confirm nothing calls `sync_permissions` (grep `src`, `examples`, the Go
  CLI references). Delete it and the now-unused `call_command` import.
  Permission sync is the library's own `manage.py rebac sync`; the docs note
  this (Slice 9). If a caller is found, stop and report instead of deleting.

### Task 6.3: Pin REBAC strict mode explicitly

**Files:** Modify `src/angee/base/settings.py` (`compose_defaults`)

- [ ] Find the django-zed-rebac strict-mode setting name (check the library's
  settings/conf). Add it to the returned mapping with an explicit, documented
  default consistent with the other `REBAC_*` defaults already set
  (`REBAC_BACKEND="local"`, `REBAC_FIELD_READ_MODE="redact"`). Add a
  `test_settings.py` assertion that the key is present and pinned.

**Slice 6 checks:** full gate.

---

## Slice 7 — Invert Resource ownership via the composer (Decision 1)

**Files:**
- Modify: `src/angee/base/apps.py` (remove `source_model_modules` declaration
  and, if it becomes unused, the feature)
- Modify: `src/angee/compose/runtime.py` (contribute the ledger under `base`)
- Test: `tests/test_compose.py`, `tests/test_layering.py`, `tests/test_settings.py`
- Docs: handled in Slice 9.

**Contract:** `angee.base` references nothing in `angee.resources`. The composer
emits the resource ledger model under the `base` label. `apps.get_model("base",
"Resource")` still resolves at runtime; `runtime/base/models.py` + migrations
still land under `base`.

- [ ] **Remove** `source_model_modules = ("angee.resources.models",)` from
  `BaseConfig`. `BaseConfig` now contributes no source models of its own.
- [ ] If `source_model_modules` has no remaining users (it doesn't), **delete
  the feature**: the `source_model_modules` ClassVar, the `explicit` flag on
  `_SourceModule`, the explicit branch in `_source_modules`, and the
  `source.explicit` branch in `_belongs_to_source_module` (it collapses to the
  package-prefix check). Prefer deletion to a dead extension point. Keep
  `_SourceModule` only if it still earns its place; otherwise inline the single
  conventional-module path.
- [ ] **Composer contributes the ledger.** In `compose/runtime.py`, import
  `from angee.resources.models import Resource` (compose may depend on
  resources; the one-way rule forbids the reverse, which still holds). Refactor
  emission so source models are organised by **target label**, with each addon
  contributing `addon.model_classes` under `addon.label` and the composer adding
  `Resource` under `"base"`:
  - Build `self.sources_by_label: dict[str, tuple[type[AngeeModel], ...]]` in
    `__init__` (addon labels with model_classes, then merge `{"base": (Resource,)}`;
    if `base` already appears, append).
  - `self.labels` derives from `sorted(self.sources_by_label)`.
  - `render_sources` iterates `self.sources_by_label` (label → models) instead
    of `self.addons`.
  - `_models_source` takes `(label, source_models)` instead of `addon`; replace
    `addon.label` with `label` and `addon.model_classes` with `source_models`.
    `_history_source` takes `label`. Extensions still key on composition label
    via `self.extensions`.
  - `_check_field_collisions` iterates the label→models map.
  Keep output byte-identical for existing addons (the `base` app now emits the
  same `Resource` concrete it did before, just sourced via the composer).
- [ ] **Tests:** `test_layering.py::test_base_does_not_import_sibling_packages`
  must still pass (now genuinely — base names nothing in resources). Add a
  `test_compose.py` assertion that emitted sources include `base/models.py`
  containing a concrete `Resource` with `app_label = "base"`. `test_settings.py`
  migration assertions (`migration_modules["base"] == "runtime.base.migrations"`)
  still hold.
- [ ] **Determinism:** the emitted `runtime/base/models.py` must be
  byte-identical to before this slice (compare against a pre-change `emit()`
  into a temp dir if practical). If it differs only by ordering, sort to match.
- [ ] Run `uv run pytest -q` and `uv run examples/notes-angee/manage.py angee build --check`
  after re-emitting (the example's committed `runtime/` may need a fresh
  `angee build`; if `--check` reports drift purely from this reorganisation,
  re-run `angee build` to re-emit, confirm the diff is empty/expected, and
  include the re-emitted runtime if it is tracked).

---

## Slice 8 — Compose is build-only; SDL moves to base; explicit build flag (Decision 2)

**Files:**
- Modify: `src/angee/base/settings.py` (run set, `ANGEE_BUILD` flag)
- Modify: `src/angee/base/apps.py` (`import_models`, delete the sniff)
- Modify: `src/angee/compose/runtime.py` (remove SDL methods)
- Modify: `src/angee/compose/management/commands/angee.py` (remove `schema`)
- Create: `src/angee/base/management/commands/schema.py` (+ `__init__.py`s as needed)
- Modify: `src/angee/base/graphql/schema.py` (`GraphQLSchemas.render_sdl`)
- Test: `tests/test_settings.py`, `tests/test_compose.py`, `tests/test_graphql.py`
- Docs: Slice 9.

**Contract:** The run app set does not install the compose command host. SDL
rendering/checking lives in `angee.base` and is invoked by a base-hosted command
(needs the loaded concrete models). `angee build` / `angee clean` remain in
compose. Build mode is signalled by an explicit `ANGEE_BUILD` settings flag.

- [ ] **Explicit build flag.** In `compose_defaults`, add `"ANGEE_BUILD": build`
  to the returned mapping. In `apps.py` `import_models`, replace
  `if _compose_build_app_set_installed(): return` with
  `if getattr(settings, "ANGEE_BUILD", False): return`. **Delete**
  `_compose_build_app_set_installed`.
- [ ] **Run set.** Remove `COMPOSE_APP` from `_run_installed_apps`. Leave
  `_build_installed_apps` unchanged (compose stays in the build set).
- [ ] **Move SDL rendering to base.** Add `GraphQLSchemas.render_sdl(self) ->
  dict[str, str]` returning `{name: self.build(name).as_str() for name in
  self.names()}`. Remove `render_schema_sdl`, `write_schema_sdl`,
  `check_schema_sdl` from `AngeeRuntime`, and remove the now-unused
  `from angee.base.graphql.schema import GraphQLSchemas` import from
  `compose/runtime.py`.
- [ ] **Base schema command.** Create
  `src/angee/base/management/commands/schema.py` (with the
  `management/`+`management/commands/` `__init__.py` package files) hosting a
  `schema` command with `--check`. It uses `GraphQLSchemas.from_discovery()` and
  writes/diffs files under `settings.ANGEE_RUNTIME_DIR / "schemas" /
  f"{name}.graphql"` — move the file write/drift logic from the old
  `AngeeRuntime.write_schema_sdl`/`check_schema_sdl` into the command (small I/O;
  the schema-building owner stays `GraphQLSchemas`). Mirror the
  `resources`/`angee` command style (`BaseCommand`, `requires_system_checks =
  []`, `self.style.SUCCESS`).
- [ ] **Compose command.** Remove the `schema` subparser + `_handle_schema` from
  `compose/management/commands/angee.py`. `angee` now exposes `build` and
  `clean` only.
- [ ] **Grep for `angee schema` usages** in `examples/`, scripts, and any Go CLI
  references in this repo; update them to the new command name (`manage.py
  schema`). Report any reference you cannot update.
- [ ] **Tests:**
  - `test_settings.py`: change `test_run_app_set_installs_resources_once` so it
    asserts `ComposeConfig` is **not** in the run set; add an assertion that the
    build set still includes it; assert `ANGEE_BUILD` is `True` for `build=True`
    and absent/`False` for the run set.
  - `test_compose.py`: drop/relocate any assertions about
    `AngeeRuntime.*_schema_sdl`.
  - `test_graphql.py`: add a `render_sdl` test (a built schema renders non-empty
    SDL per name).
- [ ] Run `uv run pytest -q`. Run `uv run examples/notes-angee/manage.py schema --check`
  only after a build+migrate (run context); the unit gate uses `angee build
  --check`.

---

## Slice 9 — Documentation reconciliation

**Files:** `docs/backend/guidelines.md`, `AGENTS.md`/`CLAUDE.md` (command
sequence), and any doc naming the moved `schema` command. **Do not touch
`docs/stack.md`** (owned separately) — see Slice 10 for the PyYAML flag.

- [ ] **GraphQL contract (lines ~139-141).** The code uses a `graphql.schemas`
  mapping of named bucket contributions (`query`/`mutation`/`subscription`/
  `types`/`extensions`) merged by the composer — keep this (decided). Rewrite
  the doc sentence to describe the actual contract: addons expose a `schemas`
  mapping in `graphql.py`; each named schema contributes Strawberry types into
  fixed buckets; the composer merges buckets across addons and builds one
  Strawberry `Schema` per name. Remove the "expose Strawberry `Schema` objects"
  wording that the code does not implement.
- [ ] **Layering (lines ~46-78).** Line 47 ("must not import … resources") is now
  literally true — keep it. Rewrite the `source_model_modules` paragraph
  (74-78): the resource ledger is emitted under `base` because **the composer
  contributes it** under that label at build time, not via a base-declared
  source module. If `source_model_modules` was deleted in Slice 7, remove its
  description entirely.
- [ ] **Build/run app sets (66-69).** State that the run set is runtime + the
  resource command host + source addons (no compose), the build set is source
  addons + the compose command host, and build mode is signalled by an explicit
  `ANGEE_BUILD` setting (not by sniffing `INSTALLED_APPS`). Note SDL rendering is
  a run-context command in `angee.base` (`manage.py schema`), since it needs the
  loaded concrete models; `angee build`/`clean` are the compose (build-time)
  commands.
- [ ] **REBAC (135-137).** Clarify Angee renders `permissions.zed` at build time;
  permission **sync** is the library's own `manage.py rebac sync` (Angee no
  longer ships a wrapper).
- [ ] **Checks (220-225).** Change `uv run ruff check .` to `uv run ruff check .
  --no-cache` (a warm cache masked a real I001).
- [ ] **Command sequence** in `AGENTS.md`/`CLAUDE.md` Run-From-Root: if it names
  `angee schema`, update to `manage.py schema`; verify the
  emit → makemigrations → migrate → resources load → schema sequence still reads
  correctly with compose build-only.

---

## Slice 10 — Final gate and flags

- [ ] **Full gate green:**
```sh
uv run ruff check . --no-cache
uv run mypy src/
uv run pytest
uv run examples/notes-angee/manage.py angee build --check
```
  If `angee build --check` reports drift caused by Slice 7's reorganisation,
  re-run `angee build`, confirm the re-emitted runtime is correct, and include
  it if tracked. Then run the example e2e (makemigrations → migrate → resources
  load → `manage.py schema --check`) to confirm the Slice 3 constraint change
  and the moved schema command work end to end.
- [ ] **Flag to the architect (do not edit `docs/stack.md`):** `entries.py`
  imports `yaml` (PyYAML) but `docs/stack.md` has no owner row for it. Report
  this so the architect can add an owner row or decide to drop YAML support.
- [ ] **Report**, per `lift`/handoff discipline: what changed per slice, which
  C1/C5 path you took (bulk vs documented), and anything you could not resolve
  (e.g. a Go CLI reference to `angee schema` outside this repo).

---

## Executor notes

- **No provenance** in code, comments, docstrings, or commit messages: describe
  the fix, never that a review/plan/old-version prompted it.
- **Reconstruct, don't paste.** Rewrite changed regions to match the surrounding
  style; match comment density and naming.
- **Re-read before and after editing** each file. If a search looks too small,
  narrow and rerun it.
- **Migrations:** never hand-edit emitted migrations; regenerate via
  `makemigrations` in the example e2e step. `angee clean` must preserve
  `*/migrations/`.
- **Determinism:** emitted artifacts stay byte-deterministic and sorted; no
  wall-clock, random ids, or filesystem order.
- **Slice independence:** Slices 1–6 are independent and safe; 7 then 8 are the
  architectural pair (do 7 first); 9 documents 7+8; 10 verifies. Commit per
  slice.
