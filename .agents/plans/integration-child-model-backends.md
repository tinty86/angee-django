# Integration Child Models And Backend Classes

## Goal

Rework integration implementations so `integrate.Integration` is the shared
multi-table inheritance parent connection row and concrete integration kinds are
Django child models. A child model owns the fields, actions, tabs, and related
tables for that kind. If several adapters share one child shape, that child
carries a role-named `backend_class` `ImplClassField`.

Primary target: `agents.InferenceProvider` becomes an `Integration` child model,
and OpenAI/Anthropic/manual/OpenAI-compatible providers become inference
`backend_class` values.

## Locked Decisions

- Use Django multi-table inheritance as the model shape for integration kinds
  whenever a concrete model is needed. `Integration` is the parent;
  `InferenceProvider`, `VcsBridge`, and future mutually exclusive integration
  kinds are child rows.
- Do not use `Integration.impl_class` or `IntegrationImpl.related_model` to
  decide which related row exists. That was manual polymorphism and is
  superseded by Django model inheritance.
- Keep `ImplClassField`, but use it as the backend/adapter-type pattern on the
  concrete owner row. The field name must describe the role, for example
  `backend_class` on `InferenceProvider` or `provider_type` on `OAuthClient`.
- Backend impl classes are default-bearing and inheritable. For example an
  OpenAI-compatible inference backend base can provide shared protocol/default
  behavior, while `openai`, `deepseek`, and similar keys specialize labels,
  endpoints, model filters, and defaults.
- Use model `extends` only for additive same-row fields contributed by a
  downstream addon. OIDC login fields on `integrate.OAuthClient` are the
  canonical shape. If exactly one concrete kind applies, use a concrete Django
  child model instead.
- Catalogue rows stay pure metadata. They do not choose implementation behavior;
  the concrete integration child row does.

## Dependency Spike

Run an early spike on `django-polymorphic` as the parent-query and downcasting
owner. Do not add it to `docs/stack.md`, `pyproject.toml`, or `uv.lock` until
the spike proves it plays cleanly with Angee's emitted runtime models, REBAC
managers, strawberry-django types/resolvers, resources, migrations, and
aggregate/list queries.

Accept `django-polymorphic` only if it reduces local code and keeps these
surfaces boring:

- `Integration.objects` can list common connection rows while detail routes and
  actions can receive concrete child instances without a local downcasting
  registry.
- REBAC managers and field-backed relations continue to scope parent and child
  querysets fail-closed.
- strawberry-django can expose parent lists and child detail/types without
  custom type-resolution glue that outweighs the dependency.
- resources can import concrete child rows deterministically.
- aggregate/list/group queries over `Integration` still work for status, vendor,
  owner, kind, and child-type grouping.

If the spike fails any of those without a small owner-level fix, keep native
Django multi-table inheritance and add the smallest Angee-owned parent-to-child
resolution seam instead. Record the rejected dependency decision in this file
and keep `docs/stack.md` unchanged.

## Architecture Gate

Owner map:

- `integrate.Integration` owns common connection identity, owner, vendor,
  credential/account, status, telemetry, list/group surfaces, connect/attach
  lifecycle, and parent-query behavior.
- Concrete integration child models own mutually exclusive integration kinds:
  `agents.InferenceProvider` owns inference provider fields, model refresh, chat,
  service environment, model catalogue tabs/actions; `integrate.VcsBridge` owns
  VCS bridge fields, sync state, webhook verification, repository discovery.
- Child-model `backend_class` fields own interchangeable SDK/protocol adapters
  within one concrete kind, for example OpenAI/Anthropic/manual inference
  backends on `InferenceProvider`.
- `extends = "app.Model"` remains additive only: downstream fields on the same
  row, such as OIDC login fields on `OAuthClient`.
- Resources own shipped seed data. They should seed concrete child rows once the
  child model owns the implementation kind.
- React form slots/tabs own presentation. They render one Integration form and
  reveal tabs/fields based on the concrete child kind and backend metadata.

Sibling inventory:

- `iam_integrate_oidc` uses `extends = "integrate.OAuthClient"` for additive
  fields on the same OAuth client row. Keep this pattern.
- `storage.Backend.backend_class` uses `ImplClassField` for behavior over a
  common persisted shape. This is the model for `InferenceProvider.backend_class`.
