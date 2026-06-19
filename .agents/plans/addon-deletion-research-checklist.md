# Addon Deletion Research Checklist

**Parent plan:** `.agents/plans/view-composition-drift-audit.md`

Run this checklist with separate researchers per addon or tightly related addon
cluster. The goal is to find code we can delete by moving facts to their owner,
composing shared primitives, or leaning harder on the dependency that already
owns the concern.

Do not implement from this file directly. Each researcher records findings here;
implementation happens in later plan waves with narrow write sets.

## Researcher Contract

For each addon or owner slice:

- [ ] Read the addon's `apps.py`, model/docstrings, schema, resources, web
  package, tests, and nearby sibling addon patterns.
- [ ] Identify the addon's real domain facts.
- [ ] Identify code that is not domain-owned: generic CRUD/list/form/table,
  GraphQL plumbing, permission derivation, SDK transport quirks, settings
  parsing, labels/options/status tones, routing glue, or generated-runtime
  interpretation.
- [ ] Map each non-domain concern to its owner: Django, React, `@angee/base`,
  `@angee/sdk`, `angee.graphql`, `angee.compose`, a locked dependency in
  `docs/stack.md`, or another addon.
- [ ] Record concrete deletion candidates with paths and the owner that makes
  them unnecessary.
- [ ] Record places where the addon is solving a library or framework concern in
  the wrong layer.
- [ ] Record naming drift: concepts with multiple names, files/classes/routes
  with mismatched nouns, or backend/frontend aliases the owner should expose.
- [ ] Record the smallest focused test or guardrail needed before deletion.

Each finding should use this shape:

```text
- Finding:
  - Current code:
  - Why this is wrong-owner or duplicate:
  - Correct owner / library:
  - Deletion or simplification:
  - Naming cleanup:
  - Test / guardrail:
  - Risk:
```

## Shared Search Seeds

- [ ] Local CRUD/list/form/table glue:
  `rg -n "useResourceList|useAuthoredQuery|useAuthoredMutation|<table|useReactTable|onSubmit|handleSubmit|pageSize|pagination|filterOptions|groupOptions" addons/angee/<addon> packages examples`
- [ ] Owner-smell helpers:
  `rg -n "get.*For|resolve.*From|build.*For|.*Label\\(|.*Display\\(|normalize|denormalize|coerce|serialize|deserialize" addons/angee/<addon> packages examples`
- [ ] Wrong-layer GraphQL/backend code:
  `rg -n "apps.get_model|from .*runtime|crud\\(|changes\\(|aggregate|permission|has_access|sudo|system_context" addons/angee/<addon> tests`
- [ ] Settings/autoconfig drift:
  `rg -n "SETTINGS|ANGEE_|autoconfig|import_string|settings\\." addons/angee/<addon> tests`
- [ ] Naming drift:
  `rg -n "Provider|Integration|Source|Repository|Credential|OAuth|Model|Agent|Thread|Tool|Knowledge|Storage|Drive|Resource" addons/angee/<addon> packages examples`

## Addon Slices

### `angee.agents`

- [ ] Research backend models/managers/schema/actions.
- [ ] Research inference provider/model/message/thread web views.
- [ ] Find duplicated provider/model catalogue behavior that should live in
  `agents` shared owners or provider-specific addons.
- [ ] Find local UI/list/form logic that should compose `@angee/base`.
- [ ] Findings:

### `angee.agents_integrate_anthropic`

- [ ] Research Anthropic SDK usage and model sync/inference backend.
- [ ] Find code that should be dependency-native Anthropic client behavior, not
  generic agents code.
- [ ] Find code duplicated with OpenAI provider addon.
- [ ] Findings:

### `angee.agents_integrate_openai`

- [ ] Research OpenAI SDK usage and model sync/inference backend.
- [ ] Find code that should be dependency-native OpenAI client behavior, not
  generic agents code.
- [ ] Find code duplicated with Anthropic provider addon.
- [ ] Findings:

### `angee.iam`

