### Summary
The code is functional, but it does not consistently live up to Angee's own constitution. The biggest structural problem is that several core seams are implemented as Angee-owned side channels instead of asking Django, Strawberry, import-export, or the owning model/config object to carry the contract. The result is hidden runtime state, import-time side effects, and duplicated ownership around schemas, runtime models, resources, and migrations. These are framework-level issues, so downstream addons will copy the wrong patterns unless the owners are tightened now.

### Findings

1. **GraphQL contributions are a parallel schema-parts DSL**
- **Dimension(s)**: Architecture, Consistency, Naming conventions, DRY
- **Location**: `src/angee/base/apps.py:271`, `src/angee/base/graphql/schema.py:33`
- **Severity**: High
- **Problem**: `BaseAddonConfig` expects `graphql.py.schemas` to be a mapping of Angee bucket names (`query`, `mutation`, `subscription`, `types`, `extensions`) and `schema.py` then builds the real Strawberry schema from those parts. This violates the GraphQL rule in `docs/backend/guidelines.md` and the glossary contract that addons expose native Strawberry `Schema` objects from conventional `graphql.py` modules, without a parallel schema language.
- **Recommendation**: Make `graphql.py` export actual `strawberry.Schema` objects keyed by schema name, delete the parts-normalization layer, and keep helpers like `crud` and `changes` as normal Strawberry authoring helpers used before the addon constructs its schema.

2. **Settings composition mutates `sys.path` inside a helper documented as pure**
- **Dimension(s)**: Architecture, Consistency, Readability for humans
- **Location**: `src/angee/base/settings.py:41`
- **Severity**: High
- **Problem**: `compose_defaults()` inserts `runtime_dir.parent` into `sys.path` before returning settings. That violates the settings-helper rule in `docs/backend/guidelines.md`: settings helpers are pure functions of their arguments and return plain Django setting mappings. It also hides the host-owned runtime import decision inside framework code.
- **Recommendation**: Remove the `sys.path` mutation from `compose_defaults()`; have the host add the runtime parent in one visible settings/entrypoint step, or provide a separately named side-effect function that the host explicitly calls.

3. **Resource loading uses process-global ledger state**
- **Dimension(s)**: Architecture, Code decomposition, Consistency
- **Location**: `src/angee/base/resources/widgets.py:16`, `src/angee/base/resources/managers.py:46`, `src/angee/base/resources/managers.py:91`
- **Severity**: High
- **Problem**: `set_ledger_model()` stores the active `Resource` model in a module global, and import-export widgets read it later through `_ledger_manager()`. This violates the Django-Native Rule and "Put Behavior on the Owning Object" in `docs/backend/guidelines.md` / `docs/guidelines.md`: the load context belongs to the manager/resource/widget instance, not to ambient process state. It is also not safe for concurrent or nested resource operations.
- **Recommendation**: Pass the ledger model or manager into the generated `AngeeResource` and its widgets through constructors/factory metadata, and remove `_active_ledger_model` entirely.

4. **Subscription signal wiring is hidden in schema construction**
- **Dimension(s)**: Architecture, Code decomposition, Readability for humans
- **Location**: `src/angee/base/graphql/subscriptions.py:45`, `src/angee/base/graphql/subscriptions.py:77`
- **Severity**: High
- **Problem**: `changes()` both creates a Strawberry subscription type and connects Django `post_save` / `post_delete` publishers. This makes signal registration depend on whether a process has built the GraphQL schema, violating "Compose at build time" and "Do not register at runtime" in `AGENTS.md`. Django signal wiring belongs in `AppConfig.ready()` or an explicit startup owner, not in a GraphQL surface factory.
- **Recommendation**: Make `changes()` pure schema/declaration construction, and register publishers from a deterministic AppConfig/build-owned registry during app startup.

