# Main-loop independent notes — Django file placement & naming (src/angee/base)

My own candidates from having read every file, to cross-check the 3 agents.
Dimensions: wrong-file | module-name | class-name | method-name.

## Wrong-file candidates

- **Managers/QuerySet placement is CORRECT** (good): `resources/managers.py` holds
  `ResourceQuerySet` + `ResourceManager = Manager.from_queryset(...)`; `models.py`
  holds only the `Resource` source model. Idiomatic. Note for contrast.

- **`resources/loader.py` mixes several Django roles in one file** — it holds an
  import-export `ModelResource` subclass (`AngeeResource`), an `InstanceLoader`
  subclass (`XrefInstanceLoader`), AND loose module functions. import-export is the
  owning lib; Django analogue would split resource classes vs instance loaders. The
  filename `loader.py` is not a Django role-name and undersells that it holds the
  Resource class. Candidate module-name + wrong-file. Medium.

- **Signal wiring lives in `graphql/subscriptions.py`, not a `signals.py`** —
  `connect_publishers`, `_on_save`, `_on_delete`, `post_save.connect(...)` are
  Django signal handlers/registration sitting inside a GraphQL module. Django
  convention: signal handlers in `signals.py`, connected from `AppConfig.ready()`.
  Strong wrong-file. (Overlaps the earlier M2 architecture finding but here it's a
  pure file-placement smell.) High.

- **`widgets.py` holds import-export widgets AND a global + xref-resolution
  functions** (`resolve_xref`, `xref_list`, `set_ledger_model`, `public_id`).
  `widgets.py` as a name is fine for the widget classes, but the xref-resolution
  helpers are not "widgets" — they read like a `xref.py`/resolver module. Mixed
  roles in a file named for only one of them. Medium.

- **`mixins/models.py`** — the mixins live under a `mixins/` package in a file
  named `models.py`. The guideline lists `mixins.py` as the role module. So this is
  `mixins/models.py` (package+file) vs the convention `mixins.py`. Also note the
  file mixes pure model mixins (TimestampMixin, AngeeModel, SqidMixin, HistoryMixin,
  RevisionMixin) with a loose module function `register_revision_models()` that is
  signal/ready-time registration — that function belongs in `signals.py` or an
  AppConfig method, not in a mixins module. module-name + wrong-file. Medium.

## Class-name candidates

- **`AngeeModel`** — base abstract model; no role suffix. Django abstract bases
  often have no suffix (e.g. `Model`), so arguably fine, but "Angee"-prefixing the
  base model is a brand prefix rather than a role. Low / debatable.
- **`DryRunRollback(Exception)`** (loader.py:38) — exception without `Error`
  suffix; Django/PEP8 exceptions usually end in `Error` (it's a control-flow
  sentinel, so maybe acceptable, but name doesn't say "exception"). Low.
- **`NativeJSONWidget`/`XrefForeignKeyWidget`/`XrefManyToManyWidget`** — correct
  `*Widget` suffix. Good.
- **`AngeeResource`** — correct-ish (`*Resource` is import-export's role suffix). OK.
- **`BuildResult`/`RuntimePlan`/`DriftError`/`ResourceEntry`/`ResourceRow`/
  `ResourceGroup`/`LoadResult`/`ValidationResult`** — plain dataclasses; fine, not
  Django ORM classes so no Django suffix expected.

## Method-name candidates

- **`changes()` and `crud()`** (graphql) — lowercase functions that RETURN a class
  (type factories). Not verb-first; read like nouns. Django uses lowercase for
  `path()`, `include()` etc., so factory-funcs are arguable, but `crud`/`changes`
  are nouns, not verbs. Borderline; they're public DSL shortcuts. Low/Medium.
- **`compose_defaults()`** (settings.py) — verb-first, fine.
- **`materialize()`** (entries.py:113) — verb but not in the get_/to_/as_ vocab;
  acceptable English verb. Low.
- **`result_counts()`** (loader.py:278) — noun-phrase function name; a `get_` or
  `count_` verb would be more Django. Low.
- **`public_id` / `from_public_id`** — `from_*` is in the conversion vocabulary; OK.
- **`scope_actor()`** (subscriptions.py:257) — verb-first OK; but `_actor_from_info`
  vs `scope_actor` are two "get the actor" funcs with different verb shapes
  (`from_` internal vs `scope_` public) — inconsistent verbs for similar ops. Low.
- **`build_application()` (asgi.py) vs `build_schema()` (schema.py)** — consistent
  `build_*`, good.
- **`iter_permission_paths()`** (rebac.py) — `iter_*` prefix not in the listed
  vocab (get_/is_/as_/to_/from_/create_/save_/delete_); Django does use `iter_*`
  sometimes, but the guideline's accessor verb is `get_*`. Low.

## Likely-strongest (for triangulation)
1. signal handlers in subscriptions.py (no signals.py) — High
2. register_revision_models() in mixins/models.py (belongs in signals/ready) — Med
3. loader.py / widgets.py mixed roles + non-role filenames — Med
4. mixins/models.py vs convention mixins.py — Med
