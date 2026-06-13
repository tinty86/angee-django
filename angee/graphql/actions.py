"""Shared GraphQL result type for console domain actions."""

from __future__ import annotations

import strawberry


@strawberry.type
class ActionResult:
    """Outcome of a console domain action: a success flag and a human message.

    Returned by non-CRUD action mutations (sync, test, discover, …) so the client
    can surface a toast and refresh the affected record.
    """

    ok: bool
    message: str
