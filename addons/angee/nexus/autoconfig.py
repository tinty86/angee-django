"""Settings fragments required by the nexus addon."""

from __future__ import annotations

SETTINGS = {
    # The tie rollup is a cheap single aggregation pass; hourly keeps recency,
    # gravity, and fading close to live without per-message write amplification.
    "CELERY_BEAT_SCHEDULE:append": {
        "nexus.recompute_ties": {
            "task": "nexus.recompute_ties",
            "schedule": 3600.0,
        },
    },
}
