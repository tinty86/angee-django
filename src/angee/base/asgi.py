"""ASGI application serving GraphQL over HTTP and WebSockets.

HTTP requests are handled by the Django ASGI app, so they pass through Django
middleware and reach the ``graphql/<name>/`` views in ``angee.base.urls``.
WebSocket connections for each contributed schema are routed to a Strawberry
Channels consumer, one route per schema name. Names are enumerated when the
application is built; serving happens after the runtime is composed, so every
addon ``graphql.py`` is importable at that point.
"""

from __future__ import annotations

import re
from typing import Any

from channels.auth import AuthMiddlewareStack
from channels.routing import ProtocolTypeRouter, URLRouter
from django.core.asgi import get_asgi_application
from django.urls import re_path
from strawberry.channels import GraphQLWSConsumer

from angee.base.graphql.schema import build_schema, collect_schema_names
from angee.base.graphql.subscriptions import scope_actor


class AngeeGraphQLWSConsumer(GraphQLWSConsumer[dict[str, object], None]):
    """GraphQL WebSocket consumer that resolves the REBAC actor on connect.

    HTTP requests get their actor from ``rebac.middleware.ActorMiddleware``;
    WebSocket connections bypass Django middleware, so the connection actor is
    resolved from the channels scope and attached to the GraphQL context for
    subscription read-gating.
    """

    async def get_context(
        self, request: Any, response: Any
    ) -> dict[str, object]:
        context = await super().get_context(request, response)
        context["actor"] = scope_actor(self.scope)
        return context


def build_application() -> ProtocolTypeRouter:
    """Return an ASGI app serving GraphQL over HTTP and WebSockets."""

    django_asgi_app = get_asgi_application()
    websocket_routes = [
        re_path(
            rf"^graphql/{re.escape(name)}/$",
            AngeeGraphQLWSConsumer.as_asgi(schema=build_schema(name)),
        )
        for name in collect_schema_names()
    ]
    return ProtocolTypeRouter(
        {
            "http": django_asgi_app,
            "websocket": AuthMiddlewareStack(URLRouter(websocket_routes)),
        }
    )
