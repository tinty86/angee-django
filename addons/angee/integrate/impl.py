"""Integration implementation descriptors.

An ``Integration`` row stores the registry key for the implementation that owns
its behavior. Concrete addons contribute subclasses through
``ANGEE_INTEGRATION_IMPLS``; this base keeps only the shared catalogue/connect
metadata and the optional one-to-one companion binding.
"""

from __future__ import annotations

from typing import Any

from django.apps import apps
from django.core.exceptions import ObjectDoesNotExist


class IntegrationImpl:
    """Base descriptor for one row-selected integration implementation."""

    category = "none"
    companion_model: str | None = None
    label = "Integration"
    icon = ""
    oauth_client = ""

    def __init__(self, integration: Any, companion: Any | None = None) -> None:
        """Bind this implementation to its owning integration and companion row."""

        self.integration = integration
        self.companion = companion

    @classmethod
    def companion_for(cls, integration: Any) -> Any | None:
        """Return this implementation's declared companion row when it exists."""

        if not cls.companion_model:
            return None
        app_label, model_name = cls.companion_model.split(".", 1)
        model = apps.get_model(app_label, model_name)
        related_name = f"{model._meta.app_label}_{model._meta.model_name}"
        try:
            return getattr(integration, related_name)
        except ObjectDoesNotExist:
            return None


class NullIntegrationImpl(IntegrationImpl):
    """Neutral implementation for draft rows with no capability companion."""

