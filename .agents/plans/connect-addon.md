# connect — unified contacts + messaging addon

Status: architecture pass complete; names aligned to messaging/email prior art
(MIME, IMAP, JMAP, Gmail/Graph, Twilio/Front, schema.org). Awaiting go-ahead to
implement. This is the owner map and build plan for a new base addon
`angee.connect` plus per-source connection addons. It composes existing owners
(`integrate`, `iam`, `storage`, the GraphQL aggregate/CRUD toolkit, the
`@angee/base` view primitives) and only extends a framework owner where one is
genuinely missing.

## Intent

One domain for **parties** (people and organisations) and the **messages**
exchanged with them, across email and public social channels, synced from
external systems. The product surface:

- **Parties** — a contact list (list + board) of people/orgs.
- **Handles** — each party's reachable addresses/handles (email, phone, social
  handle) with a platform discriminator; list + board; synced from a directory.
- **Messaging** — threads and messages with smart aggregation/grouping lists,
  thread detail, and attachments.

## The organising idea

A **Handle** (one reachable address/handle of a party) is the single hinge
between contacts and messaging. A party *has* handles; a message's participants
*are* handles. So a directory sync (which fills in parties + handles) and a
channel sync (which fills in messages whose participants are handles) meet on one
model. Private (email) and public (social) messaging share one `Thread`/`Message`
pair, discriminated by a `modality` field — not separate tables.

## Naming is aligned to prior art

The model names match what the established standards/platforms call these things,
so the vocabulary works for an email, a WhatsApp message, and a YouTube comment
alike: `Channel` (Front/Twilio omnichannel), `Thread`+`Message`+`Part`
(JMAP/Gmail/MIME), `Participant` (Twilio), `Handle` (Front; avoids the IAM/JMAP
`Identity` collision), `PostalAddress`→`Address` and `ContactPoint`-concept,
`Party`/`Person`/`Organization` (the Party data pattern + schema.org),
`Affiliation`/`Reaction`/`MessageMetrics` (schema.org/X). Where a choice diverges
from prior art it is called out as a deliberate local extension, not borrowed.

## Levels and layout

`connect` is a **base addon** (inherited by every project), mirroring the
existing `*_integrate_*` family. Per-source bridges are base addons that
contribute a backend through a settings registry only — `connect` never imports
them; dependencies are one-way.

```
addons/angee/connect/                  # the domain: models, schema, permissions, web
addons/angee/connect_integrate_imap/   # backend: imap  → Channel (email)
addons/angee/connect_integrate_carddav/# backend: carddav → Directory (contacts)
addons/angee/connect_integrate_youtube/# backend: youtube → Channel (social)
addons/angee/connect_integrate_facebook/# backend: facebook → Channel (social, + inbound webhook)
# connect_integrate_whatsapp — schema-ready (a Channel backend key), NOT built in this slice
```

`connect.apps`: `depends_on = ("angee.iam", "angee.integrate")`.
Each `connect_integrate_<x>.apps`: `depends_on = ("angee.connect", "angee.integrate")`,
an `autoconfig.py` dotted-key registry row, a `backend.py`, and an empty
`models.py` (stable discovery target).

