# The composer only emits concrete apps; Django does the rest

**Decision (2026-05-29 design session, greenfield rebuild).** `angee compose` does exactly one
thing: generate concrete Django apps under `runtime/` whose models combine abstract models from
different addons, resolving `Meta.extends`. Everything downstream is stock Django and the stack
libraries operating on those *real* apps — not reimplemented inside Angee.

> Earlier in the session this note described reusing Django's migration internals (a CompositionIR
> ≈ `ProjectState`, a synthetic `Apps` ≈ `StateApps`, the autodetector in-process). **That was
> over-engineering and is cut.** Django's migration framework was inspiration that the
> generate-concrete-code pattern is sound — not a blueprint to embed. We emit apps; Django's own
> `makemigrations`/`migrate` run on them externally.

## What compose does — all of it

Walk the addons in a deterministic order, resolve `extends`, and emit one concrete subclass per root
abstract model:

```python
# runtime/storage/models.py  (generated)
from angee.storage.models import File as _File
from angee.billing.models import FileBilling as _FileBilling   # Meta.extends = "storage.File"

class File(_FileBilling, _File):          # bases ordered deterministically
    class Meta(_File.Meta):
        abstract = False
        app_label = "storage"
        db_table = "storage_file"
```

Plus `__init__.py` and `apps.py` per app. Fields, managers, querysets, `@query`/`@mutation`
methods, and Meta are all inherited from the abstract bases via MRO — compose writes class
skeletons, nothing else.

## Everything downstream is stock, on the real apps

| Concern | Who does it |
|---|---|
| migrations | `manage.py makemigrations` / `migrate` (committed, like any Django project) |
| drift gate | `manage.py makemigrations --check` |
| GraphQL schema | strawberry-django builds the per-model surface; Angee adds a **bounded Meta→strawberry-django driver** (NOT stock — see below) that reads the Meta vocabulary, assembles the schema, and prints the SDL |
| admin | a 3-line registration loop over the app's models (Django does **not** auto-register — verified) |
| REBAC | the engine introspects the composed models — see [rebac-stays-out-of-angee.md](rebac-stays-out-of-angee.md) |
| frontend types | graphql-codegen off the printed `schema.graphql` |

## The only real work in compose

Resolving `extends` into a correct, deterministic base list and merged `Meta` (`app_label`,
`db_table`, field-clash handling), emitted sorted. A focused function, not a framework — and the one
thing Django cannot do for us.

## Verified against the installed libraries (2026-05-29)

**Django: all genuinely stock.** Multiple abstract bases combine fields; abstract Meta inherits
(re-declare `abstract`/`app_label`/`db_table`); managers and methods propagate via MRO; concrete
models in `runtime.<app>` with explicit `app_label` while their abstract bases live in a non-app
package is supported; string FK refs resolve; `makemigrations --check` exits non-zero on drift.
Caveats: a field-name clash across two abstract parents is **silently first-in-MRO** (add a compose
check if we want fail-fast), and admin needs the 3-line registration loop above.

**GraphQL is NOT stock — it's the one genuine Angee component beyond `extends`.** strawberry-django
builds the per-model surface (`@strawberry_django.type(Model, fields=…)`, `filter_type`,
`order_type`, `connection`/`node`, `mutations.create/update/delete`) and strawberry assembles +
prints SDL (`Schema`, `merge_types`, `as_str()`). But strawberry-django does **not** read a custom
Meta vocabulary (`queryable`/`mutable`/`search_fields`) and does **not** assemble the API across N
models. So Angee needs a bounded **Meta→strawberry-django driver** — the actual embodiment of
"GraphQL auto-generated from models." Core CRUD surface is low-hundreds of LOC (p1's ~4k included
subscriptions, aggregates, change-stream, REBAC).

**Open fork (runtime-build vs emit):** p1 first tried building strawberry types dynamically at
runtime, hit forward-reference / model→type registry ordering pain, and switched to **emitting a
thin `graphql.py` per app**. So either (a) compose emits a thin per-app graphql module too (still
mechanical, same category as `models.py`), or (b) build the schema at runtime from the composed
models and absorb the type-ordering complexity. Undecided.

## Settled cleanups (2026-05-29)

- **Discovery via `INSTALLED_APPS`.** `AngeeAppConfig` shrinks to a slim **marker** the composer
  filters on (`isinstance(cfg, AngeeAppConfig)`); Django finds + orders the apps. At most it carries
  `kind` (framework | base | consumer). Cut from it: `depends_on`, `namespace`/
  `sqid_prefix_namespace` (→ per-model `sqid_prefix`), `assets` (→ convention: resources loader
  scans `resources/<tier>/`), `framework_managed`, `compose_emits_runtime` (derived), and the
  `ready()` wiring (signals gone; locale/checks are stock auto-discovery).
- **Per-model declaration: a dedicated `class Angee` config, separate from Django's `class Meta`.**
  Django's `Options.contribute_to_class` *raises* on unknown `Meta` keys, so don't overload `Meta`
  (p1 only managed `Meta.extends` via a metaclass that strips keys — the hacky path). `Meta` = ORM
  options; `Angee` = composition (`extends`, optional `db_table`) + identity (`sqid_prefix`) +
  GraphQL surface (`queryable`/`mutable`/`search_fields`). No rebac keys (see rebac note).
- **strawberry-django reads the model's *fields* (`model._meta`), not `class Meta` and nothing
  Angee.** Angee's GraphQL driver reads `class Angee` and *calls* strawberry-django with the right
  fields/ops.
- **`depends_on` cut.** The dependency *is* the `extends` edges, read off the models; emission needs
  only a stable sort (by app label/model) for byte-determinism + MRO base order, not a toposort;
  validate that each `extends` target resolves to a real abstract model.
- **`compose_emits_runtime` derived.** Emit a `runtime/<label>/` app iff the addon owns ≥1 *root*
  (non-`extends`) abstract `AngeeModel`; pure-extension addons merge into the extended model's app.

## Session framing (agreed with the user)

- Deliverable: **design doc only** first, then a written plan. No code yet.
- Ambition: **re-cut the seams** — but keep the composer tiny; delegate everything delegable.
- Initial scope: **minimal foundation** = framework core addon + composer + resources +
  auth/REBAC + GraphQL surface. Feature addons follow later.
- Commit policy (proposed default): commit migrations + `schema.graphql`; gitignore the generated
  `runtime/` model code and regenerate it (`git diff` on migrations + `makemigrations --check` are
  the gates).
- Source prototype being compared: `../angee-django-p1` (greenfield — no provenance in emitted
  code, per `.agents/commands/lift.md`).
