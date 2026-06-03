"""Shared REBAC relationship-write primitives for Angee addons.

Kept free of ``angee.base.graphql`` imports so model modules can import it
during app population without a circular import.
"""

from __future__ import annotations

from typing import Any

from rebac import RelationshipTuple, to_object_ref, to_subject_ref, write_relationships


def grant_owner(resource: Any, subject: Any) -> None:
    """Write one ``owner`` relationship tuple for a newly created resource.

    Runs inside the caller's ambient ``system_context`` + ``transaction.atomic``
    so the owner grant commits or rolls back together with the row it owns.
    """

    write_relationships(
        [
            RelationshipTuple(
                resource=to_object_ref(resource),
                relation="owner",
                subject=to_subject_ref(subject),
            )
        ]
    )
