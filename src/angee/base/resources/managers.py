"""QuerySet and manager for the Resource ledger."""

from __future__ import annotations

from collections.abc import Iterable
from typing import TYPE_CHECKING, Any, cast

from django.apps import apps
from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from django.db import models, transaction
from django.db.models.utils import make_model_tuple
from import_export.exceptions import ImportError as ResourceImportError
from rebac import system_context

from angee.base.resources.entries import (
    LoadResult,
    ResourceEntry,
    ResourceGroup,
    ResourceLoadError,
    ResourceRow,
    ValidationResult,
)
from angee.base.resources.ordering import order_entries

if TYPE_CHECKING:
    from angee.base.apps import BaseAddonConfig


class ResourceQuerySet(models.QuerySet[Any]):
    """QuerySet API for resource ledger operations."""

    def validate_addons(
        self,
        addons: Iterable[BaseAddonConfig] | None = None,
        *,
        tiers: Iterable[object] | None = None,
    ) -> ValidationResult:
        """Parse resource files and validate model resource headers."""

        from angee.base.resources.loader import resource_for
        from angee.base.resources.widgets import set_ledger_model

        groups = self._groups_for(addons, tiers=tiers)
        self._check_xref_collisions(groups)
        set_ledger_model(self.model)
        try:
            checked_files = 0
            checked_rows = 0
            for group in groups:
                checked_files += 1
                checked_rows += len(group.rows)
                resource = resource_for(group.model, group.entry)
                resource.before_import(group.dataset())
        finally:
            set_ledger_model(None)
        return ValidationResult(
            checked_files=checked_files,
            checked_rows=checked_rows,
        )

    def load_addons(
        self,
        addons: Iterable[BaseAddonConfig] | None = None,
        *,
        tiers: Iterable[object],
        allow_non_dev: bool = False,
        dry_run: bool = False,
    ) -> LoadResult:
        """Load the given resource tiers from the addons idempotently."""

        from angee.base.resources.loader import (
            DryRunRollback,
            resource_for,
            result_counts,
        )
        from angee.base.resources.widgets import set_ledger_model

        active_tiers = self._normalize_tiers(tiers)
        if self.model.Tier.DEMO in active_tiers and not (
            settings.DEBUG or allow_non_dev
        ):
            raise ImproperlyConfigured(
                "resources load demo requires DEBUG or --allow-non-dev"
            )
        groups = self._groups_for(addons, tiers=active_tiers)
        self._check_xref_collisions(groups)
        created = 0
        updated = 0
        skipped = 0
        set_ledger_model(self.model)
        try:
            with system_context(reason="resources.load"), transaction.atomic():
                for group in groups:
                    resource = resource_for(group.model, group.entry)
                    try:
                        result = resource.import_data(
                            group.dataset(),
                            dry_run=False,
                            raise_errors=True,
                            use_transactions=False,
                            rollback_on_validation_errors=True,
                        )
                    except ResourceImportError as exc:
                        raise ResourceLoadError(
                            f"{group.entry.display}: {exc}"
                        ) from exc
                    gc, gu, gs = result_counts(result.rows)
                    created += gc
                    updated += gu
                    skipped += gs
                if dry_run:
                    raise DryRunRollback()
        except DryRunRollback:
            pass
        finally:
            set_ledger_model(None)
        return LoadResult(created=created, updated=updated, skipped=skipped)

    def diff_addons(
        self,
        addons: Iterable[BaseAddonConfig] | None = None,
        *,
        tiers: Iterable[object] | None = None,
    ) -> tuple[tuple[str, int], ...]:
        """Return ``(display, row count)`` per resource file in load order.

        Binary entries report ``0`` rows since base cannot read them.
        """

        return tuple(
            (
                entry.display,
                0
                if entry.resolved_kind == "binary"
                else len(entry.read_resource_rows()),
            )
            for entry in self._entries_for(addons, tiers=tiers)
        )

    def _groups_for(
        self,
        addons: Iterable[BaseAddonConfig] | None = None,
        *,
        tiers: Iterable[object] | None = None,
    ) -> tuple[ResourceGroup, ...]:
        """Return resource rows grouped by file and target model."""

        groups: list[ResourceGroup] = []
        by_key: dict[tuple[str, str], ResourceGroup] = {}
        for entry in self._entries_for(addons, tiers=tiers):
            if entry.resolved_kind == "binary":
                raise ResourceLoadError(
                    f"{entry.display}: binary resources are not "
                    "implemented yet"
                )
            for row in entry.read_resource_rows():
                model = self._model_for_label(row.model_label)
                key = (entry.source, model._meta.label_lower)
                group = by_key.get(key)
                if group is None:
                    group = ResourceGroup(entry=entry, model=model, rows=[])
                    by_key[key] = group
                    groups.append(group)
                group.rows.append(row)
        return tuple(groups)

    def _entries_for(
        self,
        addons: Iterable[BaseAddonConfig] | None = None,
        *,
        tiers: Iterable[object] | None = None,
    ) -> tuple[ResourceEntry, ...]:
        """Return declared resource entries in dependency-respecting order."""

        from angee.base.discovery import discover_addons

        discovered = tuple(discover_addons() if addons is None else addons)
        active_tiers = self._normalize_tiers(tiers)
        entries: list[ResourceEntry] = []
        for addon in discovered:
            manifest = addon.get_resource_manifest()
            for active_tier in active_tiers:
                for declaration in manifest[active_tier]:
                    entries.append(
                        ResourceEntry.from_declaration(
                            addon, active_tier, declaration
                        )
                    )
        return order_entries(entries)

    def _normalize_tiers(
        self,
        tiers: Iterable[object] | None,
    ) -> tuple[str, ...]:
        """Return normalized tier values; ``None`` means every tier."""

        if tiers is None:
            return tuple(self.model.Tier.values)
        seen: dict[str, None] = {}
        for tier in tiers:
            seen[self._tier_value(tier)] = None
        return tuple(seen)

    def _tier_value(self, tier: object) -> str:
        """Return one normalized tier value."""

        return self.model.Tier.from_value(tier)

    def _model_for_label(self, label: str) -> type[models.Model]:
        """Resolve a model label through Django's app registry."""

        try:
            app_label, model_name = make_model_tuple(label)
        except ValueError as exc:
            raise ImproperlyConfigured(
                f"Invalid model label {label!r}"
            ) from exc
        if not app_label or not model_name:
            raise ImproperlyConfigured(f"Invalid model label {label!r}")
        try:
            return cast(
                type[models.Model],
                apps.get_model(app_label, model_name),
            )
        except LookupError as exc:
            raise ImproperlyConfigured(f"Unknown model {label!r}") from exc

    def _check_xref_collisions(
        self,
        groups: tuple[ResourceGroup, ...],
    ) -> None:
        """Fail fast when the same addon declares duplicate xrefs."""

        seen: dict[tuple[str, str], ResourceRow] = {}
        for group in groups:
            for row in group.rows:
                key = (group.entry.addon.name, row.xref)
                prev = seen.get(key)
                if prev is not None:
                    raise ResourceLoadError(
                        f"xref collision in {group.entry.addon.name}: "
                        f"{row.xref!r} appears in {prev.entry.display} "
                        f"and {group.entry.display}"
                    )
                seen[key] = row


ResourceManager = models.Manager.from_queryset(ResourceQuerySet)
"""Manager exposing resource ledger operations on ``Resource.objects``."""
