# Repo Layout Split — top-level `angee/` + `addons/angee/` + `packages/`

Reshape the monorepo so the three eventual repos are already separated by
directory, **without changing a single import**. This is the intermediate step
toward splitting into:

- **`angee-django`** — the framework core + composer (`angee.base`, `angee.compose`).
- **`angee-react`** — the shared React layer (`@angee/sdk`, `@angee/base`, e2e, storybook).
- **`angee-addons`** — the base addons (`angee.iam`, `angee.resources`,
  `angee.operator`, `angee.integrate`), each carrying its own `web/`.

The filesystem mirrors the shipping boundary now; the repo split later is a
directory lift, not a file-by-file move.

> **Locked decisions (from the design Q&A):**
> - **Keep the `angee.*` namespace for addons.** Addons live under
>   `addons/angee/<name>/` so they still import as `angee.iam` etc. Zero churn on
>   `INSTALLED_APPS` / `addons=(…)` / app labels / `@angee/*` package names —
>   today and at split time.
> - **Drop the `src/` layout for the framework.** Framework core sits at
>   top-level `./angee/{base,compose}`, symmetric with `./addons/` and
>   `./packages/`.
> - **Per-addon UI stays in the addon** (`addons/angee/iam/web`); the shared
>   React bindings stay in `packages/`. This is already the idiom
>   (`src/angee/iam/web`, `src/angee/operator/web` today).

---

## 0. The namespace invariant (why this is low-risk)

`angee` is **already a PEP 420 namespace package** — there is no
`src/angee/__init__.py`, and nothing imports the `angee` root directly. So two
source roots can contribute to one `angee.*` namespace for free:

- `./angee/` (on path via repo root `.`) → `angee.base`, `angee.compose`
- `./addons/angee/` (on path via `addons/`) → `angee.iam`, `angee.resources`, …

PEP 420 merges the two `angee/` directories into one namespace at import time.
**Invariant to protect:** neither `./angee/__init__.py` nor
`./addons/angee/__init__.py` may exist. The per-addon dirs (`angee/iam/`, …)
keep their own `__init__.py` — those are regular packages *under* the namespace.

## 1. What moves (history-preserving `git mv`)

Framework (core + composer) → top level; base addons → `addons/angee/`.
`resources` is a **base addon** (per `AGENTS.md` / `docs/glossary.md`), so it
moves to `addons/` with the others — not framework.

```sh
# from repo root — git mv creates parent dirs and preserves history
git mv src/angee/base      angee/base          # framework core
git mv src/angee/compose   angee/compose        # the composer
git mv src/angee/iam       addons/angee/iam      # base addon (+ web/)
git mv src/angee/resources addons/angee/resources # base addon
git mv src/angee/operator  addons/angee/operator  # base addon (+ web/)
git mv src/angee/integrate addons/angee/integrate # base addon
# src/angee is now empty (it had no __init__.py); src/ goes away
rmdir src/angee src 2>/dev/null || true
```

Resulting tree:

```text
.
├── angee/                  # django-angee — framework core + composer (namespace dir)
│   ├── base/
│   └── compose/
├── addons/                 # django-angee-addons — base addons (namespace root)
│   └── angee/              # namespace dir (NO __init__.py)
│       ├── iam/   (+ web/)
│       ├── resources/
│       ├── operator/ (+ web/)
│       └── integrate/
├── packages/               # angee-react — shared bindings + FE tooling (unchanged)
├── examples/notes-angee/   # the example project (unchanged — still src-layout)
├── docs/  templates/  tests/
```

## 2. What changes (config — exact edits)

### `pyproject.toml`

