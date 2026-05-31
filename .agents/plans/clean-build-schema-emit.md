# Clean compose / build / serve lifecycle

Status: **IMPLEMENTED & verified.** Python core green (ruff + mypy + pytest);
end-to-end lifecycle runs from a wiped runtime. Dev manifest rewritten. Move to
`docs/` once the prose has settled.

## The one idea

The concrete runtime is rebuilt **inside Django's own `populate()`**, in the gap
between "registry populated" and "models adopted" — i.e. app-populate **phase 2**
(`AppConfig.import_models`). The composer is ordered first, so it emits
`runtime/<label>/models.py` before any addon adopts it in the same phase. By
phase 3 the concrete `iam.User` is registered, so Django's auth contract
(`AuthConfig.ready()` → `get_user_model()`) resolves normally.

That single **emit-then-adopt** pass is the whole architecture. There is one app
set, one settings shape, one boot. No `ANGEE_BUILD` flag, no build/run settings
split, no subprocess, no second registry.

## Why this is the right window (verified against Django 6.0.5)

- **Settings (pre-`populate()`) cannot touch models.** `ModelBase.__new__` calls
  `apps.get_containing_app_config()` → `check_apps_ready()`, which raises until
  phase 1 ends. So `compose_defaults` only computes `INSTALLED_APPS` strings.
- **Phase 2 is the earliest legal moment to introspect models.** `apps_ready`
  flips True at the end of phase 1, so by the first `import_models` the abstract
  source models are importable and their `_meta` is readable.
- **Phase 2 runs entirely before phase 3.** If the composer (emits) and the
  addons (adopt) all run in phase 2, then `iam.User` exists before the phase-3
  auth bite. Ordering, not a mode, satisfies the one irreducible constraint.
- **`models_ready` is only True at the END of phase 2.** Emission must not call
  anything that needs the global relation graph (`Meta.get_fields()` walks
  reverse relations and trips `check_models_ready`). It reads local field lists
  instead.

## Components

| Piece | Role |
|---|---|
| `compose_defaults` (`base/settings.py`) | one `INSTALLED_APPS`, no `build=`, no `ANGEE_BUILD`. Orders `ComposeConfig` first. Folds addon `settings_defaults`. |
| `ComposeConfig.import_models` (`compose/apps.py`) | emits the runtime via `AngeeRuntime.emit_if_stale()` in phase 2, before adopters. |
| `BaseAddonConfig.import_models` (`base/apps.py`) | adopts `runtime.<label>`; tolerant — absent runtime reads as "not built", no crash. |
| `AngeeRuntime` (`compose/runtime.py`) | `emit_if_stale()` / `is_current()` / `_drift()`; `emit`/`check`/`clean` unchanged. `_history_excluded_fields` is phase-2 safe. |
| `BaseAddonConfig.settings_defaults` + `IAMConfig` | `AUTH_USER_MODEL = iam.User` contributed by the iam addon, not hardcoded in compose. |
| host `settings.py` | no argv-sniff, no `build=`; host owns `ANGEE_DATA_DIR`. |
| `angee build` / `angee clean` commands | explicit emit + `--check` for CI; no longer required for a normal boot (boot self-heals). |

## The boot sequence (every command)

```
settings.py: compose_defaults(addons=[...])   → INSTALLED_APPS (strings only)
             INSTALLED_APPS frozen ──►
populate():
  Phase 1  create AppConfigs, import packages          (no models)
  Phase 2  import_models() in INSTALLED_APPS order:
             ComposeConfig   → emit_if_stale()  renders runtime/<label>/models.py
             BaseConfig      → adopt runtime.base.models
             IAMConfig       → adopt runtime.iam.models   (iam.User registers)
             NotesConfig     → adopt runtime.notes.models
  Phase 3  ready(): AuthConfig.get_user_model() resolves iam.User ✓
```

## Two clocks, collapsed where possible

- **Emit (models + SDL placeholder)** — automatic, in-process, phase 2,
  hash-guarded (`emit_if_stale`). Self-heals on every boot.
- **migrate / makemigrations / rebac sync / resources load / schema** — separate
  steps (they mutate the DB or write leaf artifacts). These are the supervisor's
  **job graph**, ordered after the boot that emits.
- **Autoreload** — Django's own (daphne `runserver`): edit serving code → child
  restarts → fresh boot re-emits → live. Model edits self-heal on the next boot;
  in dev that means a `runserver` restart (or `angee restart web`).

## Supervisor job graph (Option 2) — `angee dev`

The Go `angee` CLI runs `.angee/angee.yaml`: `jobs` (one-shot, `depends_on`
ordered) then `services` (long-running, `after` ordered).

```
jobs:
  build           manage.py angee build            # explicit emit (also self-heals)
  makemigrations  manage.py makemigrations base iam notes
  migrate         manage.py migrate --noinput
  permissions     manage.py rebac sync --yes
  resources       manage.py resources load --tier install && ... --tier demo
  schema          manage.py schema                 # runtime/schemas/<name>.graphql
services:
  web             manage.py runserver              # daphne ASGI + autoreload
```

## Deletions vs the previous (flag-based) design

- `compose_defaults` `build=` parameter, `_build_installed_apps`,
  `_run_installed_apps`, `is_build_invocation`, `BUILD_COMMANDS`, the
  `ANGEE_BUILD` settings key — all removed.
- `import_models`' `if settings.ANGEE_BUILD: return` guard — removed (tolerant
  adoption replaces it).
- hardcoded `AUTH_USER_MODEL = "iam.User"` in compose — removed (addon
  `settings_defaults`).
- `data_dir` param + `ANGEE_DATA_DIR` courier in compose — removed (host owns it).
- dev manifest: broken p1-lift jobs (`angee build --no-apply` / `--watch`,
  `angee assets load`), the `build-watch` service, and the frontend services
  (`ui` / `storybook` / `playwright`, dirs absent until M3) — removed.

## Verification

```sh
uv run ruff check . --no-cache         # All checks passed (runtime/ excluded)
uv run mypy src/                       # Success
uv run pytest                          # green
# end-to-end from a wiped runtime:
rm -rf examples/notes-angee/src/runtime
uv run examples/notes-angee/manage.py makemigrations base iam notes   # composer self-emits in phase 2
uv run examples/notes-angee/manage.py migrate
uv run examples/notes-angee/manage.py rebac sync
uv run examples/notes-angee/manage.py resources load --tier install
uv run examples/notes-angee/manage.py schema                          # writes runtime/schemas/*.graphql
```

## Notes / open items

- `tests/settings.py` provisions models out-of-band (`ANGEE_RUNTIME_MODULE =
  "tests.runtime"`) and does not install `ComposeConfig`; the unit suite does not
  exercise the phase-2 emit (that path is covered by the e2e run and
  `test_compose.py` against `AngeeRuntime`).
- React codegen consumes `runtime/schemas/<name>.graphql` (the SDL contract).
