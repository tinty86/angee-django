---
description: Merge parent, workspace, or branch changes into the current Angee workspace branch.
argument-hint: "[workspace | branch | ref — omit to pull the parent]"
---

# /pull — bring changes into this workspace

`/pull` brings changes into the current Angee workspace branch. It does not
publish, and it does not commit unrelated working-tree changes.

- With **no argument**, pull from the workspace's parent ref (or parent
  workspace).
- With an **argument** (`$ARGUMENTS`), merge that workspace, branch, or ref into
  the current workspace.

Read `.agents/skills/angee-workspace/SKILL.md` and follow its **Pull** workflow:
resolve the current workspace and source slots, the source worktree checks,
clean/pushed requirements, explicit-override rules, merge-conflict handling, the
Safety Stops, and final state reporting.
