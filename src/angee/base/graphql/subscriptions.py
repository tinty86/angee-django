"""Model change subscriptions delivered over the channel layer.

``changes(Model, field=...)`` returns a Strawberry subscription surface that
streams a :class:`ChangeEvent` whenever an instance is created, updated, or
deleted. Saves and deletes are published to a per-model channel-layer group via
Django signals; each subscriber drains its own channel and yields events.

Events are REBAC read-gated at emit time: a subscriber only sees changes to
rows it may read, with field-gated values redacted. Models without a REBAC
resource type stream unfiltered. The WebSocket transport resolves the
connection actor in ``angee.base.asgi``; this module reads it from the context.
"""

from __future__ import annotations

import datetime
from collections.abc import AsyncGenerator, Iterable, Mapping
from types import SimpleNamespace
from typing import Any

import strawberry
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.db import models, transaction
from django.db.models.signals import post_delete, post_save
from rebac import ObjectRef, SubjectRef, anonymous_actor
from rebac.actors import get_actor_resolver
from rebac.backends import backend
from rebac.field_visibility import check_field_access, gated_read_fields
from rebac.resources import model_resource_type
from strawberry.scalars import JSON


@strawberry.type
class ChangeEvent:
    """A read-gated notification that one model instance changed."""

    model: str
    id: strawberry.ID
    action: str
    changed_fields: list[str] | None = None
    changed_values: JSON | None = None


def changes(model: type[models.Model], *, field: str) -> type:
    """Return a subscription surface streaming changes to ``model``.

    The GraphQL field is named ``field``. Calling this also connects the change
    publishers for ``model`` (idempotently), so a schema that exposes the field
    is wired end to end.
    """

    connect_publishers(model)
    label = _model_label(model)

    async def resolve(
        self: object, info: strawberry.Info
    ) -> AsyncGenerator[ChangeEvent, None]:
        actor = _actor_from_info(info)
        async for payload in _subscribe(model):
            event = _gate_event(model, actor, payload)
            if event is not None:
                yield event

    resolve.__name__ = field
    namespace = {field: strawberry.subscription(resolver=resolve, name=field)}
    surface = type(f"{model.__name__}Subscription", (), namespace)
    surface.__doc__ = f"Live changes to {label}."
    return strawberry.type(surface)


# --- publishing -----------------------------------------------------------

_connected: set[type[models.Model]] = set()


def connect_publishers(model: type[models.Model]) -> None:
    """Connect change publishers for ``model`` exactly once."""

    if model in _connected:
        return
    _connected.add(model)
    uid = f"angee-changes-{_model_label(model)}"
    post_save.connect(_on_save, sender=model, dispatch_uid=f"{uid}-save")
    post_delete.connect(_on_delete, sender=model, dispatch_uid=f"{uid}-delete")


def _on_save(
    sender: type[models.Model],
    instance: models.Model,
    created: bool = False,
    update_fields: Iterable[str] | None = None,
    raw: bool = False,
    **_: Any,
) -> None:
    """Publish a create/update event after the transaction commits."""

    if raw:
        return
    _publish(
        instance,
        action="create" if created else "update",
        update_fields=update_fields,
    )


def _on_delete(
    sender: type[models.Model], instance: models.Model, **_: Any
) -> None:
    """Publish a delete event after the transaction commits."""

    _publish(instance, action="delete", update_fields=None)


def _publish(
    instance: models.Model,
    *,
    action: str,
    update_fields: Iterable[str] | None,
) -> None:
    """Build a change payload and broadcast it on commit."""

    model = type(instance)
    changed = (
        sorted(str(name) for name in update_fields)
        if update_fields is not None
        else None
    )
    values = (
        {name: _json_safe(getattr(instance, name, None)) for name in changed}
        if changed is not None
        else None
    )
    payload = {
        "model": _model_label(model),
        "id": _public_id(instance),
        "action": action,
        "changed_fields": changed,
        "changed_values": values,
    }
    transaction.on_commit(lambda: _broadcast(model, payload))


def _broadcast(model: type[models.Model], payload: dict[str, Any]) -> None:
    """Send one payload to the model's channel-layer group."""

    layer = get_channel_layer()
    if layer is None:
        return
    async_to_sync(layer.group_send)(
        _group(model), {"type": "angee.change", "payload": payload}
    )


