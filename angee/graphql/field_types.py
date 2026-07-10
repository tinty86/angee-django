"""Teach strawberry-django to resolve custom model value fields under ``auto``.

strawberry-django maps a Django model field to its GraphQL type through
``field_type_map`` — an **exact-class** lookup with no MRO walk (see
``strawberry_django.fields.types.resolve_model_field_type``). An Angee value
field that subclasses a Django field but adds only a semantic declaration keeps
the base field's wire shape, yet ``auto`` raises ``NotImplementedError`` on the
subclass because its exact class is absent from the map. Registering the subclass
beside the base it wraps is the strawberry-django-native fix: field owners call
the singular :func:`register_field_type` seam from their ``AppConfig.ready()``
before schema construction resolves ``auto``.

Choice and id fields need no entry: strawberry-django resolves ``StateField`` by
``isinstance`` against ``django-choices-field``'s ``TextChoicesField``, and the
opaque-id ``SqidField`` is a non-concrete column projected explicitly as
``strawberry.ID`` by ``AngeeNode`` — neither reaches ``field_type_map``.
"""

from __future__ import annotations

from typing import Any

from django.db import models
from strawberry_django.fields.types import field_type_map


def register_field_type(field_class: type[models.Field[Any, Any]], wire_type: type) -> None:
    """Map one Django model field subclass to the GraphQL type it projects under ``auto``.

    This is the extension seam a field's owning addon uses to teach
    strawberry-django its wire type: a value field that subclasses a Django field
    but adds only a semantic declaration keeps the base field's wire shape, yet the
    exact-class ``field_type_map`` lookup misses the subclass. An addon registers its
    own field here (from its ``AppConfig.ready()``, before any schema builds) so a
    consumer can write ``field: auto`` instead of hand-annotating the wire type.
    Idempotent — a plain dict assignment safe to run once per process.
    """

    field_type_map[field_class] = wire_type
