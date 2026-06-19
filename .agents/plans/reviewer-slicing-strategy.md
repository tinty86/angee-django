# Reviewer Slicing Strategy

**Parent plan:** `.agents/plans/view-composition-drift-audit.md`

This file exists to prevent parallel reviewers from skipping meaningful findings
because a slice is too broad. Reviewers should audit small cells in a matrix, not
whole continents like "frontend", "agents", or "Django".

## Core Rule

A review slice should contain **one owner, one concern, and one question**.

Good slices:

- `integrate / OAuth clients / are we duplicating Django + pyjwt/OIDC concerns?`
- `agents / inference model catalogue / which code belongs in provider addons?`
- `storage / file preview web components / which behavior belongs to preview
  libraries or @angee/base?`
- `@angee/base / grouped list controls / what addon code can this delete?`

Too broad:

- `review integrate`
- `review all frontend`
- `review all library usage`
- `review agents and providers`

Broad reviewers may build an inventory, but they may not be the final authority
on architecture findings. Final findings must come from narrow slices.

## Slice Size Budget

Split a slice when any of these are true:

- [ ] More than one owner is being judged.
- [ ] More than one domain concept is being judged.
- [ ] The slice crosses backend, frontend, and dependency code at once.
- [ ] The reviewer cannot name the exact files or directories in scope.
- [ ] The reviewer cannot state what is intentionally out of scope.
- [ ] The slice would require reading more than roughly 10-20 source files before
  forming a first finding.
- [ ] The likely answer could be "some of everything."

A slice may overlap a neighboring slice, but overlap must be explicit.

## Required Slice Brief

Every reviewer receives a brief with this shape:

```text
Slice:
Owner under review:
Concern:
Question:
In scope paths:
Out of scope paths:
Sibling patterns to compare:
Library/docs to check:
Expected deletion signal:
Escalation trigger:
Output file:
```

If the brief cannot be filled in, the slice is too broad or the owner is not
understood yet.

## Audit Matrix

Use this matrix to split work. Review cells, not whole rows.

### Rows: Owner / Domain Slices

- [ ] `angee.agents`
  - [ ] inference providers
  - [ ] inference models/catalogue
  - [ ] threads/messages/runs/tools
  - [ ] provider actions/sync/inference
  - [ ] agents web pages
- [ ] `angee.agents_integrate_anthropic`
  - [ ] model sync
  - [ ] inference client
  - [ ] settings/autoconfig/resources
  - [ ] duplication with OpenAI
- [ ] `angee.agents_integrate_openai`
  - [ ] model sync
  - [ ] inference client
  - [ ] settings/autoconfig/resources
  - [ ] duplication with Anthropic
- [ ] `angee.integrate`
  - [ ] vendors
  - [ ] credentials
  - [ ] OAuth clients/accounts
  - [ ] integrations/impls
  - [ ] sources/repositories/VCS providers
  - [ ] webhooks
  - [ ] template sources/templates
  - [ ] integrate web pages
- [ ] `angee.integrate_github`
  - [ ] GitHub VCS provider
  - [ ] repository/source sync
  - [ ] provider-specific credentials/OAuth
- [ ] `angee.iam`
  - [ ] users/groups/service accounts
  - [ ] roles/REBAC actor surfaces
  - [ ] IAM web pages
- [ ] `angee.iam_integrate_oidc`
  - [ ] OIDC client fields
  - [ ] OIDC login/exchange
  - [ ] resources/demo seeds
- [ ] `angee.resources`
  - [ ] resource manifests
  - [ ] import/export/resource command
  - [ ] xref ledger
  - [ ] tier behavior
- [ ] `angee.storage`
  - [ ] drives/folders/files
  - [ ] upload/finalize
  - [ ] MIME detection
  - [ ] previews
  - [ ] backend impls
- [ ] `angee.knowledge`
  - [ ] knowledge models
  - [ ] source/template sync
  - [ ] storage/resources/integrate overlap
- [ ] `angee.mcp`
  - [ ] MCP server/tool lifecycle
  - [ ] GraphQL tool bridge
  - [ ] auth/context
  - [ ] ASGI mount
