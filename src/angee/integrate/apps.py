"""Django config for Angee's integration runtime addon."""

from __future__ import annotations

from types import ModuleType

from django.utils.functional import cached_property

from angee.base.apps import BaseAddonConfig


class IntegrateConfig(BaseAddonConfig):
    """Source app manifest for Angee integration runtime primitives."""

    default = True
    name = "angee.integrate"
    label = "integrate"
    depends_on = ("iam",)
    rebac_schema = None

    @cached_property
    def source_models_module(self) -> ModuleType | None:
        """Keep Capability/Bridge import-only; domain addons emit concrete subclasses."""

        return None
