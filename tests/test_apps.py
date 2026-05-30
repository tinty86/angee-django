"""Tests for addon AppConfig contracts."""

from __future__ import annotations

from pathlib import Path
from types import ModuleType
from typing import ClassVar

import pytest
from django.core.exceptions import ImproperlyConfigured

from angee.base.apps import BaseAddonConfig
from angee.base.models import Resource


class ResourceConfig(BaseAddonConfig):
    """Tiny addon config used to exercise resource manifest parsing."""

    name = "tests.resource_addon"
    label = "resource_addon"
    resources: ClassVar[dict[object, object]] = {
        Resource.Tier.INSTALL: ("resources/install.yaml",),
        "demo": "resources/demo.yaml",
    }


def config_for(tmp_path: Path) -> ResourceConfig:
    """Return a resource config with a concrete app root."""

    module = ModuleType(ResourceConfig.name)
    module.__file__ = str(tmp_path / "__init__.py")
    return ResourceConfig(ResourceConfig.name, module)


def test_resource_manifest_accepts_enum_keys_and_string_shorthand(
    tmp_path: Path,
) -> None:
    """Resource tiers are enum-owned while AppConfigs stay easy to author."""

    manifest = config_for(tmp_path).get_resource_manifest()

    assert manifest[Resource.Tier.MASTER] == ()
    assert manifest[Resource.Tier.INSTALL] == ("resources/install.yaml",)
    assert manifest[Resource.Tier.DEMO] == ("resources/demo.yaml",)


def test_resource_manifest_rejects_unknown_tiers(tmp_path: Path) -> None:
    """Unknown resource tiers fail at the manifest owner."""

    class BrokenConfig(ResourceConfig):
        resources: ClassVar[dict[str, tuple[str, ...]]] = {
            "fixture": ("resources/fixture.yaml",)
        }

    module = ModuleType(BrokenConfig.name)
    module.__file__ = str(tmp_path / "__init__.py")
    config = BrokenConfig(BrokenConfig.name, module)

    with pytest.raises(ImproperlyConfigured, match="Unknown resource tier"):
        config.get_resource_manifest()
