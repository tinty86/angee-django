"""Library-backed CRUD mutation surfaces for source addons.

``crud`` builds a Strawberry mutation type whose fields delegate to
``strawberry_django.mutations``. Validation, persistence, and write
authorization stay with strawberry-django and the model's REBAC-scoped manager;
this only names the fields and binds their return type. The result drops into a
schema ``"mutation"`` parts list alongside hand-written surfaces.
"""

from __future__ import annotations

from typing import Any

import strawberry
import strawberry_django
from django.core.exceptions import ImproperlyConfigured


def crud(
    node: type,
    *,
    create: type | None = None,
    update: type | None = None,
    delete: bool = False,
    name: str | None = None,
    permission_classes: list[type] | None = None,
) -> type:
    """Return a Strawberry mutation surface for one model type.

    ``node`` is a ``strawberry_django`` type bound to a Django model.
    ``create`` and ``update`` take the input types for those mutations;
    ``delete`` enables a delete field. Field names are derived from the model
    (``createNote`` and so on) unless ``name`` overrides the singular.
    """

    singular = name or _model_name(node)
    annotations: dict[str, Any] = {}
    namespace: dict[str, Any] = {"__annotations__": annotations}

    def add(verb: str, field: Any) -> None:
        attr = f"{verb}_{singular}"
        annotations[attr] = node
        namespace[attr] = field

    if create is not None:
        add("create", strawberry_django.mutations.create(
            create, permission_classes=permission_classes))
    if update is not None:
        add("update", strawberry_django.mutations.update(
            update, permission_classes=permission_classes))
    if delete:
        add("delete", strawberry_django.mutations.delete(
            permission_classes=permission_classes))

    if not annotations:
        raise ImproperlyConfigured(
            f"crud({_surface_name(node)}) needs at least one of create, "
            "update, or delete"
        )
    surface = type(f"{_capitalize(singular)}Mutation", (), namespace)
    return strawberry.type(surface)


def _model_name(node: type) -> str:
    """Return the Django model name backing a strawberry-django type."""

    definition = getattr(node, "__strawberry_django_definition__", None)
    if definition is None:
        raise ImproperlyConfigured(
            f"{_surface_name(node)} is not a strawberry_django type"
        )
    return definition.model._meta.model_name


def _capitalize(singular: str) -> str:
    """Return the singular with its first letter upper-cased."""

    return singular[:1].upper() + singular[1:]


def _surface_name(node: object) -> str:
    """Return a readable label for a node type in error messages."""

    return getattr(node, "__name__", repr(node))
