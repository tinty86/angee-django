"""Settings fragments contributed when the social addon is installed."""

from __future__ import annotations

SETTINGS = {
    # Feed backends a ``social.Feed`` row may select. ``manual`` is the neutral
    # null-object (no source; ``ImplClassField`` requires a non-empty registry).
    # Source addons add their own with a yamlconf dotted key, e.g.
    # ``"ANGEE_SOCIAL_FEED_BACKEND_CLASSES.youtube"`` from ``social_integrate_youtube``.
    "ANGEE_SOCIAL_FEED_BACKEND_CLASSES": {
        "manual": "angee.social.backends.ManualFeedBackend",
    },
}
"""Django settings contributed when the social addon is installed."""
