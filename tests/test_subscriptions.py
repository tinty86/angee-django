"""Tests for ``changes`` model-change subscriptions and REBAC gating."""

from __future__ import annotations

import asyncio
from collections.abc import AsyncGenerator, Awaitable, Callable
from types import SimpleNamespace
from typing import cast

import strawberry
from channels.layers import InMemoryChannelLayer
from channels.testing import WebsocketCommunicator
from django.contrib.auth.models import AnonymousUser, Group
from rebac import actor_context, anonymous_actor, current_actor
from rebac.graphql.strawberry import RebacChannelsConsumerMixin

from angee.base import signals
from angee.base.consumers import AngeeGraphQLWSConsumer
from angee.base.graphql import subscriptions
from angee.base.graphql.events import ChangeEvent
from angee.base.graphql.subscriptions import changes

ANON = anonymous_actor()
SubscriptionResolver = Callable[
    [object, object],
    AsyncGenerator[ChangeEvent, None],
]


def _payload(**overrides: object) -> dict[str, object]:
    payload: dict[str, object] = {
        "model": "auth.Group",
        "id": "1",
        "action": "update",
        "changed_fields": ["name"],
        "changed_values": {"name": "x"},
    }
    payload.update(overrides)
    return payload


def _subscription_resolver(surface: type) -> SubscriptionResolver:
    """Return the generated subscription resolver from ``surface``."""

    definition = getattr(surface, "__strawberry_definition__")
    field = definition.fields[0]
    return cast(SubscriptionResolver, field.base_resolver.wrapped_func)


def test_changes_builds_a_named_subscription_field() -> None:
    """``changes`` exposes one subscription field and wires publishers."""

    surface = changes(Group, field="groupChanged")

    @strawberry.type
    class Query:
        @strawberry.field
        def ok(self) -> bool:
            return True

    sdl = strawberry.Schema(query=Query, subscription=surface).as_str()
    assert "groupChanged: ChangeEvent!" in sdl
    assert Group in signals._connected


def test_gate_event_passes_through_non_rebac_models(monkeypatch) -> None:
    """A model without a REBAC resource type streams unfiltered."""

    class Gate:
        """Gate stub that returns the payload unchanged."""

        def __init__(self, model: object, actor: object) -> None:
            self.model = model
            self.actor = actor

        def filter(self, payload: dict[str, object]) -> ChangeEvent:
            return ChangeEvent.from_payload(payload)

    monkeypatch.setattr(subscriptions, "ChangeReadGate", Gate)

    event = subscriptions._gate_event(Group, ANON, _payload())

    assert isinstance(event, ChangeEvent)
    assert event.action == "update"
    assert event.changed_fields == ["name"]


def test_gate_event_drops_unreadable_rows(monkeypatch) -> None:
    """An event for a row the actor cannot read is suppressed."""

    class Gate:
        """Gate stub that drops every payload."""

        def __init__(self, model: object, actor: object) -> None:
            self.model = model
            self.actor = actor

        def filter(self, payload: dict[str, object]) -> None:
            return None

    monkeypatch.setattr(subscriptions, "ChangeReadGate", Gate)

    assert subscriptions._gate_event(Group, ANON, _payload()) is None


def test_gate_event_redacts_denied_fields(monkeypatch) -> None:
    """Field-gated values the actor cannot read are removed from the event."""

    class Gate:
        """Gate stub that redacts the secret field."""

        def __init__(self, model: object, actor: object) -> None:
            self.model = model
            self.actor = actor

        def filter(self, payload: dict[str, object]) -> ChangeEvent:
            redacted = dict(payload)
            redacted["changed_fields"] = ["name"]
            redacted["changed_values"] = {"name": "x"}
            return ChangeEvent.from_payload(redacted)

    monkeypatch.setattr(subscriptions, "ChangeReadGate", Gate)

    event = subscriptions._gate_event(
        Group,
        ANON,
        _payload(
            changed_fields=["name", "secret"],
            changed_values={"name": "x", "secret": "y"},
        ),
    )

    assert event is not None
    assert event.changed_fields == ["name"]
    assert event.changed_values == {"name": "x"}


def test_subscribe_yields_broadcast_payloads(monkeypatch) -> None:
    """A payload sent to the model group reaches an active subscriber."""

    layer = InMemoryChannelLayer()
    monkeypatch.setattr(subscriptions, "get_channel_layer", lambda: layer)

    async def scenario() -> dict[str, object]:
        stream = subscriptions._subscribe(Group)
        pending = asyncio.ensure_future(stream.__anext__())
        await asyncio.sleep(0.05)  # let the subscriber join the group
        await layer.group_send(
            signals.change_group(Group),
            {"type": "angee.change", "payload": _payload(id="7")},
        )
        try:
            return await asyncio.wait_for(pending, timeout=1)
        finally:
            await stream.aclose()

    payload = asyncio.run(scenario())
    assert payload["id"] == "7"


