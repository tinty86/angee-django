"""Default backend URL routes for composed hosts.

Each contributed schema is served over HTTP at ``graphql/<name>/`` through the
Strawberry Django view, so requests pass through Django middleware (notably the
REBAC actor middleware). WebSocket transport for the same names is added by
``angee.base.asgi``. Schemas are built lazily on first request and cached per
worker; an unknown name answers ``404`` with the available names.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Any

from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from django.http import Http404, HttpResponse
from django.urls import path
from strawberry.django.views import GraphQLView

from angee.base.graphql.schema import build_schema


@lru_cache(maxsize=None)
def _view_for(schema_name: str) -> Any:
    """Return the cached GraphQL view serving one named schema."""

    return GraphQLView.as_view(
        schema=build_schema(schema_name),
        graphql_ide=settings.ANGEE_GRAPHQL_IDE,
    )


def graphql_endpoint(request: object, schema_name: str) -> HttpResponse:
    """Dispatch to the named schema's view, 404-ing on unknown names."""

    try:
        view = _view_for(schema_name)
    except ImproperlyConfigured as exc:
        raise Http404(str(exc)) from exc
    return view(request)


urlpatterns = [
    path("graphql/<str:schema_name>/", graphql_endpoint),
]
