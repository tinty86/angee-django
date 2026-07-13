"""Nexus — derived relationship intelligence over parties × messaging.

Everything here is computed, never authoritative: the human-owned facts (who a
party is, its circles, its typed relationships) live in ``angee.parties``;
messages live in ``angee.messaging``. Nexus overlays them with a per-party
interaction rollup (:class:`~angee.nexus.models.Tie` — counts, recency, gravity,
fading, stay-in-touch cadence) and the cross-channel person timeline read, so
deleting the addon loses no source data.
"""