```toml
# [tool.hatch.build.targets.wheel]
-packages = ["src/angee"]
+packages = ["angee", "addons/angee"]   # two source roots, both map to the angee/ namespace
 artifacts = [
-  "src/angee/**/*.csv",  "src/angee/**/*.pyi",  "src/angee/**/*.typed",
-  "src/angee/**/*.yaml", "src/angee/**/*.yml",  "src/angee/**/*.zed",
+  "angee/**/*.csv",  "angee/**/*.pyi",  "angee/**/*.typed",
+  "angee/**/*.yaml", "angee/**/*.yml",  "angee/**/*.zed",
+  "addons/angee/**/*.csv",  "addons/angee/**/*.pyi",  "addons/angee/**/*.typed",
+  "addons/angee/**/*.yaml", "addons/angee/**/*.yml",  "addons/angee/**/*.zed",
 ]

# [tool.hatch.build.targets.sdist]
-only-include = ["AGENTS.md","LICENSE","README.md","docs","examples","pyproject.toml","src","tests","uv.lock"]
+only-include = ["AGENTS.md","LICENSE","README.md","docs","examples","pyproject.toml","angee","addons","tests","uv.lock"]

# [tool.pytest.ini_options]
-testpaths = ["tests", "src/angee/resources/tests"]
-pythonpath = [".", "src", "examples/notes-angee/src"]
+testpaths = ["tests", "addons/angee/resources/tests"]
+pythonpath = [".", "addons", "examples/notes-angee/src"]

# [tool.mypy]
-mypy_path = ["src"]
+mypy_path = [".", "addons"]
```

> **Why two `packages` entries, not `force-include`.** Hatchling's editable
> install adds the *parent* of each `packages` entry to `sys.path` (today's
> `.pth` is literally `…/angee-django/src`). Listing both `angee` and
> `addons/angee` makes editable dev add **repo-root** and **`addons/`** to the
> path, so PEP 420 merges the two `angee/` dirs — which is what `uv run
> manage.py` relies on. `force-include` only grafts into *built* wheels, not
> editable installs, so it would leave `angee.iam` unimportable in dev. After
> `uv sync`, confirm `_editable_impl_django_angee.pth` lists both roots, and
> after `uv build` inspect the wheel (`python -m zipfile -l dist/*.whl`) to
> confirm `angee/base`, `angee/compose`, **and** `angee/iam` … land under one
> `angee/` tree with no `__init__.py` at the root. If hatch rejects two
> `packages` entries targeting `angee/`, jump to the two-dist uv workspace (§5).

### `pnpm-workspace.yaml`

```yaml
 packages:
   - "packages/*"
   - "examples/*/e2e"
   - "examples/*/src/web"
   - "examples/*/src/example/*/web"
-  - "src/angee/*/web"
+  - "addons/angee/*/web"
```

### `tests/test_layering.py` (path constants only — assertions unchanged)

```python
-SRC = Path(__file__).resolve().parents[1] / "src" / "angee"
-BASE = SRC / "base"
-RESOURCES = SRC / "resources"
-COMPOSE = SRC / "compose"
+ROOT = Path(__file__).resolve().parents[1]
+BASE = ROOT / "angee" / "base"
+COMPOSE = ROOT / "angee" / "compose"
+RESOURCES = ROOT / "addons" / "angee" / "resources"   # resources is a base addon
```

### Docs (layout maps — prose, no contract change)

- `AGENTS.md` → rewrite the **Repository Layout** tree + the two prose lines
  (the `src/angee/` mentions). `CLAUDE.md` is a symlink to `AGENTS.md`, so it
  follows automatically.
- `README.md:81` → `django-angee (src/angee/)` becomes the new path.
- `grep docs/ -rn 'src/angee'` and reconcile any stragglers (glossary/stack did
  not flag, but check).

## 3. What does NOT change (blast-radius bound)

- **Python imports** — `angee.base`, `angee.iam`, … all still resolve.
- **`addons=("angee.iam", "angee.integrate", "angee.operator", …)`** in
  `examples/notes-angee/src/host/settings.py` — untouched.
- **Django app labels** (`iam`, `resources`, …) — derived from `AppConfig`, not
  disk path. So migrations / FKs / REBAC tuples keyed by label are stable.
- **`@angee/iam`, `@angee/operator`, `@angee/base`, `@angee/sdk`** package names
  — unchanged; pnpm re-links from the new paths on `pnpm install`.
