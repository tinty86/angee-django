"""Channels WebSocket consumers for GraphQL subscriptions."""

from __future__ import annotations

from collections.abc import Mapping
from types import SimpleNamespace
from typing import Any

from rebac import SubjectRef, actor_context, anonymous_actor
from rebac.actors import get_actor_resolver
from strawberry.channels import GraphQLWSConsumer
from strawberry.subscriptions.protocols.graphql_transport_ws.handlers import (
    BaseGraphQLTransportWSHandler,
    Operation,
)
from strawberry.subscriptions.protocols.graphql_ws.handlers import (
    BaseGraphQLWSHandler,
)


class AngeeGraphQLTransportWSHandler(
    BaseGraphQLTransportWSHandler[dict[str, object], None]
):
    """GraphQL transport WS handler that installs the connection actor."""

    async def run_operation(
        self,
        operation: Operation[dict[str, object], None],
    ) -> None:
        """Run one operation inside the ambient actor context."""

        actor = _handler_actor(self.context, _handler_scope(self.view))
        with actor_context(actor):
            await super().run_operation(operation)


class AngeeGraphQLWSHandler(BaseGraphQLWSHandler[dict[str, object], None]):
    """Legacy GraphQL WS handler that installs the connection actor."""

    async def handle_async_results(
        self,
        operation_id: str,
        query: str,
        operation_name: str | None,
        variables: dict[str, object] | None,
    ) -> None:
        """Run one subscription operation inside the ambient actor context."""

        actor = _handler_actor(self.context, _handler_scope(self.view))
        with actor_context(actor):
            await super().handle_async_results(
                operation_id,
                query,
                operation_name,
                variables,
            )


class AngeeGraphQLWSConsumer(GraphQLWSConsumer[dict[str, object], None]):
    """GraphQL WebSocket consumer that attaches a REBAC actor."""

    graphql_transport_ws_handler_class = AngeeGraphQLTransportWSHandler
    graphql_ws_handler_class = AngeeGraphQLWSHandler

    async def get_context(
        self,
        request: Any,
        response: Any,
    ) -> dict[str, object]:
        """Return Strawberry context with the connection actor attached."""

        context = await super().get_context(request, response)
        context["actor"] = scope_actor(self.scope)
        return context


def scope_actor(scope: Mapping[str, Any]) -> SubjectRef:
    """Resolve the REBAC actor for a Channels connection scope."""

    request = SimpleNamespace(user=scope.get("user"))
    return get_actor_resolver()(request) or anonymous_actor()


def _handler_actor(context: object, scope: Mapping[str, Any]) -> SubjectRef:
    """Return the actor bound to one WebSocket handler."""

    if isinstance(context, Mapping):
        actor = context.get("actor")
        if isinstance(actor, SubjectRef):
            return actor
    return scope_actor(scope)


def _handler_scope(view: object) -> Mapping[str, Any]:
    """Return the Channels scope carried by a Strawberry view."""

    scope = getattr(view, "scope", {})
    if isinstance(scope, Mapping):
        return scope
    return {}
