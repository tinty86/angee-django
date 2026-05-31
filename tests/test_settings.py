"""Tests for the ``compose_defaults`` host settings helper."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest
from django.core.exceptions import ImproperlyConfigured

from angee.base.settings import (
    _addon_settings_defaults,
    compose_defaults,
)


def _compose(tmp_path: Path) -> dict[str, Any]:
    """Return composed settings for the notes example addon."""

    return compose_defaults(
        addons=("example.notes",),
        runtime_dir=tmp_path / "runtime",
        root_urlconf="host.urls",
        asgi_application="host.asgi.application",
    )


def test_base_migrations_are_redirected_into_runtime(tmp_path: Path) -> None:
    """Base is composed like any other addon: its migrations live in runtime.

    ``Resource`` is an abstract source model emitted into ``runtime/base``; its
    concrete migration must land in ``runtime.base.migrations`` and be
    normalized, not in the installed package source tree.
    """

    settings = compose_defaults(
        addons=("example.notes",),
        runtime_dir=tmp_path / "runtime",
        root_urlconf="host.urls",
        asgi_application="host.asgi.application",
    )

    migration_modules = settings["MIGRATION_MODULES"]
    assert migration_modules["base"] == "runtime.base.migrations"
    assert migration_modules["notes"] == "runtime.notes.migrations"


def test_base_is_installed_exactly_once(tmp_path: Path) -> None:
    """Redirecting base migrations keeps it listed once in INSTALLED_APPS."""

    settings = _compose(tmp_path)
    installed = settings["INSTALLED_APPS"]
    base_app = "angee.base.apps.BaseConfig"
    assert installed.count(base_app) == 1


def test_iam_user_is_the_default_auth_model(tmp_path: Path) -> None:
    """Composed hosts use Angee's swappable IAM user."""

    settings = _compose(tmp_path)
    installed = settings["INSTALLED_APPS"]

    assert settings["AUTH_USER_MODEL"] == "iam.User"
    assert "angee.iam.apps.IAMConfig" in installed
    assert settings["MIGRATION_MODULES"]["iam"] == "runtime.iam.migrations"


def test_one_app_set_orders_compose_before_adopters(
    tmp_path: Path,
) -> None:
    """One app set: the composer emits before base and the source addons.

    The composer's ``import_models`` renders ``runtime/<label>`` in phase 2; it
    must run before the apps that adopt it, so it is ordered first.
    """

    settings = _compose(tmp_path)
    installed = settings["INSTALLED_APPS"]

    assert installed.count("angee.compose.apps.ComposeConfig") == 1
    assert installed.count("angee.base.apps.BaseConfig") == 1
    assert installed.count("angee.resources.apps.ResourcesConfig") == 1
    compose_at = installed.index("angee.compose.apps.ComposeConfig")
    base_at = installed.index("angee.base.apps.BaseConfig")
    notes_at = installed.index("example.notes.apps.NotesConfig")
    assert compose_at < base_at < notes_at
    assert "ANGEE_BUILD" not in settings


def test_rebac_strict_mode_is_explicitly_pinned(tmp_path: Path) -> None:
    """Composed hosts keep REBAC strict mode enabled by default."""

    settings = _compose(tmp_path)

    assert settings["REBAC_STRICT_MODE"] is True


def test_auth_user_model_comes_from_addon_settings_defaults(
    tmp_path: Path,
) -> None:
    """The run user model is contributed by IAM, not hardcoded in compose."""

    from angee.iam.apps import IAMConfig

    settings = _compose(tmp_path)

    assert IAMConfig.settings_defaults["AUTH_USER_MODEL"] == "iam.User"
    assert settings["AUTH_USER_MODEL"] == "iam.User"


def test_data_dir_is_host_owned_not_composed(tmp_path: Path) -> None:
    """compose_defaults no longer couriers ANGEE_DATA_DIR; the host owns it."""

    settings = _compose(tmp_path)

    assert "ANGEE_DATA_DIR" not in settings


class _FakeAddon:
    """Minimal stand-in carrying a name and settings defaults."""

    def __init__(
        self,
        name: str,
        settings_defaults: dict[str, object],
    ) -> None:
        self.__name__ = name
        self.settings_defaults = settings_defaults


def test_addon_settings_defaults_merge() -> None:
    """The composer folds each addon's contributed setting defaults."""

    addons = [
        _FakeAddon("AlphaConfig", {"A": 1}),
        _FakeAddon("BetaConfig", {"B": 2}),
    ]

    merged = _addon_settings_defaults(addons)  # type: ignore[arg-type]

    assert merged == {"A": 1, "B": 2}


def test_conflicting_addon_settings_defaults_raise() -> None:
    """Two addons contributing one key with different values is an error."""

    addons = [
        _FakeAddon("AlphaConfig", {"AUTH_USER_MODEL": "alpha.User"}),
        _FakeAddon("BetaConfig", {"AUTH_USER_MODEL": "beta.User"}),
    ]

    with pytest.raises(ImproperlyConfigured, match="conflicting values"):
        _addon_settings_defaults(addons)  # type: ignore[arg-type]
