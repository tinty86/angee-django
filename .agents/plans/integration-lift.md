# Integration Lift — connections in `iam`, a thin `integrate` runtime

Lift P1's integration surface (`../angee-django-p1/addons/integrate` +
`addons/integrate-auth-oauth`) into this repo using the **two-layer** split we
settled on the whiteboard:

- **`iam` owns connections** — the vendor catalogue, a principal's linked
  external accounts, the OAuth/OIDC client config, and the (typed) credentials.
  OIDC login lands here too, because `iam` already owns `User`.
- **`integrate` is a thin runtime seam** — abstract `Capability` / `Bridge`
  bases, the sync scheduler, the capability registry, and webhook eventing. It
  owns **no per-domain data**.
- **Domain addons own the capabilities** — `agents.InferenceProvider(Capability)`,
  `connect.MailBridge(Bridge)`, … as real models with behavior on the class.

This **dissolves P1's generic `integrate.Provider`/`Bridge` table** and the
`integrate-auth-oauth` sibling: their concerns split cleanly between the
identity layer (connections) and the runtime seam (capabilities), so neither
intermediate addon survives.

> **Reconcile, don't contradict.**
> - `.agents/plans/iam-roles-lift.md` owns the **principal** surface of `iam`
>   (User/Group/Service/ApiKey/ImpersonationEvent, roles, actor resolver,
>   `auth/*` REBAC namespace, fail-closed posture). This plan **adds** the
>   connection models to the same addon and **sequences after its B1–B3**
>   (`User` + actor resolver must exist: `Credential.user → User`, the OIDC
>   resolver provisions `User`).
> - It **corrects** `iam-roles-lift.md` F1 and
>   `frontend-stack-upgrade-popover-dry.md` §1.6: the login-method slots wire to
>   **iam `Client(is_oidc=True)`**, not a separate `integrate-auth-oauth` addon —
>   that addon no longer exists in this design.
> - `.agents/plans/notes-auth-lift.md` §1 constraints (no codegen, hand-written
>   `schema.py` + `crud()`/`changes()`, lift hygiene, run-from-root) apply.

---

## 0. The model (locked on the whiteboard)

Three homes, drawn on the line between **seams** (framework) and **concerns**
(domain), per the constitution's "framework owns the seams, not the concerns":

```
iam        identity + connections
           User · Vendor · ExternalAccount · Client · Credential(typed) · OIDC resolver
integrate  runtime seam (no per-domain data)
           abstract Capability/Bridge · scheduler · registry · WebhookSubscription · event kinds
domains    the actual capabilities          depends_on = ('iam', 'integrate')
           agents.InferenceProvider(Capability) · connect.MailBridge(Bridge) · …
```

The whiteboard insight P1 missed: **"OAuth" does two unrelated jobs** —
*authentication* (mint a `User` session: pure identity) and *delegation* (hold a
token to act as the user against a vendor API: a connection). P1 fused them into
one `OAuthProvider(is_oidc=…)` and called the capability row `Provider` too,
producing the apologetic "two Providers" naming. We keep the **one client
config** (the fusion was correct) but stop calling it a provider, and we move the
capability rows out of the framework entirely.

### Locked decisions
- **D1 — connections live in `iam`.** `Vendor`, `ExternalAccount`, `Client`,
  `Credential` + the OIDC resolver are `iam` source models / modules. No
  separate `connect`/`integrate-auth-oauth` addon for this data.
- **D2 — the linked account is `ExternalAccount`** (not P1's bare `Account`,
  ambiguous beside `User`). It is the shared `(vendor, external_id)` identity;
  it carries **no `user` FK** — ownership is a REBAC grant, because one vendor
  account can be linked by many principals (each with their own `Credential`).
- **D3 — one typed `Credential` model, dispatched by handler (polymorphism, not
  a switch).** A `kind` field (`oauth` | `static_token` | `vault_ref`) selects a
  registered **handler class** that owns `refresh()` / `auth_headers()` /
  `reveal()`. Secret material lives in an encrypted, handler-owned blob; only
  common, queried columns (`kind`, `status`, `expires_at`, `client`, `user`,
  telemetry) are typed on the row. **No `if kind == …` anywhere** — the smell the
  constitution forbids. This mirrors how the capability layer dispatches behavior
  onto the owning model (D6).
