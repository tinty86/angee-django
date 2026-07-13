"""Source models for the nexus addon.

One model: :class:`Tie`, the per-party interaction rollup. A tie is derived
bookkeeping — recomputed from messaging participants at any time — so its rows
carry no human-authored facts except the stay-in-touch ``cadence_days``. The
scoring formulas (gravity, fading) are pure functions on the model, sourced from
the fyltr nexus prototype: ``gravity = log2(volume) × recency × reciprocity ×
diversity``, and a tie fades when the current silence exceeds eight times the
average interval between messages.
"""

from __future__ import annotations

import datetime
import math
from typing import Any

from django.db import models

from angee.base.mixins import SqidMixin
from angee.base.models import AngeeModel
from angee.nexus.managers import TieManager


class Tie(SqidMixin, AngeeModel):
    """The derived interaction rollup between the workspace and one party.

    One row per party with any message history: counts and recency aggregated
    from messaging participants (record chatter excluded — it stays behind its
    record gate), the composite ``gravity`` score, the ``is_fading`` signal, and
    the user's stay-in-touch cadence. Access derives from the party row; the only
    writable column is ``cadence_days``.
    """

    runtime = True
    sqid_prefix = "tie_"

    party = models.OneToOneField(
        "parties.Party",
        on_delete=models.CASCADE,
        related_name="tie",
    )
    message_count = models.PositiveIntegerField(default=0)
    outbound_count = models.PositiveIntegerField(default=0)
    inbound_count = models.PositiveIntegerField(default=0)
    thread_count = models.PositiveIntegerField(default=0)
    platforms = models.JSONField(blank=True, default=list)
    """Sorted platform values the party has been reached through."""

    first_interaction_at = models.DateTimeField(null=True, blank=True)
    last_interaction_at = models.DateTimeField(null=True, blank=True, db_index=True)
    gravity = models.FloatField(default=0.0, db_index=True)
    is_fading = models.BooleanField(default=False, db_index=True)
    cadence_days = models.PositiveIntegerField(null=True, blank=True)
    """Stay-in-touch cadence in days — the one human-owned column."""

    touch_due_at = models.DateTimeField(null=True, blank=True, db_index=True)
    """Derived ``last_interaction_at + cadence_days``; server-owned (see ``save``)."""

    objects = TieManager()

    class Meta:
        """Django model options for the tie source model."""

        abstract = True
        ordering = ("-gravity", "sqid")
        rebac_resource_type = "nexus/tie"
        rebac_id_attr = "sqid"

    def __str__(self) -> str:
        """Return a readable rollup description for Django displays."""

        return f"tie:{self.party_id} g={self.gravity:.2f}"

    def save(self, *args: Any, **kwargs: Any) -> None:
        """Persist the row, re-deriving ``touch_due_at`` from cadence and recency.

        The derivation lives on the one write path so a cadence PATCH and a
        recompute agree; bulk ``update()`` callers (the stale-tie zero-out) set the
        column explicitly.
        """

        derived = self.derive_touch_due()
        if self.touch_due_at != derived:
            self.touch_due_at = derived
            update_fields = kwargs.get("update_fields")
            if update_fields is not None:
                kwargs["update_fields"] = list({*update_fields, "touch_due_at"})
        super().save(*args, **kwargs)

    def derive_touch_due(self) -> datetime.datetime | None:
        """Return when the party is next due, or ``None`` without cadence/history."""

        if not self.cadence_days or self.last_interaction_at is None:
            return None
        return self.last_interaction_at + datetime.timedelta(days=self.cadence_days)

    @staticmethod
    def compute_gravity(
        *,
        message_count: int,
        outbound_count: int,
        inbound_count: int,
        last_at: datetime.datetime | None,
        platform_count: int,
        now: datetime.datetime,
    ) -> float:
        """Return the composite tie strength: volume × recency × reciprocity × diversity.

        Reciprocity zeroes a one-directional stream (a newsletter is not a
        relationship); diversity rewards each extra platform a conversation
        spans. Pure math — no queries — so it is unit-testable in isolation.
        """

        if not message_count or last_at is None:
            return 0.0
        volume = math.log2(message_count + 1)
        days_since = max((now - last_at).total_seconds() / 86400.0, 0.0)
        recency = 1.0 / (1.0 + days_since / 30.0)
        top = max(outbound_count, inbound_count)
        reciprocity = (min(outbound_count, inbound_count) / top) if top else 0.0
        diversity = 1.0 + 0.1 * max(platform_count - 1, 0)
        return volume * recency * reciprocity * diversity

    @staticmethod
    def check_fading(
        *,
        message_count: int,
        first_at: datetime.datetime | None,
        last_at: datetime.datetime | None,
        now: datetime.datetime,
    ) -> bool:
        """Whether the current silence exceeds ``max(8 × avg interval, 60 days)``.

        The threshold adapts to each relationship's own rhythm: a daily thread
        fades after a week-plus of silence, a quarterly one only after two years;
        the 60-day floor keeps brand-new contacts from "fading" instantly. Fewer
        than two messages establish no rhythm, so they never fade.
        """

        if message_count < 2 or first_at is None or last_at is None:
            return False
        span_days = (last_at - first_at).total_seconds() / 86400.0
        avg_interval = span_days / max(message_count - 1, 1)
        threshold = max(8.0 * avg_interval, 60.0)
        gap_days = (now - last_at).total_seconds() / 86400.0
        return gap_days > threshold