def test_subscription_resolver_gates_events_through_sync_adapter(
    monkeypatch,
) -> None:
    """Subscription gating runs through the sync adapter."""

    calls: list[bool] = []

    async def subscribe(model: type[Group]):
        """Yield one payload without touching the channel layer."""

        assert model is Group
        yield _payload(id="9")

    def gate_event(
        model: type[Group],
        actor: object,
        payload: dict[str, object],
    ) -> ChangeEvent:
        """Return a visible event."""

        assert model is Group
        assert actor == ANON
        return ChangeEvent.from_payload(payload)

    def sync_adapter(
        func: Callable[[type[Group], object, dict[str, object]], ChangeEvent],
        *,
        thread_sensitive: bool,
    ) -> Callable[
        [type[Group], object, dict[str, object]],
        Awaitable[object],
    ]:
        """Record that the resolver offloads the sync gate."""

        assert func is gate_event
        calls.append(thread_sensitive)

        async def wrapper(
            model: type[Group],
            actor: object,
            payload: dict[str, object],
        ) -> object:
            return func(model, actor, payload)

        return wrapper

    monkeypatch.setattr(subscriptions, "_subscribe", subscribe)
    monkeypatch.setattr(subscriptions, "_gate_event", gate_event)
    monkeypatch.setattr(
        subscriptions,
        "sync_to_async",
        sync_adapter,
        raising=False,
    )
    surface = changes(Group, field="groupChanged")
    resolver = _subscription_resolver(surface)

    async def scenario() -> list[ChangeEvent]:
        events: list[ChangeEvent] = []
        info = SimpleNamespace(context={"actor": ANON})
        with actor_context(ANON):
            async for event in resolver(object(), info):
                events.append(event)
        return events

    events = asyncio.run(scenario())

    assert calls == [True]
    assert [event.id for event in events] == [strawberry.ID("9")]


def test_subscription_resolver_uses_current_actor(monkeypatch) -> None:
    """Subscription gating reads the ambient REBAC actor."""

    seen: list[object] = []

    async def subscribe(model: type[Group]):
        """Yield one payload without touching the channel layer."""

        assert model is Group
        yield _payload(id="10")

    def gate_event(
        model: type[Group],
        actor: object,
        payload: dict[str, object],
    ) -> ChangeEvent:
        """Record the actor used by the subscription gate."""

        assert model is Group
        seen.append((actor, current_actor()))
        return ChangeEvent.from_payload(payload)

    monkeypatch.setattr(subscriptions, "_subscribe", subscribe)
    monkeypatch.setattr(subscriptions, "_gate_event", gate_event)
    surface = changes(Group, field="groupChanged")
    resolver = _subscription_resolver(surface)

    async def scenario() -> list[ChangeEvent]:
        events: list[ChangeEvent] = []
        info = SimpleNamespace(context={})
        with actor_context(ANON):
            async for event in resolver(object(), info):
                events.append(event)
        return events

    events = asyncio.run(scenario())

    assert seen == [(ANON, ANON)]
    assert [event.id for event in events] == [strawberry.ID("10")]


def test_subscription_resolver_denies_without_current_actor(
    monkeypatch,
) -> None:
    """A subscription with no ambient actor yields no change events."""

    calls: list[object] = []

    async def subscribe(model: type[Group]):
        """Yield one payload without touching the channel layer."""

        assert model is Group
        yield _payload(id="11")

    def gate_event(
        model: type[Group],
        actor: object,
        payload: dict[str, object],
    ) -> ChangeEvent:
        """Fail if no-actor subscriptions reach row gating."""

        calls.append((model, actor, payload))
        return ChangeEvent.from_payload(payload)

    monkeypatch.setattr(subscriptions, "_subscribe", subscribe)
    monkeypatch.setattr(subscriptions, "_gate_event", gate_event)
    surface = changes(Group, field="groupChanged")
    resolver = _subscription_resolver(surface)

    async def scenario() -> list[ChangeEvent]:
        events: list[ChangeEvent] = []
        info = SimpleNamespace(context={})
        async for event in resolver(object(), info):
            events.append(event)
        return events

    events = asyncio.run(scenario())

    assert events == []
    assert calls == []


def test_ws_consumer_uses_rebac_channels_mixin() -> None:
    """The GraphQL WS consumer delegates actor setup to REBAC."""

    assert issubclass(AngeeGraphQLWSConsumer, RebacChannelsConsumerMixin)


def test_ws_query_runs_inside_actor_context() -> None:
    """GraphQL-over-WebSocket queries install the connection actor."""

    @strawberry.type
    class Query:
        """Minimal query root for the consumer."""

        @strawberry.field
        def actor_active(self) -> bool:
            """Return whether the ambient actor is installed."""

            return current_actor() == ANON

    async def scenario() -> dict[str, object]:
        application = AngeeGraphQLWSConsumer.as_asgi(
            schema=strawberry.Schema(query=Query)
        )
        communicator = WebsocketCommunicator(
            application,
            "/graphql",
            subprotocols=["graphql-transport-ws"],
        )
        communicator.scope["user"] = AnonymousUser()
        connected, _subprotocol = await communicator.connect()
        assert connected
        await communicator.send_json_to({"type": "connection_init"})
        assert await communicator.receive_json_from() == {
            "type": "connection_ack"
        }
        await communicator.send_json_to(
            {
                "id": "1",
                "type": "subscribe",
                "payload": {"query": "{ actorActive }"},
            }
        )
        payload = await communicator.receive_json_from()
        assert await communicator.receive_json_from() == {
            "id": "1",
            "type": "complete",
        }
        await communicator.disconnect()
        return payload

    result = asyncio.run(scenario())

    assert result == {
        "id": "1",
        "type": "next",
        "payload": {"data": {"actorActive": True}},
    }
    assert current_actor() is None