- [ ] `angee.operator`
  - [ ] daemon bridge
  - [ ] workspaces/services
  - [ ] logs/status subscriptions
  - [ ] operator web pages
- [ ] `angee.platform`
  - [ ] cluster/studio/platform surfaces
  - [ ] shared chrome/menus
- [ ] Framework/package owners
  - [ ] `angee.base`
  - [ ] `angee.graphql`
  - [ ] `angee.compose`
  - [ ] `@angee/sdk`
  - [ ] `@angee/base`

### Columns: Concern Slices

For each row above, use these columns to split work:

- [ ] Data/model ownership: fields, methods, managers, querysets, state
  transitions, factory/write behavior.
- [ ] Schema/API ownership: Strawberry types, filters, order, CRUD, actions,
  aggregates, subscriptions, authored operations.
- [ ] Frontend page ownership: routes, `DataPage`, `List`, `Form`,
  `GroupListView`, `RowsListView`, shell/menu/chrome.
- [ ] State ownership: route/search state, server/cache state, form state,
  data-view state, local ephemeral state.
- [ ] Dependency leverage: locked library APIs that should replace local code.
- [ ] Resources/seeds/settings: resource manifests, demo data, autoconfig,
  settings overlays, env parsing.
- [ ] Naming/decomposition: file/component/class/route/menu/GraphQL vocabulary.
- [ ] Tests/guardrails: focused tests, grep/lint checks, schema checks, browser
  smoke.

## Review Passes

### Pass 1: Inventory Only

- [ ] One or two broad scouts map rows, columns, and obvious hot spots.
- [ ] Scouts do not make final architecture calls.
- [ ] Output is a slice list and "unknowns", not implementation advice.

### Pass 2: Narrow Cell Review

- [ ] Run parallel reviewers on matrix cells.
- [ ] Each reviewer answers the required slice brief.
- [ ] Each reviewer records out-of-scope suspicious findings as new candidate
  slices instead of silently ignoring them.

### Pass 3: Drawing-Board Review

- [ ] For high-impact cells, reconstruct the greenfield design.
- [ ] Identify the earliest wrong fork.
- [ ] Escalate lower-surface alternatives before implementation.

### Pass 4: Cross-Cell Reconciliation

- [ ] One integrator de-duplicates findings across cells.
- [ ] Conflicting owner claims are resolved by architecture review, not by
  whichever reviewer finished first.
- [ ] Findings are ordered by deletion potential and owner leverage.

### Pass 5: Implementation Slicing

- [ ] Implementation slices follow accepted review findings only.
- [ ] Each implementation slice has one owner and one deletion path.
- [ ] Broad mechanical conversions are forbidden unless the review already proved
  the owner and guardrails.

## Anti-Skip Requirements

Each reviewer must include:

- [ ] Files searched.
- [ ] Files read.
- [ ] Search terms used.
- [ ] Sibling patterns compared.
- [ ] Library docs or stack rows checked.
- [ ] Explicit "out of scope" list.
- [ ] Suspicious findings outside scope, promoted to candidate slices.
- [ ] Zero-finding explanation when no issue is found.

If a reviewer reports "nothing found" without this evidence, rerun the slice.

## Split Triggers

Split immediately when a reviewer says:

- [ ] "This probably applies everywhere."
- [ ] "There are several patterns here."
- [ ] "This is both backend and frontend."
- [ ] "This depends on library behavior I have not checked."
- [ ] "This naming issue spans multiple domains."
- [ ] "This needs implementation to understand."

Those are signs the slice is too large or the owner is unclear.

## Escalation Triggers

Escalate to the human architect before implementation when:

- [ ] The lower-surface option deletes an existing concept/API.
- [ ] The true owner may be outside this repository.
- [ ] The fix requires changing a locked dependency row in `docs/stack.md`.
- [ ] The fix changes addon boundaries or dependency direction.
- [ ] The fix requires migration/compatibility policy.
- [ ] Two reviewers assign the same concern to different owners.

## Output Summary Template

At the end of a review batch:

```text
Batch:
Slices completed:
Slices split:
Coverage gaps:
Top deletion opportunities:
Wrong-owner findings:
Greenfield alternatives requiring architect decision:
Guardrails/tests needed:
Implementation order recommendation:
```
