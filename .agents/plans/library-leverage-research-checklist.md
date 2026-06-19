# Library Leverage Research Checklist

**Parent plan:** `.agents/plans/view-composition-drift-audit.md`

Run this checklist with separate researchers per locked library or library
family in `docs/stack.md`. The goal is to delete Angee code by using the
underlying library's native shape, and to catch places where Angee or an addon is
solving a dependency/framework concern in the wrong layer.

Researchers should use primary documentation for the library they inspect. If a
library is not locked in `docs/stack.md`, the finding should first decide
whether the concern belongs in an existing locked dependency, a proposed stack
row, or Angee itself.

## Researcher Contract

For each library or family:

- [ ] Read the `docs/stack.md` row and the code that claims to be Angee glue.
- [ ] Check primary library docs/API for the native owner of the concern.
- [ ] Search for local wrappers, adapters, helpers, polyfills, manual state, or
  schema/codegen code that duplicates library behavior.
- [ ] Classify each finding:
  - `delete-local-wrapper`
  - `replace-with-library-api`
  - `move-to-shared-angee-owner`
  - `keep-angee-glue`
  - `stack-row-needs-update`
  - `dependency-missing-or-wrong`
- [ ] Name the wrong layer if present: addon, `@angee/base`, `@angee/sdk`,
  `angee.graphql`, `angee.compose`, framework core, or project/example code.
- [ ] Record the deletion/simplification path and the guardrail that proves we
  keep using the dependency-native shape.

Each finding should use this shape:

```text
- Library:
  - Native owner/API:
  - Current Angee/addon code:
  - What can be deleted or simplified:
  - Correct Angee glue owner:
  - Stack/docs update needed:
  - Test / guardrail:
  - Risk:
```

## Backend Library Researchers

### Django

- [ ] Models, fields, managers, querysets, app registry, settings, migrations,
  admin, forms, management commands, URLconf, ASGI/WSGI seams.
- [ ] Find neutral helpers/registries that should be Django objects.
- [ ] Find generated-runtime imports or string parsing that should use app
  registry / `_meta`.
- [ ] Findings:

### strawberry-django

- [ ] GraphQL types, filters, order, resolvers, dataloaders, schema printing.
- [ ] Find hand-written result serialization, field projection, CRUD, or resolver
  code that library primitives can own.
- [ ] Findings:

### strawberry-django-aggregates

- [ ] Aggregation and group-by resolvers.
- [ ] Find addon-specific aggregate/group code that should use
  `AggregateBuilder` / `rebac_aggregate_builder`.
- [ ] Findings:

### django-choices-field

- [ ] Enum-backed model fields and GraphQL enum behavior.
- [ ] Find manual enum/string coercion, options generation, or read/write casing
  workarounds that should live on field/options owners.
- [ ] Findings:

### django-zed-rebac

- [ ] Actor scoping, relationship definitions, permission checks, sync, local
  backend.
- [ ] Find duplicated permission logic in views/resolvers/pages.
- [ ] Findings:

### django-sqids

- [ ] Opaque ids and nullable join behavior.
- [ ] Find manual id encode/decode or sqid parsing outside boundary scalars and
  fields.
- [ ] Findings:

### django-simple-history / django-reversion

- [ ] History, revision snapshots, revert.
- [ ] Find local audit/versioning code that can be deleted.
- [ ] Findings:

### cryptography

- [ ] Encryption primitives and key handling.
- [ ] Find bespoke secret encoding/decoding that should use `EncryptedField` or
  dependency-native primitives.
- [ ] Findings:

### django-import-export / tablib

- [ ] Resource import/export, tabular formats, row cleaning/results.
- [ ] Find custom import/export/table parsing in resources or addons.
- [ ] Findings:

### pyyaml / django-yamlconf / django-environ

- [ ] YAML parsing, settings overlays, typed environment access.
- [ ] Find manual settings parsing, env coercion, or YAML shape decoding.
- [ ] Findings:

### pyjwt[crypto]

- [ ] JWT and JOSE verification.
- [ ] Find manual token parsing/verification in OIDC or integration code.
- [ ] Findings:

### FastMCP / `mcp`

- [ ] MCP server registration, auth verifier, StreamableHTTP ASGI app, middleware.
- [ ] Find hand-rolled JSON-RPC, auth, lifecycle, or tool dispatch code.
- [ ] Findings:

### anthropic

- [ ] Messages API, model catalogue, retries, typed SDK models.
- [ ] Find provider code that should use SDK-native pagination, model objects,
  errors, retries, or request typing.
- [ ] Findings:

### openai

- [ ] Chat/completions/responses-compatible client seams, model catalogue,
  retries, typed SDK models.
- [ ] Find provider code that should use SDK-native pagination, model objects,
  errors, retries, or request typing.
- [ ] Findings:

### python-magic

