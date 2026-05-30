# Narrow pass — Django file placement & naming. Consolidated synthesis

Four independent reviewers (main-loop Claude, Claude subagent, Gemini, Codex) on ONE
question: which code/decomposition doesn't feel like Django because of wrong-file
placement or non-Django names (module / class / method). Ranked by consensus × severity.
Agreement: M=main-loop S=subagent G=gemini C=codex.

---

## Tier 1 — Full or near-full consensus (act first)

### F1. `mixins/models.py` is a role-name collision, and it mixes three kinds of code  [M S G C — all four]
`src/angee/base/mixins/models.py` is a package `mixins/` whose only file is named
`models.py` — the role name Django reserves for an app's model module. Inside it are
three different kinds of code that want three homes:
- **the abstract base model `AngeeModel`** (:25) — NOT a mixin; it's the base every
  source model inherits (`class Note(AngeeModel)`). Belongs in `models.py` as the base.
- **true mixins** `TimestampMixin`/`SqidMixin`/`HistoryMixin`/`RevisionMixin` — belong
  in `mixins.py`.
- **`register_revision_models()`** (:216) — a `ready()`-time registration helper; belongs
  in `signals.py` or as a `BaseConfig` method, not in a mixins module. [M S(low) G(med)]
Fix: `mixins.py` for the `*Mixin` classes; `AngeeModel` to `models.py`; the registration
to signals/apps.

> CONFLICT to resolve: **Gemini #3 says rename `AngeeModel` → `AngeeModelMixin`. That is
> wrong** — it's a base model, not a mixin (Django's own base is `models.Model`, no
> suffix). Codex #3 has the right read: it's *misfiled* as a mixin. Move it, don't
> re-suffix it.

### F2. The `graphql/` package absorbs roles that have their own Django home  [S strong, M (signals)]
`base` has no `signals.py`, `views.py`, or `consumers.py` — yet holds code of each:
- **Signal handlers/wiring in `graphql/subscriptions.py`** (`_on_save`/`_on_delete`
  :88,107; `connect_publishers`/`post_save.connect` :77,84; `_publish`/`_broadcast`).
  → `signals.py`, connected from `AppConfig.ready()`. **High.** [M S] (also the earlier
  architecture finding about runtime signal registration — same smell, file-level here.)
  Corroboration: a `signals.py` slot already exists for the example notes addon, so this
  is an internal inconsistency, not just an idiom gap.
- **View function in `urls.py`** — `graphql_endpoint(request,…)` (:34) + `_view_for`
  (:25). Django keeps handlers in `views.py`; `urls.py` only binds routes. → `views.py`.
  **Medium.** [S]
- **Channels consumer in `asgi.py`** — `AngeeGraphQLWSConsumer` (:26). Channels keeps
  consumer classes in `consumers.py`; `asgi.py` only wires routing. → `consumers.py`.
  **Medium.** [S]

---

## Tier 2 — Real, partial agreement

### F3. Public GraphQL shortcuts `crud` / `changes` are nouns, not verb-first  [C(med), M(low)]
`graphql/crud.py:42` `crud(...)` and `graphql/subscriptions.py:45` `changes(...)` return
Strawberry surfaces but read as nouns; the Naming vocab is verb-first. Codex proposes
`create_crud_mutation` / `create_changes_subscription`.
> TRADEOFF: these are the public addon-authoring API used in every `graphql.py`
> (`crud(NoteType, …)`). Verb-correct but verbose and a breaking rename. Architect call;
> lower priority than F1/F2.

### F4. Method names that drift from the `get_*`/`to_*`/`from_*` vocabulary  [S, C]
- `urls.py:25` `_view_for` → `get_*` (rest of code uses `get_*` accessors). [S]
- `resources/entries.py:143` `inferred_model_label` → `get_…`; `:364` `dataset()` →
  `to_dataset`/`as_dataset`; `resources/loader.py:249` `resource_for` → `create_…`. [C]
Low severity, mechanical, internal-only (except entries which are public-ish).

### F5. Module-level `public_id()` shadows the model's `public_id` property  [M, S]
`resources/widgets.py:164` free function duplicates the model-owned `public_id`
(`mixins/models.py:124`) — decodes the fact from outside. Make it `_internal` or use the
property. Low. (Overlaps the earlier DRY/ownership cluster.)

---

## Genuine CONFLICT — needs your call (no consensus)

### X1. Is the `resources/` feature subpackage Django, or should role modules be flat?
- **Codex #1/#4 (High):** `Resource` and `ResourceQuerySet`/`ResourceManager` should move
  to top-level `base/models.py` and `base/managers.py`; the nested `resources/models.py`,
  `resources/managers.py`, `mixins/models.py` make base "feel like several mini-apps."
- **Subagent + main-loop:** the `resources/` subpackage uses role-named modules *internally*
  (`models.py`, `managers.py`, `widgets.py`, `ordering.py`, `entries.py`, `loader.py`,
  `fetch.py` = 7 files) — a legitimate large-feature layout; flattening 7 modules into
  base's top level is likely worse, and `base/models.py` already re-exports `Resource` as
  the composer's discovery seam (it works *because* of that façade).
- **Gemini #4 (low):** also wants `Resource` defined in `base/models.py` — but that would
  collapse the cohesive feature package.
> My read: the *internal* role-naming in `resources/` is fine and discoverable; the only
> firmly-wrong nesting is `mixins/models.py` (F1), which everyone agrees on. Whether
> `resources/` stays a subpackage is a structure preference, not a Django-correctness bug.

### X2. Rename `settings.py` → `settings_helpers.py`?  [G(low) yes, C says fine]
Gemini: `settings.py` in a library package could be confused with project settings.
Codex/main-loop: acceptable for a settings-composition helper; rename is churn. Low.

---

## Confirmed idiomatic (no findings) — all reviewers
`apps.py`, `managers.py` (internally), `models.py` re-export, `resources/entries.py`,
`resources/ordering.py`, `compose/*`, `discovery.py`, both `management/commands/`,
`settings.py` content (loose orchestration funcs are explicitly allowed).

---

## Suggested order if refactoring
1. **F1** — split `mixins/models.py` → `mixins.py` (mixins) + `models.py` (AngeeModel base)
   + move `register_revision_models` to signals/apps. (Unanimous; highest value.)
2. **F2** — extract `signals.py` (+ wire from `ready()`), `views.py`, `consumers.py` from
   the graphql/asgi/urls modules. (signals = High.)
3. **F4 + F5** — mechanical `get_*`/`to_*` renames + drop the shadowing free function.
4. **Decide X1 (resources nesting) and F3 (crud/changes rename) before touching them** —
   both are architect calls with API/structure tradeoffs, not clear bugs.
5. **X2** — optional, low.
