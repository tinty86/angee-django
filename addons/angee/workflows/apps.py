"""Django config for Angee's workflows addon."""

from __future__ import annotations

from django.apps import AppConfig


class WorkflowsConfig(AppConfig):
    """Source app manifest for workflow definition models."""

    default = True
    name = "angee.workflows"

    def ready(self) -> None:
        """Run workflows ready-time hooks after app population."""

        super().ready()
        # Phase-1 ready hooks belong here when workflows needs populated models.