- **D4 — `Client` replaces P1 `OAuthProvider`.** One `Client` per
  `(vendor, environment)` carries both the OAuth machinery (client_id/secret,
  endpoints, scopes, refresh quirks) and the login policy (`is_oidc`,
  `link_on_email_match`, `create_on_login`, `allowed_email_domains`). **Login and
  connect-account are two flows over one `Client`.**
- **D5 — the OIDC resolver is native to `iam`** (`resolve(client, sub, email,
  claims) -> User`). **No `Meta.extends` into `User`** — `iam` owns `User`, so the
  P1 `UserOAuthIdentityExtension` dance disappears. Built on **pyjwt** (stack
  owner of JWT/JOSE; Angee adds discovery + exchange orchestration, per
  `docs/stack.md`).
- **D6 — dissolve P1's generic `Provider`/`Bridge` table.** `integrate` ships
  **abstract** `Capability` / `Bridge` bases; concrete capability rows live in
  domain apps, carry their **own** `rebac_resource_type`, and put behavior
  (`sync()`, `complete()`) **on the model**. This kills the `impl_class` FQN
  string and the OneToOne sidecar — "put behavior on the object that owns the
  data."
- **D7 — `integrate` is the thin runtime addon.** It owns the abstract bases, the
  registry, the scheduler, and exactly **one** concrete table —
  `WebhookSubscription` (cross-cutting, domain-agnostic eventing) — plus the
  event-kind catalogue. Nothing per-domain.
- **D8 — status rollup is push, not query.** A capability reports status to its
  `ExternalAccount` (`account.note_capability_status(...)`); the account owns its
  own rollup. With the generic child table gone there is nothing to `SELECT`
  over — and the owner-tells-owner shape is the better design anyway.
- **D9 — webhooks live in `integrate`** — `WebhookSubscription`, inbound routing
  (vendor → verify → `Bridge.handle_webhook`), outbound at-least-once delivery
  (HMAC-signed, SSRF-gated), and the event-kind catalogue.
- **D10 — scheduler logic in `integrate`; trigger owned by the runtime.**
  `run_due_bridges()` is `integrate`'s; the *process/cadence* that fires it is
  operational (daemon / stack periodic-task runner). Code home and trigger are
  separate — see O2.
- **D11 — `Vendor` is a model in `iam`** (admin-mutable, extendable by domain
  facets via OneToOne, e.g. `agents.InferenceVendor`). The default catalogue is
  seeded via **resources** (master tier); **`Client` secrets are seeded from
  env/settings, never from a resource file**.
- **D12 — REBAC namespaces:** connection defs are `auth/*` (`auth/vendor`,
  `auth/external_account`, `auth/client`, `auth/credential`) to match `iam`'s
  existing `auth/*` split; `integrate` uses `integrate/*`
  (`integrate/webhook_subscription`). Domain capabilities carry their own
  `<domain>/*` types.

---

## 1. Critical constraints (grounded in this repo)

> **Fail-closed posture (carried from `iam-roles-lift.md`).** `base/settings.py`
> runs `REBAC_STRICT_MODE=True`, `REBAC_SUPERUSER_BYPASS=False`. Every no-actor
> secret path here — token **refresh**, `last_used_at` bumps, the OIDC resolver's
> account lookup/provisioning, the scheduler's writes, credential upserts before
> the owner grant exists — **fails closed** unless wrapped in
> `system_context` / `asystem_context` or reached via a const-backed `admin`
> relation. Treat this as the default for the whole runtime layer.

