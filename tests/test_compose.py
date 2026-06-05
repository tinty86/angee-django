"""Tests for build-time runtime composition."""

from __future__ import annotations

import sys
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest
from django.apps import apps
from django.db import models

import angee.compose as compose_package
import angee.compose.runtime as runtime_module
from angee.base.mixins import RevisionMixin
from angee.base.models import AngeeModel
from angee.compose.apps import ComposeConfig
from angee.compose.runtime import Runtime


class DecoratedRevisionThing(RevisionMixin, AngeeModel):
    """Abstract model used to test composer-emitted model decorators."""

    revisioned_fields = ("body",)

    body = models.TextField()

    class Meta:
        """Django model options for the test source model."""

        abstract = True
        app_label = "tests"


def runtime_for(tmp_path: Path) -> Runtime:
    """Return a runtime that emits the installed resource addon."""

    return Runtime(
        (apps.get_app_config("resources"),),
        runtime_dir=tmp_path / "runtime",
    )


def test_runtime_renders_resource_sources(tmp_path: Path) -> None:
    """The runtime renders source files for the resource ledger model."""

    sources = runtime_for(tmp_path).render_sources()

    assert Path("__init__.py") in sources
    assert Path("asgi.py") not in sources
    assert Path("urls.py") not in sources
    assert "ANGEE GENERATED RUNTIME" in sources[Path("__init__.py")]
    assert "RUNTIME_APPS = ['resources']" in sources[Path("__init__.py")]
    assert "class Resource" in sources[Path("resources/models.py")]
    assert 'app_label = "resources"' in sources[Path("resources/models.py")]
    assert ".angee-manifest.json" not in {str(path) for path in sources}
    assert Path("permissions.zed") not in sources


def test_runtime_renders_iam_user_sources(tmp_path: Path) -> None:
    """The IAM addon emits a concrete swappable user model."""

    iam_config = apps.get_app_config("iam")
    runtime = Runtime(
        (apps.get_app_config("resources"), iam_config),
        runtime_dir=tmp_path / "runtime",
    )

    sources = runtime.render_sources()
    user_source = sources[Path("iam/models.py")]

    assert "class User" in user_source
    assert 'app_label = "iam"' in user_source
    assert "rebac_resource_type = 'auth/user'" in user_source
    assert "swappable = 'AUTH_USER_MODEL'" in user_source


def test_runtime_renders_model_decorators_from_mixins(tmp_path: Path) -> None:
    """Mixin-declared decorators are emitted on concrete runtime models."""

    app_config = SimpleNamespace(
        label="decorated",
        name=__name__,
        module=sys.modules[__name__],
        models_module=sys.modules[__name__],
    )
    runtime = Runtime((app_config,), runtime_dir=tmp_path / "runtime")

    source = runtime.render_sources()[Path("decorated/models.py")]

    assert "import reversion" in source
    assert "@reversion.register(fields=('body',))" in source
    assert source.index("@reversion.register") < source.index("class DecoratedRevisionThing")


def test_runtime_emit_and_check_detect_drift(tmp_path: Path) -> None:
    """Emit writes deterministic files and check reports later drift."""

    runtime = runtime_for(tmp_path)
    runtime.emit()
    runtime.check()

    (tmp_path / "runtime" / "resources" / "models.py").write_text(
        "# stale\n",
        encoding="utf-8",
    )

    with pytest.raises(RuntimeError, match="stale"):
        runtime.check()
    assert (tmp_path / "runtime" / "resources" / "models.py").read_text(encoding="utf-8") == "# stale\n"


def test_runtime_check_ignores_schema_command_output(tmp_path: Path) -> None:
    """GraphQL SDL files are checked by the schema command, not build."""

    runtime = runtime_for(tmp_path)
    runtime.emit()
    schema_path = tmp_path / "runtime" / "schemas" / "public.graphql"
    schema_path.parent.mkdir()
    schema_path.write_text("type Query { ok: Boolean! }\n", encoding="utf-8")

    runtime.check()


def test_runtime_clean_requires_generated_sentinel(tmp_path: Path) -> None:
    """Clean refuses to delete a non-generated configured runtime dir."""

    runtime = runtime_for(tmp_path)
    runtime.runtime_dir.mkdir()
    (runtime.runtime_dir / "handwritten.py").write_text(
        "# keep\n",
        encoding="utf-8",
    )

    with pytest.raises(RuntimeError, match="not an Angee runtime directory"):
        runtime.clean()


def test_clean_then_emit_is_idempotent(tmp_path: Path, settings: Any) -> None:
    """A migrations-only runtime remainder can be emitted and cleaned again."""

    runtime = runtime_for(tmp_path)
    settings.ANGEE_RUNTIME_DIR = runtime.runtime_dir
    runtime.emit()
    migration_path = runtime.runtime_dir / "resources" / "migrations" / "0001_initial.py"
    migration_path.write_text("# migration\n", encoding="utf-8")

    runtime.clean()
    runtime.emit()

    assert "ANGEE GENERATED RUNTIME" in (runtime.runtime_dir / "__init__.py").read_text(encoding="utf-8")
    assert migration_path.read_text(encoding="utf-8") == "# migration\n"
    runtime.clean()
    assert migration_path.read_text(encoding="utf-8") == "# migration\n"
    runtime.clean()


def _compose_config() -> ComposeConfig:
    """Return a ComposeConfig bound enough for a direct import_models call."""

    config = ComposeConfig("angee.compose", compose_package)
    config.apps = apps
    return config


@pytest.mark.parametrize(
    ("argv", "current", "expected"),
    (
        (["manage.py", "angee", "build"], False, ["current", "emit", "import"]),
        (["manage.py", "angee", "clean"], False, ["current", "emit", "import"]),
        (["manage.py", "angee", "build", "--check"], False, ["check", "import"]),
        (["manage.py", "angee", "build", "--bad-option"], False, ["check", "import"]),
    ),
)
def test_compose_config_runtime_commands_bootstrap_generated_models(
    monkeypatch: pytest.MonkeyPatch,
    argv: list[str],
    current: bool,
    expected: list[str],
) -> None:
    """Runtime commands import generated models without env-driven writes."""

    calls: list[str] = []

    class FakeRuntime:
        def is_current(self) -> bool:
            calls.append("current")
            return current

        def emit(self) -> None:
            calls.append("emit")

        def check(self) -> None:
            calls.append("check")

        def import_generated_models(self) -> None:
            calls.append("import")

    monkeypatch.setattr(sys, "argv", argv)
    monkeypatch.setattr(runtime_module.Runtime, "from_django", classmethod(lambda cls: FakeRuntime()))

    _compose_config().import_models()

    assert calls == expected


def test_compose_config_default_action_checks_before_import(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Normal Django startup imports generated models only after drift check."""

    calls: list[str] = []

    class FakeRuntime:
        def emit(self) -> None:
            calls.append("emit")

        def check(self) -> None:
            calls.append("check")

        def import_generated_models(self) -> None:
            calls.append("import")

    monkeypatch.setenv("ANGEE_RUNTIME_ACTION", "emit")
    monkeypatch.setattr(sys, "argv", ["manage.py", "runserver"])
    monkeypatch.setattr(runtime_module.Runtime, "from_django", classmethod(lambda cls: FakeRuntime()))

    _compose_config().import_models()

    assert calls == ["check", "import"]
