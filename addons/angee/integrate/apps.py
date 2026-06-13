"""Django config for Angee's integration runtime addon."""

from __future__ import annotations

from django.apps import AppConfig


class IntegrateConfig(AppConfig):
    """Source app manifest for Angee integration runtime primitives."""

    default = True
    angee_addon = True
    default_auto_field = "django.db.models.BigAutoField"
    name = "angee.integrate"
    label = "integrate"
    depends_on = ("angee.iam",)
    schemas = "schema.schemas"
    permissions = "permissions.zed"

    resources = {
        "master": ({"path": "resources/master/010_integrate.vendor.yaml", "adopt": "slug"},),
    }
    """Default third-party vendor catalogue, adopted by slug so reloads stay idempotent."""
