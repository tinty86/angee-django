# Features

> Angee is an opinionated framework for **self-extending, agent-native
> applications**. It pre-solves the cross-cutting problems every SaaS, ERP, or
> internal tool eventually hits — authentication, authorization, audit, files,
> secrets, integrations, real-time, agents, deployment — and ships them as
> framework primitives and batteries-included addons. Consumers inherit the
> answers and spend their code budget on what is actually unique to their
> product.

**How to read the status.** Every capability below has been **prototyped and is
working end to end** — proven inside production platforms the team has already
built. Angee is the exercise of *lifting* those capabilities out of those
codebases and open-sourcing them here, reconstructed to the framework's
conventions one addon at a time. Each feature is tagged **Built** (proven end to
end, landing in the open-source framework addon-by-addon) or **Planned**
(designed, on the near roadmap). This is the whole point of the framework, and
why it is **technical investment, not technical debt**: every component *and its
permissions* are tested end to end, so each new addon stands on an already-proven
foundation, and each one that lands makes the next one easier.

Angee has two layers — **framework primitives** every project inherits, and
**batteries** you compose. The shared vocabulary (addon, composer, host, source
model, REBAC, shell) lives in the [Glossary](glossary.md); for the big picture
start with [Get Started](howto/getstarted.md). Deeper per-area docs
(`docs/addons.md`, `docs/host.md`, `docs/tooling.md`, `docs/backend/*`,
`docs/frontend/*`) are being lifted in alongside the code.

---

## The foundation — framework primitives

### Compose — the extensible addon system · *Built*

An **addon** is one unit of cross-cutting capability, and it bundles both halves
of a product. On the backend it is a Django app shipping **abstract** models,
their GraphQL operations, a REBAC permission fragment, and seed data; when it has
UI it ships a sibling JavaScript package, `@angee/<addon>-base`, exporting the
routes, views, widgets, menus, and translations for that capability. The Python
wheel never serves product HTML — the JS package is what a host imports and
composes. Everything, including the framework core, is an addon, so the first
question for any change is always *which addon owns it.*

The **composer** is what makes a bundle of addons feel like one application. At
build time (`manage.py angee build`) it discovers every active addon from
`INSTALLED_APPS`, merges their abstract models by Python MRO into concrete Django
apps, collects their `@query` / `@mutation` / `@subscription` methods into one
GraphQL schema, concatenates their REBAC fragments into one permission schema,
and emits typed TypeScript contracts — all into a generated `runtime/` tree. It
is deterministic by contract: byte-identical inputs produce byte-identical
outputs, enforced in CI by `angee build --check`. There is no monkey-patching and
no runtime registration; composition happens once, at build. → [`composer.md`](composer.md);
addon source layout in `docs/addons.md` *(lifting in)*.

### Data modeling — abstract models, opaque IDs, audit, encryption · *Built*

Addons declare **abstract** Django models; the composer emits the concrete tables.
A small metaclass reads an extended `class Meta` (validated at class-load, so
drift fails fast) and a one-stop `AngeeModel` base bundles the common behaviour.
External identity is handled by opaque, prefixed, sortable **sqids**
(`note_abc123`) at the API boundary so integer primary keys never leak. Secrets
are per-column `EncryptedTextField(secret=True)` values (encrypted at rest and
excluded from projections), and a library of orthogonal mixins adds the recurring
concerns — `Timestamped`, `Audited` (created/updated-by from the actor),
`History` (shadow audit tables), `Revision` (user-facing versions), `Archivable`,
`Taggable`, and more.

Semantic field types (`StateField`, `AvatarField`, `IconField`) carry a tag the
frontend reads to pick the right widget automatically, so the data shape drives
the UI without per-field wiring. The libraries behind these primitives —
`django-sqids`, `django-simple-history`, `django-reversion`, `django-choices-field`
— are locked in the [opinionated stack](stack.md); the per-concern detail lives
in `docs/backend/{models,fields,mixins}.md` *(lifting in)*.

### IAM & REBAC permissions — authorization on every operation · *Built*

Authorization is **Relationship-Based Access Control** in the Google-Zanzibar
shape, delegated wholesale to `django-zed-rebac`. Every operation passes through
it — there is no "skip permissions" path. The two halves are split by receiver:
**reads** scope through the model manager (`Model.objects.with_actor(actor).accessible(op)`
returns a permission-narrowed queryset, and an unscoped query raises rather than
leak), while **writes** check the specific instance before any SQL runs. Three
roles are framework-reserved — `anonymous`, `authenticated`, and an audited
`system` bypass (`sudo(reason=…)`, never `is_superuser`). Each addon ships a
`rebac.zed` fragment at its root; the composer merges them into one schema and
`manage.py rebac sync` loads it into the engine, with a `--check` drift gate. A
local recursive-CTE backend and a SpiceDB-compatible backend sit behind one
interface.

