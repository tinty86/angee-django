"""Django config for Angee's integration runtime addon."""

from __future__ import annotations

from angee.base.apps import BaseAddonConfig


class IntegrateConfig(BaseAddonConfig):
    """Source app manifest for Angee integration runtime primitives."""

    default = True
    name = "angee.integrate"
    label = "integrate"
    depends_on = ("iam",)
    rebac_schema = "permissions.zed"

    def _is_source_model(self, value: type) -> bool:
        """Keep import-only capability bases out of runtime emission."""

        if value.__name__ in {"Capability", "Bridge"}:
            return False
        return super()._is_source_model(value)
