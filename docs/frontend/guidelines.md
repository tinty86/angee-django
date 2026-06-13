# Frontend Guidelines

Frontend code is TypeScript, React, and the rendered Angee experience. It owns
presentation, routes, menus, widgets, shells, view state, and interaction.

Follow the shared development process and coding principles in
[`docs/guidelines.md`](../guidelines.md) for every task; the rules below are the
frontend-specific layer applied during the Build step.

## Stack

The opinionated stack in `docs/stack.md` is the source of truth for frontend
libraries and what each one owns. Check it before adding a dependency or
hand-rolling a concern. TypeScript dependency setup belongs in `package.json`,
`pnpm-workspace.yaml`, and `pnpm-lock.yaml`.

## Rules

- Python ships schema and operations. TypeScript ships UX.
- React does not own business logic, permissions, models, or persistence.
- Use `defineAddon` for addon contribution and `createApp` for the project's
  host composition.
- One component tree. Extend or register; do not fork.
- Slots are additive extension points. Use them before copying a component.
- Tokens beat color props and one-off variants. Theme by overriding tokens.
- Use shared page, view, form, table, widget, and shell primitives before adding
  new local state.
- Client-side gates are UX only. The server is the authorization boundary.
- No Python view DSL, no frontend metadata hidden in backend decorators.

## Pitfalls

Hard-won traps — the wise learn from others' mistakes (`docs/guidelines.md`).

- **Relation widgets follow the SDL field kind** — a nested object FK
  (`kind:"relation"`) auto-wires to a creatable `many2one` picker; a bare `ID`
  scalar (`kind:"scalar"`) is not auto-detected and must use `widget:"select"`
  (`many2one` selects `<field>.id`, invalid on a scalar id).
- **A FormView create dialog under the console shell** needs
  `<ControlBandProvider host={undefined}>` to keep its Save band inline instead of
  portaling into the shell's band.
- **Shells bind their own schema** (`ShellConfig.schema`): console-only fields
  need the console client — set `defaultSchema: "console"` and pin the
  public/login shell to `public`.
- **Order urql exchanges `[cache, subscription, fetch]`** — a client missing
  `fetchExchange` forces plain queries over graphql-ws and they hang; never set a
  poll interval shorter than the slowest resolver, or a `network-only` reexecute
  aborts the in-flight request.
- **Generate the operator console's types from the Go daemon's introspected SDL**
  (`operator_schema` → codegen), never by hand; daemon actions return
  `MutationResult{status}`, not `{ok}`.
- **Add every new addon web package to the app CSS `@source`** — its unique
  arbitrary Tailwind classes silently fail to generate otherwise.
- **Shared/generic icon glyphs live in the base `chrome/icon-registry.ts`** —
  registration is fail-fast, so an addon cannot re-register another's glyph.
- **A new web package needs `pnpm install` + a Vite restart** (Vite snapshots
  workspace packages at start) plus registration in the host `main.tsx` addons and
  `package.json`.

## Checks

Run package-scoped commands while editing, then the broad checks before handoff:

```sh
pnpm run typecheck
pnpm run test
pnpm run build
```

Run the package vitest suite — not just `tsc` and a story render, which miss
stale assertion drift. When verifying data-bound views, wait for the async query
to load before asserting. Use browser verification for meaningful UI changes.
