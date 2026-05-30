"""Small abstract model mixins shared by source addons."""

from __future__ import annotations

from typing import Any

from django.core.exceptions import ImproperlyConfigured
from django.db import models
from django.db.models.utils import make_model_tuple
from rebac import RebacMixin


class TimestampMixin(models.Model):
    """Add creation and update timestamps to a source model."""

    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True, db_index=True)

    class Meta:
        """Django model options."""

        abstract = True


class AngeeModel(TimestampMixin, RebacMixin):
    """Default abstract base for composed Angee source models.

    Composing :class:`rebac.RebacMixin` gives every Angee model the
    REBAC-scoped manager and per-instance actor binding. A model stays an
    unscoped pass-through until it declares ``Meta.rebac_resource_type``
    (optionally ``rebac_id_attr``); from then on reads, writes, and field
    access are gated by the permission schema.
    """

    class Meta:
        """Django model options."""

        abstract = True

    @classmethod
    def get_composition_label(cls) -> str:
        """Return the normalized composition label for this source model."""

        return cls._meta.label_lower

    @classmethod
    def get_extension_target(cls) -> str | None:
        """Return the normalized model this source model extends, if any."""

        target = getattr(cls, "extends", None)
        if target in {None, ""}:
            return None
        return cls.normalize_model_label(str(target))

    @classmethod
    def normalize_model_label(cls, label: str) -> str:
        """Return a normalized ``app_label.model_name`` reference."""

        try:
            app_label, model_name = make_model_tuple(label)
        except ValueError as exc:
            raise ImproperlyConfigured(
                f"{cls.__module__}.{cls.__name__}.extends must be "
                "'app_label.ModelName'"
            ) from exc
        return f"{app_label}.{model_name}"

    @classmethod
    def get_declared_composition_fields(cls) -> tuple[str, ...]:
        """Return fields this source model declares for composition."""

        local_names = {
            field.name
            for field in (
                *cls._meta.local_fields,
                *cls._meta.local_many_to_many,
            )
        }
        inherited_names: set[str] = set()
        for base in cls.__mro__[1:]:
            meta = getattr(base, "_meta", None)
            if (
                not issubclass(base, models.Model)
                or meta is None
                or not meta.abstract
            ):
                continue
            inherited_names.update(
                field.name
                for field in (
                    *meta.local_fields,
                    *meta.local_many_to_many,
                )
            )
        return tuple(sorted(local_names - inherited_names))

    @classmethod
    def get_model_reference(cls) -> str:
        """Return a readable dotted reference to this model class."""

        return f"{cls.__module__}.{cls.__name__}"

    @classmethod
    def get_extension_bases(cls) -> tuple[type[models.Model], ...]:
        """Return abstract bases this extension contributes to a target model.

        Extension marker classes may inherit field/behavior mixins and carry
        only ``extends`` themselves. If no contributed base exists, the
        extension class itself is the contribution, preserving direct
        field-bearing extension classes.
        """

        contributed = tuple(
            base
            for base in cls.__bases__
            if (
                isinstance(base, type)
                and issubclass(base, models.Model)
                and base not in {models.Model, TimestampMixin, AngeeModel}
            )
        )
        return contributed or (cls,)

    @property
    def public_id(self) -> str:
        """Return the stable external id for this model instance."""

        return str(self.pk)

    @classmethod
    def from_public_id(cls, value: str) -> Any | None:
        """Return the row with this external id or ``None``."""

        return cls._default_manager.filter(pk=value).first()


class SqidMixin(models.Model):
    """Lookup helper for models with an explicit ``sqid`` field."""

    class Meta:
        """Django model options."""

        abstract = True

    @classmethod
    def from_sqid(cls, sqid: str) -> Any | None:
        """Return the row with ``sqid`` or ``None``."""

        return cls._default_manager.filter(sqid=sqid).first()

    @property
    def public_id(self) -> str:
        """Return the opaque sqid for this model instance."""

        return str(self.sqid)

    @classmethod
    def from_public_id(cls, value: str) -> Any | None:
        """Return the row with this opaque external id or ``None``."""

        return cls.from_sqid(value)
