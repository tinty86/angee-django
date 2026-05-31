"""Django config for Angee's IAM addon."""

from __future__ import annotations

from angee.base.apps import BaseAddonConfig


class IAMConfig(BaseAddonConfig):
    """Source app manifest for Angee identity models."""

    default = True
    name = "angee.iam"
    label = "iam"
    depends_on = ("base",)
