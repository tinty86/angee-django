### Summary
The code is compact and generally Django-shaped, but the biggest structural problem is ownership drift between `base`, `resources`, and `compose`. Several public contracts disagree with the docs: resource ownership, build-vs-run app sets, GraphQL schema authoring, and REBAC sync. That means the framework does not yet live up to its own constitution’s “find the owner” and “compose at build time” rules. Verification: `uv run pytest -p no:cacheprovider` and `uv run mypy src/angee --cache-dir=/dev/null` passed; `uv run ruff check src/angee --no-cache` failed on import sorting.

### Findings

1. **Base reaches into resources to own the Resource model**
- **Lens(es)**: Boundaries & layering, decomposition, DRY
- **Location**: `src/angee/base/apps.py:370`, `src/angee/base/apps.py:239`, `src/angee/compose/runtime.py:401`
- **Severity**: High
- **Problem** — `BaseConfig` declares `source_model_modules = ("angee.resources.models",)`, and `_source_modules()` imports those modules. The backend standard says "`angee.base` ... must not import `angee.compose` or `angee.resources`" and specifically says `Resource` is emitted under `base` "without `base` importing `resources`" (`docs/backend/guidelines.md:46-48`, `docs/backend/guidelines.md:74-78`). This makes `base` depend on the resource subsystem to know its own source models.
- **Recommendation** — Choose one owner. Either move the ledger model and its manager fully into `base`, or make `resources` own and emit it under its own addon label. Do not have `base` import a higher package by declaration.

2. **Runtime settings install the build-time composer**
- **Lens(es)**: Boundaries & layering, build-vs-runtime placement
- **Location**: `src/angee/base/settings.py:117`, `src/angee/base/settings.py:129`
- **Severity**: High
- **Problem** — `_run_installed_apps()` includes `COMPOSE_APP`, so the normal runtime app set installs `angee.compose`. The docs say the build app set is "source addons + the composer command host" while the run app set is "runtime + resources + source addons" (`docs/backend/guidelines.md:66-69`), and AGENTS says "Compose at build time" (`AGENTS.md:79`).
- **Recommendation** — Remove the compose command host from the run app set. If schema emission needs a post-build command, expose that through a run-safe command host or an explicit build settings mode.

3. **GraphQL uses an Angee schema-parts DSL where docs require native Strawberry schema objects**
- **Lens(es)**: Library ownership, naming, public contract drift
- **Location**: `src/angee/base/apps.py:79`, `src/angee/base/apps.py:93`, `src/angee/base/graphql/schema.py:90`
- **Severity**: High
- **Problem** — `BaseAddonConfig.schema_parts` expects `graphql.schemas` to be a mapping with Angee bucket keys like `query`, `mutation`, and `types`, then `GraphQLSchemas` merges those buckets. The backend rule says "GraphQL authoring is native Strawberry" and addons expose Strawberry `Schema` objects from `graphql.py` (`docs/backend/guidelines.md:139-141`). This is a parallel public schema shape.
- **Recommendation** — Make the addon contract native Strawberry schema objects, or explicitly reconcile the docs and code around a typed, minimal contribution object. Avoid an untyped dict contract as the framework API.

4. **Resource validation bypasses import-export’s row validation**
- **Lens(es)**: Library ownership, correctness, readability
- **Location**: `src/angee/resources/managers.py:49`, `src/angee/resources/managers.py:54`, `src/angee/resources/loader.py:87`
- **Severity**: Medium
- **Problem** — `validate_addons()` builds an import-export resource but only calls `before_import()`, which only validates headers. Widget cleaning, FK xref resolution, model cleaning, and row errors are skipped. The stack says `django-import-export + tablib` own "row cleaning, and row results" (`docs/stack.md:39`).
- **Recommendation** — Validate by running `import_data(..., dry_run=True, raise_errors=True, rollback_on_validation_errors=True)` inside a rollback transaction, or delegate to `load_addons(dry_run=True)` and return counts.

