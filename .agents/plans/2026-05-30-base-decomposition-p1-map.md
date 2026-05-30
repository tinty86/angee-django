# Base Decomposition P1 Map

> Status: architecture note and future-work plan. P1 is evidence of feature
> pressure, not an architecture to copy. The target is the current
> `src/angee/base` owner model: concise Django-native code whose placement makes
> the pattern readable without tests.

## Goal

Use `../angee-django-p1` as an inventory of what the larger prototype tried to
do, then map each capability to the clean base owners established here:

- `BaseAddonConfig` declares addon facts and resolves addon-local modules/files.
- `discover_addons()` orders addons and nothing else.
- `AngeeModel` owns model composition facts.
- `Resource` and its manager own resource manifests, entries, validation, load,
  and diff.
- `emission.py` owns deterministic runtime model emission.
- `graphql.py` owns native Strawberry schema contribution collection/merge.
- `rebac.py` delegates to `django-zed-rebac`; it does not synthesize
  authorization facts.

## What P1 Does

P1 split the framework into separate `compose`, `core`, `resources`, and
`graphql` packages. That made feature pressure visible, but it also introduced
several extra Angee layers before the owning objects were clear.

| P1 area | What it tried to own | New base owner |
|---|---|---|
| `compose/discovery.py` | AppConfig manifest decoding, asset tiers, optional module import, source model discovery, GraphQL module discovery, REBAC paths, dependency ordering | `BaseAddonConfig` owns addon-local declarations/imports; `discover_addons()` owns only deterministic ordering; `Resource` owns resource manifest normalization; `rebac.py` owns schema path use |
| `compose/model_emission.py` | Runtime app/model source rendering, extension base composition, admin source, revision tables, permission writing, migrations | `emission.py` owns runtime model emission and build orchestration; `AngeeModel` owns labels/extension targets/declared fields; revision/admin code stays out until needed |
| `compose/pipeline.py` | Multi-step build pipeline: models, GraphQL runtime, permissions, resources | Current `emit_runtime()` is the build seam; if GraphQL generation returns, GraphQL owns that build step and emission calls it as a named seam |
| `core/apps.py` | AppConfig base plus default synthetic configs, signals/checks import, locale mutation, resources, framework-managed flags | `BaseAddonConfig` stays explicit and boring; no synthetic config generation, no runtime registration, no resource parsing |
| `core/models.py` | Angee metaclass, `_angee_meta`, many model/GraphQL/REBAC options, `Meta.extends` stripping | Current `AngeeModel` uses plain class facts and classmethods; no metaclass or frozen option object until several real model-owned facts prove they belong together |
| `core/computed.py` | `@depends_on` computed-property dependencies for GraphQL/subscriptions | Future `computed.py` only if needed; it is model vocabulary, not GraphQL and not AppConfig. Dependencies may name any model-readable path, not only models |
| `resources/models.py` + `resources/loader.py` | Resource ledger, manifest entries, YAML/CSV parsing, object refs, xref cache, REBAC relationship writes | `Resource` owns tiers/manifest; `ResourceQuerySet` owns entries/validation/load/diff; REBAC grants or structural relationships stay in `django-zed-rebac`/auth, not in the resource loader |
| `graphql/plan.py` + `graphql/emit.py` | Model introspection IR and generated Strawberry-Django surface | Current base keeps manual native `graphql.py` exports. If auto CRUD returns, GraphQL owns it and reads composed models; composer must not grow GraphQL rules |
| `graphql/schema.py` | Runtime schema merge, SDL write, REBAC/optimizer wiring | Current `graphql.py` only merges addon `schemas`; future schema printing belongs here, still using Strawberry APIs directly |
| `graphql/subscriptions.py` | Change stream, `@depends_on` projection, GraphQL WS payloads | Future GraphQL/subscription owner; it reads model-owned computed metadata and does not put subscription behavior on `AppConfig` or `emission.py` |
| `graphql/model_explorer.py` / `graphql/compose.py` | Introspection UI queries like addon catalog, model explorer, asset ledger | Not base foundation yet. If added, it belongs to GraphQL as read-only inspection over `discover_addons()` and Django `_meta`; not to core models |

## Target Base File Map

