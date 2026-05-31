---
description: Lift a capability from another repo (a prototype or another framework) into this one by reconstructing it to local conventions — never by copying files.
argument-hint: <source path, or a description of what to lift>
---

# /lift — reconstruct, don't copy

You are lifting **$ARGUMENTS** into this repository.

Lifting is **deconstruct → understand → reconstruct**, never copy. The source is a
reference for *intent and behaviour*, not a source of files. What you produce must
read as if it were written here natively, by someone who only knows this repo's
conventions and has never seen the source.

## Absolute rules

- **Never `cp`, `mv`, or paste source files verbatim.** Read the source, then write
  fresh against local conventions. If a file you produce is byte-identical to a
  source file, you did it wrong — start that file over.
- **Green-field — no provenance anywhere.** Never mention the source repo, a
  prototype, an earlier version, "lifted/ported from", plan numbers, a rebuild, or a
  migration — not in code, comments, docs, resource data, filenames, or commit
  messages. The origin of the code must not appear in any artifact.
- **Stay DRY and land at the right level.** Reuse existing local primitives instead
  of reimporting; put each change at the level that owns the concern — framework /
  base addon vs consumer addon (see `AGENTS.md` → Repository Role).
- **Defer to the stack.** If `docs/stack.md` says a library owns a concern, wire it —
  do not bring the source's hand-rolled version. Do not add a dependency without an
  owner row; flag it instead of adding it silently.

## How it runs

`/lift` orchestrates a **workflow** (`.agents/workflows/lift.js`): decompose & plan →
the plan is reviewed by three independent engines (Claude, the codex plugin, and
gemini) and revised until none report a blocking finding → **codex builds** the
approved plan inside an isolated `angee` workspace → the built code is reviewed by the
same three engines wearing the architecture and code-review personas and fixed (by
codex) until none report a blocking finding. Both loops run **fully automatically**;
the result is left on a workspace branch for you to merge — nothing is auto-merged.

Your job before launching is only to resolve the inputs, then start the workflow and
relay its report.

1. **Resolve the source.** Turn `$ARGUMENTS` into a concrete `source` (a path and/or a
   precise description of the capability). If it's too vague to plan from, ask the user
   one clarifying question before continuing.
2. **Derive a `slug`** — short kebab-case, from the capability (e.g. `notes-search`).
   It names the plan (`.agents/plans/lift-<slug>.md`), the per-round reports
   (`.agents/notes/lift-<slug>/`), and the workspace (`lift-<slug>`).
3. **Pick `baseRef`** — the git ref the workspace branches from. Default to the current
   branch (`git rev-parse --abbrev-ref HEAD`); use `main` if that isn't sensible.
4. **Resolve the codex companion path.** The codex plugin runs codex through
   `codex-companion.mjs` — find the installed copy:
   `node -e 'const p=require(require("os").homedir()+"/.claude/plugins/installed_plugins.json").plugins["codex@openai-codex"][0].installPath+"/scripts/codex-companion.mjs"; require("fs").accessSync(p); console.log(p)'`
5. **Precheck the engines, fail loudly.** Confirm the companion path exists, and that
   `gemini` and `angee` are on `PATH` (`command -v gemini`, `command -v angee`). If any
   is missing, stop and tell the user what to install or run (e.g. `/codex:setup` for
   codex) — do not fall back to a different engine.
6. **Launch the workflow** and wait for it:
   `Workflow({ scriptPath: ".agents/workflows/lift.js", args: { source, slug, baseRef, companion, maxRounds: 3 } })`
7. **Relay the report.** When it returns, present its `message`, the workspace branch
   to merge, the personas that reviewed, and any residual findings. If it halted
   before building (plan didn't converge) or before merging (code didn't converge),
   say so plainly and point at `.agents/notes/lift-<slug>/`.

## Report

The workflow returns, and you relay:

- What capability was reconstructed, and at what level (from the plan).
- What was reused from the local stack/code instead of ported.
- What was deliberately dropped or simplified.
- Anything flagged: dependencies needing owner rows, unwired tools, or decisions that
  need a human.
- Where the result lives (workspace branch) and whether all three engines signed off.
