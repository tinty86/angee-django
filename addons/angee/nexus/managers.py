"""Managers that own the tie recompute write path.

The rollup is one aggregation pass over messaging participants grouped by the
handle's resolved party, plus a distinct platform sweep — both SQLite-safe (no
array aggregates). Recompute is idempotent and self-healing: a party whose
messages vanished is zeroed, not deleted, so a user-set cadence survives.
Callers run it elevated (the periodic task, a management shell) — the rows it
writes are server-derived bookkeeping.
"""

from __future__ import annotations

from typing import Any

from django.apps import apps
from django.db import models
from django.db.models.functions import Coalesce
from django.utils import timezone

from angee.base.models import AngeeManager


class TieManager(AngeeManager):
    """Owns the derived tie rows: the recompute pass and its bookkeeping."""

    def recompute(self, party_ids: Any | None = None, *, now: Any | None = None) -> int:
        """Recompute ties from messaging participants; return the number of live rollups.

        ``party_ids`` narrows the pass (the incremental path); ``None`` sweeps
        everything and zeroes ties whose interactions vanished. Record chatter is
        excluded to mirror the person-timeline (inbox) semantics — a party's tie
        counts what was actually exchanged with them on channels.
        """

        now = now or timezone.now()
        participant_model = apps.get_model("messaging", "Participant")
        message_model = apps.get_model("messaging", "Message")

        base = participant_model._base_manager.filter(
            message__isnull=False,
            handle__party__isnull=False,
            message__thread__attachments__isnull=True,
        )
        if party_ids is not None:
            base = base.filter(handle__party_id__in=list(party_ids))

        order_at = Coalesce("message__sent_at", "message__created_at")
        rows = base.values("handle__party_id").annotate(
            total=models.Count("message", distinct=True),
            outbound=models.Count(
                "message",
                filter=models.Q(message__direction=message_model.Direction.OUTBOUND),
                distinct=True,
            ),
            inbound=models.Count(
                "message",
                filter=models.Q(message__direction=message_model.Direction.INBOUND),
                distinct=True,
            ),
            threads=models.Count("message__thread", distinct=True),
            first_at=models.Min(order_at),
            last_at=models.Max(order_at),
        )

        platforms_by_party: dict[Any, set[str]] = {}
        for party_id, platform in base.values_list("handle__party_id", "message__platform").distinct().order_by():
            platforms_by_party.setdefault(party_id, set()).add(str(platform))

        live_party_ids: set[Any] = set()
        for row in rows:
            party_id = row["handle__party_id"]
            live_party_ids.add(party_id)
            platforms = sorted(platforms_by_party.get(party_id, set()))
            self.update_or_create(
                party_id=party_id,
                defaults={
                    "message_count": row["total"],
                    "outbound_count": row["outbound"],
                    "inbound_count": row["inbound"],
                    "thread_count": row["threads"],
                    "platforms": platforms,
                    "first_interaction_at": row["first_at"],
                    "last_interaction_at": row["last_at"],
                    "gravity": self.model.compute_gravity(
                        message_count=row["total"],
                        outbound_count=row["outbound"],
                        inbound_count=row["inbound"],
                        last_at=row["last_at"],
                        platform_count=len(platforms),
                        now=now,
                    ),
                    "is_fading": self.model.check_fading(
                        message_count=row["total"],
                        first_at=row["first_at"],
                        last_at=row["last_at"],
                        now=now,
                    ),
                },
            )

        stale = self.exclude(party_id__in=live_party_ids)
        if party_ids is not None:
            stale = stale.filter(party_id__in=list(party_ids))
        stale.update(
            message_count=0,
            outbound_count=0,
            inbound_count=0,
            thread_count=0,
            platforms=[],
            first_interaction_at=None,
            last_interaction_at=None,
            gravity=0.0,
            is_fading=False,
            touch_due_at=None,
        )
        return len(live_party_ids)
