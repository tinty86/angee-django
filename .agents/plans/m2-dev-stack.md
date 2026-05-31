# M2 — `angee dev` full local dev stack (from research wuoceuykb)

> M2 is overwhelmingly a **reconciliation job, not new framework code**. The Go `angee`
> binary (/usr/local/bin/angee) already owns the dev supervisor: `angee dev` reads
> `.angee/angee.yaml` and runs `jobs` (one-shot, `depends_on`-ordered) then `services`
> (long-running, `after`-ordered) via an embedded process-compose. The repo owns the
> Copier template + the rendered manifest + the Django management commands.

## The gap (verified)
The live manifest is a **broken p1 lift** against our emit-only command surface: it calls
`angee build --no-apply`, `angee build --watch`, `angee assets load …` (none of these exist),
**never** runs `makemigrations` (mandatory — `examples/*/src/runtime/` incl. migrations is
gitignored) or `schema`, and points `ui`/`storybook`/`playwright` at dirs that don't exist
(`examples/notes-angee/src/web`, `packages/storybook-host`). So `angee dev` fails at the first job.

## The fix
Rewrite ONE Jinja file: `templates/stacks/dev/template/{{ ANGEE_ROOT }}/angee.yaml.jinja`
(renders `.angee/angee.yaml`). There is NO Copier `_tasks`/hook mechanism for continuous work —
the orchestration primitive is the manifest's `jobs:`/`services:` graph (each entry shells out
`uv run python manage.py <cmd>` with `workdir: source://app`, env, mounts).

**Jobs (one-shot, `depends_on`-ordered):**
`angee build` → `makemigrations base iam notes` → `migrate` → `rebac sync --yes` →
`resources load --include-demo` → `schema`.
**Services (long-running):** `web` = `daphne … host.asgi:application` (no UI yet — drop/gate the
ui/storybook/playwright services; their dirs are absent per the milestone).

## Watch (decisive finding)
The installed CLI manifest schema has **NO `watch`/`on_change` field** (verified) and **no watch
library is in the stack**. So declarative watch is Go-CLI work, OUT of this repo's scope.
Repo-local options for live re-emit:
- **(default for M2) manual levers:** `angee job run build` / `angee restart web` after source changes.
- **(optional) a small stdlib watch management command** (`manage.py … watch`, debounced, no
  library — the p0/p1 pattern) that on source change re-runs build→makemigrations→migrate→schema
  and **restarts** the web service.
**RESTART vs reload:** daphne has no autoreload and the GraphQL schema builds once at ASGI boot;
because of the build/run `INSTALLED_APPS` split, emitting new concrete models needs a **fresh
process** — so a model/schema change requires a web *restart*, never in-proc reload.

## Prerequisite (BLOCKER)
`manage.py schema` currently fails (the M1 relay nested-connection bug — being fixed now). Wiring
`schema` into the dev sequence hard-fails until that lands. M2 starts after M1 is green.

## Forks for the architect
- Watch mechanism: manual levers (simplest) vs a stdlib `watch` command (nicer DX) — declarative
  CLI `watch:` is out of scope (Go-CLI).
- Whether to gate the frontend services behind a Copier flag now (so M3 can flip them on) vs delete
  them from the dev manifest until M3.

## Where things live (verified)
- Template: `templates/stacks/dev/` (copier.yml + `template/{{ ANGEE_ROOT }}/angee.yaml.jinja`).
- Rendered: `.angee/angee.yaml`. Sources alias: `app`→`examples/notes-angee`, `framework`→repo root.
- Commands: `angee build`/`clean` (compose), `schema` (base), `resources` (resources), `rebac sync`
  (library). Settings sniff `BUILD_COMMAND` from argv to pick build vs run `INSTALLED_APPS`; `iam`
  is auto-injected by `compose_defaults`.
- Full research detail: workflow `wuoceuykb` output.