5. **The base addon is emitted as runtime code but migrated from source**
- **Dimension(s)**: Architecture, Consistency, DRY
- **Location**: `src/angee/base/settings.py:112`, `src/angee/base/compose/emission.py:463`, `src/angee/base/migrations/0001_initial.py:1`
- **Severity**: High
- **Problem**: `BaseConfig` is excluded from `_addon_config_classes()`, so `MIGRATION_MODULES` is not redirected for the base addon, while the composer still emits `runtime/base/models.py`. The concrete `Resource` model therefore has generated runtime source but source-tree migrations. This violates `AGENTS.md` and `docs/glossary.md`: the framework core is an addon like any other, and runtime concrete apps/migrations are generated output with one owner.
- **Recommendation**: Choose one owner: either make `Resource` a normal concrete base app model and stop emitting `runtime/base`, or treat base like every other composed addon and route its migrations to the runtime output.

6. **Source model discovery can pick up imported internal abstract classes**
- **Dimension(s)**: Architecture, Code decomposition, Naming conventions
- **Location**: `src/angee/base/apps.py:225`, `src/angee/base/apps.py:369`, `src/angee/base/apps.py:380`
- **Severity**: Medium
- **Problem**: `_model_contributions` scans every class visible from `models.py`, accepts anything whose module starts with the addon package prefix, and then infers source-ness from `issubclass(AngeeModel)` plus `_meta.abstract`. That is an implicit package/name/shape heuristic, which conflicts with the backend rule that source model discovery should follow Django inheritance and explicit model-owned declarations.
- **Recommendation**: Make source contribution explicit on the model owner, or restrict discovery to classes defined in the conventional `models.py` module and ask a model-owned method whether it is a composed source model or extension.

7. **Model extension collision checks only cover fields**
- **Dimension(s)**: Architecture, Code decomposition, DRY
- **Location**: `src/angee/base/compose/emission.py:348`, `src/angee/base/compose/emission.py:381`
- **Severity**: Medium
- **Problem**: `_check_field_collisions()` fails fast only for directly declared fields. Extension bases can still silently collide on managers, methods, properties, class attributes, or `Meta` behavior, leaving Python MRO to choose the winner. That violates `AGENTS.md`: extension must be mechanical, explicit, deterministic, and fail-fast on collisions.
- **Recommendation**: Either constrain model extensions to field-only mixins and reject behavior-bearing bases, or add a model-owned declaration/check that covers all exported extension members before emitting the concrete class.

8. **URL resources are mutable inputs cached without a pinned content contract**
- **Dimension(s)**: Architecture, DRY, Consistency
- **Location**: `src/angee/base/apps.py:154`, `src/angee/base/resources/entries.py:117`, `src/angee/base/resources/fetch.py:31`
- **Severity**: Medium
- **Problem**: resource manifests may declare a URL, and `fetch_url()` caches by URL hash, reusing the first downloaded bytes indefinitely without a checksum, timeout, or manifest-pinned content hash. That violates the deterministic build/load expectations in `AGENTS.md`; the source of truth is the mutable remote URL, not the addon contract.
- **Recommendation**: Prefer package-local resource files; if URLs remain supported, require a declared SHA-256 digest, cache by verified content, use a timeout, and include the digest in generated review artifacts.

### Patterns & inconsistencies
The same ownership problem repeats across the core: schema ownership is pulled away from Strawberry, settings import-path ownership is pulled away from the host, resource context ownership is pulled away from import-export instances, and subscription wiring is pulled away from AppConfig startup.

Runtime composition is not consistently build-time. Some behavior is emitted into `runtime/`, some is shipped as source migrations, some is registered when a schema is built, and some is inferred during app import.

The code often has good local docstrings, but the docstrings sometimes document a rule that the implementation immediately breaks, especially `compose_defaults()` claiming purity while mutating `sys.path`.

Collision handling is strong where it exists, but it is incomplete: fields and GraphQL root field names fail fast, while model extension behavior and mutable resource inputs can still drift silently.

### Top 5 recommendations
1. Replace the GraphQL schema-parts contract with native Strawberry `Schema` exports, or reconcile the docs first if schema parts are now the intended contract.
2. Remove hidden runtime state and side effects from framework helpers: no `sys.path` mutation in settings helpers, no resource ledger globals, and no signal registration inside schema factories.
3. Decide whether the base addon is truly composed like every other addon; then put its concrete models and migrations under one owner.
4. Make model discovery and extension behavior explicit on the owning model classes, with fail-fast checks beyond field names.
5. Pin or remove URL-backed resources so resource loading is deterministic and reviewable.
