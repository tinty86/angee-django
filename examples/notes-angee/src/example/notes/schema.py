"""Strawberry-Django schema contributions for notes."""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, cast

import strawberry
import strawberry_django
from django.apps import apps
from django.db.models import QuerySet
from rebac import MissingActorError, current_actor
from strawberry import auto, relay
from strawberry_django_aggregates.compiler import (
    aggregate_alias,
    compute_aggregation,
    group_by_alias,
)
from strawberry_django_aggregates.granularity import (
    Granularity,
    TimeGranularity,
)
from strawberry_django_aggregates.operators import AggregateOp

from angee.base.graphql import AngeeNode, Connection, changes, crud

Note = apps.get_model("notes", "Note")
_COUNT_ALIAS = aggregate_alias(AggregateOp.COUNT, None)

# Register the model's TextChoices as the one GraphQL enum, named for the addon
# so the wire type does not collide with another addon's ``Status``. This
# single registration is what ``status: auto`` on NoteType resolves to, so the
# type, inputs, filter, and aggregate bucket all share one ``NoteStatus``.
NoteStatus = strawberry.enum(Note.Status, name="NoteStatus")


@strawberry.enum
class NoteGroupBy(Enum):
    """Allowed note aggregate groupings."""

    STATUS = "status"
    IS_STARRED = "is_starred"
    UPDATED_AT_MONTH = "updated_at_month"


_GROUP_BY_SPECS: dict[NoteGroupBy, tuple[str, Granularity | None]] = {
    NoteGroupBy.STATUS: ("status", None),
    NoteGroupBy.IS_STARRED: ("is_starred", None),
    NoteGroupBy.UPDATED_AT_MONTH: ("updated_at", TimeGranularity.MONTH),
}


@strawberry_django.type(Note)
class NoteType(AngeeNode):
    """GraphQL projection of a note."""

    title: auto
    body: auto
    status: auto
    tags: auto
    is_starred: auto
    created_at: auto
    updated_at: auto

    @strawberry_django.field(only=["body"])
    def word_count(self) -> int:
        """Return the computed word count."""

        return cast(int, self.word_count)


@strawberry.input
class NoteInput:
    """Fields accepted when creating a note."""

    title: str
    body: str = ""
    status: NoteStatus = NoteStatus.DRAFT
    tags: list[str] = strawberry.field(default_factory=list)
    is_starred: bool = False


@strawberry.input
class NotePatch:
    """Fields accepted when updating a note."""

    id: relay.GlobalID
    title: str | None = strawberry.UNSET
    body: str | None = strawberry.UNSET
    status: NoteStatus | None = strawberry.UNSET
    tags: list[str] | None = strawberry.UNSET
    is_starred: bool | None = strawberry.UNSET


@strawberry_django.filter_type(Note, lookups=True)
class NoteFilter:
    """Field lookups accepted when filtering the notes connection."""

    status: auto
    is_starred: auto
    title: auto


@strawberry_django.order_type(Note)
class NoteOrder:
    """Orderings accepted by the notes connection."""

    title: auto
    status: auto
    updated_at: auto
    created_at: auto


@strawberry.type
class NotesQuery:
    """Public notes queries."""

    notes: Connection[NoteType] = strawberry_django.connection(
        filters=NoteFilter,
        order=NoteOrder,
    )
    note: NoteType | None = strawberry_django.node()


@strawberry.type
class NoteGrouped:
    """One actor-scoped note aggregate bucket."""

    count: int
    status: NoteStatus | None = None
    is_starred: bool | None = None
    updated_at_month: datetime | None = None


@strawberry.type
class NoteAggregate:
    """Actor-scoped aggregate over notes."""

    count: int
    groups: list[NoteGrouped]


@strawberry.type
class NotesAggregateQuery:
    """Public notes aggregate queries."""

    @strawberry.field
    def note_aggregate(
        self,
        group_by: list[NoteGroupBy] | None = None,
    ) -> NoteAggregate:
        """Return actor-scoped note counts grouped by allowed fields."""

        specs = [_GROUP_BY_SPECS[value] for value in group_by or []]
        rows = cast(
            list[dict[str, Any]],
            compute_aggregation(
                _scoped_note_queryset(),
                group_by=specs,
                aggregates=[(AggregateOp.COUNT, None)],
                order_by=[
                    (group_by_alias(field, granularity), "asc", None)
                    for field, granularity in specs
                ],
            ),
        )
        if not specs:
            count = _row_count(rows[0]) if rows else 0
            return NoteAggregate(count=count, groups=[])

        groups = [_grouped_from_row(row, group_by or []) for row in rows]
        return NoteAggregate(
            count=sum(group.count for group in groups),
            groups=groups,
        )


def _scoped_note_queryset() -> QuerySet[Any]:
    """Return notes with the ambient REBAC actor eagerly applied."""

    actor = current_actor()
    if actor is None:
        raise MissingActorError(
            "noteAggregate requires an authenticated actor"
        )
    queryset = Note.objects.all().with_actor(actor).on_field_deny("allow")
    cast(Any, queryset)._apply_scope_in_place()
    return cast(QuerySet[Any], queryset)


def _grouped_from_row(
    row: dict[str, Any],
    group_by: list[NoteGroupBy],
) -> NoteGrouped:
    """Return GraphQL output for one aggregate row."""

    status = _group_value(row, NoteGroupBy.STATUS, group_by)
    return NoteGrouped(
        count=_row_count(row),
        status=Note.Status(status) if status is not None else None,
        is_starred=cast(
            bool | None,
            _group_value(row, NoteGroupBy.IS_STARRED, group_by),
        ),
        updated_at_month=cast(
            datetime | None,
            _group_value(
                row,
                NoteGroupBy.UPDATED_AT_MONTH,
                group_by,
            ),
        ),
    )


def _group_value(
    row: dict[str, Any],
    value: NoteGroupBy,
    group_by: list[NoteGroupBy],
) -> Any:
    """Return one grouped value if it was requested."""

    if value not in group_by:
        return None
    field, granularity = _GROUP_BY_SPECS[value]
    return row.get(group_by_alias(field, granularity))


def _row_count(row: dict[str, Any]) -> int:
    """Return the count aggregate from a compute-layer row."""

    return int(row.get(_COUNT_ALIAS) or 0)


schemas = {
    "public": {
        "query": [NotesQuery, NotesAggregateQuery],
        "mutation": [
            crud(NoteType, create=NoteInput, update=NotePatch, delete=True)
        ],
        "types": [NoteType, NoteAggregate, NoteGrouped],
    },
    "console": {
        "query": [NotesQuery, NotesAggregateQuery],
        "mutation": [
            crud(NoteType, create=NoteInput, update=NotePatch, delete=True)
        ],
        "subscription": [changes(Note, field="noteChanged")],
        "types": [NoteType, NoteAggregate, NoteGrouped],
    },
}
