"""Import-export widgets for cross-addon xref resolution."""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from django.apps import apps
from django.db import models
from django.db.models import Q
from django.db.models.utils import make_model_tuple
from import_export import widgets

from angee.base.mixins.models import AngeeModel

_active_ledger_model: type[models.Model] | None = None


def set_ledger_model(model: type[models.Model] | None) -> None:
    """Set the concrete Resource model for the current load context."""

    global _active_ledger_model  # noqa: PLW0603
    _active_ledger_model = model


def _ledger_manager() -> models.Manager[Any]:
    """Return the concrete Resource model's default manager."""

    if _active_ledger_model is not None:
        return _active_ledger_model._default_manager
    return apps.get_model("base", "Resource")._default_manager


class XrefForeignKeyWidget(widgets.ForeignKeyWidget):
    """Resolve ``<addon>.<xref>`` foreign keys through the ledger."""

    def clean(
        self,
        value: Any,
        row: Mapping[str, Any] | None = None,
        **kwargs: Any,
    ) -> Any:
        """Return the target object or id for one xref."""

        del row, kwargs
        if value in (None, ""):
            return None
        if not isinstance(value, str):
            raise ValueError("xref foreign keys must be strings")
        target = resolve_xref(value)
        if target._meta.concrete_model is not self.model._meta.concrete_model:
            raise ValueError(
                f"xref {value!r} targets {target._meta.label}, "
                f"not {self.model._meta.label}"
            )
        return target.pk if self.key_is_id else target


class XrefManyToManyWidget(widgets.ManyToManyWidget):
    """Resolve list or comma-separated xrefs through the ledger."""

    def clean(
        self,
        value: Any,
        row: Mapping[str, Any] | None = None,
        **kwargs: Any,
    ) -> list[models.Model]:
        """Return target objects for xref values."""

        del row, kwargs
        targets: list[models.Model] = []
        for ref in xref_list(value):
            target = resolve_xref(ref)
            if (
                target._meta.concrete_model
                is not self.model._meta.concrete_model
            ):
                raise ValueError(
                    f"xref {ref!r} targets {target._meta.label}, "
                    f"not {self.model._meta.label}"
                )
            targets.append(target)
        return targets


class NativeJSONWidget(widgets.JSONWidget):
    """JSON widget that accepts native YAML and JSON values."""

    def clean(
        self,
        value: Any,
        row: Mapping[str, Any] | None = None,
        **kwargs: Any,
    ) -> Any:
        """Return native JSON values unchanged."""

        if isinstance(value, dict | list | bool | int | float):
            return value
        return super().clean(value, row=row, **kwargs)


def resolve_xref(value: str) -> models.Model:
    """Resolve ``<addon>.<xref>`` through the resource ledger."""

    if "." not in value:
        raise ValueError("xrefs must use <addon>.<xref>")
    addon_ref, xref = value.split(".", 1)
    ledger = (
        _ledger_manager()
        .filter(xref=xref)
        .filter(
            Q(source_addon=addon_ref)
            | Q(source_addon__endswith=f".{addon_ref}")
        )
        .exclude(target_id="")
        .order_by("source_addon", "source_path", "target_model", "pk")
        .first()
    )
    if ledger is None:
        raise ValueError(f"unresolved xref {value!r}")
    model = _model_from_label(str(getattr(ledger, "target_model")))
    target = _instance_from_public_id(model, str(getattr(ledger, "target_id")))
    if target is None:
        raise ValueError(f"xref {value!r} has no ORM target")
    return target


def xref_list(value: Any) -> list[str]:
    """Return a list of xref strings from scalar or sequence input."""

    if value in (None, ""):
        return []
    if isinstance(value, str):
        return [item.strip() for item in value.split(",") if item.strip()]
    if isinstance(value, list | tuple):
        refs: list[str] = []
        for item in value:
            if not isinstance(item, str):
                raise ValueError("many-to-many values must be xref strings")
            refs.append(item)
        return refs
    raise ValueError("many-to-many values must be a list or string")


def _model_from_label(label: str) -> type[models.Model]:
    """Return one model class from a stored model label."""

    app_label, model_name = make_model_tuple(label)
    return apps.get_model(app_label, model_name)


def _instance_from_public_id(
    model: type[models.Model],
    value: str,
) -> models.Model | None:
    """Return a model row by public id or primary key."""

    from_public_id = getattr(model, "from_public_id", None)
    if callable(from_public_id):
        return from_public_id(value)
    return model._default_manager.filter(pk=value).first()


def public_id(instance: models.Model) -> str:
    """Return an instance public id or primary key."""

    if isinstance(instance, AngeeModel):
        return instance.public_id
    return str(instance.pk)