- [ ] Research identity, users, groups, service accounts, REBAC actor surfaces,
  and web views.
- [ ] Find duplicated auth/permission UI or backend logic that should use Django
  auth, REBAC, or shared base primitives.
- [ ] Findings:

### `angee.iam_integrate_oidc`

- [ ] Research OIDC login extension models/schema/settings/resources.
- [ ] Find pyjwt/OIDC discovery/exchange behavior that should be dependency or
  integrate-owned.
- [ ] Find duplicate OAuth/OIDC seed or settings facts.
- [ ] Findings:

### `angee.integrate`

- [ ] Research vendors, credentials, OAuth clients/accounts, integrations,
  sources, repositories, VCS/provider seams, webhooks, and templates.
- [ ] Find generic integration UI or schema behavior that should live in base
  primitives or `angee.graphql`.
- [ ] Find provider-specific behavior that should move to provider addons.
- [ ] Findings:

### `angee.integrate_github`

- [ ] Research GitHub VCS/source/repository integration behavior.
- [ ] Find code that should use provider SDK/API client patterns or integrate
  provider interfaces.
- [ ] Find duplicate source/repository sync behavior.
- [ ] Findings:

### `angee.knowledge`

- [ ] Research knowledge models, source/template sync surfaces, and web views.
- [ ] Find code that should compose resources/storage/integrate owners instead
  of duplicating import/export, source, file, or list behavior.
- [ ] Findings:

### `angee.mcp`

- [ ] Research MCP tool/server registration, GraphQL tool bridge, auth, and ASGI
  mount code.
- [ ] Find code that should rely on FastMCP/native MCP lifecycle/auth/tool APIs
  rather than Angee-owned transport glue.
- [ ] Findings:

### `angee.operator`

- [ ] Research operator bridge, daemon GraphQL/documents, workspace/service
  views, and live status/log streams.
- [ ] Find code that should rely on daemon contracts, GraphQL codegen, shared
  rows/list primitives, or subscriptions instead of custom UI state.
- [ ] Findings:

### `angee.platform`

- [ ] Research platform/cluster/studio surfaces and shared project chrome.
- [ ] Find code that belongs in base shell primitives or operator/platform owner
  contracts.
- [ ] Findings:

### `angee.resources`

- [ ] Research resource manifests, import/export, xref ledger, resource command,
  and tests.
- [ ] Find code that should lean harder on `django-import-export`, `tablib`,
  YAML parsing, or Django app config ownership.
- [ ] Findings:

### `angee.storage`

- [ ] Research drives, folders, files, upload/finalize, previews, MIME detection,
  and storage backend seams.
- [ ] Find code that should use Django storage-style abstractions, `python-magic`,
  browser-native drag/drop, preview libraries, or shared file primitives.
- [ ] Findings:

## Framework And Package Owner Slices

These are not product addons, but they are the owners addons should compose.
Run researchers here when addon findings point to missing owner behavior.

### `angee.base`

- [ ] Find wrappers around Django models/fields/managers that add no concept.
- [ ] Find model toolkit behavior repeated in addons.
- [ ] Findings:

### `angee.graphql`

- [ ] Find resolver, CRUD, aggregate, SDL, subscription, and codegen behavior
  duplicated in addons.
- [ ] Findings:

### `angee.compose`

- [ ] Find build/runtime seams that are duplicated in serving code or addons.
- [ ] Findings:

### `@angee/sdk`

- [ ] Find frontend resource/model metadata/query behavior duplicated in addons
  or `@angee/base`.
- [ ] Findings:

### `@angee/base`

- [ ] Find view/form/table/shell/glyph/state behavior duplicated in addons.
- [ ] Findings:

## Output Summary

After researchers complete, summarize:

- [ ] Top deletion candidates by estimated LOC.
- [ ] Wrong-owner concerns by owning layer.
- [ ] Shared primitive gaps blocking deletion.
- [ ] Dependency/library leverage opportunities.
- [ ] Naming normalization targets.
- [ ] Tests/guardrails to add before or during deletion.