5. **Short xref lookup silently chooses the first matching addon suffix**
- **Lens(es)**: Mechanical extension, fail-fast collisions, ownership
- **Location**: `src/angee/resources/widgets.py:102`, `src/angee/resources/widgets.py:105`, `src/angee/resources/widgets.py:109`
- **Severity**: Medium
- **Problem** — `resolve_xref()` accepts `source_addon__endswith=f".{addon_ref}"` and then `.first()`. If two addons share a trailing name, the resolver picks one by ordering instead of failing. AGENTS requires "explicit owners, deterministic order, fail-fast collisions" (`AGENTS.md:83-84`).
- **Recommendation** — Require fully qualified addon names in xrefs, or resolve aliases through a checked registry that raises on ambiguity before loading rows.

6. **Resource adoption infers identity from unique-field shape**
- **Lens(es)**: Decomposition, Django-native ownership, lifted behavior
- **Location**: `src/angee/resources/loader.py:263`, `src/angee/resources/loader.py:277`, `src/angee/resources/loader.py:281`
- **Severity**: Medium
- **Problem** — `_adopt_existing_target()` scans model fields, guesses adoption from exactly one unique field present in the row, and silently disables adoption otherwise. The backend standard says model behavior lives on models/managers and warns against field-shape heuristics (`docs/backend/guidelines.md:85-93`, `docs/guidelines.md:95-100`).
- **Recommendation** — Make the adoption key explicit on the resource declaration or use a model/import-export-owned identity contract such as declared `import_id_fields` or a model natural key.

7. **REBAC sync is not actually wired through Angee**
- **Lens(es)**: Library ownership, build-time contract, dead surface
- **Location**: `src/angee/compose/rebac.py:44`, `src/angee/compose/management/commands/angee.py:28`
- **Severity**: Medium
- **Problem** — `sync_permissions()` exists but is not exposed by the `angee` command, whose subcommands are only `build`, `clean`, and `schema`. The docs say REBAC is owned by `django-zed-rebac` and "Angee wires schema sync" (`docs/backend/guidelines.md:135-137`), but the code only renders `permissions.zed`.
- **Recommendation** — Add an explicit Angee permission sync/check command that delegates to `django-zed-rebac`, or delete the unused wrapper and update the docs to say sync is manual.

8. **Resource command imports fail the configured Ruff gate**
- **Lens(es)**: Imports, checks
- **Location**: `src/angee/resources/management/commands/resources.py:8`
- **Severity**: Low
- **Problem** — `uv run ruff check src/angee --no-cache` reports I001 because the `angee.base.discovery` import appears before Django imports. The backend checks require `uv run ruff check .` before handoff (`docs/backend/guidelines.md:215-224`).
- **Recommendation** — Sort imports into standard, third-party, then local groups.

### Patterns & inconsistencies
The main recurring theme is owner ambiguity: `Resource` is physically in `resources`, emitted under `base`, normalized by `BaseAddonConfig`, and retrieved as `base.Resource`. Build-time code also leaks into the runtime app set through settings, while REBAC sync goes the other direction and is not wired at all. Public contracts are often loose mappings or heuristics (`graphql.schemas`, resource `depends_on`, short xrefs, unique-field adoption) where the constitution asks for explicit owners and fail-fast mechanics. Library-backed concerns are mostly wired, but validation and GraphQL authoring still wrap or reshape library-native APIs instead of letting those libraries own the contract.

### Top recommendations
1. Settle the `Resource` owner first; most base/resources layering drift follows from that decision.
2. Split build and run settings so `angee.compose` is not installed in the runtime app set.
3. Reconcile the GraphQL contract with the docs, preferably by accepting native Strawberry schema objects.
4. Replace resource heuristics with explicit declarations and ambiguity checks.
5. Make `resources validate` and REBAC sync delegate to their owning libraries end to end.