- Current `Integration.impl_class + IntegrationImpl.related_model` manually
  creates one-to-one related rows (`InferenceProvider`, `VcsBridge`). This is the
  pattern to delete and replace with child models.

Dependency check:

- Django multi-table inheritance is the accepted model shape and needs no new
  dependency.
- `django-polymorphic` is only accepted after the dependency spike. If accepted,
  add it to `docs/stack.md`, `pyproject.toml`, and `uv.lock` in the same change.
- Do not build a local downcasting registry before the spike result is known.

Naming check:

- Avoid generic `impl_class` for integration kinds. The child model is the
  integration implementation. Adapter selection inside the child is named by
  role: `backend_class`, `provider_type`, etc.

## Desired Shape

```python
class Integration(...):
    owner = ...
    vendor = ...
    credential = ...
    account = ...
    status = ...


class InferenceProvider(Integration):
    backend_class = ImplClassField(
        base_class=InferenceBackend,
        registry_setting="ANGEE_INFERENCE_BACKENDS",
        default="openai",
    )
    name = ...
    base_url = ...
    config = ...


class VcsBridge(Integration):
    backend_class = ImplClassField(
        base_class=VCSBackend,
        registry_setting="ANGEE_VCS_BACKENDS",
    )
    webhook_secret = ...
    cursor = ...


class OpenAICompatibleInferenceBackend(InferenceBackend):
    defaults = {
        "config": {"api_protocol": "openai_responses"},
    }


class OpenAIInferenceBackend(OpenAICompatibleInferenceBackend):
    label = "OpenAI"
    defaults = {"base_url": "https://api.openai.com/v1"}


class DeepSeekInferenceBackend(OpenAICompatibleInferenceBackend):
    label = "DeepSeek"
    defaults = {"base_url": "https://api.deepseek.com/v1"}
```

## Implementation Plan

1. Lock the child-model contract for integrations.
   - Make `Integration` the Django multi-table inheritance parent model.
   - Run the `django-polymorphic` spike before choosing the parent-query owner.
   - Add `django-polymorphic` to the locked backend stack and dependency graph
     only if the spike passes.
   - Keep parent queries stable for existing list/group/permission surfaces.
   - Verify base-list to child-detail resolution uses the chosen owner rather
     than ad hoc caller-side shape inspection.

2. Move inference implementation selection.
   - Add `InferenceProvider.backend_class`.
   - Move OpenAI/Anthropic/manual registry entries from unified
     `ANGEE_INTEGRATION_IMPLS` to an inference-specific registry.
   - Move `InferenceBackend` behavior so it binds to `InferenceProvider` directly,
     not to `Integration + related`.

3. Convert `InferenceProvider` from one-to-one related model to child model.
   - Preserve common `Integration` fields on the parent.
   - Preserve inference fields and methods on the child.
   - Make model refresh/chat/service env ask the child owner directly.

4. Convert VCS bridge to the same shape if the inference migration proves the
   contract.
   - `VcsBridge` becomes an `Integration` child.
   - VCS host adapter moves to `VcsBridge.backend_class`.
   - Repository/source/template relations keep pointing at the concrete bridge
     owner.

5. Collapse setup UX into one Integration form.
   - Parent integration list remains the navigation surface.
   - Opening a row displays common fields plus child tabs.
   - Inference tabs show Provider, Auth, Models, Advanced.
   - Backend choices prefill child fields through the existing impl metadata path.

6. Update resources and demo seeds.
   - Seed concrete child model rows instead of an integration row plus related row.
   - Keep catalogue model resources pure metadata.
   - Regenerate runtime/schema artifacts from source.

7. Delete obsolete glue.
   - Remove `IntegrationImpl.related_model`, related-row creation helpers, and
     duplicated GraphQL create mutations once child creation owns the flow.
   - Remove `Integration.impl_class` if it only selected the integration kind.
   - Remove top-level CRUD pages that expose implementation child rows as separate
     setup destinations when the Integration form owns them.

## Verification

- Backend tests for child creation, parent listing, permission scope, delete
  cascades, and backend-class defaults.
- GraphQL SDL check after runtime build.
- Resource load for install/demo tiers.
- Frontend unit tests for Integration form tabs and backend prefill.
- Browser check that creating an inference integration happens through one form
  and no separate provider form is required.
