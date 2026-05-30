"""Source models owned by the base addon."""

from __future__ import annotations

from collections.abc import Iterable
from pathlib import Path
from typing import TYPE_CHECKING, TypeAlias, cast

from django.core.exceptions import ImproperlyConfigured
from django.db import models

from angee.base.managers import ResourceManager
from angee.base.mixins import AngeeModel

if TYPE_CHECKING:
    from angee.base.apps import BaseAddonConfig

ResourcePaths: TypeAlias = str | Path | Iterable[str | Path] | None
"""One resource path or deterministic iterable of resource paths."""


class Resource(AngeeModel):
    """Ledger row for idempotent resource imports."""

    class Tier(models.TextChoices):
        """Resource file tiers persisted on ledger rows."""

        MASTER = "master", "Master"
        INSTALL = "install", "Install"
        DEMO = "demo", "Demo"

        @classmethod
        def from_value(cls, value: object) -> str:
            """Return a tier value from TextChoices or string shorthand."""

            if isinstance(value, cls):
                return value.value
            raw = str(value)
            try:
                return cls(raw).value
            except ValueError as exc:
                expected = ", ".join(cls.values)
                raise ImproperlyConfigured(
                    f"Unknown resource tier {raw!r}; "
                    f"expected one of {expected}"
                ) from exc

    @classmethod
    def get_manifest(
        cls,
        addon: BaseAddonConfig,
    ) -> dict[str, tuple[str, ...]]:
        """Return validated resource paths declared by one addon."""

        raw = addon.resources or {}
        manifest: dict[str, tuple[str, ...]] = {
            tier: () for tier in cls.Tier.values
        }
        for raw_tier, paths in raw.items():
            try:
                tier = cls.Tier.from_value(raw_tier)
            except ImproperlyConfigured as exc:
                raise ImproperlyConfigured(
                    f"{addon.name}.resources declares {raw_tier!r}: {exc}"
                ) from exc
            manifest[tier] = cls._paths_for_manifest_value(
                cast(ResourcePaths, paths)
            )
        return manifest

    @classmethod
    def _paths_for_manifest_value(
        cls,
        value: ResourcePaths,
    ) -> tuple[str, ...]:
        """Return relative paths from one resource manifest value."""

        if value is None:
            return ()
        if isinstance(value, str | Path):
            return (cls._relative_manifest_path(value),)
        if not isinstance(value, Iterable):
            raise ImproperlyConfigured(
                f"{value!r} is not a path or iterable of paths"
            )
        return tuple(cls._relative_manifest_path(path) for path in value)

    @classmethod
    def _relative_manifest_path(cls, value: object) -> str:
        """Return one safe resource path relative to the addon root."""

        raw = str(value)
        path = Path(raw)
        if not raw or path.is_absolute() or ".." in path.parts:
            raise ImproperlyConfigured(
                f"Resource path {raw!r} must be relative and stay inside "
                "the addon"
            )
        return raw

    source_addon = models.CharField(max_length=200)
    source_path = models.CharField(max_length=300)
    tier = models.CharField(max_length=40, choices=Tier.choices)
    xref = models.CharField(max_length=160, blank=True, default="")
    content_hash = models.CharField(max_length=64)
    target_model = models.CharField(max_length=120)
    target_id = models.CharField(max_length=120, blank=True, default="")
    loaded_at = models.DateTimeField(auto_now=True)

    objects = ResourceManager()

    class Meta:
        """Django model options."""

        abstract = True
        ordering = ("source_addon", "source_path", "xref", "target_model")
        constraints = (
            models.UniqueConstraint(
                fields=("source_addon", "source_path", "xref", "target_model"),
                name="base_resource_source_target",
            ),
        )