The identity primitives REBAC operates on come from the **IAM addon** (`angee.iam`
here): a custom `User`, `Group`, `Service` (machine accounts), and hashed
`ApiKey`, plus append-only impersonation auditing. An actor resolver collapses
session, token, and machine-to-machine identities into one subject shape on every
request, and OIDC single sign-on plugs in through the OAuth addon (below). →
[Glossary](glossary.md), [`stack.md`](stack.md); detail in
`docs/backend/permissions.md` *(lifting in)*.

### GraphQL-first API — auto-CRUD, real-time, typed end to end · *Built*

GraphQL is the primary API surface; the backend serves data, not HTML. CRUD is
**auto-generated from model declarations** — flagging a model `queryable` /
`mutable` yields its `note(id:)`, `notes`, and `noteCreate/Update/Delete`
operations, plus search, aggregates, and group-by — with no hand-written
resolvers. Custom operations are transport-neutral methods tagged `@query` /
`@mutation` / `@subscription`; the composer turns them into Strawberry resolvers,
and every resolver is REBAC-checked by construction. Real-time arrives as GraphQL
subscriptions over WebSockets (channels + daphne): a per-model change stream lets
the client cache invalidate precisely.

The composer also emits the SDL, persisted operation documents, and — via
graphql-codegen — a fully typed TypeScript surface, so the React client consumes
operations by *name* with end-to-end types and never hand-writes an API client.
A small REST sidecar (`django-ninja`) is available, but only for clients that
cannot speak GraphQL (inbound webhooks, OAuth callbacks, health checks); mirroring
GraphQL behind REST is treated as a smell. → `docs/backend/graphql.md` *(lifting in)*,
[`stack.md`](stack.md).

### The UX framework — headless SDK + one rendered binding · *Built*

The frontend is a two-ring composition framework. `@angee/sdk` is **headless** —
composition contracts (`defineAddon`, `createApp`), providers, data hooks, and all
the GraphQL/urql wiring — with no styling. `@angee/base` is the **single rendered
binding**, built on Base UI primitives + Tailwind 4 + shadcn authoring
conventions; it ships the **shells** (the app chrome — rails, nav, breadcrumbs,
command palette — each bound to a backend schema by name), **page presets**
(`DataPage`, `HeroPage`, `CanvasPage`), the **view family** (`ListView`,
`FormView`, `BoardView`, `CalendarView`, `GraphView`, …), and a set of foundation
**widgets**. A host writes one `createApp({ addons, shells, graphql })`; each
addon contributes one `defineAddon` manifest, and composition fails fast on any
collision.

Two principles keep it DRY. **Theming is by tokens, not props**: Tailwind 4
`@theme` tokens are the single source of truth, so a skin is a token override
(`data-skin="brand"`) with no React re-render. **Field widgets bind by meaning**:
a widget attaches to a field by its semantic tag or GraphQL type, and relational
pickers are generated from a directive on each foreign key, so `<Field name="vault">`
mounts the right picker with zero per-addon code. `<FormView mutation="noteUpdate">`
and `<ListView query="notes">` consume operation names directly, driven by headless
TanStack Form/Table/Virtual/Router. One `locale/<lang>/` tree per addon serves both
Django (`.po`) and React (`.json`). → [`frontend/guidelines.md`](frontend/guidelines.md);
detail in `docs/frontend/{composition,sdk,shells,layouts,widgets,theming-i18n}.md`
*(lifting in)*.

### Seed data & admin — tiered assets and an auto-emitted admin · *Built*

Reference and bootstrap data load through a tiered, idempotent pipeline: `master`
(mandatory reference data, re-runnable every deploy), `install` (one-shot
bootstrap on a fresh database), and `demo` (sample data, dev-gated). Each addon
lists its files in its manifest; `angee assets load <tier>` applies them, and a
generated ledger records what loaded so reloads are no-ops. REBAC relationships
are themselves a first-class asset type. Alongside this, the composer
auto-emits a Django **admin** for every concrete model — the only
backend-rendered UI in the system — deriving its columns, filters, and search from
the same `Meta` that drives GraphQL, and scoping its querysets through REBAC like
everything else. → `docs/backend/{assets,admin}.md` *(lifting in)*.

