# Django Runtime-Correctness Review — `src/angee/` (compose, base, resources)

Reviewer lens: runtime correctness, query performance, transactions, migrations,
async/ASGI, authorization (REBAC), and stack-library idiom. Verified against
`docs/stack.md`, `docs/backend/guidelines.md`, the `django-zed-rebac`,
`strawberry-django`, `django-import-export`, `channels`, `django-sqids`,
`django-simple-history`, and `django-reversion` sources in `.venv`, and the code.

Checks run (all green):
- `uv run ruff check src/angee/` — All checks passed.
- `uv run mypy src/` — Success: no issues in 42 files.
- `uv run pytest` — 63 passed (54 in `tests/`, 9 in `src/angee/resources/tests`).
- `tests/test_layering.py` — 4 passed (package one-way import rule enforced).

## Summary

The framework is in good Django-correctness health. The REBAC contract is wired
the way `django-zed-rebac` documents it: `RebacMixin` makes `objects`/
`_default_manager` the actor-scoping `RebacManager`, reads fail closed under the
default `REBAC_STRICT_MODE=True`, and writes/deletes are gated by the library's
`pre_save`/`pre_delete` signals — so the `crud` create/update/delete surfaces and
`from_public_id` lookups stay scoped without Angee re-implementing authz. Change
publishing correctly defers to `transaction.on_commit`, the resource load runs
inside one `transaction.atomic()` + `system_context`, and the emitted runtime
(models, migrations, SDL) is deterministic and the migration is reversible. The
riskiest items are not crashes but contract gaps a future addon author can trip
on: the `crud` delete resolver runs a non-atomic preview-then-delete and the
`DeletionPreview` collector bypasses REBAC scoping (Medium), the resource ledger
lacks an index for the `xref`/`source_addon__endswith` resolution path used per FK
during import (Low/perf), and a couple of small idiom nits. No Critical or High
defects found.

## Findings

### 1. `crud` delete resolver: non-atomic preview-then-delete, and the preview collector is unscoped
- **Lenses:** Transactions & integrity; Authorization
- **Location:** `src/angee/base/graphql/crud.py:127-153`; `src/angee/base/deletion.py:46-68`
- **Severity:** Medium
- **Problem:** `_delete_resolver.delete()` calls `DeletionPreview.from_instance(instance)`
  (which builds a Django `Collector` and walks the cascade) and then, in a separate
  step, `instance.delete()` — with no `transaction.atomic()` around the pair. Between
  the preview walk and the delete, the cascade graph can change (a new protected child
  row, a concurrent FK insert), so the preview returned to the client can disagree with
  what actually happened, and a `ProtectedError` raised by `instance.delete()` after the
  preview said `has_blockers == False` would escape un-rolled-back. Separately,
  `DeletionPreview.from_instance` constructs the `Collector` directly on the raw instance;
  the cascade walk it reports is *not* REBAC-scoped, so the counts can describe rows the
  actor cannot read. The actual deletion is still gated (the instance was loaded through
  the scoped `_default_manager`, so `_fetch_all` pinned the actor and the `pre_delete`
  signal re-checks `delete`), so this is an information-shape/consistency issue, not an
  authz bypass.
- **Recommendation:** Wrap the preview + delete in `with transaction.atomic():` so the
  forecast and the delete observe one snapshot and a failed delete rolls back cleanly.
  If the preview counts are surfaced to end users, decide explicitly whether they should
  be actor-scoped; if so, scope the collected rows, otherwise document that the preview
  is a structural (sudo-level) forecast.

### 2. Resource-ledger `xref` resolution scans on a non-indexed column and a non-sargable suffix match
- **Lenses:** ORM & query performance; Models & managers
- **Location:** `src/angee/resources/widgets.py:102-111` (`resolve_xref`); `src/angee/resources/models.py:45-55`
- **Severity:** Low (batch-only path, but unbounded with ledger growth)
- **Problem:** `resolve_xref` runs, per foreign-key/many-to-many cell during an import,
  `ledger_model._default_manager.filter(xref=xref).filter(Q(source_addon=ref) |
  Q(source_addon__endswith=f".{ref}")).exclude(target_id="")`. The `Resource` model only
  indexes the four-column `UniqueConstraint` (`source_addon, source_path, xref,
  target_model`); there is no index whose leading column is `xref`, and
  `source_addon__endswith` is a trailing `LIKE '%.ref'` that cannot use an index at all.
  For a large ledger and a resource file with many FK xrefs this is an N (rows) × M (FK
  cells) sequence of full-ish scans. It is a CLI/batch path so it is not user-facing
  latency, but it degrades superlinearly as the ledger grows.
