---
description: Commit reviewed changes and publish the current Angee workspace branch.
argument-hint: "[commit message — omit to derive one from the diff]"
---

# /push — commit and publish this workspace

`/push` commits the reviewed source changes in the current Angee workspace and
publishes the workspace branch. It does not merge into the parent branch.

Use `$ARGUMENTS` as the commit message when provided; otherwise write a concise
message from the diff.

Read `.agents/skills/angee-workspace/SKILL.md` and follow its **Push** workflow:
workspace detection, deliberate staging, generated-output exclusions,
publish/upstream handling, network escalation, the Safety Stops, and final state
reporting.
