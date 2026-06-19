# Refactoring Workflow

**Parent plan:** `.agents/plans/view-composition-drift-audit.md`

This workflow describes how a refactor idea becomes clean, production-ready code.
It is designed for the pre-1.0 architecture cleanup, where the goal is not to
polish the current shape but to find the right owner, delete code, and commit to
the smallest durable architecture.

## Phase 1: Ideation And Smell Capture

Start with a concrete smell, not a preferred solution.

- [ ] Record the trigger: bug, repeated code, page drift, naming drift,
  excessive LOC, awkward API, missing affordance, or library/framework concern
  solved in the wrong layer.
- [ ] State the suspected owner problem: wrong owner, missing owner, duplicated
  owner, unclear boundary, or dependency not being used deeply enough.
- [ ] State the deletion hypothesis: what code might disappear if the owner is
  corrected?
- [ ] State the user/product behavior that must remain true.
- [ ] Record unknowns instead of guessing.

Output:

```text
Smell:
Behavior to preserve:
Suspected wrong owner:
Deletion hypothesis:
Unknowns:
Candidate slices:
```

## Phase 2: Slice The Work

Use `.agents/plans/reviewer-slicing-strategy.md`. Do not send reviewers broad
territories.

- [ ] Convert the smell into review cells: one owner, one concern, one question.
- [ ] Fill the required slice brief before spawning or assigning review.
- [ ] Mark in-scope and out-of-scope paths.
- [ ] Name sibling patterns to compare.
- [ ] Name library docs or `docs/stack.md` rows to check.
- [ ] Define the expected deletion signal.
- [ ] Define escalation triggers.

Stop if the slice cannot be briefed precisely.

## Phase 3: Research And Inventory

Researchers gather evidence only. They do not implement and do not preserve the
current architecture by default.

- [ ] Search for duplicate shapes, names, helpers, queries, view patterns,
  settings, resources, schema roots, and tests.
- [ ] Read the owner candidates and sibling implementations.
- [ ] Check the locked dependency or framework docs for native behavior.
- [ ] Record current files, searched files, search terms, and out-of-scope
  suspicious findings.
- [ ] Classify findings: delete, move to owner, replace with dependency API,
  keep as Angee glue, rename, add guardrail, or escalate.

Output:

```text
Files searched:
Files read:
Sibling patterns:
Library/docs checked:
Findings:
Out-of-scope candidate slices:
Zero-finding explanation:
```

## Phase 4: Drawing-Board Review

Before implementation, reviewers go back far enough to find earlier wrong forks.

- [ ] Ask what would be built if this feature did not exist yet.
- [ ] Identify which current abstractions would disappear in the greenfield
  version.
- [ ] Identify the true owner, even if it is outside this repository.
- [ ] Compare current cleanup vs greenfield rebuild on LOC, files, concepts,
  public APIs, owner boundaries, addon glue, tests, and migration cost.
- [ ] Prefer deleting concepts over making wrong concepts cleaner.
- [ ] Escalate lower-surface alternatives to the human architect before coding.

Output:

```text
Current shape:
Earliest wrong fork:
Greenfield shape:
Concepts/files/APIs deleted:
True owner:
Compatibility/migration cost:
Architect decision needed:
Recommendation:
```

## Phase 5: Architecture Decision

Do not start implementation until the design decision is explicit.

- [ ] Choose the owner that will absorb the behavior.
- [ ] Choose what will be deleted.
- [ ] Choose what will stay as narrow Angee glue.
- [ ] Choose naming vocabulary across backend, frontend, schema, routes, files,
  tests, and docs.
- [ ] Choose migration or compatibility policy.
- [ ] Choose the guardrail that prevents regression.
- [ ] Record any rejected greenfield alternative and why.

Output:

```text
Accepted owner:
Rejected alternatives:
Deletion path:
Naming path:
Migration/compatibility:
Guardrail/test plan:
Implementation slices:
```

## Phase 6: Implementation Slice Planning

Implementation slices should be small and ordered by owner.

Preferred order:

1. Add or adjust characterization tests when behavior is risky.
2. Fix or create the owning primitive/model/manager/queryset/schema contract.
3. Migrate one representative caller.
4. Verify the owner removes local glue.
5. Migrate remaining callers in narrow batches.
6. Delete old helpers, wrappers, aliases, documents, local state, and dead tests.
7. Normalize names.
8. Add or tighten guardrails.