# --- subscribing ----------------------------------------------------------


async def _subscribe(
    model: type[models.Model],
) -> AsyncGenerator[dict[str, Any], None]:
    """Yield change payloads for ``model`` until the subscriber disconnects."""

    layer = get_channel_layer()
    if layer is None:
        return
    group = _group(model)
    channel = await layer.new_channel()
    await layer.group_add(group, channel)
    try:
        while True:
            message = await layer.receive(channel)
            payload = message.get("payload")
            if payload:
                yield payload
    finally:
        await layer.group_discard(group, channel)


# --- REBAC gating ---------------------------------------------------------


def _gate_event(
    model: type[models.Model], actor: SubjectRef, payload: Mapping[str, Any]
) -> ChangeEvent | None:
    """Drop events the actor cannot read and redact field-gated values."""

    resource_type = model_resource_type(model)
    if not resource_type:
        return _to_event(payload)

    resource = ObjectRef(resource_type, str(payload["id"]))
    active_backend = backend()
    if not check_field_access(
        active_backend, subject=actor, action="read", resource=resource
    ).allowed:
        return None
    return _to_event(_redact(model, actor, resource, payload, active_backend))


def _redact(
    model: type[models.Model],
    actor: SubjectRef,
    resource: ObjectRef,
    payload: Mapping[str, Any],
    active_backend: Any,
) -> dict[str, Any]:
    """Return a payload copy with unreadable field-gated values removed."""

    gated = gated_read_fields(model)
    fields = payload.get("changed_fields")
    values = payload.get("changed_values")
    if not gated or not fields:
        return dict(payload)

    denied = {
        name
        for name in fields
        if name in gated
        and not check_field_access(
            active_backend,
            subject=actor,
            action=f"read__{name}",
            resource=resource,
        ).allowed
    }
    if not denied:
        return dict(payload)

    redacted = dict(payload)
    redacted["changed_fields"] = [
        name for name in fields if name not in denied
    ]
    if isinstance(values, Mapping):
        redacted["changed_values"] = {
            name: value for name, value in values.items() if name not in denied
        }
    return redacted


def _to_event(payload: Mapping[str, Any]) -> ChangeEvent:
    """Build the GraphQL event from a change payload."""

    return ChangeEvent(
        model=str(payload["model"]),
        id=strawberry.ID(str(payload["id"])),
        action=str(payload["action"]),
        changed_fields=payload.get("changed_fields"),
        changed_values=payload.get("changed_values"),
    )


# --- helpers --------------------------------------------------------------


def scope_actor(scope: Mapping[str, Any]) -> SubjectRef:
    """Resolve the REBAC actor for a channels connection scope."""

    request = SimpleNamespace(user=scope.get("user"))
    return get_actor_resolver()(request) or anonymous_actor()


def _actor_from_info(info: strawberry.Info) -> SubjectRef:
    """Return the connection actor attached to the GraphQL context."""

    context = info.context
    actor = (
        context.get("actor")
        if isinstance(context, Mapping)
        else getattr(context, "actor", None)
    )
    return actor or anonymous_actor()


def _model_label(model: type[models.Model]) -> str:
    """Return the ``app_label.Model`` label for a model."""

    return f"{model._meta.app_label}.{model._meta.object_name}"


def _group(model: type[models.Model]) -> str:
    """Return the channel-layer group name for a model's changes."""

    return f"angee.changes.{model._meta.app_label}.{model._meta.model_name}"


def _public_id(instance: models.Model) -> str:
    """Return the instance public id, falling back to the primary key."""

    return str(getattr(instance, "public_id", None) or instance.pk)


def _json_safe(value: Any) -> Any:
    """Return a JSON-serializable representation of a changed value."""

    if value is None or isinstance(value, bool | int | float | str):
        return value
    if isinstance(value, datetime.datetime | datetime.date):
        return value.isoformat()
    if isinstance(value, list | tuple):
        return [_json_safe(item) for item in value]
    if isinstance(value, Mapping):
        return {str(key): _json_safe(item) for key, item in value.items()}
    return str(value)
