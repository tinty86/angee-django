# Independent findings — main-loop Claude (first-hand read of all src/angee/base)

These are my own notes from reading every .py file, to cross-check the three agents.

## Strongest findings

1. **1:1 getter-over-cached_property ceremony (apps.py)** — `BaseAddonConfig` pairs a
   public `get_X()` with a private `_X` `cached_property` ~7 times
   (`get_resource_manifest`/`_resource_manifest`, `get_rebac_schema_path`/`_rebac_schema_path`,
   `get_source_models_module`, `get_model_classes`+`get_model_extensions` over
   `_model_contributions`, `get_graphql_module`, `get_schema_parts`). cached_property IS
   the Django-native public accessor; the extra getter layer is pure ceremony.
   Dimension: decomposition/consistency. Severity: High.

2. **1:1 public-fn-over-_private ceremony + behavior off its owner (emission.py)** — 8 public
   functions (`plan_runtime`, `check_runtime`, `reset_runtime_dir`, `emit_runtime_sources`,
   `import_runtime_models`, `normalize_migration_headers`, `emit_schema_sdl`, `check_schema_sdl`)
   each unpack `RuntimePlan` and forward to a `_private`. `RuntimePlan` owns addons/extensions/labels
   — these are methods on the plan. Collapse the wrappers; put behavior on RuntimePlan. High.

3. **public_id / from_public_id resolution scattered (DRY + find-the-owner)** — same
   "resolve instance by public id" logic reimplemented with `getattr(model,'from_public_id',None)`
   fallbacks in: widgets._instance_from_public_id (152), widgets.public_id (164),
   subscriptions._public_id (288), crud._resolve_for_delete (132), mixins AngeeModel/SqidMixin.
   Owner is AngeeModel. Consolidate to one polymorphic classmethod. High. (Gemini agrees.)

4. **`_running_angee_build()` sniffs sys.argv (apps.py:36)** — argv[1:3]==["angee","build"].
   The documented "smell": global inspection to decide behavior; fragile across invocation
   paths (call_command, manage.py). High/Critical. (Gemini agrees, calls Critical.)

5. **module-global mutable `_active_ledger_model` (widgets.py:16) + manual set/None
   try/finally in managers.py** — hidden state, thread-unsafe, hand-rolled context. Should be
   carried on the AngeeResource instance or a real contextmanager. High. (Gemini agrees.)

6. **Dual-shape dispatch via getattr+callable (emission.py:381 `_declared_composition_fields`,
   :409 `_model_reference`)** — comments call it "intentional polymorphism" but it's the exact
   getattr-callable-fallback anti-pattern over (AngeeModel | plain mixin). Normalize extension
   bases so one type answers. Medium.

## Architecture verification notes (where agents may be WRONG)

- **Gemini #2 (use runtime type() instead of emitting .py)**: WRONG for this architecture.
  The composer must emit committed source so makemigrations/drift-check/`edit source not
  artifact` work. Keep emission; the valid kernel is "Meta reconstruction (_rebac_meta_source,
  _db_table_source reading original_attrs) is brittle." Fix is narrower, not runtime type().

- emission hand-builds Python via f-strings/line-lists (`_models_source`). templates/ holds
  only Copier scaffolding, not emission templates — so the string-building is a deliberate
  (if fragile) choice, not an inconsistency with an existing template engine.

## Lower severity
- Two different `_dedupe` (schema.py by id-identity; settings.py by dict.fromkeys strings):
  same name, different semantics across modules. Low.
- `ResourceManifest: TypeAlias = Mapping[object, object]` (apps.py:20) — extremely loose typing.
- `check_schema_sdl` calls `_import_runtime_models` as a side effect inside a "check". Low.
- subscriptions `_connected` module set — global, but idempotent signal-connect is ~ok.