- **The composer** — addon discovery is import-path driven (it walks
  `INSTALLED_APPS`, not the source tree), so it needs no change.
- **The example project** (`examples/notes-angee/**`) — keeps its own
  `src/` layout; we are only restructuring framework + base addons.
- **`runtime/` migrations** — they reference addons by app label / import path,
  both unchanged. (Still rebuild + `schema --check` in §4 to prove it.)

## 4. Phases (each independently green)

1. **Move** — the `git mv` block in §1. Then assert the namespace invariant:
   `test ! -e angee/__init__.py && test ! -e addons/angee/__init__.py`.
2. **Config** — the `pyproject.toml`, `pnpm-workspace.yaml`, `test_layering.py`
   edits in §2.
3. **Relock + regenerate** — from repo root:
   - `pnpm install` (re-links the addon web packages; updates `pnpm-lock.yaml`).
   - `uv sync` (deps unchanged → lock stable; confirms the package still builds).
   - `uv run examples/notes-angee/manage.py angee build`
   - `… makemigrations base notes && … migrate && … rebac sync`
   - `… schema --check`
4. **Docs** — §2 doc edits.
5. **Verify** — §6 checklist.

## 5. Packaging: one wheel now, two wheels for the split (optional Phase B)

**Default for this plan:** keep a **single `django-angee` wheel** that includes
both roots (the `force-include` above). Minimal change, everything green, the
visible boundary is in place.

**Phase B (recommended before the actual repo split, can defer):** make the
package boundary *real* by turning the repo into a **uv workspace** with two
dists:

- root `pyproject.toml` → `django-angee` (framework), `packages = ["angee"]`,
  framework-only dependencies.
- `addons/pyproject.toml` → `django-angee-addons`, `packages = ["angee"]`
  (relative to `addons/`), `dependencies = ["django-angee", …addon-only…]`.
- root `[tool.uv.workspace] members = ["addons"]`; the example depends on both.

This exercises the dependency direction (addons → framework, never the reverse)
that the directory move alone does not enforce. **Partition dependencies from
real imports, don't guess** — e.g. `grep -rn "import" addons/angee/resources`
shows `django-import-export`/`tablib`/`pyyaml` belong to the addons dist, and
`pyjwt[crypto]` follows `iam`'s OIDC. Whatever `angee/base` + `angee/compose`
import stays in the framework dist. Doing Phase B now means the repo split is
"move `addons/` to a new repo + point its `django-angee` dep at the published
version" — nothing else.

## 6. Verify checklist

- `test ! -e angee/__init__.py && test ! -e addons/angee/__init__.py` (namespace intact).
- `uv build` → inspect wheel: one merged `angee/` tree, all six subpackages present.
- `uv run pytest` (incl. `tests/test_layering.py` — the moved path constants).
- `uv run mypy` and `uv run ruff check` clean.
- `… angee build && … migrate && … rebac sync && … schema --check` clean.
- `pnpm install && pnpm -r typecheck && pnpm -r test` green (proves `@angee/iam`
  / `@angee/operator` re-linked from `addons/angee/*/web`).
- `angee dev` from repo root brings the stack up; SPA mounts and lists load
  (guards against a missing-SDL regression — see `runtime-sdl-missing-breaks-app`).

## 7. Gotchas

- **Existing workspaces are stale.** `.angee/workspaces/*` are full gitignored
  copies on the old layout. After this lands on `main`, **recreate** workspaces
  (`angee ws create …`); do not migrate them in place (cf. the
  `addon-merge-recovery` recovery pattern).
- **The two-root `packages` is the one packaging unknown** — re-run `uv sync`
  so the editable `.pth` regenerates with both roots, and verify the built
  wheel (§2). If hatch rejects two entries targeting `angee/`, jump straight to
  Phase B (two dists), the cleaner end-state regardless.
- **Don't churn `.agents/plans/*.md`** — older plans reference `src/angee/…`
  paths as historical record; leave them. Only AGENTS.md/README.md are the
  live layout maps.
```