- `apps.py`
  - Owns `BaseAddonConfig`, `BaseConfig`, `depends_on`, `rebac_schema`,
    `resources`, cached optional module imports, and source model discovery.
  - Must not parse resource manifests, build GraphQL, write runtime files, or
    register runtime behavior in `ready()`.

- `discovery.py`
  - Owns filtering installed Django app configs to Angee addons and sorting
    them by `depends_on`.
  - No manifest dataclass unless ordering needs a real new value object.

- `mixins.py`
  - Owns reusable abstract model behavior.
  - `AngeeModel` owns composition labels, extension targets, declared
    composition fields, public ids, and model references.
  - If `@depends_on` lands, add a tiny `computed.py` only if keeping it in
    `mixins.py` makes that file less clear.

- `models.py`
  - Owns persisted source models shipped by the base addon.
  - `Resource` owns `Tier`, `get_manifest(addon)`, and resource path
    normalization because those facts describe the `Resource` feature.

- `managers.py`
  - Owns model collection behavior.
  - `ResourceQuerySet` / `ResourceManager` expose `get_manifest(addon)`,
    `get_entries(...)`, `validate_tier(...)`, `load_tier(...)`, and
    `diff_tier(...)`.
  - `ResourceEntry` and `ResourceRow` stay here only while they are manager
    support objects with behavior; no loose resource functions.

- `emission.py`
  - Owns `BuildResult`, `DriftError`, `emit_runtime()`, `clean_runtime()`,
    filesystem drift checks, and deterministic runtime source emission.
  - It may orchestrate across addons, models, resources, and REBAC, but it must
    ask those owners for facts instead of decoding their shapes.
  - If rendering grows, split pure source rendering into `rendering.py`; do not
    split before it removes real reading burden.

- `graphql.py`
  - Owns `SchemaContributions`, `collect_schema_contributions()`, and
    `build_schema()`.
  - Addons keep exporting plain Strawberry classes via `schemas`.
  - P1-style auto CRUD is a separate GraphQL-owned feature; it must not move
    into `emission.py` or `apps.py`.

- `rebac.py`
  - Owns `.zed` path iteration, combined schema writing, and delegation to the
    `rebac` management command.
  - It must not duplicate relationship state, classify structural relations, or
    synthesize tuples from Django fields.

- `settings.py`, `urls.py`, `management/commands/angee.py`
  - Stay as entrypoints: build setting mappings, expose the GraphQL route, parse
    command arguments, and dispatch to owners.

## Decomposition Plan

1. Keep the current flat `src/angee/base` layout until a file has two owners.
   A file being 400 lines is not enough; unclear ownership is the trigger.
2. Treat P1 packages as pressure signals:
   - Resource growth maps to `Resource`/`ResourceQuerySet` first.
   - Model declaration growth maps to `AngeeModel` or a tiny model-vocabulary
     module.
   - GraphQL growth maps to `graphql.py` or a GraphQL-owned sibling module.
   - Build orchestration growth maps to `emission.py`; pure source-string
     rendering may split to `rendering.py`.
3. Do not restore P1 wrappers:
   - no `DiscoveredAddon`/`AddonManifest` unless the value object removes real
     duplication;
   - no metaclass for `Meta.extends`;
   - no frozen option dataclasses for facts already owned by Django classes;
   - no resource parsing on `AppConfig`;
   - no GraphQL generation inside composer.
4. When adding a P1 capability, first name the owner:
   - persisted fact -> model/field;
   - row-set behavior -> manager/queryset;
   - model declaration -> model class;
   - addon declaration/path -> AppConfig;
   - schema assembly -> GraphQL;
   - cross-addon file emission -> emission.
5. Verification for any decomposition change:
   - `uv run ruff check src/angee/base`
   - `uv run mypy src/angee/base`
   - `ANGEE_DATA_DIR=/private/tmp/angee-refactor-data PYTHONPATH=examples/notes-angee/src uv run python examples/notes-angee/manage.py angee build --check`

## Open Decisions

- Whether `emission.py` should split now. Current answer: no; split only if the
  source rendering grows past model emission or starts hiding the build flow.
- Whether computed metadata deserves `computed.py`. Current answer: only when
  `@depends_on` is introduced; until then, keep base smaller.
- Whether GraphQL auto CRUD comes back. Current answer: not in the base
  foundation; if it returns, it is GraphQL-owned and uses strawberry-django
  directly.