- **Secrets are projection-excluded.** `Client.client_secret`,
  `Credential` material, and `WebhookSubscription.secret` never appear in any
  GraphQL projection (P1's `EncryptedTextField(secret=True)` contract). No
  `revealSecret` mutation; admin surfaces show *status*, not values.
- **All GraphQL is hand-written** (notes-auth §1): `@strawberry_django.type` +
  `crud()` + `changes()`; private fields simply not declared. No model-`Meta`
  GraphQL machinery.
- **Lift hygiene:** reconstruct, never copy; no file byte-identical to P1; strip
  all provenance; reuse local primitives. P1 paths are **feature references**.
- **Run from root;** per-area gate green before commit; new deps carry a
  `docs/stack.md` owner row. Emit→migrate→`rebac sync`→`resources load`→seed→
  `schema --check`.

### Framework gaps to fill first (owner = `base`)
- **`EncryptedField` does not exist.** `base/fields.py` has only `StateField`
  (+ `AvatarField` from `iam-roles-lift`). Add a Fernet-backed, projection-marked
  encrypted field with a **deterministic `deconstruct()`** (no lambda / wall-clock
  / random — CLAUDE.md deterministic-artifacts rule) and a key from one new
  setting. **Hard prerequisite:** `Client.client_secret`, `Credential` material,
  and `WebhookSubscription.secret` all depend on it. One `docs/stack.md` row.
- **SSRF-gated URL validator** for `WebhookSubscription.target_url` (P1 had one).
  Decide owner — `base` (reusable) vs `integrate` (only consumer today). Lean
  `base` if any other outbound-URL field is foreseeable; else `integrate`.
- Confirm `crud()`/`changes()` cover the new types; extend `base` on a gap.

---

## 2. `iam` connection phases

P1 feature references: `addons/integrate/angee/integrate/{models,signals,conf}.py`;
`addons/integrate-auth-oauth/angee/integrate_auth_oauth/{models,identity}.py`,
`.../oidc/{client,state,errors}.py`, `.../graphql/{mutations,providers,inputs}.py`.

### IC1 — Connection models (`src/angee/iam/models.py`)
- **`Vendor`** (`auth/vendor`, sqid `vnd`): slug (unique), display_name,
  website_url, icon, description. Admin-mutable (const-backed `admin`); default
  catalogue seeded via resources (D11). Extendable by domain facets via OneToOne.
- **`ExternalAccount`** (`auth/external_account`, sqid `eac`): `vendor`→Vendor
  (PROTECT), `external_id`, email, display_name, avatar_url, `status`
  (`StateField`), `identity_claims` (JSON — verified id_token claims landed on
  SSO link), `last_error`/`_at`, `last_used_at`. Unique `(vendor, external_id)`.
  **No `user` FK** (D2); REBAC-owned; `created_by` audit-only. Idempotent
  `objects.link()` write path.
- **`Client`** (`auth/client`, sqid `clt`): `vendor`→Vendor (PROTECT),
  `environment` (default `prod`), display_name, `client_id`,
  `client_secret` (EncryptedField), OIDC/OAuth endpoints (issuer, authorize,
  token, revoke, userinfo, jwks_uri, discovery_url), `is_oidc`, `is_enabled`,
  `scopes_catalogue`/`default_scopes` (JSON), refresh quirks
  (`supports_refresh`/`refresh_rotates`/`supports_pkce`/`max_refresh_age_seconds`),
  SSO policy (`link_on_email_match`, `create_on_login`, `allowed_email_domains`).
  Unique `(vendor, environment)` (D4).
- **`Credential`** (`auth/credential`, sqid `crd`): `user`→User (CASCADE),
  `client`→Client (PROTECT), `kind` (`oauth`|`static_token`|`vault_ref`),
  `material` (EncryptedField blob — shape owned by the kind handler), `status`
  (`StateField`), `expires_at`, `granted_scopes` (JSON), refresh telemetry.
  Unique `(user, client)`. **Behavior on the handler, not the model** (D3): a
  `CredentialKind` handler registry (handler base + built-in `oauth`/`static_token`
  handlers) owns `validate()`/`refresh()`/`auth_headers()`/`reveal()`.
- Each model: `rebac_resource_type` + `rebac_id_attr="sqid"` in Meta only.
- **One `makemigrations iam`** with the connection models (co-resolve FK order
  with the principal models if landing in the same cut).

### IC2 — Zed schema (`src/angee/iam/permissions.zed`) — author BEFORE crud()
Fail-closed ⇒ the full write schema exists before IC5. Add `auth/vendor`,
`auth/external_account`, `auth/client`, `auth/credential` with owner/editor/viewer
relations + create/read/write/delete permissions + the **const-backed
`admin: angee/role // rebac:const=admin`** line on each (matching `auth/user`).
`Vendor`/`Client` are admin-managed; `ExternalAccount` and `Credential` carry a
per-principal owner relation written on `link()`/credential upsert.

### IC3 — OIDC + connect flows (`src/angee/iam/identity.py`, `iam/oidc/`)
- Reconstruct P1's `oidc/{client,state,errors}` on **pyjwt**: discovery,
  authorize-URL build, code exchange, id_token verify, userinfo; `StateRecord`
  cache (CSRF + replay).
- **Resolver native on `iam`** (D5): find `ExternalAccount(vendor, sub)` under
  `system_context` → else email-match if policy + domain allows → else provision
  `User` if policy + domain allows → else `403`.
- **Two flows over one `Client`** (D4): *login* (anon → resolver → session) and
  *link* (authenticated user → attach `ExternalAccount` + upsert `Credential`).
- **Async/ASGI:** sync ORM under `sync_to_async(thread_sensitive=True)`; never a
  bare sync ORM call in an `async def` branch.

### IC4 — Seeds + managers
- Default `Vendor` catalogue via resources (master tier) — reconstruct P1's
  `010_default_vendors.yaml` as a resource (Google/Microsoft/Anthropic/OpenAI…).
- `Client` rows: seed *shape* (endpoints, scopes, `is_oidc`) but inject
  `client_secret` from **settings/env** (D11) — no secrets in resource files.
- Credential upsert writes the REBAC owner grant on first create, under
  `system_context` where no actor yet exists. **Do NOT lift P1's
  `PlainTextCredential` bootstrap** — it's superseded by the `static_token`
  credential kind (D3).

### IC5 — GraphQL (`src/angee/iam/schema.py`, hand-written)
- **`public`** — connected-accounts self-service: list my `ExternalAccount`s +
  `Credential` *status*; `linkAccountStart`/`linkAccountComplete`/`unlinkAccount`;
  OIDC `loginStart`/`loginComplete`. Secrets never projected.
- **`console`** — `Vendor`/`Client` admin CRUD (`crud()` + `permission_classes`),
  `ExternalAccount` admin view, credential health. Paginate every listing (OFFSET).
- Wrap login / `last_login` writes in `system_context`/`asystem_context`.

### IC6 — verify
`angee build` → `makemigrations iam` → `migrate` → `makemigrations --check`
(drift-clean) → `rebac sync` → `resources load` → seed → `schema --check`. pytest:
OIDC login provisions a non-superuser over **sync and async** paths; link/unlink
idempotency; credential refresh under fail-closed; admin-only `Client` CRUD;
secrets absent from every projection; `(vendor, external_id)` / `(user, client)`
uniqueness.

---

## 3. `integrate` runtime phases (`src/angee/integrate/`)

A new thin base addon, `depends_on = ('iam',)`.

### IR1 — Abstract bases (`integrate/models.py`, abstract sources)
- **`Capability`** (abstract): `account`→`iam.ExternalAccount` (PROTECT), `config`
  (JSON), `status` (`StateField`), use-telemetry (`last_used_at`/`_status`,
  `use_count_24h`, `error_count_24h`, `last_error`/`_at`). A `report_status()`
  that **pushes** to the account (D8). `rebac_resource_type` is left to the
  concrete domain subclass.
- **`Bridge(Capability)`** (abstract): + `cursor` (JSON), `poll_interval`,
  `subscription_state` (JSON), `next_subscription_refresh_at`, sync-telemetry; and
  the abstract `sync()`/`handle_webhook()`/`verify_webhook()`/`start_live()`/
  `stop_live()` contract. Domain subclasses implement them.
- These are **abstract bases consumed by other addons' concrete models** — the
  same cross-addon abstract-inheritance pattern as `base.AngeeModel`. `integrate`
  emits no concrete model from them.

### IR2 — Registry + scheduler (`integrate/registry.py`, `integrate/scheduler.py`)
- **Registry:** enumerate concrete `Capability`/`Bridge` subclasses across addons
  (deterministic, sorted order) via the addon model-discovery contract. Powers the
  cross-domain operator view (GraphQL union per the buckets mechanism) and feeds
  the driver — **the replacement for P1's single-table scan** (O3).
- **Scheduler:** `run_due_bridges()` iterates registered `Bridge` models, selects
  rows with `next_sync_at <= now` (N indexed queries, one per model — fine at the
  handful-of-types scale), runs `sync()` with cursor persistence, backoff, status
  push, telemetry. Pure logic; **trigger is operational** (D10, O2). All writes
  under `system_context` (framework op).

### IR3 — Webhooks (`integrate/models.py` concrete + `integrate/webhooks.py`)
- **`WebhookSubscription`** (`integrate/webhook_subscription`, sqid `whs`):
  `owner`→User (CASCADE), `target_url` (SSRF-gated), `secret` (EncryptedField,
  HMAC key), `event_kinds` (JSON), filters, `enabled`, delivery telemetry. The
  one concrete table `integrate` owns (D7).
- **Inbound:** vendor webhook → verify signature → dispatch to the right
  `Bridge.handle_webhook()`.
- **Outbound:** emit event kinds (`bridge.synced`/`errored`/`disabled`,
  `capability.errored`, `account.expired`/`revoked`) → at-least-once,
  HMAC-signed, SSRF-gated delivery. Event-kind catalogue lives here (D9).

### IR4 — Zed + settings + stack rows
- `integrate/permissions.zed`: `integrate/webhook_subscription` (owner relation +
  const-backed `admin`). `settings_defaults` for delivery/scheduler knobs (no key
  conflicting with `iam`'s `AUTH_USER_MODEL`/`REBAC_ACTOR_RESOLVER`/
  `AUTHENTICATION_BACKENDS` — the composer errors on conflicts). `docs/stack.md`
  rows for any new dep (e.g. the HTTP client / scheduler primitive).

### IR5 — verify
Build/migrate/`rebac sync`/`schema --check` clean. pytest: a fixture `Bridge`
subclass registers and is driven by `run_due_bridges()`; cursor persists across
runs; status push updates the `ExternalAccount` rollup; inbound webhook verify +
dispatch; outbound delivery is HMAC-signed and SSRF-gated; secrets absent from
projections.

---

## 4. Domain adoption (illustrative — built by per-domain lifts, not here)

This plan ships the **seams** (IR1–IR4) and the **connections** (IC1–IC5). Each
domain adopts when it is lifted:
- **agents:** `InferenceProvider(Capability)`; `InferenceVendor` OneToOne
  `iam.Vendor`; `AccountInferenceModel`→`iam.ExternalAccount`
  (P1 `addons/agents/.../models.py`).
- **connect:** `MailBridge(Bridge)`, `CalendarBridge(Bridge)`
  (P1 `addons/connect/docs/OVERVIEW.md`).
- **storage:** **O1** — does `storage.Backend` become a `Credential` consumer, or
  keep self-managing creds in `backend_config`? Today it bypasses the connection
  path (P1 `addons/storage/.../models.py`) — a DRY inconsistency to resolve at the
  storage lift, not here.

---

## 5. Sequencing & gates

1. **base gaps first** (owner=base): `EncryptedField` (hard prerequisite),
   SSRF URL validator, crud/changes coverage.
2. **`iam` connections** IC1 → **IC2 (full write schema)** → IC3 → IC4 → IC5 →
   IC6. Sequences **after `iam-roles-lift` B1–B3**. IC2 must precede IC5.
3. **`integrate` runtime** IR1 → IR2 → IR3 → IR4 → IR5. Can start once IC1
   (`ExternalAccount`) lands; full IR5 needs IC done (account status push).
4. **Domains** adopt in their own lifts (§4).
5. One phase ≈ one commit. Each backend phase: **`django-reviewer`**; structural
   slices: **`architecture-reviewer`**. This plan itself wants a
   **`plan-reviewer`** pass before execution.

---

## 6. Deferred / open

- **O1 — `storage.Backend` as a `Credential` consumer** vs self-managed
  (consistency call; storage lift).
- **O2 — scheduler trigger owner:** operator daemon vs the stack's periodic-task
  runner. Pick when the runtime process model is settled.
- **O3 — cross-domain "all capabilities health" view:** registry fan-out
  (default) vs a thin denormalized health-ledger row the `Capability` mixin
  write-throughs (fallback **only** if fan-out hurts — do not pre-build it; it
  would partly resurrect the table we dissolved).
- **O4 — third-party credential kinds / runtime-authored `Client`s:** the
  `CredentialKind` handler registry is the seam; ship built-in kinds only for now.
- **O5 — webhook outbound delivery** may later move to a general eventing system;
  the integration *event kinds* stay in `integrate` regardless.

---

## 7. Build slices (execution checklist)

Driven as a loop: **Codex builds each slice → I run the verify gate → `django-reviewer`
+ `architecture-reviewer` on the diff → fold findings (back to Codex for blockers,
direct fix for trivia) → re-verify → commit → next slice.** Codex verify is the
**backend gate only** (pytest + `manage.py` checks); never Storybook (sandbox-hangs —
[[codex-hung-job-restart]]). Restart a stalled Codex job rather than wait on its
notification. Lift hygiene applies to every slice (reconstruct, no provenance).

Slices are dependency-ordered. Domain adoption (§4) is out of scope — this build
ships `base` gap + `iam` connections + the `integrate` runtime seam only.

| # | Slice | Files | Verify gate |
|---|---|---|---|
| **S0** | `base.EncryptedField` | `base/fields.py`; `pyproject.toml` (cryptography explicit); `docs/stack.md` row reconcile (`EncryptedTextField`→`EncryptedField`, secret-by-type) | pytest: round-trip, ciphertext-at-rest, None, deterministic `deconstruct()` |
| **S1** | IC1 connection models | `iam/models.py` (Vendor, ExternalAccount, Client, Credential), `iam/credentials.py` (CredentialKind handler registry + built-in `oauth`/`static_token`), managers (`link`/upsert) | `angee build` → `makemigrations iam` (one) → `migrate` → `makemigrations --check` drift-clean |
| **S2** | IC2 Zed (author before GraphQL) | `iam/permissions.zed` (`auth/vendor`, `auth/external_account`, `auth/client`, `auth/credential` + const-backed admin + owner) | `rebac sync` clean; admin-write smoke (fail-closed) |
| **S3** | IC3 OIDC + resolver | `iam/oidc/{client,state,errors}.py`, `iam/identity.py`; `pyproject.toml` (pyjwt[crypto]) | pytest: discovery/exchange/verify (mocked); resolver provision under `system_context`, sync+async |
| **S4** | IC4 seeds + managers | Vendor resource (master tier); Client seed-from-settings; credential owner-grant | `resources load` seeds vendors; secret sourced from settings, never a file |
| **S5** | IC5 GraphQL | `iam/schema.py` (`public` connected-accounts; `console` Client/Vendor admin) | `schema --check`; secrets absent from every projection; admin-only CRUD |
| **S6** | IC verify gate | — | full `iam` gate + pytest connection suite |
| **S7** | IR1 integrate scaffold + abstract bases | `src/angee/integrate/{__init__,apps}.py`, `integrate/models.py` (abstract `Capability`/`Bridge`) | addon discovered; abstracts import; build clean (no concrete emitted) |
| **S8** | IR2 registry + scheduler | `integrate/registry.py`, `integrate/scheduler.py` (`run_due_bridges`, status push) | pytest: fixture `Bridge` registered + driven; cursor persists; status push updates `ExternalAccount` |
| **S9** | IR3 webhooks | `integrate/models.py` (WebhookSubscription), SSRF validator, `integrate/webhooks.py` (inbound routing, outbound HMAC delivery), event-kind catalogue | pytest: HMAC-signed + SSRF-gated delivery; inbound dispatch |
| **S10** | IR4 zed + settings + stack | `integrate/permissions.zed`, `settings_defaults`, `docs/stack.md` rows | `rebac sync`; no settings-key conflict with `iam` |
| **S11** | IR verify gate | — | full `integrate` gate |

Each slice ≈ one commit on `workspace/integration-lift`. S1 sequences after
`iam-roles-lift` B1–B3 ideally, but builds on the current minimal `iam` +
reconciles at merge if those land later (per the §0 posture).
