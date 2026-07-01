"""Django config for Angee's integration runtime addon."""

from __future__ import annotations

from django.apps import AppConfig


class IntegrateConfig(AppConfig):
    """Source app manifest for Angee integration runtime primitives."""

    default = True
    name = "angee.integrate"

    def ready(self) -> None:
        """Wire integration-owned denormalization maintenance after app population."""

        super().ready()
        from angee.integrate import resource_source, signals

        signals.connect()
        # Contribute the networked `url` resource source up into the resources addon
        # (the legal integrate -> resources direction), so resources stays local-only.
        resource_source.register()
