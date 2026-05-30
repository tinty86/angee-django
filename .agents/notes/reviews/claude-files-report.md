# Focused Review — Django file placement & module naming (`src/angee/base/`)

### Summary

For the most part the package reads as idiomatic Django: `apps.py` holds
`AppConfig` subclasses, `models.py` re-exports source models, `managers.py`
holds the queryset+manager, `mixins/` holds mixins, `management/commands/`
holds commands, and `migrations/` is left to Django. The build/composer layer
(`compose/`, `discovery.py`, `settings.py`) is correctly kept as loose
orchestration functions, which the backend guideline explicitly allows. The
single biggest placement problem is in the `graphql/` package: Django signal
handlers and their wiring live inside `graphql/subscriptions.py`, and a request
view function lives inside `urls.py` instead of `views.py` — both are code
sitting in a module whose Django role is something else.

### Findings

#### 1. Signal handlers and signal wiring live in `graphql/subscriptions.py`, not `signals.py`
- **Type**: `wrong-file`
- **Location**: `src/angee/base/graphql/subscriptions.py:77` (`connect_publishers`),
  `:88` (`_on_save`), `:107` (`_on_delete`), `:84-85` (`post_save.connect` /
  `post_delete.connect`); should live in `src/angee/base/signals.py`.
- **Severity**: High
- **Why it isn't Django**: The Naming section lists `signals.py` as the role
  module for signal handlers and wiring, and the Django-Native rule says to use
  Django's native owners. `_on_save`/`_on_delete` are `post_save`/`post_delete`
  receivers and `connect_publishers` is the `.connect()` wiring — that is exactly
  what a Django developer expects in `signals.py`. They are buried in a module
  whose stated role is "GraphQL composition," so a senior Django dev grepping
  `signals.py` for the model-change receivers finds nothing.
- **Move/Rename to**: Move `_on_save`, `_on_delete`, `_publish`, `_broadcast`,
  `connect_publishers`, and the `_connected` registry to a new
  `src/angee/base/signals.py`; keep the Strawberry subscription surface
  (`changes`, `ChangeEvent`, `_subscribe`, the REBAC gating) in
  `graphql/subscriptions.py` and have it import the connector from `signals`.

#### 2. A request view function lives in `urls.py`
- **Type**: `wrong-file`
- **Location**: `src/angee/base/urls.py:25` (`_view_for`), `:34`
  (`graphql_endpoint`); should live in `src/angee/base/views.py`.
- **Severity**: Medium
- **Why it isn't Django**: Django's role split puts request handlers in
  `views.py` and route tables in `urls.py`; `urls.py` is expected to import
  views and bind them to paths, not define them. `graphql_endpoint(request, ...)`
  is a view and `_view_for` constructs the `GraphQLView` — both are view code.
  The Naming section names `urls.py` as the URL-conf module only.
- **Move/Rename to**: Move `_view_for` and `graphql_endpoint` to
  `src/angee/base/views.py`; leave `urls.py` as `from angee.base.views import
  graphql_endpoint` plus the `urlpatterns` list. (The endpoint name itself is
  fine; `graphql_view` would match Django's `*_view` habit slightly better but
  is not required.)

#### 3. A Channels consumer is defined in `asgi.py` instead of `consumers.py`
- **Type**: `wrong-file`
- **Location**: `src/angee/base/asgi.py:26` (`AngeeGraphQLWSConsumer`); should
  live in `src/angee/base/consumers.py`.
- **Severity**: Medium
- **Why it isn't Django**: Django/Channels convention is that `asgi.py` exposes
  the ASGI `application` and wires routing, while consumer classes live in
  `consumers.py` (the Channels analogue of `views.py`). Defining the WebSocket
  consumer class inline in `asgi.py` mixes the transport-entrypoint role with
  the handler role. `asgi.py` also currently exports a `build_application()`
  factory rather than the conventional module-level `application`, though that
  is a host-composition choice and lower priority than the consumer placement.
- **Move/Rename to**: Move `AngeeGraphQLWSConsumer` to
  `src/angee/base/consumers.py`; `asgi.py` imports it and keeps only
  `build_application()` (the routing/entrypoint).

#### 4. `mixins/models.py` — a mixins file misnamed with the `models` role
- **Type**: `module-name`
- **Location**: `src/angee/base/mixins/models.py` (whole file: `TimestampMixin`,
  `AngeeModel`, `SqidMixin`, `HistoryMixin`, `RevisionMixin`).
- **Severity**: Medium
- **Why it isn't Django**: The Naming section maps mixins to `mixins.py` and
  reserves `models.py` for an app's model module — Django discovers `models.py`
  by name. Here the *package* is already named `mixins/`, and the only file in
  it is named `models.py`. The role-name (`models`) contradicts the package
  role (`mixins`); a Django dev reads `mixins/models.py` as "the models of the
  mixins app." The contents are abstract mixins, not the addon's source models
  (those are re-exported from `base/models.py`).
