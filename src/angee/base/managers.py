"""Django managers for base addon source models."""

from __future__ import annotations

import csv
import hashlib
import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import TYPE_CHECKING, Any, cast

import yaml
from django.apps import apps
from django.conf import settings
from django.core.exceptions import (
    FieldDoesNotExist,
    ImproperlyConfigured,
    ValidationError,
)
from django.db import models, transaction
from django.db.models.utils import make_model_tuple

from angee.base.mixins import AngeeModel

if TYPE_CHECKING:
    from angee.base.apps import BaseAddonConfig


@dataclass(slots=True)
class ResourceEntry:
    """One declared resource file."""

    addon: BaseAddonConfig
    """Addon that owns the resource file."""

    tier: str
    """Resource tier value."""

    relative_path: str
    """Manifest path relative to the addon root."""

    absolute_path: Path
    """Resolved file path on disk."""

    _resource_rows: tuple[ResourceRow, ...] | None = field(
        default=None,
        init=False,
        repr=False,
    )

    def read_rows(self) -> list[dict[str, Any]]:
        """Read this YAML or CSV resource file."""

        if not self.absolute_path.exists():
            raise ImproperlyConfigured(
                f"{self.addon.name}.resources[{self.tier}] references "
                f"missing file {self.relative_path!r}"
            )
        suffix = self.absolute_path.suffix.lower()
        if suffix == ".csv":
            with self.absolute_path.open(
                newline="", encoding="utf-8"
            ) as handle:
                return [dict(row) for row in csv.DictReader(handle)]
        if suffix not in {".yaml", ".yml"}:
            raise ImproperlyConfigured(
                f"{self.relative_path!r} must be .csv, .yaml, or .yml"
            )
        payload = yaml.safe_load(
            self.absolute_path.read_text(encoding="utf-8")
        )
        if payload is None:
            return []
        if isinstance(payload, dict):
            payload = [payload]
        if not isinstance(payload, list):
            raise ImproperlyConfigured(
                f"{self.relative_path!r} must contain a list"
            )
        return [dict(row) for row in payload]

    def model_label_for(self, row: dict[str, Any]) -> str:
        """Return ``app.Model`` for one resource row."""

        raw = row.get("model")
        if not raw:
            raise ImproperlyConfigured(
                f"{self.relative_path!r} row is missing model"
            )
        return str(raw)

    def read_resource_rows(self) -> tuple[ResourceRow, ...]:
        """Return parsed resource rows from this file."""

        if self._resource_rows is None:
            self._resource_rows = tuple(
                ResourceRow.from_payload(self, row, index=index)
                for index, row in enumerate(self.read_rows())
            )
        return self._resource_rows


@dataclass(slots=True)
class ResourceRow:
    """One parsed row from an addon resource file."""

    entry: ResourceEntry
    """Resource file that declared this row."""

    model_label: str
    """Dotted model label targeted by this row."""

    fields: dict[str, Any]
    """Field values declared for the target model."""

    ledger_xref: str
    """Stable ledger key for this row."""

    content_hash: str
    """Stable hash of the field payload."""

    @classmethod
    def from_payload(
        cls,
        entry: ResourceEntry,
        payload: dict[str, Any],
        *,
        index: int,
    ) -> ResourceRow:
        """Return a parsed resource row from one YAML or CSV payload."""

        fields = cls._fields_for_payload(payload)
        xref = str(payload.get("xref") or "")
        return cls(
            entry=entry,
            model_label=entry.model_label_for(payload),
            fields=fields,
            ledger_xref=xref or f"row:{index}",
            content_hash=cls._content_hash(fields),
        )

    @staticmethod
    def _fields_for_payload(payload: dict[str, Any]) -> dict[str, Any]:
        """Return model fields from a row with optional nested ``fields``."""

        if "fields" in payload:
            fields = payload["fields"]
            if not isinstance(fields, dict):
                raise ImproperlyConfigured(
                    "resource row fields must be a mapping"
                )
            return dict(fields)
        return {
            key: value
            for key, value in payload.items()
            if key not in {"model", "xref"}
        }

    @staticmethod
    def _content_hash(fields: dict[str, Any]) -> str:
        """Return a stable hash for resource field values."""

        payload = json.dumps(
            fields, sort_keys=True, default=str, separators=(",", ":")
        )
        return hashlib.sha256(payload.encode()).hexdigest()


