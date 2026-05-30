"""Source models owned by the resources subpackage."""

from __future__ import annotations

from django.core.exceptions import ImproperlyConfigured
from django.db import models

from angee.base.mixins.models import AngeeModel
from angee.base.resources.managers import ResourceManager


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

    source_addon = models.CharField(max_length=200)
    source_path = models.CharField(max_length=300)
    tier = models.CharField(max_length=40, choices=Tier.choices)
    xref = models.CharField(max_length=160)
    content_hash = models.CharField(max_length=71)
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
                name="%(app_label)s_resource_source_target",
            ),
        )