- **Move/Rename to**: Collapse to a single `src/angee/base/mixins.py` (drop the
  package), or if the package is kept for future splitting, rename the file to a
  role that reads correctly under `mixins/` (e.g. `mixins/__init__.py` exporting
  the classes, since there is currently only one module). Update imports
  (`from angee.base.mixins.models import ...`) accordingly.

#### 5. `register_revision_models` (a `ready()`-time registration) sits in the mixins module
- **Type**: `wrong-file`
- **Location**: `src/angee/base/mixins/models.py:216`
  (`register_revision_models`), called from `apps.py:403` `BaseConfig.ready()`.
- **Severity**: Low
- **Why it isn't Django**: This is app-startup registration wiring (the
  django-reversion `reversion.register(...)` calls), the same family of
  "connect things in `ready()`" work that Django keeps in `signals.py` /
  app-config setup. It is a loose module function living in the mixins module
  rather than beside the other startup wiring. It scans `apps.get_models()` and
  registers them — orchestration, not mixin behavior.
- **Move/Rename to**: Move to `src/angee/base/signals.py` (alongside finding 1's
  receivers) or keep it as a method/staticmethod the `BaseConfig.ready()` calls;
  do not leave registration logic in `mixins`.

#### 6. Module-level `public_id()` function shadows the model `public_id` property
- **Type**: `method-name`
- **Location**: `src/angee/base/resources/widgets.py:164` (module function
  `public_id`) vs `src/angee/base/mixins/models.py:124` (`AngeeModel.public_id`
  property) and `:131` `from_public_id`.
- **Severity**: Low
- **Why it isn't Django**: "Put behavior on the object that owns the data." The
  model already owns `public_id` (property) and `from_public_id` (classmethod).
  `widgets.public_id(instance)` is a loose function that re-decodes the same
  fact from outside the owning class (`isinstance(instance, AngeeModel)` switch),
  duplicating the name as a free function. Same-named free function vs. method
  is exactly the "function that inspects an object to decide something" smell.
- **Move/Rename to**: Drop the free function and call `instance.public_id`
  (the property already exists on `AngeeModel`); for the non-`AngeeModel`
  fallback, give the owning surface a method rather than a module helper. If a
  helper must remain, name it `_internal` (e.g. `_public_id`) so it does not read
  as a public peer of the model property.

#### 7. `_view_for` accessor uses `_for` rather than the `get_*` accessor verb
- **Type**: `method-name`
- **Location**: `src/angee/base/urls.py:25` (`_view_for`); compare the
  `resources/` package's own `resource_for` / `_model_for_label` / `_groups_for`.
- **Severity**: Low
- **Why it isn't Django**: The Naming vocabulary uses `get_*` for accessors.
  `_view_for(schema_name)` returns (and caches) the view for a name — a `get_*`
  accessor. The package is internally inconsistent: `urls.py` uses `_for`
  suffixes while the model layer uses `get_*` (`get_model_classes`,
  `get_rebac_schema_path`). Pick one; Django favors `get_*`.
- **Move/Rename to**: `_get_view` / `get_view_for_schema` (and apply the same
  decision consistently to the `*_for` helpers if they move into views).

### Naming/placement patterns

- **The `graphql/` package absorbs roles that have their own Django home.**
  Findings 1, 2, and 3 are one theme: signal receivers, a request view, and a
  Channels consumer all sit in transport/GraphQL modules instead of `signals.py`,
  `views.py`, and `consumers.py`. The `base` app currently has *no* `signals.py`,
  `views.py`, or `consumers.py` at all, even though it clearly contains code of
  each role — the missing role-modules are the tell.

- **`mixins/models.py` is the one role-name collision** (finding 4): a `models`
  filename inside a `mixins` package. Everywhere else the model/manager/queryset
  split is clean and idiomatic (`models.py` re-exports, `managers.py` holds
  `ResourceQuerySet` + `Manager.from_queryset`, `Resource.Tier` is a model-owned
  `TextChoices`).

- **Accessor-verb inconsistency** (findings 6, 7): the model and AppConfig layers
  use the `get_*` / `from_*` / `is_*` vocabulary correctly and consistently, but
  the `urls.py` and `widgets.py` helpers drift to `*_for` and to free functions
  that duplicate model-owned names. These are local drifts from an otherwise
  consistent verb vocabulary, not a systemic problem.

- **Correctly placed, for the record:** `apps.py`, `models.py`, `managers.py`,
  `resources/entries.py` (dataclasses/value types), `resources/ordering.py`
  (toposort orchestration), `compose/*` and `discovery.py` (loose composer
  orchestration, allowed by the guideline), and `management/commands/angee.py` /
  `angee_resources.py` (thin `Command` dispatchers). No findings there.
