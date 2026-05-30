"""Django app contracts for composed Angee addons."""

from __future__ import annotations

import importlib
import inspect
import sys
from collections.abc import Mapping
from pathlib import Path
from types import ModuleType
from typing import ClassVar, TypeAlias, cast

from django.apps import AppConfig
from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from django.db import models
from django.utils.functional import cached_property
from django.utils.module_loading import module_has_submodule

ResourceManifest: TypeAlias = Mapping[object, object]
"""Resource files keyed by enum tiers or string shorthand."""


class BaseAddonConfig(AppConfig):
    """Base class for Django apps that participate in Angee builds.

    Addons stay ordinary Django apps: the app root is ``AppConfig.path``,
    source models live in ``models.py``, and native Strawberry contributions
    live in ``graphql.py``. The class attributes below only name facts Django
    does not already know.
    """

    default = False
    default_auto_field = "django.db.models.BigAutoField"

    depends_on: ClassVar[tuple[str, ...]] = ()
    """Addon labels or app names that must compose before this addon."""

    rebac_schema: ClassVar[str | None] = "permissions.zed"
    """REBAC schema file read by django-zed-rebac, relative to the app root.

    ``None`` means the addon contributes no schema. The default follows the
    library convention and is skipped when the file is absent.
    """

    resources: ClassVar[ResourceManifest] = {}
    """Resource files grouped by tier, relative to ``AppConfig.path``.

    Addons may key the dict with ``Resource.Tier`` values or string shorthand
    such as ``"demo"``. Tiers default to no files, so addons only declare the
    tiers they use. Addons list files explicitly so builds stay deterministic
    and reviews see changes.
    """

    def get_dependencies(self) -> tuple[str, ...]:
        """Return dependency aliases used to order addon composition."""

        return tuple(str(dep) for dep in self.depends_on)

    def get_rebac_schema_path(self) -> Path | None:
        """Return the existing django-zed-rebac schema path, when declared."""

        return self._rebac_schema_path

    @cached_property
    def _rebac_schema_path(self) -> Path | None:
        """Return the cached django-zed-rebac schema path."""

        if self.rebac_schema is None:
            return None
        relative_path = self._relative_path(self.rebac_schema)
        path = Path(self.path) / relative_path
        if path.exists():
            return path
        if relative_path == "permissions.zed":
            return None
        raise ImproperlyConfigured(
            f"{self.name}.rebac_schema references missing file "
            f"{relative_path!r}"
        )

    def get_source_models_module(self) -> ModuleType | None:
        """Return the source ``models.py`` module imported by Django."""

        return self._source_models_module

    @cached_property
    def _source_models_module(self) -> ModuleType | None:
        """Return the cached source ``models.py`` module."""

        if self.models_module is not None:
            return self.models_module
        return self.import_optional_module("models")

    @property
    def model_classes(self) -> tuple[type[models.Model], ...]:
        """Abstract source models owned by this addon."""

        return self._model_contributions[0]

    @property
    def model_extensions(self) -> tuple[type[models.Model], ...]:
        """Abstract source models that extend another source model."""

        return self._model_contributions[1]

    @cached_property
    def _model_contributions(
        self,
    ) -> tuple[tuple[type[models.Model], ...], tuple[type[models.Model], ...]]:
        """Return cached source model contributions declared by this addon."""

        module = self.get_source_models_module()
        if module is None:
            return (), ()
        models_owned: list[type[models.Model]] = []
        extensions: list[type[models.Model]] = []
        package_prefix = module.__name__ + "."
        for _name, value in inspect.getmembers(module, inspect.isclass):
            if not self._belongs_to_source_module(
                value, module.__name__, package_prefix
            ):
                continue
            if not self._is_source_model(value):
                continue
            from angee.base.mixins import AngeeModel

            model_class = cast(type[AngeeModel], value)
            target = model_class.get_extension_target()
            if target:
                extensions.append(model_class)
                continue
            models_owned.append(model_class)
        return (
            tuple(sorted(models_owned, key=lambda cls: cls._meta.object_name)),
            tuple(
                sorted(
                    extensions,
                    key=lambda cls: (
                        cast(type[AngeeModel], cls).get_extension_target()
                        or "",
                        cls._meta.object_name,
                    ),
                )
            ),
        )

    def get_graphql_module(self) -> ModuleType | None:
        """Return the addon ``graphql.py`` module, when present."""

        return self._graphql_module

    @cached_property
    def _graphql_module(self) -> ModuleType | None:
        """Return the cached addon ``graphql.py`` module."""

        return self.import_optional_module("graphql")

    def import_optional_module(self, module_name: str) -> ModuleType | None:
        """Import one addon submodule without hiding nested import errors."""

        if not module_has_submodule(self.module, module_name):
            return None
        return importlib.import_module(f"{self.name}.{module_name}")

    def import_models(self) -> None:
        """Import emitted concrete models for this source app if they exist."""

        super().import_models()
        if len(sys.argv) >= 3 and sys.argv[1:3] == ["angee", "build"]:
            return
        runtime_module = getattr(settings, "ANGEE_RUNTIME_MODULE", "runtime")
        target = f"{runtime_module}.{self.label}.models"
        try:
            importlib.import_module(target)
        except ModuleNotFoundError as exc:
            if exc.name in {
                runtime_module,
                f"{runtime_module}.{self.label}",
                target,
            }:
                return
            raise

    def _relative_path(self, value: object) -> str:
        """Return one safe path relative to the addon root."""

        raw = str(value)
        path = Path(raw)
        if not raw or path.is_absolute() or ".." in path.parts:
            raise ImproperlyConfigured(
                f"Manifest path {raw!r} must be relative and stay inside "
                "the addon"
            )
        return raw

    def _belongs_to_source_module(
        self,
        value: type,
        module_name: str,
        package_prefix: str,
    ) -> bool:
        """Return true when a class is defined by this source addon."""

        origin = value.__module__
        return origin == module_name or origin.startswith(package_prefix)

    def _is_source_model(self, value: type) -> bool:
        """Return true for abstract Angee models declared by this addon."""

        from angee.base.mixins import AngeeModel

        return (
            issubclass(value, AngeeModel)
            and value is not AngeeModel
            and value._meta.abstract
        )


class BaseConfig(BaseAddonConfig):
    """Django config for the framework base addon."""

    default = True
    name = "angee.base"
    label = "base"
