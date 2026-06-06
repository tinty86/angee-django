# .agents

Working area for agentic development: durable notes, plans, handover prompts,
slash commands, subagent definitions, and project bookkeeping.

Prefer this directory over scratch locations like `/tmp`. Anything worth keeping
between sessions lives here and is committed; only genuinely throwaway scratch
(and anything carrying sensitive content you do not want in the repo) stays out.

## Layout

- `commands/` — project slash commands for non-Codex harnesses
  (`/name` resolves to `commands/name.md`). Surfaced via the
  `.claude/commands` symlink. A command may be self-contained or a thin shim
  that delegates to an owner skill in `skills/`; Codex's own slash entries come
  from skills instead.
- `skills/` — repo-scoped skills, scanned by Codex from the working directory up
  to the repo root. Keep shared workflow logic in one harness-neutral owner
  skill; both Codex alias skills and non-Codex command shims delegate to it.
  Small alias skills (with `agents/openai.yaml`) exist only to make Codex
  slash-list entries discoverable.
- `agents/` — subagent definitions. Surfaced via the `.claude/agents` symlink.
- `plans/` — implementation plans, one file per effort.
- `notes/` — durable memory and working notes meant to outlive a single session.
- `handovers/` — handover prompts that pass context to the next session or to a
  spawned agent.
- `pm/` — project-management bookkeeping; `pm/templates/` holds reusable
  templates.
- `tools/` — small repo-scoped scripts and helpers used by agentic workflows.

## Conventions

- One file per concern; name files in kebab-case.
- No secrets here.
- `.claude/commands` and `.claude/agents` are symlinks into this directory — edit
  the files here, not under `.claude/`.
