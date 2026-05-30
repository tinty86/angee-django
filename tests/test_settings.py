"""Tests for the ``compose_defaults`` host settings helper."""

from __future__ import annotations

from pathlib import Path

from angee.base.settings import compose_defaults


def _compose(tmp_path: Path) -> dict[str, object]:
    """Return composed settings for the notes example addon."""

    return compose_defaults(
        addons=("example.notes",),
        runtime_dir=tmp_path / "runtime",
        data_dir=tmp_path / "data",
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
        data_dir=tmp_path / "data",
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