---

## Build & operate

### Development SOPs — the opinionated build cycle · *Built*

Angee prescribes one development cycle, and the connective tissue across every
stage is the **GraphQL operation name**. You build a slice **frontend-first** in a
Storybook workshop, rendering real components against mocked data answered by
operation name — no backend required. You then author the backend slice (abstract
models, decorated operations, a REBAC fragment) and run `angee build`, which
composes the concrete `runtime/` and a typed TypeScript surface; the host's strict
typecheck against those generated types is the gate that proves the UI's
operations match the schema. Finally you lock behaviour with the testing pyramid:
pytest (including a declarative YAML scenario runner that drives persisted
operations *as* a given user), Vitest component tests, and Playwright end-to-end
tests against the real composed product.

Two things make this more than a convention. First, the e2e layer tests
**components *and* permissions** — specs assert that two users' scopes are
disjoint and that an anonymous write is denied, exercising the server-side REBAC
boundary, not just the client gate. Second, **determinism is enforced**: the same
inputs always produce byte-identical `runtime/`, checked in CI, and custom ESLint
rules keep styling on design tokens and rendered UI imported only from the single
binding. The whole loop is driven by the `angee` Go CLI (workspaces, dev
supervisor, scaffolding, build, migrate). → [`guidelines.md`](guidelines.md),
[`testing/e2e.md`](testing/e2e.md); CLI in `docs/tooling.md` *(lifting in)*.

### DevOps — agentic self-management & self-deployment · *Built*

Angee is its own deployment plane. The `angee` CLI and the `angee-operator`
daemon (both Go) are a **self-managed stack manager**: they declare your code as
**Sources** (git repos), compose them into **Workspaces** (a set of Sources and/or
agentic configuration, materialized as files) and **Stacks** (the runnable unit,
in a **dev** or **prod** flavor), and run the Stacks on docker-compose or
process-compose — all from one `angee.yaml`. There is no separate CI/CD that knows
how to build the app: a feature branch developed in a Workspace promotes to
production by pointing the same Sources at a different Stack.