- [ ] MIME detection from file bytes.
- [ ] Find manual extension/type guessing that should use MIME detection owner.
- [ ] Findings:

## Frontend Library Researchers

### React

- [ ] Component composition, props/state ownership, render derivation, effects for
  external sync only.
- [ ] Find mirrored state, derived state in `useEffect`, forked component trees,
  or side effects in render.
- [ ] Findings:

### TypeScript

- [ ] Type system, inference, branded boundary types.
- [ ] Find hand-written GraphQL result/variable types, unsafe casts, or duplicate
  domain type aliases.
- [ ] Findings:

### urql / @urql/core

- [ ] GraphQL client, normalized cache, subscriptions, invalidation.
- [ ] Find manual fetch/cache/refetch/polling logic that should use urql and
  Angee resource hooks.
- [ ] Findings:

### graphql-ws

- [ ] Subscription lifecycle and retry behavior.
- [ ] Find custom websocket lifecycle code outside the owning provider seam.
- [ ] Findings:

### GraphQL Code Generator / TypedDocumentNode

- [ ] Generated schema and operation types.
- [ ] Find authored operation types, inline ops missed by codegen, or
  hand-written response interfaces.
- [ ] Findings:

### TanStack Router / nuqs

- [ ] Route state and URL/search params.
- [ ] Find duplicated route params, local search state, tab state, or manual URL
  parsing.
- [ ] Findings:

### TanStack Form

- [ ] Form state and validation owner through `FormView`.
- [ ] Find local form state, required-field validation, or submit payload assembly
  in addon pages.
- [ ] Findings:

### TanStack Table / Virtual / dnd-kit

- [ ] Columns, sort, filter, grouping, selection, virtualization, board/drag
  interaction.
- [ ] Find local tables, boards, grouping, pagination, visible-field, selection,
  or drag/drop behavior outside `@angee/base`.
- [ ] Findings:

### valibot

- [ ] Schema validation for opaque client values.
- [ ] Find ad hoc validation or unsafe JSON assertions.
- [ ] Findings:

### i18next

- [ ] Runtime i18n and namespaces.
- [ ] Find hardcoded component copy or duplicate label maps.
- [ ] Findings:

### date-fns

- [ ] Date and relative-time formatting.
- [ ] Find manual date formatting, `toLocale*`, or repeated relative-time code.
- [ ] Findings:

### use-debounce

- [ ] Debounced values/callbacks.
- [ ] Find manual timeout/debounce implementations.
- [ ] Findings:

### Tailwind / tailwind-merge / tailwind-variants / tw-animate-css

- [ ] Token styling, class merge, variant recipes, motion utilities.
- [ ] Find hand-built color/tone class maps, one-off variants, or unsafe class
  concatenation that should use tokens/recipes.
- [ ] Findings:

### lucide-react / glyph registry

- [ ] Icon source and registered glyph seam.
- [ ] Find direct icon imports in components or duplicated SVG/icon code.
- [ ] Findings:

### @base-ui/react / @floating-ui/react-dom

- [ ] Dialog, popover, menu, tabs, tooltip, field, toolbar, scroll area,
  positioning.
- [ ] Find hand-rolled focus, popover/menu/dialog/tooltip behavior in base or
  addons.
- [ ] Findings:

### CodeMirror

- [ ] JSON/Markdown/text editor behavior through `useCodeMirrorEditor`.
- [ ] Find bespoke text editor state, JSON editor behavior, or syntax handling.
- [ ] Findings:

### react-pdf / pdfjs-dist, @vidstack/react, heic-to

- [ ] File preview rendering for PDF, media, HEIC/HEIF.
- [ ] Find custom preview/media decode code.
- [ ] Findings:

### @xyflow/react / dagre

- [ ] Graph canvas and directed graph layout.
- [ ] Find custom graph layout/canvas behavior that should compose `GraphView`.
- [ ] Findings:

## Tooling Researchers

### uv / pnpm / Vite

- [ ] Dependency resolution, workspace layout, bundling/dev server.
- [ ] Find hand-rolled install/runtime scripts or stale lockfile/manual package
  management.
- [ ] Findings:

### ruff / mypy / pytest / Vitest / Playwright / Storybook

- [ ] Lint, typing, backend tests, frontend tests, e2e, component workshop.
- [ ] Find missing guardrails for seams that researchers identify.
- [ ] Findings:

### Cobra / Copier / hatchling / GitHub Actions

- [ ] CLI, templates, packaging, CI.
- [ ] Find custom command/template/package/CI behavior that should use these
  owners.
- [ ] Findings:

## Output Summary

After library researchers complete, summarize:

- [ ] Highest-value local wrappers to delete.
- [ ] Library APIs Angee should use more directly.
- [ ] Places where `docs/stack.md` rows need correction.
- [ ] Proposed dependencies that should become locked before use, or be rejected
  because an existing library owns the concern.
- [ ] Focused guardrails to prevent reinvention.
