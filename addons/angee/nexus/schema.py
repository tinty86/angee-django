"""Strawberry-Django schema contributions for nexus.

Exposes the tie rollup (read-only except the stay-in-touch cadence), extends
parties' ``PartyType`` with its ``tie``, and serves the cross-channel person
timeline — a thin dispatcher over ``Message.objects.timeline_for_party`` (the
messaging manager owns the read mechanics and the actor stays in charge of
per-row visibility).
"""

from __future__ import annotations

from typing import cast

import strawberry
import strawberry_django
from django.apps import apps
from strawberry import auto

from angee.graphql.data import hasura_model_resource, public_pk_decoder
from angee.graphql.node import AngeeNode
from angee.graphql.subscriptions import changes
from angee.messaging.schema import MessageType
from angee.parties.schema import PartyType

Tie = apps.get_model("nexus", "Tie")
Party = apps.get_model("parties", "Party")
Message = apps.get_model("messaging", "Message")


@strawberry_django.type(Tie)
class TieType(AngeeNode):
    """GraphQL projection of a party's interaction rollup."""

    party: PartyType | None
    message_count: auto
    outbound_count: auto
    inbound_count: auto
    thread_count: auto
    platforms: strawberry.scalars.JSON
    first_interaction_at: auto
    last_interaction_at: auto
    gravity: auto
    is_fading: auto
    cadence_days: auto
    touch_due_at: auto
    updated_at: auto


@strawberry_django.type(Party, name="PartyType", extend=True)
class PartyTieExtension:
    """Contributes the nexus rollup onto parties' ``PartyType``.

    ``tie`` is the reverse one-to-one of ``Tie.party``; null until the first
    recompute sees a message exchanged with the party.
    """

    tie: TieType | None


@strawberry.type
class PartyTimelinePayload:
    """One newest-first page of a party's cross-channel timeline."""

    messages: list[MessageType]
    count: int


@strawberry.type
class NexusQuery:
    """Read surface for derived relationship intelligence."""

    @strawberry.field
    def party_timeline(
        self,
        info: strawberry.Info,
        party_id: strawberry.ID,
        search: str = "",
        before: strawberry.ID | None = None,
        limit: int = 50,
    ) -> PartyTimelinePayload:
        """Return messages exchanged with one party across every channel.

        Keyset-paginated newest-first: pass the oldest loaded message's id as
        ``before`` to fetch the previous page. Actor-scoped — the caller sees
        only messages their REBAC grants reach.
        """

        party = Party.objects.all().from_public_id(str(party_id))
        if party is None:
            raise ValueError("party not found")
        messages, count = Message.objects.timeline_for_party(
            party,
            search=search,
            before=str(before) if before is not None else None,
            limit=limit,
        )
        return PartyTimelinePayload(messages=cast("list[MessageType]", messages), count=count)


_TIE_RESOURCE = hasura_model_resource(
    TieType,
    model=Tie,
    name="ties",
    filterable=[
        "id",
        "party",
        "gravity",
        "is_fading",
        "message_count",
        "last_interaction_at",
        "touch_due_at",
    ],
    sortable=["gravity", "message_count", "last_interaction_at", "touch_due_at", "updated_at"],
    aggregatable=["id", "message_count", "gravity"],
    groupable=["is_fading"],
    # Rows are derived: created/refreshed by the recompute pass only. The
    # stay-in-touch cadence is the one human-owned column.
    insert=False,
    updatable=["cadence_days"],
    delete=False,
    field_id_decode={"party": public_pk_decoder(Party)},
)


_NEXUS_SCHEMA_BUCKET = {
    "query": [
        NexusQuery,
        _TIE_RESOURCE.query,
    ],
    "mutation": [
        _TIE_RESOURCE.mutation,
    ],
    "types": [
        TieType,
        PartyTimelinePayload,
        *_TIE_RESOURCE.types,
    ],
    "type_extensions": [
        PartyTieExtension,
    ],
}


schemas = {
    "public": {
        **_NEXUS_SCHEMA_BUCKET,
    },
    "console": {
        **_NEXUS_SCHEMA_BUCKET,
        "subscription": [
            changes(Tie, field="tieChanged"),
        ],
    },
}
