# Changelog

Notable structural and behavioral changes to the Angee framework — the `angee/`
core + composer and the base addons under `addons/angee/`. The format loosely
follows [Keep a Changelog](https://keepachangelog.com); the framework is
pre-release (alpha preview), so entries are grouped by the dated effort that
landed them, newest first. Day-to-day detail lives in git history — this file
keeps the load-bearing decisions and the deferred follow-ups that outlive the
working plans that produced them. Principles live in `docs/`; concrete contracts
live in code docstrings.

## 2026-06-05 — Framework core review fixes

A six-reviewer pass over `angee/{base,graphql,compose}` (21 findings), executed
and verified (243 backend tests, mypy + ruff clean, `angee build --check` and
`schema --check` green). Durable decisions now in code:

- **CSRF is real.** The IAM middleware fragment installs `CsrfViewMiddleware`;
  bearer-authenticated requests are marked CSRF-exempt in the actor/auth layer
  (the DRF session-vs-token pattern), so cookie clients are protected and token
  clients keep working.
- **Compose drift is check-only on boot.** `ComposeConfig.import_models()` heals
  the runtime in place (write-only `emit_if_stale()`); the destructive
  reset/prune `emit()` is reachable only through `angee build` / `angee clean`.
  Production ASGI workers no longer pay a per-boot full re-render, and a stale
  runtime yields a clean `CommandError`, not an `ImproperlyConfigured` traceback.
- **Destructive deletes require confirmation.** The GraphQL CRUD `delete`
  resolver defaults `confirm=False`: a bare call returns a non-destructive
  `DeletePreview`; deletion needs `confirm: true`. Preview + delete run inside one
  `transaction.atomic()`.
- **Elevated writes** — `crud(..., write_context="system")` runs the
  create/update/delete body under `system_context` *after* the permission gate,
  so const-admin surfaces (IAM) use the generic CRUD instead of hand-rolled
  mutations.
- Serialization (`json_safe`) maps non-finite floats and normalizes
  `set`/`frozenset`/`bytes` so the subscription/resource wire stays valid,
  deterministic JSON. Public-id lookup is polymorphic on `SqidMixin` (no
  type-switching from outside). The Strawberry schema subclass `AngeeSchema`
  lives in `angee/graphql/schema.py`.
- **Non-findings recorded so they are not re-litigated:** unparenthesized
  `except` tuples are valid on Python 3.14 (the code uses the parenthesized form
  regardless); the select_related-on-a-REBAC-guarded-relation trap does not occur
  in `angee/graphql/` (the one guarded `select_related` runs under
  `system_context`).

## 2026-06-04 — Decomposition & pattern-standardization audit sweep

A whole-tree, addon-by-addon review against the repo's own guidelines (58
findings: 16 high / 22 medium / 20 low) plus the A1–A11 / B1–B4 library- and
pattern-consistency items. Owner-first fixes, one commit per unit; all resolved.
Headline outcomes now in code/docs:

- **Manager/QuerySet canon** documented in `docs/backend/guidelines.md`:
  chainable read scopes live on a `*QuerySet` via `Manager.from_queryset(...)`;
  factories and mutations stay on the manager that owns the write.
- `docs/stack.md` reconciled with reality — phantom locked rows demoted, the
  `pyyaml` row added, aspirational rows moved to "Proposed."
- Scattered functions folded onto their owners across base / iam / resources and
  the frontend (`AccountStatus` rollups onto the enum, `OidcIdentityResolver`,
  `DeletionPreviewNode` factories, one `ListView`, typed `DataView` / `Filter`).
- Dead/forked code removed (the operator's forked SDK client → pluggable auth on
  the single SDK client factory; dead `roles.ts` / `fixtures.ts`).

Commit map (newest→oldest): `1e2cbb1` (A1 SDK auth) · `3838048`
(web/storybook) · `e25dba7` / `429b598` (operator) · `080f76f` (integrate/notes)
· `313fae6` (packages/base) · `c026be8` (iam) · `d618b33` (base deletion) ·
`780324d` (iam AccountStatus) · `2ec6c29` (stack.md / B1–B4).

## 2026-06-04 — Repository layout split (Phase A) & framework recomposition

- **Top-level layout** (`5834a5a`): `src/angee/{base,compose}` →
  `angee/{base,compose}` (framework core) and `src/angee/{iam,resources,
  operator,integrate}` → `addons/angee/*` (base addons), with `packages/` for the
  React layer. The directories now mirror the eventual `django-angee` /
  `django-angee-addons` / `angee-react` split **without changing a single
  import**: `angee` stays a PEP 420 namespace (no `__init__.py` at `angee/` or
  `addons/angee/`), so two source roots merge into one `angee.*` namespace.