- **Recommendation:** Add `db_index=True` to `xref` (or a composite
  `models.Index(fields=["xref"])`) on the abstract `Resource` model so the emitted
  concrete table indexes it. Consider resolving the addon alias to its canonical dotted
  name once (the loader already builds an `addon_names` map in `ordering.py`) and matching
  `source_addon` by equality instead of `__endswith`, eliminating the suffix scan.

### 3. `crud` create/update authz depends entirely on ambient actor + signals; no instance-level write check is asserted in the surface
- **Lenses:** Authorization & security; Stack-library idiom
- **Location:** `src/angee/base/graphql/crud.py:89-115`
- **Severity:** Low (fails closed by default, but the safety is implicit)
- **Problem:** `crud()` forwards `permission_classes` to `strawberry_django.mutations.create/update`
  and otherwise relies on `django-zed-rebac`'s `pre_save` gate. That gate resolves the
  actor as `instance._rebac_actor or current_actor()`; on **create** the instance is
  fresh (no pinned actor), so the only thing standing between an unauthenticated path and
  a write is the ambient `current_actor()` set by `rebac.middleware.ActorMiddleware`
  (present in `compose_defaults`) plus `REBAC_STRICT_MODE=True` (the library default — note
  `compose_defaults` does not set it explicitly, so it inherits the default). This is
  correct today and fails closed, but the safety is entirely transitive: if a host ever
  serves a `crud` mutation through a transport that does not populate `current_actor()`
  (e.g. a future non-HTTP entrypoint, a custom resolver, or `REBAC_STRICT_MODE` flipped),
  create/update silently lose their only guard. The WS subscription path, by contrast,
  explicitly attaches an actor (`consumers.py:25`); the mutation path has no equivalent.
- **Recommendation:** Either pin `REBAC_STRICT_MODE=True` explicitly in `compose_defaults`
  (so the fail-closed posture is owned by Angee, not inherited from a library default that
  could change), or document on `crud()` that it depends on an ambient REBAC actor and is
  only safe behind `ActorMiddleware` + strict mode. A docstring contract here is cheap
  insurance for addon authors copying the pattern.

### 4. `change` publishers connect lazily on first schema build, not at app `ready()`
- **Lenses:** Async/ASGI; Stack-library idiom
- **Location:** `src/angee/base/graphql/subscriptions.py:18-21`; `src/angee/base/signals.py:36-52`
- **Severity:** Low (design choice; worth confirming intent)
- **Problem:** `connect_publishers(model)` runs inside `changes()`, which executes when an
  addon's `graphql.py` is imported. Schema discovery is lazy: `views._get_view` is
  `lru_cache`d and calls `GraphQLSchemas.from_discovery()` on first request, and
  `asgi.build_application()` builds at ASGI startup. So `post_save`/`post_delete`
  publishers are wired the first time a schema that defines a subscription is built — for
  the HTTP view that is the first GraphQL request. Model changes that occur after process
  start but before any schema build are not broadcast. For the ASGI server this is fine
  (the app is built at boot); for a host that only mounts the HTTP `urls.py` and never
  builds the ASGI app, the window exists. The `_connected` module-global set is correctly
  idempotent, so repeated builds do not double-connect.
- **Recommendation:** Confirm this is intentional (subscriptions only matter over the ASGI
  transport, which builds at boot). If broadcasts must be reliable regardless of when the
  first schema is built, connect publishers from `BaseConfig.ready()` for models that
  declare a `changes` subscription, the same place `register_revision_models()` already
  runs.

### 5. `RevisionMixin.revisions` / `revert_to` are typed `Any` and reach into `reversion.models`
- **Lenses:** Typing; Stack-library idiom
- **Location:** `src/angee/base/mixins.py:59-72`
- **Severity:** Low
- **Problem:** `revisions` returns `Any` and `revert_to(self, version: Any)` takes `Any`,
  losing type information at a public boundary the guidelines call out (strict mypy, no
  stray `Any` at boundaries). `reversion.models.Version` is the concrete owner type and
  could be named. `revert_to` also calls a bare `self.save()` with no `update_fields`,
  so it rewrites every column and fires full-row history/change signals even though only
  `revisioned_fields` changed.