@dataclass(slots=True)
class ValidationResult:
    """Counts returned by resource validation."""

    checked_files: int
    """Number of files read."""

    checked_rows: int
    """Number of rows parsed."""


@dataclass(slots=True)
class LoadResult:
    """Counts returned by a resource load."""

    loaded: int
    """Rows created or updated."""

    skipped: int
    """Rows already matching the ledger hash."""


class ResourceQuerySet(models.QuerySet[Any]):
    """QuerySet API for resource ledger operations."""

    def get_manifest(
        self,
        addon: BaseAddonConfig,
    ) -> dict[str, tuple[str, ...]]:
        """Return resource paths declared by one addon."""

        return self.model.get_manifest(addon)

    def get_entries(
        self,
        *,
        tier: object | None = None,
        addons: tuple[BaseAddonConfig, ...] | None = None,
    ) -> tuple[ResourceEntry, ...]:
        """Return declared resource files in addon order."""

        from angee.base.discovery import discover_addons

        discovered = discover_addons() if addons is None else addons
        tiers = self._tiers(tier)
        entries: list[ResourceEntry] = []
        for addon in discovered:
            manifest = self.get_manifest(addon)
            for active_tier in tiers:
                for relative in manifest[active_tier]:
                    entries.append(
                        ResourceEntry(
                            addon=addon,
                            tier=active_tier,
                            relative_path=relative,
                            absolute_path=Path(addon.path) / relative,
                        )
                    )
        return tuple(entries)

    def validate_tier(
        self,
        *,
        tier: object | None = None,
        addons: tuple[BaseAddonConfig, ...] | None = None,
    ) -> ValidationResult:
        """Parse resource files and validate referenced models."""

        checked_files = 0
        checked_rows = 0
        for entry in self.get_entries(tier=tier, addons=addons):
            rows = entry.read_resource_rows()
            checked_files += 1
            checked_rows += len(rows)
            for row in rows:
                self._model_for_label(row.model_label)
        return ValidationResult(
            checked_files=checked_files,
            checked_rows=checked_rows,
        )

    def load_tier(
        self,
        *,
        tier: object,
        allow_non_dev: bool = False,
        addons: tuple[BaseAddonConfig, ...] | None = None,
    ) -> LoadResult:
        """Load one resource tier idempotently."""

        active_tier = self._tier_value(tier)
        if active_tier == self.model.Tier.DEMO and not (
            settings.DEBUG or allow_non_dev
        ):
            raise ImproperlyConfigured(
                "angee resources load demo requires DEBUG or --allow-non-dev"
            )

        rows = self._validated_rows(tier=active_tier, addons=addons)
        loaded = 0
        skipped = 0
        with transaction.atomic():
            for row in rows:
                changed = self._load_row(row)
                loaded += int(changed)
                skipped += int(not changed)
        return LoadResult(loaded=loaded, skipped=skipped)

    def diff_tier(self, *, tier: object) -> str:
        """Return a compact text summary of resource files in a tier."""

        active_tier = self._tier_value(tier)
        lines = [f"tier: {active_tier}"]
        for entry in self.get_entries(tier=active_tier):
            lines.append(
                f"{entry.addon.name}:{entry.relative_path}: "
                f"{len(entry.read_resource_rows())} rows"
            )
        return "\n".join(lines)

    def _tiers(self, tier: object | None) -> tuple[str, ...]:
        """Return all resource tiers or one normalized tier."""

        if tier is None:
            return tuple(self.model.Tier.values)
        return (self._tier_value(tier),)

    def _tier_value(self, tier: object) -> str:
        """Return one normalized resource tier value."""

        return self.model.Tier.from_value(tier)

    def _validated_rows(
        self,
        *,
        tier: object,
        addons: tuple[BaseAddonConfig, ...] | None,
    ) -> tuple[ResourceRow, ...]:
        """Return parsed rows after model labels have been validated."""

        rows: list[ResourceRow] = []
        for entry in self.get_entries(tier=tier, addons=addons):
            for row in entry.read_resource_rows():
                self._model_for_label(row.model_label)
                rows.append(row)
        return tuple(rows)

    def _load_row(self, row: ResourceRow) -> bool:
        """Create or update one row and its ledger entry."""

        model = self._model_for_label(row.model_label)
        ledger = self.model._default_manager.filter(
            source_addon=row.entry.addon.name,
            source_path=row.entry.relative_path,
            xref=row.ledger_xref,
            target_model=row.model_label,
        ).first()
        if (
            ledger
            and ledger.content_hash == row.content_hash
            and ledger.target_id
        ):
            if model.from_public_id(ledger.target_id) is not None:
                return False
        values = self._coerce_values(model, row.fields)
        obj = self._upsert_object(model, values, ledger=ledger)
        self.model._default_manager.update_or_create(
            source_addon=row.entry.addon.name,
            source_path=row.entry.relative_path,
            xref=row.ledger_xref,
            target_model=row.model_label,
            defaults={
                "content_hash": row.content_hash,
                "target_id": obj.public_id,
                "tier": row.entry.tier,
            },
        )
        return True

    def _model_for_label(self, label: str) -> type[AngeeModel]:
        """Resolve an Angee model label through Django's app registry."""

        try:
            app_label, model_name = make_model_tuple(label)
        except ValueError as exc:
            raise ImproperlyConfigured(
                f"Invalid model label {label!r}"
            ) from exc
        if not app_label or not model_name:
            raise ImproperlyConfigured(f"Invalid model label {label!r}")
        try:
            model = apps.get_model(app_label, model_name)
        except LookupError as exc:
            raise ImproperlyConfigured(f"Unknown model {label!r}") from exc
        if not issubclass(model, AngeeModel):
            raise ImproperlyConfigured(
                f"{label} must inherit AngeeModel to load resources"
            )
        return cast(type[AngeeModel], model)

    def _coerce_values(
        self,
        model: type[AngeeModel],
        fields: dict[str, Any],
    ) -> dict[str, Any]:
        """Coerce resource values through Django field metadata."""

        values: dict[str, Any] = {}
        for name, value in fields.items():
            try:
                field = model._meta.get_field(name)
            except FieldDoesNotExist as exc:
                raise ImproperlyConfigured(
                    f"{model._meta.label}.{name} is not a model field"
                ) from exc
            if field.many_to_many:
                raise ImproperlyConfigured(
                    f"{model._meta.label}.{name} many-to-many resources "
                    "are not supported yet"
                )
            values[name] = self._coerce_value(field, value)
        return values

    def _coerce_value(
        self,
        field: models.Field[Any, Any],
        value: Any,
    ) -> Any:
        """Coerce one scalar resource value through Django's field API."""

        if value == "" and field.null:
            return None
        try:
            return field.to_python(value)
        except ValidationError as exc:
            raise ImproperlyConfigured(
                f"{field.model._meta.label}.{field.name} cannot load {value!r}"
            ) from exc

    def _upsert_object(
        self,
        model: type[AngeeModel],
        values: dict[str, Any],
        *,
        ledger: models.Model | None,
    ) -> AngeeModel:
        """Update the ledger target or create a new model instance."""

        target_id = (
            getattr(ledger, "target_id", "") if ledger is not None else ""
        )
        if target_id:
            obj = model.from_public_id(str(target_id))
            if obj is not None:
                obj, _created = model._base_manager.update_or_create(
                    pk=obj.pk,
                    defaults=values,
                )
                return cast(AngeeModel, obj)
        return cast(AngeeModel, model._base_manager.create(**values))


ResourceManager = models.Manager.from_queryset(ResourceQuerySet)
"""Manager exposing resource ledger operations on ``Resource.objects``."""
