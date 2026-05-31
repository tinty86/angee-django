"""Angee model field types.

Thin semantic wrappers over the libraries ``docs/stack.md`` names as the owner
of each concern. Angee adds only the naming and the framework default; the
library owns the behavior.
"""

from __future__ import annotations

from typing import Any

from django_choices_field import TextChoicesField


class StateField(TextChoicesField):
    """A finite-state column backed by a ``TextChoices`` enum.

    ``docs/stack.md`` names ``django-choices-field`` the owner of enum-backed
    model fields; this is the ``StateField`` semantic wrapper it lists. The
    enum is the single source of truth — ``strawberry-django`` emits the
    GraphQL enum straight from ``choices_enum`` and the column ``max_length``
    is derived from it, so a state column never restates its choices. Declared
    natively, e.g. ``StateField(choices_enum=Note.Status, default=...)``.
    """

    def __init__(self, **kwargs: Any) -> None:
        """Default a state column to indexed; it is what queries filter on."""

        kwargs.setdefault("db_index", True)
        super().__init__(**kwargs)