Each implementation slice must have:

- [ ] One owner.
- [ ] One deletion path.
- [ ] One verification path.
- [ ] A clear write set.
- [ ] A rollback or migration story if data/public APIs are touched.

Stop if implementation requires changing the accepted owner decision.

## Phase 7: Build Loop

Build with deletion in mind.

- [ ] Re-read files before editing.
- [ ] Implement the owner-level change first.
- [ ] Migrate callers to compose the owner.
- [ ] Delete the old path immediately after the replacement is proven.
- [ ] Avoid compatibility aliases unless there is a recorded migration reason.
- [ ] Keep routes, commands, resolvers, and page components thin.
- [ ] Keep generated artifacts generated.
- [ ] Track LOC and concept count as signals, not vanity metrics.

After each small slice:

- [ ] Run the narrow relevant test/check.
- [ ] Run relevant search seeds to verify old patterns are gone.
- [ ] Update the inventory/checklist with what was deleted or why it stayed.

## Phase 8: Review Loop

Reviewers check architecture, not just correctness.

- [ ] Code review starts with findings: bugs, wrong owners, duplicated rules,
  naming drift, missing tests, and retained local glue.
- [ ] Architecture reviewer asks whether the implementation followed the
  accepted owner decision or silently preserved a wrong fork.
- [ ] Backend reviewer checks Django-native ownership, app registry use,
  manager/queryset/model placement, schema composition, REBAC, generated output,
  and migration safety.
- [ ] Frontend reviewer checks shared primitives, state ownership, typed
  operations, i18n/glyphs, route/page thinness, effects, and view affordances.
- [ ] Library reviewer checks whether the underlying dependency could delete
  more code.
- [ ] If reviewers find a lower-surface owner, stop and return to Phase 4.

## Phase 9: Verification And Production Readiness

Production-ready means behavior, architecture, generated contracts, and user
flows are all checked.

- [ ] Run targeted backend tests.
- [ ] Run targeted frontend tests.
- [ ] Run typecheck/lint relevant to touched packages.
- [ ] Regenerate/check schema and generated artifacts when contracts change.
- [ ] Run browser or Playwright smoke for meaningful UI changes.
- [ ] Run primitive-drift/search scans for the touched surface.
- [ ] Verify no generated output was edited by hand.
- [ ] Verify docs/guidelines changed only where durable rules belong.
- [ ] Verify plan/checklist findings reflect the final decision.
- [ ] Verify final diff deletes or thins code, or explains why a temporary
  increase unlocks larger deletion.

## Phase 10: Finalization

Only finalize after the code and the plan agree.

- [ ] Update inventory/checklists with completed deletions and remaining follow
  ups.
- [ ] Record architect decisions and rejected alternatives.
- [ ] Record test commands and results.
- [ ] Commit with a message naming the owner-level change, not the symptom.
- [ ] Push or open PR according to the branch/workspace flow.
- [ ] Handoff calls out residual risk and next deletion candidates.

## Stop Conditions

Stop and return to review or the human architect when:

- [ ] The true owner appears to be outside the current slice.
- [ ] The true owner appears to be outside this repository.
- [ ] The lower-surface option deletes a public concept/API.
- [ ] LOC grows without a recorded owner-level payoff.
- [ ] A reviewer says the slice is "mostly mechanical".
- [ ] Implementation introduces a second naming vocabulary.
- [ ] A route/page/resolver/command starts owning policy.
- [ ] A dependency-native feature could replace the Angee code.
- [ ] Tests pass but the architecture owner is still unclear.

## Done Definition For A Refactor Slice

A refactor slice is done when:

- [ ] The accepted owner carries the behavior.
- [ ] Callers are thinner.
- [ ] Wrong-owner code is deleted.
- [ ] Names are normalized.
- [ ] The underlying library/framework is used at its native owner boundary.
- [ ] Guardrails/tests prevent regression.
- [ ] Generated artifacts are in sync.
- [ ] Plan/checklist artifacts describe what changed and what remains.
- [ ] The final diff is smaller or has a documented deletion payoff.

The ideal end state is boring: the next feature follows an obvious path and takes
less code because this refactor taught the framework where the pattern lives.