Naming note: `integrate` already uses **connect** as its OAuth-attach verb
(`connectIntegration`, `connectAccount*`). The `connect` *addon* is the
contacts/messaging domain; the two coexist at different layers. The addon is named
`connect` (the product term) and never exposes a `connect*` GraphQL/action verb
(those stay `integrate`'s) — the clash is confined to the package label.

## Architecture gate

**Owner map** (the fact → its owner):

- Connection identity, credential, status, owner, vendor, connect/attach
  lifecycle, list/group surfaces → **`integrate.Integration`** (MTI parent). Our
  connection kinds (`Channel`, `Directory`) are child models.
- Incremental sync state (cursor, poll cadence, `next_sync_at`, sync telemetry,
  `sync()`/`handle_webhook()`/`dispatch_inbound()`/`start_live()` contract) →
  **`integrate.Bridge`** (abstract). `Channel`/`Directory` subclass it.
- Which protocol adapter a connection uses → a role-named **`backend_class`
  `ImplClassField`** on each child, resolved from a per-kind settings registry a
  source addon contributes to via `autoconfig` (the `ANGEE_VCS_BACKEND_CLASSES`
  pattern).
- Secret material (passwords, OAuth tokens) → **`integrate.Credential`** + the
  credential-kind handler registry. A new basic-auth kind extends that registry at
  the framework level.
- File bytes for attachments + media → **`storage.File`** (content-addressed — the
  "Blob"), referenced directly by a `Part`.
- List/board grouping + "smart aggregation" → **`rebac_aggregate_builder`**
  (`group_by_fields`) in `schema.py`; live updates → **`changes()`**.
- List/board/grouped rendering, thread detail, relation follow → **`@angee/base`**
  `DataPage`/`GroupListView`/`FormView` `recordTabs` + `model:`-tagged routes.
- Party kind / handle platform / message status / part type & disposition enums →
  **model-owned `TextChoices` via `StateField`**.
- Periodic execution of due bridges → **`integrate` scheduler** (`run_due_bridges`
  already exists; we add the driver that ticks it — framework level).

**Sibling inventory** — the shapes we are copying, not inventing:

- `integrate.VcsBridge` / `agents.InferenceProvider` = `Integration` child +
  `Bridge` + `backend_class`. Our `Channel`/`Directory` are the same shape.
- `integrate_github` / `agents_integrate_anthropic` = backend-only addon
  (autoconfig dotted-key row, `backend.py`, empty `models.py`). Our
  `connect_integrate_*` are the same.
- `storage.Backend.backend_class` = adapter-over-common-shape `ImplClassField`.
- `notes` = the canonical model+schema+permissions+web addon. Our domain models
  follow its bases (`SqidMixin, AuditMixin, AngeeModel`), its `schema.py`
  (`crud`/list/filter/order/aggregate/`changes`), and its `permissions.zed`.
- `storage` `FileBrowserContent` = parent→children nested collection + previewer,
  the template for Thread→Messages and message attachments.

**Dependency check** — new third-party libraries (each needs a `docs/stack.md`
owner row in the same change; none added silently):

- `imapclient` — IMAP protocol client (basic-auth, UID fetch). Essential.
- `mailparser` — RFC-822 → structured email (headers, parts, attachments).
  Essential. (`mailparser-reply` for quoted/signature splitting is optional; the
  body-tree split + signature/quote `role` detection can also be done with stdlib
  `email` + a small heuristic — keep the dependency surface minimal, decide at
  build.)
- `vobject` — vCard parse/serialise (round-trips CardDAV). Essential.
- `google-api-python-client` — YouTube Data API ergonomics. **Optional**: the
  same calls are plain HTTPS over the shared outbound-HTTP client (prereq #6).
  Drop this unless the Data API surface proves painful.
- Facebook Graph + CardDAV + YouTube HTTP → the **shared SSRF-pinned outbound-HTTP
  client** (prereq #6), no new dep. Note: `integrate/net.py` is SSRF *validation*
  only, not a client — there is no outbound-HTTP owner today (`integrate_github`
  hand-rolls `http_get` over `http.client` at `backend.py:188`, and
  `integrate/webhooks.py` has a second pinned POST client). Prereq #6 creates the
  missing owner; until it lands, do not describe `net.py` as a client.
- No `requests`, no `caldav`, no `facebook-sdk`, no `neonize` in this slice.

**Deletion check** — this is a new capability, so it adds lines; the offsetting
discipline is that it carries **no** bespoke infra: no hand-rolled encrypted
secret store (uses `Credential`), no hand-rolled sync-cursor table (uses
`Bridge.cursor`), no hand-rolled file/blob store (uses `storage.File`), no
hand-rolled grid/board/list (uses `@angee/base`), no DRF surface (GraphQL only).
Prior-art alignment collapsed the `TextPart`/`AttachmentPart` MTI into **one `Part`**
(the working model's shape; `Fragment` retained as the shared content store) and two
edge tables into **one `MessageEdge`**.

**Naming check** — one concept, one name, prior-art-aligned:
`Party`/`Person`/`Organization`, `Handle` (the contact-point; doubles as message
participant), `HandleMatch` (soft same-person merge), `Address` (physical/postal),
`Affiliation`, `Channel`/`Directory` (connection kinds), `Thread`, `Message`,
`Participant`, `Part` (one MIME-faithful body node), `MessageEdge`, `Reaction`,
`MessageMetrics`. Two enforceable disambiguation rules for nouns that exist
elsewhere:

- **`connect` never exposes a `connect*` GraphQL mutation or `<Action>` verb** —
  those stay `integrate`'s OAuth-attach verbs.
- **`Channel`** (locked) is the omnichannel term (Front/Twilio/Zendesk) for a
  connected conversation source; it overlaps *conceptually* with the `channels` ASGI
  library but never in code (`connect.Channel` model vs the `channels` package).
- **`Handle`** (not `Identity`) for the contact-point — `Identity` collides with
  IAM's "who the actor is" and with JMAP's `Identity` ("an address you send as").
  `Handle` is Front's term and carries no collision.

## Domain model

All models: `class X(SqidMixin, AuditMixin, AngeeModel)`, `runtime = True`, unique
3-letter sqid prefix, `Meta(abstract=True, ordering=…, rebac_resource_type=…,
rebac_id_attr="sqid")`, a `permissions.zed` `definition`, and a `schema.py` entry.
Cross-model FKs are symbolic strings (`"connect.Party"`, `"storage.File"`,
`"integrate.Integration"`, `settings.AUTH_USER_MODEL`).

### Contacts

- **`Party`** — MTI parent (`runtime=True`). Owns common contact identity: the
  sqid, ownership (`AuditMixin.created_by`), `display_name`, structured name parts
  (`name_prefix`, `given_name`, `additional_name`, `family_name`, `name_suffix`),
  `nickname`, `birthday`, `anniversary`, `notes`, `avatar` (FK `"storage.File"`),
  denormalised `handle_count`/`message_count`/`last_message_at`, `merged_into`
  (self-FK), and lossless-vCard carriers: `raw_vcard` (TextField) + `extensions`
  (JSON for `IMPP`/`GEO`/`X-*`/etc.). `kind` is the child discriminator.
  - **`Person`** / **`Organization`** — `extends = "connect.Party"`, `runtime=True`
    MTI children adding kind-specific fields. Board/list run over `Party`.
- **`Handle`** — the contact-point; one model, `StateField platform` discriminator
  (`email`/`phone`/`whatsapp`/`youtube`/`facebook`/`other`). Fields: `platform`,
  `value` (the email/number/handle string), `external_id` (platform's stable opaque
  id — distinct from the display value; uniqueness keys on it for public handles),
  `display_name`, `label` (home/work/cell — promoted to a real field),
  `is_preferred` (the party's preferred contact method), `is_own`, `is_verified`,
  `metadata` JSON, and `party` — a **denormalised resolved pointer** to the owning
  party (maintained by `PartyHandle`'s manager; nullable until resolved). Unique
  `(platform, value)` and `(platform, external_id)` (where non-empty). **This row is
  also the messaging participant** (`Participant.handle`, `Message.sender`).
  (schema.org `ContactPoint`; Front `handle`.)
- **`PartyHandle`** — the confidence-bearing **party↔handle link** (the proven
  contacts-sync shape): `party` FK, `handle` FK, `confidence` (0..1), `source`
  (manual/import/email_match/llm/oauth/carddav), `is_confirmed` (human-confirmed —
  named to avoid colliding with `Handle.is_preferred`), `is_dismissed`
  (human-rejected), `metadata`. Unique `(party, handle)`. A handle may carry several
  scored candidate parties, so sync surfaces an uncertain match as a weak (~0.3) link
  instead of silently picking one; a human confirms or rejects; the **resolved owner
  = the highest-confidence, non-dismissed link**, which the `PartyHandle` manager
  materialises onto `Handle.party`. This **replaces** both a bare `Handle.party` FK
  and a separate handle↔handle match table: cross-platform "same person" suggestions
  are weak links to a shared party (solving the unstable-public-id problem), and
  party-level merges use `Party.merged_into`. The resolve/reconcile flow lives on the
  `PartyHandle` manager — the mapper's `Handle.objects.upsert_from(...)` creates and
  rescores these links. Carry the working contacts model's exact semantics: the
  **conflict path writes a weak `confidence=0.3` link** (with a reason) instead of
  silently reassigning a handle claimed by another party, and resolution orders
  `-is_confirmed, -confidence` skipping merged/dismissed — that ordering is what the
  manager materialises onto `Handle.party`.
- **`Address`** — physical/postal (schema.org `PostalAddress`). `party` FK,
  `label`, `po_box`, `extended`, `street`, `city`, `region`, `postal_code`,
  `country`, `latitude`/`longitude`, `is_primary`. Dropping the working model's
  `(party, label)` uniqueness lets multiple same-labelled addresses survive (a vCard
  can carry two "home" `ADR`s — a fidelity fix), **but that breaks the CardDAV
  mapper's `update_or_create(party, label)` idempotency** — re-sync would append a
  new row each time. **Decided: drop the constraint (fidelity — multiple same-labelled
  addresses) and re-key the CardDAV mapper on `(party, label, street)` / the vCard
  line UID for idempotency.**
- **`Affiliation`** — person↔organisation membership (schema.org `affiliation`).
  `party` FK, `organization` FK (a `Party`, nullable) + `organization_name`
  free-text fallback, `role`, `title`, `department`, `started_at`, `ended_at`,
  `is_primary`. Carries vCard `ORG`/`TITLE`/`ROLE`.

vCard losslessness: typed fields cover `FN`/`N`/`NICKNAME`/`BDAY`/`ANNIVERSARY`/
`EMAIL`/`TEL`/`ADR`/`ORG`/`TITLE`/`ROLE`/`NOTE`/`URL`; everything else
(`PHOTO` → a `storage.File`; `CATEGORIES`/`IMPP`/`GEO`/`TZ`/`X-*` → `extensions`)
plus the verbatim `raw_vcard` guarantee round-trip.

### Connections (Integration child models — the bridges)

Each is `class X(Bridge)` with `runtime=True`, `extends="integrate.Integration"`
(MTI child → inherits owner/vendor/credential/status/telemetry) and a role-named
`backend_class`. `Bridge` already gives `config`/`cursor`/`poll_interval`/
`subscription_state`/`next_sync_at` + the `sync()`/`handle_webhook()`/
`dispatch_inbound()`/`start_live()` contract. The scheduler discovers both via
`bridge_models()` automatically.

- **`Channel`** — a connected **conversation source** (email mailbox, social
  account). `backend_class` registry `ANGEE_CONNECT_CHANNEL_BACKENDS`
  (`email`/imap, `youtube`, `facebook`; `whatsapp` later). Folder/UID sync state
  (email) or feed cursor (social) lives in `cursor` JSON. **`is_active` is a
  first-class field, not optional** — the working model enforces it: new channels
  start inactive and the scheduler polls only active ones. It's the runaway-sync
  gate (don't auto-pull a 200k-message mailbox or a whole YouTube back-catalogue
  before the user confirms) and applies to email too, not just social. (We drop the
  working model's dead `etag`/`feed_type` columns — confirmed never used;
  conditional-GET, if ever built, lives in `cursor`.) Polling/receiving on a Channel
  discovers `Thread`s → `Message`s. (One model for email + social — the
  `VcsBridge`-for-all-git-hosts precedent — because the difference is *backend
  behaviour*, not persisted shape.)
- **`Directory`** — a connected **contact source** (CardDAV address book).
  `backend_class` registry `ANGEE_CONNECT_DIRECTORY_BACKENDS` (`carddav`).
  ctag/sync-token in `cursor`. Produces `Party`/`Handle`/`Address`/`Affiliation`.

Each source addon's `backend.py` defines a `ConnectSourceBackend`-subclass adapter
(a `VCSBackend` analog) that reads `self.bridge.credential` +
`self.bridge.config`/`cursor` and does the protocol I/O over the shared HTTP client
(prereq #6) or `imapclient`. **DRY split:** `transport` (wire protocol) and
`parse` (vendor payload → a neutral dataclass) are **per-source**; the `map` stage
(neutral dataclass → `connect` rows) is the **same write for every source**, so it
lands on `connect` **model managers** (`Handle.objects.upsert_from(...)`,
`Thread.objects.resolve(...)`, `Message.objects.ingest(...)`), not re-expressed in
each backend. So the four backends share one upsert/dedup/threading write path;
`orchestrate` (cursor load, batch, save) is the thin per-source `sync()`. The
**mapper-on-managers is the single funnel** both polling and webhooks converge on.

### Messaging

- **`Thread`** — aggregation root, **two orthogonal axes** (the working messaging
  model kept them separate; cross-check verdict #7): `StateField modality`
  (`email_thread`/`direct`/`group`/`public_thread` — the *shape*) **and** `StateField
  visibility` (`public`/`unlisted`/`private`/`restricted`, default `private` — *who
  can see it*). Collapsing to modality alone can't express an unlisted/members-only
  video, which public social really has. For public threads it *is* the subject
  post: `channel` FK (`"integrate.Integration"` — the owning Channel), `external_id`
  (anchor = video/post/thread id), `subject` (title), `body`, `subject_url`,
  content-type `tags`, self-FK `parent`, denormalised `message_count`/
  `last_message_at` (maintained with `F()` — see Invariants) + thread-level metric
  rollups (an improvement; the working model kept these in JSON). (Term matches
  JMAP/Gmail/Nylas `Thread`.)
- **`Message`** — the unit. `thread` FK, `channel` FK, `sender` FK (`Handle`),
  self-FK `parent` (reply pointer / comment hierarchy — In-Reply-To, RFC 5322),
  `platform`, `direction` (inbound/outbound/internal), `StateField status`
  (`draft`/`sent`/`synced`/`edited`/`hidden`/`removed`/`failed` — public moderation
  lifecycle), `external_id` (the ingestion-dedup key — **unique on `(platform,
  external_id)` alone, NOT scoped to thread**; see Invariants), `subject`,
  `preview`, `sent_at`, `received_at`, `metadata` JSON (incl. the raw to/cc/bcc
  recipients — the lossless source behind `Participant`), `HistoryMixin`. The **root
  post is itself a `Message`** (`is_original_post`), repliable inline. The `status`
  set covers IMAP + social for v1; **`delivered`/`read` receipts are reserved for
  the WhatsApp slice** (the working chat model had them), and a successful outbound
  reply maps to one status (`sent`) — the working social model keyed
  reply-success on this, so keep it single. Body is the `Part` tree (below).
- **`Part`** — one recursive body node. This is the MIME/JMAP/Gmail
  `EmailBodyPart`/`MessagePart` shape (one object + discriminators) **and exactly
  what the working messaging model uses** — a single `Part` with a `role` and *at
  most one* content reference, **not** MTI children. Fields: `message` FK, self-FK
  `parent`, `position`, `type` (MIME content-type; `multipart/*` = a container),
  `disposition` (`inline`/`attachment` — RFC 2183), `cid` (Content-ID for inline
  images — RFC 2392), `name` (filename), `role` (`body`/`quoted`/`signature`/
  `header`), and the content ref: **`fragment` FK (→`Fragment`, for text parts) or
  `file` FK (`"storage.File"`, for byte parts)**. One model, not MTI — `type`/`role`
  is a genuine discriminator. **Attachments** are `Part`s with
  `disposition=attachment` + `file`; **inline images** are `disposition=inline` +
  `cid`. Sync ingests attachment bytes into a dedicated `connect` storage drive via
  storage's server-side ingest verb (prereq #4); previewers (`PreviewPane`, storage
  PDF/media/HEIC) work off the `storage.File`.
- **`Fragment`** — the **content-addressed text store** a text `Part` references:
  `text`, `hash` (SHA-256, unique), `kind` (paragraph/quote/signature/code/header).
  **Kept after cross-checking the working model (dropping it was my error).** Email
  threads re-quote the same paragraphs in every reply, so a hashed shared row (a)
  **dedups that text duplication**, (b) makes the quotation graph a cheap **FK-join**
  (two messages quote-link iff their parts share a `Fragment`) not a string self-join
  over millions of rows, and (c) isolates **signatures** (one repeated signature →
  one `Fragment`, excluded from search/quotation). JMAP factors content out of the
  part tree into `bodyValues`/`Blob` for the same reasons, so this is *aligned*, not
  a divergence. **`kind`-vs-`role` settled by the cross-check:** the working model
  keeps the label in **both** places, and **`Part.role` is the primary filter axis**
  — the search-vector excludes `role IN ('quoted','signature')` and the quotation
  pass filters on it — while `Fragment.kind = signature` is the *secondary* skip in
  the quotation builder. Carry both, with `role` as the query axis.
- **`MessageEdge`** — one typed cross-message graph that **unifies what the working
  model split into two tables** (a *derived*, fragment-keyed quotation edge and an
  *explicit*, platform-declared reference edge). Fields: `src`/`dst` `Message`,
  `StateField kind` (`reply`/`quote`/`mention`/`crosspost`/`forward`/`duplicate`),
  **nullable `fragment` FK** (set on derived quote edges), `confidence`. This single
  table works *only because* it keeps the `fragment` FK + `confidence` and
  **both-direction indexes** (`(src,dst)` and `(dst,src)` — the working BFS needs
  both); model the quote rows on the proven *derived* semantics, **not** on v0's
  same-named but vestigial table. `Message.parent` stays the single-parent reply
  pointer; `Thread` is membership; `MessageEdge` carries the M2M/derived relations.
  The **quotation graph** = messages whose `Part`s share a non-boilerplate `Fragment`
  (skip `Fragment`s referenced by > 100 messages — the working model's load-bearing
  cutoff; without it a repeated disclaimer quote-links the whole corpus), writing
  `MessageEdge(kind="quote", fragment=…, confidence=…)`. The three manager methods
  are ported verbatim onto the edge's manager: `create_for_message` (the >100 cutoff
  + timestamp-derived direction), `graph_from` (bulk BFS, both-direction), and the
  thread-inference that assigns an unthreaded message to the **majority thread among
  its BFS neighbours**. Shared-`Fragment` FK-join, not a string self-join;
  DB-agnostic, no vector/FTS.
- **`Participant`** — explicit `Handle`-keyed junction (Twilio term): `thread`/
  `message`, `handle`, `role` (from/to/cc/bcc + author/owner/moderator/viewer),
  `joined_at`/`left_at`. **This is a deliberate new bet, not a reversion** — one
  working model derived recipients from `Message.metadata` JSON and the other's
  participant junction was vestigial (always `role=sender`, never read). We adopt
  explicit rows *because the inbox's group-by-participant aggregation needs queryable
  membership that JSON can't give* — but we **retain the raw to/cc/bcc in
  `Message.metadata`** as the lossless source, with `Participant` as its queryable
  projection (the IMAP mapper must now write cc/bcc rows neither working model did).
- **`Reaction`** — attributed (`message`, `handle`, `reaction`); distinct from the
  rolled-up `MessageMetrics`. (Matrix `m.reaction`.)
- **`MessageMetrics`** — OneToOne `Message`: `view_count`/`like_count`/
  `repost_count`/`quote_count`/`reply_count`/`bookmark_count` (the public metrics a
  private message lacks). Flat 1:1, **not MTI** — the metric set overlaps heavily
  across platforms (X `public_metrics`, YouTube `statistics`); platform extras go in
  a `metadata` JSON. (schema.org models these as `InteractionCounter`.)

### Public-messaging accommodations (folded into the above)

Subject-post-as-thread (anchor id/url/title/body); root-post-as-Message;
`status` moderation states (`hidden`/`removed`/`edited`) + a removal-diff on full
sync; two-level threading with the reply-target id stored in `Message.metadata`
(the platform's reply target ≠ the message's own id); `MessageMetrics` +
attributed `Reaction`s; `Channel` activation gate (social); deferred per-credential
quota accounting (see below); `PartyHandle` weak links for unstable public ids;
`raw`-payload retention in `metadata` for re-mapping.

## Invariants carried from the working model (battle scars — do not re-lose)

The cross-check against the two working implementations surfaced facts that look
small but each fixed a real production bug; the reconstruction must carry them on
the model + the mapper-on-manager write path, or it reintroduces a solved problem.

- **Ingestion dedup is `(platform, external_id)` unique — and `Message`'s is NOT
  scoped to the thread.** The working model has *four* dedup migrations; the last
  widened `Message`'s constraint from `(thread, platform, external_id)` to
  `(platform, external_id)` because the same comment surfaced under two threads.
  Put explicit unique constraints on `Handle (platform, value)` + `(platform,
  external_id)`, `Thread (platform, external_id)`, and **`Message (platform,
  external_id)`** (not thread-scoped). All upserts are `update_or_create` on these
  keys — the constraint is what makes re-sync idempotent.
- **Strip null bytes (`\x00`) before every Postgres write.** Email bodies routinely
  contain `\x00`, which Postgres rejects in text/JSON columns — the working IMAP
  mapper strips them recursively on subject/body/metadata. Without it the IMAP sync
  hard-fails on write. Lives on `Message.objects.ingest`.
- **`select_for_update` in `Thread.objects.resolve`.** Two concurrent IMAP batches
  resolving the same normalised subject will double-create a thread without the row
  lock — the working model locks during subject-match + the final get-or-create.
- **Email thread resolution is a 4-step priority** (the working model's, RFC 5322):
  `In-Reply-To` → `References` walked right-to-left → normalised subject (strip
  `Re:`/`Fwd:`/…) → new thread. `Thread.objects.resolve` must implement exactly this
  for the email modality.
- **Denormalised counters bump with `F()` (batched deltas), never read-modify-write.**
  `Party.message_count`/`handle_count`, `Thread.message_count`/`last_message_at` are
  maintained with `F()+1`, accumulated per batch and flushed once — the working
  model's throughput pattern.
- **The ingest write path is batch-mode.** Preload known `external_id`s per platform
  and keep per-batch handle/fragment caches, or a large-mailbox sync is O(n) queries.
  `Message.objects.ingest` supports a deferred/flush batch mode.
- **If quota state lands in `Bridge.cursor` (deferring the `Quota` table), keep it
  atomic.** The working `consume_quota` is `transaction.atomic` + `refresh_from_db` +
  `F()`; parallel feed tasks race a non-atomic counter.

Vestigial in the working code — **deliberately NOT carried** (cross-check confirmed
zero live usage): a handle↔handle link table, a same-named unused `MessageEdge`, a
sender-only participant `role` enum, `Feed.etag` (no conditional-GET) and
`feed_type` (rss never built).

## Framework prerequisites (land at the owning level, not in `connect`)

Each is a small extension of a base owner, sequenced before/alongside the slice
that needs it. Treat them as separate reviewable changes.

1. **`integrate` — pluggable basic-auth credential kind.** A
   `CredentialKind.BASIC_AUTH` handler (host/user/password in the existing
   `material` JSON; `validate`/`auth_headers`). Needed by IMAP + CardDAV. The
   handler registry is import-time only today; make addon registration possible
   (an `AppConfig.ready()` import, or — cleaner — a settings-backed registry
   mirroring `ImplClassField`). Decide at build; prefer the smaller move.
2. **`integrate` — inbound-webhook HTTP entry point.** A view/URL that verifies a
   provider webhook (verify-token GET handshake + HMAC POST signature), resolves
   the owning bridge by the platform account id in the payload, and calls
   `bridge.dispatch_inbound(...)`. Generic; needed by Facebook now, WhatsApp later.
   `Bridge.handle_webhook`/`verify_webhook`/`dispatch_inbound` already exist — this
   wires the missing HTTP edge.
3. **`integrate` — background sync driver** (decision #3: build now). The owned,
   thin piece is a `manage.py integrate run-due-bridges` command calling the
   existing `run_due_bridges(now)`. The **periodic trigger is genuinely un-owned**
   and is a hard precondition gate on slice 3 (IMAP) — the operator daemon has
   **no** interval/cron mechanism today (verified), so "an operator tick" is not a
   real option yet. The choices, each needing the **same architect sign-off as
   locking Celery**: (a) an external scheduler/cron invoking the command; (b) an
   in-process ASGI-lifespan ticker that offloads each blocking `bridge.sync()` to a
   thread (a new scheduling primitive — escalation-grade); (c) Celery+beat
   (`docs/stack.md` *proposed → locked*). Recommend (a) first (smallest, no new
   primitive); state which slice 3 assumes before building it. The command benefits
   every `Bridge` (VCS included), which is why it lives in `integrate`.
4. **`storage` — server-side ingest verb.** A trusted, token-free
   `File.objects.ingest_bytes(stream, …)` doing draft→write→finalize under an
   elevated/owner actor, for sync pulling attachment bytes. Today's path is gated
   for a human uploader (`_authorize_push` requires a user actor); the storage
   module already anticipates this "sibling source." Until it lands, sync runs
   ingestion under `actor_context(<connection owner>)`.
5. **`@angee/base` — `AttachmentChip` primitive** (+ a small attachment list/
   composer over `UploadDropTarget` + `PreviewPane`). Building it in `connect`
   would be the hand-rolled-copy anti-pattern. (Multi-hop relation group axes,
   e.g. `thread__channel`, are a second possible base extension — only if a
   messaging view needs a two-hop group; single-hop is already covered.)
6. **`integrate` — shared SSRF-pinned outbound-HTTP client.** No outbound-HTTP
   owner exists today: `integrate_github.http_get` (`backend.py:188`, `http.client`
   GET) and `integrate/webhooks.py` (a pinned POST client) are two hand-rolled
   copies, and `net.py` only validates addresses. Promote one request helper at the
   `integrate` level owning method/headers/timeout over the existing `net.py` SSRF
   validators (GET + POST). CardDAV/YouTube/Facebook backends compose it instead of
   each re-hand-rolling a GET — and it unlocks collapsing the two existing copies (a
   real deletion). Build it before any HTTP-fetching backend (slice 2).

## GraphQL + REBAC

- Per model: `@strawberry_django.type` bound to the runtime model, `crud()`,
  `offset_paginated` list, `filter_type`/`order_type`,
  `rebac_aggregate_builder(group_by_fields=…)` for board/inbox grouping, and
  `changes(Model, field="<model>Changed")` on the console schema for live updates.
  Every group-by axis is also a filter field.
- Messaging "smart aggregation/grouping": `Message` aggregate `group_by_fields`
  include `thread`, `sender`/party, `channel`, `status`, `sent_at`, `platform`;
  `Thread` groups by `channel`/`modality`/`last_message_at`. Single-hop FK axes echo
  the related public sqid (relation facets derive from SDL client-side
  automatically).
- `Part` exposes as a single GraphQL type with `type`/`disposition`/`role` fields
  (no union needed — one model). `text` is intersected out of any list projection
  for size.
- `permissions.zed`: each owned row gets a `definition` with
  `owner: auth/user // rebac:field=created_by`, `editor`/`reader`,
  `admin: angee/role // rebac:const=admin`, `create=authenticated`. Messaging rows
  reach through their thread/channel where natural. Sync writes run under the
  connection owner's actor (and `row.sudo()` where a preflight gates the insert).

## Frontend (`addons/angee/connect/web` — compose only)

- `defineBaseAddon` manifest: a `consolePage`-style helper emitting list + `$id`
  record routes for `connect.Party`, `connect.Handle`, `connect.Thread`/
  `connect.Message`; each **collection** route tagged `model:` so relation
  follow-arrows resolve. Menu tree + icons.
- **Parties (list + board)** and **Handles (list + board)**:
  `DataPage model=… placement="inline" routed` with `<List list={GroupListView}
  defaultGroups={{ board:{field:"kind"|"platform"}, list:{field:"createdAt",
  granularity:"month"} }}>` + `<Column>`s + a `<Form>`. Party detail uses
  `recordTabs` for the Handles/Addresses/Affiliations nested lists (filtered by
  `party`, `createDefaults` seeding the FK).
- **Messaging**: cross-thread "smart aggregation" inbox = `GroupListView` grouped
  by thread/party/channel/status (backend `group_by_fields` + `useRelationFacet`).
  Thread detail = `FormView` with a `recordTabs` Messages list filtered by `thread`;
  attachments (the `Part`s with `disposition=attachment`) via the new
  `AttachmentChip` + `PreviewPane`.
- No hand-rolled grid/list/board/detail; gaps fixed in `@angee/base` (prereq #5).

## Deliberately out of scope / deferred

- **WhatsApp** (decision #2) — schema-ready (a `Channel` backend key reserved,
  session-blob credential kind noted); not wired. If/when built, prefer the
  official Cloud API (token + prereq #2 webhook) over a live-socket transport with
  a heavy non-stack dependency.
- **Semantic + full-text search** (decision #1, tier 3) — message embeddings / FTS
  deferred; would require locking `pgvector` + pinning PostgreSQL (a stack change).
  The aggregate group-by + quotation graph cover "smart grouping" without them.
- **Per-credential API quota** — defer the **table**, NOT the **logic**. The
  cross-check is explicit: YouTube's sync **hard-gates** on quota (10k units/day,
  `search` = 100 units each — a single unbudgeted sync blows the day in ~100 calls
  and fails mid-run), so the YouTube backend MUST carry budgeting (per-op unit costs,
  midnight-PT period, check-before-page, bail-on-exhaust) in `Bridge.cursor` —
  atomically (see Invariants). Facebook uses no quota (rate-limit errors only), so it
  needs none. At slice 4, decide whether the budgeting state graduates from `cursor`
  to a credential-scoped `integrate` model. "Defer" here means *relocate to cursor*,
  not *skip*.
- Community-detection / LLM auto-grouping / topic-mindmap analytics — not part of a
  contacts/messaging capability.

## Phasing

1. **Framework prerequisites** (separate reviewable changes): #1 basic-auth
   credential kind, #6 shared HTTP client, #4 storage ingest verb, #2 inbound-webhook
   entry point, #3 sync driver, #5 `AttachmentChip`. Land the ones a given slice
   needs first (#6 before slice 2; #1 before slice 2/3; #3 gates slice 3).
2. **`connect` contacts core**: `Party`/`Person`/`Organization`/`Handle`/
   `HandleMatch`/`Address`/`Affiliation` + schema + permissions + web (Parties &
   Handles list/board/detail) + `connect_integrate_carddav` (Directory bridge,
   basic-auth, vobject; the simplest end-to-end source).
3. **`connect` messaging core**: `Channel`/`Thread`/`Message`/`Part`/`Participant`/
   `MessageEdge`/`Reaction`/`MessageMetrics` + schema (aggregates, `changes`) + web
   (inbox aggregation + thread detail + attachments) + `connect_integrate_imap`
   (Channel/email bridge, imapclient/mailparser, body→Part tree + Fragment dedup,
   quotation pass).
4. **Public social**: social `Channel` backends `connect_integrate_youtube` (OAuth)
   + `connect_integrate_facebook` (OAuth + inbound webhook), reusing prereqs #2/#3;
   decide quota placement here.

**Green-field hygiene (carry into implementation):** the `connect_integrate_*`
backend docstrings, seed YAML, code comments, and commit messages name things from
the domain only — no origin/prototype vocabulary anywhere in shipped artifacts.

## Verification (per slice, from the repo root)

```
uv run examples/notes-angee/manage.py angee build
uv run examples/notes-angee/manage.py makemigrations base connect integrate storage
uv run examples/notes-angee/manage.py migrate
uv run examples/notes-angee/manage.py rebac sync
uv run examples/notes-angee/manage.py resources load
uv run examples/notes-angee/manage.py schema --check
uv run python -m pytest tests
pnpm run typecheck && pnpm run test && pnpm run build
# then `angee dev` from the workspace root for a live check
```

## Decisions log

1. Message body carries content-addressed dedup + a quotation graph; no vector/FTS
   tier.
2. WhatsApp deferred; v1 sources = IMAP, CardDAV, YouTube, Facebook; schema stays
   WhatsApp-ready (a `Channel` backend key).
3. Background sync scheduler wired now (driver command in `integrate`); the periodic
   runner mechanism gates slice 3 and needs architect sign-off — no locked
   dependency added without that call.
4. `Handle` (not `Identity`) = the contact-point/message participant; `Address` =
   physical/postal. (Prior art: `Identity` collides with IAM + JMAP `Identity`.)
5. **Names + body model aligned to messaging/email prior art** (MIME RFC 2045–2183,
   IMAP RFC 9051, JMAP RFC 8620/8621, Gmail/Graph, Twilio/Front, schema.org/X):
   - body is **one `Part`** (type/role + disposition discriminator) — the working
     model's shape *and* the unanimous MIME/JMAP/Gmail shape; only the
     `TextPart`/`AttachmentPart` MTI was collapsed. **`Fragment` is retained** (the
     working model's content-addressed text store: dedup + FK-join quotation +
     signature isolation; JMAP-aligned via `bodyValues`/`Blob`). A text `Part` →
     `Fragment`; a byte `Part` → `storage.File`;
   - `Thread` kept (JMAP/Gmail/Nylas) over `Conversation`;
   - connection kinds are `Channel` (Front/Twilio) + `Directory` (LDAP/Google),
     replacing `Mailbox`/`Feed`/`AddressBook` (and merging email+social into one
     `Channel`);
   - `MessageMetrics` (X `public_metrics` / schema.org `InteractionCounter`)
     replaces `EngagementStats`, flat 1:1.
6. **Cross-checked against the two working implementations** (the auditable baseline,
   not just prior art). Confirmed safe: single `Part`+`Fragment`, `MessageMetrics`
   flat 1:1, one `Channel`, connection-only cursor, dropping the vestigial
   handle↔handle/`MessageEdge`/`etag`/`feed_type`. Corrected back toward the working
   model: `Fragment` restored; `Thread.visibility` re-added as a second axis;
   `MessageEdge` must keep the `fragment` FK + both-direction indexes + the three
   quotation manager methods + the >100-msg cutoff; `Message` dedup is `(platform,
   external_id)` un-scoped; null-byte strip, `select_for_update`, `F()` counters, the
   4-step email thread resolution, and batch-mode ingest are mandatory write-path
   invariants (see *Invariants carried from the working model*). **Decided (your
   calls):** adopt explicit `Participant` (+ retained JSON recipients as the lossless
   source); defer the quota *table* but keep the *logic* budgeting in `Bridge.cursor`;
   drop `Address` `(party,label)` uniqueness and re-key the CardDAV mapper on
   `(party,label,street)`/vCard UID; reserve `delivered`/`read` for the WhatsApp slice.

## Open items

- Sync-driver runner mechanism (prereq #3) — architect call.
- Whether `mailparser-reply` earns a stack row or the body split stays stdlib —
  decide when building slice 3.
- Whether YouTube needs `google-api-python-client` or routes through the shared HTTP
  client — decide when building slice 4 (prefer the latter).
- Credential-kind registration mechanism (ready-import vs settings registry) —
  decide when building prereq #1 (prefer the smaller).