- **Recommendation:** Type `revisions -> QuerySet[reversion.models.Version]` and
  `revert_to(self, version: reversion.models.Version)`. Consider
  `self.save(update_fields=[...the fields actually restored...])` so the targeted revert
  writes only what it changed (this also tightens the `signals._publish` `changed_fields`
  payload for that save).

### 6. `_history_excluded_fields` predicate is broad; verify it never excludes a concrete field
- **Lenses:** Migrations; Stack-library idiom
- **Location:** `src/angee/compose/runtime.py:428-440`
- **Severity:** Low (currently correct for the in-tree models)
- **Problem:** The predicate selects fields where `getattr(field, "concrete", True) is
  False and not field.is_relation and not auto_created`. For the example model this
  correctly yields `['sqid']` (the django-sqids virtual field), which `simple-history`
  cannot mirror. The logic is sound but fragile: it depends on every non-mirrorable field
  being non-concrete, non-relation, and non-auto-created. A future library-backed virtual
  field that does not match this exact shape would either leak into history (and break the
  historical-model build) or be wrongly excluded. The owner of "is this field
  history-mirrorable" is arguably the field/mixin, not a heuristic in the composer.
- **Recommendation:** Keep as-is for now (it is verified correct against the current
  stack), but consider letting a mixin/field declare its own history-exclusion (e.g. a
  marker on `SqidMixin`) so the composer asks the owner instead of re-deriving shape —
  consistent with the Find-the-owner rule.

## Patterns & inconsistencies

- **REBAC scoping is applied correctly and consistently.** Every read goes through
  `objects`/`_default_manager` (the `RebacManager`); no `_base_manager` use, no `raw`/
  `extra`/`cursor` string interpolation, no SQL injection surface. The only `system_context`
  use (`resources/managers.py:84`) is the legitimate, library-blessed bypass for trusted
  data import and is paired with `transaction.atomic()`. Verified no `_base_manager` usage
  anywhere in `src/angee`.
- **Transactions and commit-deferral are handled the Django way.** Change broadcasts use
  `transaction.on_commit` (`signals.py:115`); the resource load wraps all groups in one
  `transaction.atomic()` with a `DryRunRollback` sentinel for dry runs. `import_data` is
  called with `use_transactions=False` because the outer atomic owns the boundary —
  correct, avoids nested-savepoint surprises.
- **Mass-assignment is guarded.** `AngeeResource._validate_headers` rejects primary-key and
  unknown headers (`loader.py:298-321`), and `import_id_fields=()` forces ledger-driven
  identity rather than client-supplied PKs — good defense against import-time PK injection.
- **Determinism is enforced end to end.** Addon discovery sorts (`discovery.py:75`), schema
  parts dedupe by identity, runtime emission sorts imports/fields, and drift checks compare
  rendered vs on-disk. No wall-clock/random/filesystem-order leakage in emitted artifacts.
- **Minor idiom nit:** `resources/management/commands/resources.py:8-9` orders
  `from angee.base.discovery import ...` before `from django.apps import apps`, a small
  import-ordering inconsistency ruff currently tolerates; not a defect.
- **Note on `except TypeError, ValueError:`** at `base/models.py:87,110` — this is valid
  on Python 3.14 (PEP 758 relaxed unparenthesized except tuples) and parses as
  `except (TypeError, ValueError)`. It is not a bug, but it reads like the Py2 form;
  parenthesizing would avoid reviewer double-takes.

## Top recommendations

1. Wrap the `crud` delete preview + delete in one `transaction.atomic()` and decide
   explicitly whether the cascade preview should be actor-scoped (Finding 1).
2. Index `Resource.xref` and replace the `source_addon__endswith` suffix match with a
   canonicalized equality match to keep xref resolution sane as the ledger grows (Finding 2).
3. Pin `REBAC_STRICT_MODE=True` in `compose_defaults` (or document the dependency) so the
   create/update fail-closed posture is owned by Angee, not inherited from a library default
   (Finding 3).
4. Confirm whether change publishers must connect at `ready()` rather than lazily at first
   schema build, and move them if reliability before the first request matters (Finding 4).
5. Tighten `RevisionMixin` types and use `save(update_fields=...)` on revert (Finding 5).