- **Django-shaped recomposition**: `angee/base` is now the model toolkit only
  (the `django.db` analog); the GraphQL runtime moved to its own `angee/graphql/`
  package (schema, CRUD, deletion preview, events, publishing, access); `net.py`
  moved to `addons/angee/integrate`. (`json_safe` stays the single public
  serializer in `angee/base/serialization.py`, consumed by both graphql and
  resources.) `tests/test_layering.py` enforces base ⊥ {graphql, compose,
  addons}, graphql ⊥ compose, and addons ⊥ compose.

## 2026-06 — Base addon lifts

The base addons reached parity with the team's prototypes and are tested end to
end. Details live in code, the addon `AppConfig` docstrings, and the agent memory
index; summarized here because the working lift plans were retired.

- **IAM** — the swappable `iam.User`, OIDC login (public + console GraphQL),
  third-party **connections** (`Vendor` / `ExternalAccount` / `OAuthClient` /
  `Credential` with a `CredentialKind` handler registry), and a Permission Hub
  console built on **roles-as-namespace** (`rebac.roles`; no `Role` model). The
  superuser ↔ `angee/role:admin` grant fires on `save()`.
- **Integrate** — a thin capability/bridge runtime seam: abstract `Capability` /
  `Bridge`, `WebhookSubscription`, and the `registry` / `scheduler` / `net` /
  `webhooks` / `events` modules. The connection models (vendor/account/client/
  credential) live in IAM, not integrate.
- **Operator** — a thin Django bridge that hands the browser a connection to the
  Go daemon, plus an 8-section console. The daemon mints scoped tokens over a
  server-side admin bearer; the console's GraphQL types are codegen'd from the
  **daemon's** introspected SDL (never hand-written); a `managed=False`
  `OperatorConnection` anchor const-gates the table-less resource to
  `angee/role:admin`.
- **Base / GraphQL** — `EncryptedField` (Fernet at rest), Relay `AngeeNode` +
  `sqid` boundary, and addon-level `AggregateBuilder` wiring.

## Deferred follow-ups

Forward-looking work consciously deferred; kept here so it survives the plans
that proposed it.

- **Repo split Phase B — two-dist uv workspace.** Before the actual repo split,
  turn the monorepo into a uv workspace with two dists: root `django-angee`
  (`packages = ["angee"]`, framework-only deps) and `addons/pyproject.toml`
  `django-angee-addons` (`dependencies = ["django-angee", …]`). Partition
  dependencies from real imports — `django-import-export` / `tablib` / `pyyaml` →
  addons, `pyjwt[crypto]` → iam, whatever `angee/base` + `angee/compose` import →
  framework — so the addons→framework dependency direction is enforced, not just
  implied by directory. The repo split then becomes "move `addons/` to a new repo
  + point its `django-angee` dependency at the published version."
- **Generic-list title/status is a backend contract.** `@angee/base` has no owner
  for *which* row field is the "title" vs the "status" of a generic list row; a
  frontend heuristic would violate find-the-owner. The real owner is the GraphQL
  schema: it should annotate title/status fields (a backend contract change),
  then the list view reads the annotation. (Residual of the audit's pkgbase-001.)
- **Machine identity (deferred from the IAM lift).** A full machine-identity
  model (`Service` accounts, hashed `ApiKey`, `ImpersonationEvent` audit) and a
  runtime `auth/role` hierarchy (`includes` / `effective_member`) were planned but
  superseded by roles-as-namespace + the Permission Hub. If revisited: ApiKey
  tokens are **sha256-hashed, not Argon2** (a slow KDF buys nothing for
  high-entropy random tokens), and `last_used_at` is bumped via an unscoped
  `_base_manager.update()`, never `instance.save()` (which trips the write gate
  and `auto_now`). When deriving operator/edge token scope from roles, use
  `effective_member` (the authz boundary, folds in the role hierarchy), never
  `roles_of` / `roleRefs` (a direct-grants UX hint) — the latter under-grants by
  dropping implied roles.
- **Composer extraction seam (strategic).** No packaged tool fills Angee's niche —
  *deterministic build-time emission of generated Django source from
  declaratively-composed addon contracts*. The clean extraction boundary is
  everything above `AngeeRuntime.render_sources() -> dict[Path, str]` (generic
  discover / order / drift / emit / clean / sentinel behind an Emitter protocol,
  with Angee's model / REBAC / history / SDL emitters as the implementations).
  The biggest gap for a public package is entry-point discovery
  (`importlib.metadata`, as pluggy / DJP / stevedore do); today Angee discovers
  only `AppConfig`s already in `INSTALLED_APPS`.
