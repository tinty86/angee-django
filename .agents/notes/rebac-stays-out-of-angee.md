# REBAC stays out of Angee

**Decision (2026-05-29 design session, greenfield rebuild).** The Angee framework and its
composed models must carry **zero REBAC semantics**. Authorization is a self-contained layer
provided by `django-zed-rebac` — a sibling repo the team **owns** (`../django-zed-rebac`) — that
introspects pure Django models from the outside.

## The rule

- Models are pure Django. `Meta` carries only composition/GraphQL concerns (`queryable`,
  `mutable`, `search_fields`, `sqid_prefix`, `extends`, …) — **never** `rebac_resource_type`,
  **never** `rebac_relations`, never an FK→relation binding.
- The FK↔relation binding lives on the REBAC side, inferred by the engine:
  - A `.zed` relation `drive: storage/drive` is satisfied by the Django FK field **named `drive`**
    if one exists → resolved **live from the `drive_id` column** (LocalBackend) → no stored tuple,
    no sync, no drift.
  - A relation with **no matching FK** (`owner`, `editor`, `viewer`) is a **grant**: a stored
    tuple written explicitly at the authorization-decision point (the `create`/`share` mutation).
  - The engine categorizes structural-vs-grant **itself**, by FK presence. Angee never categorizes.
  - When relation and field names must differ, the explicit binding hint is authored **in the
    `.zed`** (the engine's own grammar) — still never in Angee's models.
- **Field-backed relations are SHIPPED** in `django-zed-rebac` (0.8, forward FK / OneToOne only):
  declare `// rebac:field=<attname>` on a structural relation in the `.zed` and the engine resolves
  it from the Django column (`field_backing.py`: direct / arrow / lookup_subjects / accessible-union
  via `_base_manager` + column filters), with a write-guard ("set `Post.folder` instead"),
  schema-load validation, and DB-persisted backing (`SchemaRelation.backing`, migration 0003). So
  structural relations need **no tuple and no sync** today. Deferred: reverse-FK / M2M backings, and
  the SpiceDB write-through projector (phase 2).
- The **resource type**, by contrast, is **still declared** — `resources.model_resource_type` reads
  `meta.rebac_resource_type` and returns `None` if absent (verified). For the "Angee declares zero
  rebac" goal this is the one remaining engine change: derive `app_label/snake(model)` when the
  attribute is absent, so composed models need no rebac key. Until then *something* must set
  `rebac_resource_type` — best derived in the engine, never by Angee touching a rebac attr.
- Angee's entire REBAC surface reduces to three intents: merge addon `.zed` fragments as **opaque
  text**, weave the engine's `RebacMixin`/`RebacManager` onto every model, and run the engine's
  schema validation as a delegated build gate. The GraphQL layer is REBAC-agnostic: every query
  flows through the scoping manager and the engine decides.

## Why (the drift, and where it comes from)

A Django FK (`file.drive_id`, in Postgres) and a REBAC relation tuple are **two stores holding one
fact**:

- **LocalBackend** (the only implemented backend today; SpiceDB is a `NotImplementedError` stub on
  the roadmap): tuples live in a Django `Relationship` table — a *different table* in the same DB.
- **SpiceDB** (future): tuples live in SpiceDB's own datastore across a **gRPC boundary** — a
  different database. The migrations create the `Relationship` table unconditionally, but the
  SpiceDB backend "will write through gRPC and will not touch the local relationship table."

For *structural* relations (those mirroring an FK) the tuple is just a **denormalized copy of the
FK**. Maintaining that copy by hand is the drift source. The prototype (`../angee-django-p1`) grew
**seven hand-written `signals.py`** modules doing exactly this dual-write — which (a) silently
breaks under SpiceDB (cross-DB dual-write, no shared transaction, Zookie lag), and (b) violates the
constitution: signals connected in `AppConfig.ready()` are "register at runtime."

Deciding *how* to satisfy a structural relation (read the FK live vs materialize+sync a tuple)
depends on backend internals — **only the engine knows the backend** — so the binding must live in
the engine, at the right level. Putting it in Angee leaks backend knowledge upward.

## Generalizable feedback

- When a capability touches a concern a stack-owned library owns, fix it **in that library at the
  right level**. We own the sibling libs — extend them, don't work around them in Angee.
- **Never reach for Django signals** to wire composed behavior.
- Keep one source of truth per fact: the FK is the truth for structural relations; tuples are the
  truth only for grants that have no FK.

Related: [composer-on-django-migrations.md](composer-on-django-migrations.md).