Crucially, every primitive is exposed over the **same CLI + REST + GraphQL
surface**, so a human, a script, or an *agent* drives the identical lifecycle —
which is what lets the platform self-build and self-deploy across environments. On
the Django side, a thin `operator` addon bridges to the daemon (one
`Query.operatorConnection` field hands the browser `{endpoint, token}`; it owns no
Django models), and a console UI manages stacks, services, workspaces, sources,
and secrets. → the operator's own docs at [docs.angee.ai](https://docs.angee.ai)
and [Get Started](howto/getstarted.md#whats-needed-for-agents-to-self-build).

---

## Batteries — the addon catalog

### Agents — a permissioned agentic surface · *Built*

The `agents` addon makes an **agent a first-class REBAC subject**, alongside
users, services, and API keys, so every permission check works on an agent
identically — "Software 3.0 from day one": an agent is *permissioned*, not merely
authenticated, and issuing one grants nothing until explicit relations are added.
In v1 you pick a template-driven agent, bind it to an integration account and a
model, mount skills into its workspace, and chat with it; every step is recorded
in an append-only audit.

Two boundaries keep it safe. Process lifecycle belongs to the **operator** (the
browser asks the daemon to run the agent), so Django never mirrors runtime state.
And an **agent ceiling** (`@agent_policy(max_mode=…)`) caps what an agent's runtime
may *do* with an otherwise-authorized operation — narrower than REBAC, and the
hook that the MCP tool surface (roadmap) lights up to enforce. → the addon's own
docs ship with it at `addons/agents/docs/OVERVIEW.md` *(lifting in)*.

### Integrations — third-party systems & OAuth · *Built*

The `integrate` addon is the system-to-system surface and the foreign-key target
every domain addon points at when it talks to an outside service: a vendor
catalogue, per-account state, stateless **providers** and stateful **bridges**
(with sync cursors and lifecycle), and inbound/outbound **webhooks** (signed,
retried, auto-disabled on repeated failure). It is deliberately credential-source
agnostic — accounts ship without credential columns, and credential addons
contribute them via the composer's model-extension mechanism.

The first such contributor is `integrate_auth_oauth`, which owns all **OAuth2 +
OIDC** code: vendor configuration, per-user encrypted token storage, the discovery
/ authorize / exchange / refresh protocol, and a single link flow that serves both
"connect my Google to sync calendars" and "sign in with Google" (auto-provisioning
users by policy on the SSO branch). → `addons/integrate/docs/OVERVIEW.md`,
`addons/integrate-auth-oauth/docs/OVERVIEW.md` *(lifting in)*.

### Knowledge management — structured knowledge & graph RAG · *Built (substrate) · Planned (RAG)*

The `knowledge` addon is a server-backed, REBAC-permissioned, multi-user PKM
substrate in the Obsidian shape. `Page` is the universal addressable identity
(notes, folders, templates, canvases), with typed `Property` frontmatter, typed
`Link` edges (wikilinks, embeds, mentions), `Attachment`s to stored files, and
block-anchored `Chunk`s for transclusion. The defining move is **"index, don't
grep"**: every page change runs an in-transaction walker that turns the markdown
and its frontmatter into queryable rows, so wiki structure is data, not a regex
over text. It targets lossless round-trip with an Obsidian vault.

**Graph RAG** layers on top as a follow-up addon so the base carries no vector or
LLM dependency: entities, claims, and communities extracted from the chunks, plus
embeddings and a graph-retrieval resolver, behind pluggable vector and graph-RAG
engines (pgvector / sqlite-vec / LightRAG, listed as proposed in [`stack.md`](stack.md)).
Real-time CRDT co-editing is on the same horizon. → `addons/knowledge/docs/OVERVIEW.md`
*(lifting in)*.

### Storage — files & blobs · *Built*

The `storage` addon is a small, complete file domain: content-hash-deduplicated
`File` rows, `Drive`s and `Folder`s, and a polymorphic attachment so *any* model
row can carry files. Storage backends are pluggable behind Django's storage
interface — a bundled local backend for dev and an S3/R2/MinIO backend for
production — resolved per drive, with credentials kept as encrypted env-refs that
rotate without a restart. MIME type is detected from the bytes on finalize (via
libmagic, never the client's claim), and uploads use one client-visible flow
(begin → single PUT → finalize) whether bytes go direct-to-S3 or proxy through the
server, with presigned GET/PUT URLs. A preview-provider registry resolves
renderers by MIME (images, video, PDF, markdown, …) and downstream addons register
richer ones. → `addons/storage/docs/OVERVIEW.md` *(lifting in)*.

### Communications — contacts & messaging (connect) · *Planned*

The `connect` addon is the **people-and-conversations** domain — the inverse of
`integrate`'s system-to-system split. It pairs an address book (`Contact`,
`Organisation`, and `Identity` records that act as merge keys) with messaging
(`Thread`, `Message`, `Channel`, `Participation`), where any actor — user,
service, **agent**, group, or external contact — can participate in a thread.
Planned v1 channels are web chat, email (inbound webhook / outbound SMTP, threaded
by identity), and an agent channel; real-time delivery rides the framework's
subscriptions, attachments use `storage`, and inbound connectors use `integrate`.
It is deliberately not a full CRM (no pipelines or marketing email). → design-only
today; `addons/connect/docs/OVERVIEW.md` *(lifting in)*.

### On the roadmap

Same composer contract, near horizon:

- **Workflows** *(Planned)* — queue + scheduled jobs + state machines with durable
  execution and a React-Flow canvas that is both editor and live viewer. The
  differentiator is a **permissioned step contract**: every step is a GraphQL
  operation run under an explicit REBAC subject with the agent ceiling enforced —
  there is no path that bypasses permissions. Human-in-the-loop tasks, escalation,
  and agent steps are first-class. → `docs/workflows.md` *(lifting in)*.
- **MCP** *(Planned)* — a Model Context Protocol tool surface that emits agent
  tools directly from the framework's persisted, REBAC-gated GraphQL operations,
  turning the agent ceiling from metadata into enforcement.
- **Tenants** *(Planned)* — multi-tenant lifecycles built on top of REBAC.
- **ARP — Agentic Resource Planning** *(Planned)* — the flagship downstream addon
  set re-cutting ERP (payments, invoicing, accounting, procurement, CRM, HR) as
  composable addons on this same contract, every entity permissioned and every
  workflow agent-addressable. Its shared primitives — `money` (currency +
  exchange-rate + `MoneyField`), `sequence` (human-readable numbering like
  `INV/2026/0001`), and `uom` (units of measure) — are designed and on deck.

---

The single source of truth for which libraries are wired versus still proposed is
the [opinionated stack](stack.md). For where each capability stands today versus
what is still being lifted in, see
[Get Started → How much is built](howto/getstarted.md#how-much-of-this-is-built-today).
