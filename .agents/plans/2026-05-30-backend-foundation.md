# Backend Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the first backend slice as a small root package: `src/angee/base`.

**Architecture:** Keep the framework core flat until real pressure appears. Django models own storage, addon `graphql.py` files use normal Strawberry-Django types and root classes, `.zed` policy owns authorization structure, and Angee only provides deterministic addon ordering plus a tiny schema-part merge seam. Tests and docstrings are the durable specification.

**Tech Stack:** Python >=3.14, Django 6, strawberry-django, django-zed-rebac, pytest, ruff, mypy, uv.

---

## File Structure

- `pyproject.toml` — root package, dependencies, and check configuration.
- `src/angee/__init__.py` — namespace package marker.
- `src/angee/base/__init__.py` — public exports for the base addon.
- `src/angee/base/apps.py` — `BaseConfig` and `BaseAddonConfig`.
- `src/angee/base/addons.py` — addon identity and deterministic ordering.
- `src/angee/base/graphql.py` — small schema-part merge helper around Strawberry.
- `src/angee/base/rebac.py` — `.zed` policy collection; no relationship-row synthesis.
- `src/angee/base/composer.py` — tiny build-time composition entry point.
- `tests/settings.py` — minimal Django test settings.
- `tests/base/` — executable contract tests.

---

## Task 1: Root Package

**Files:**
- Create: `pyproject.toml`
- Create: `src/angee/__init__.py`
- Create: `src/angee/base/__init__.py`
- Create: `src/angee/base/apps.py`
- Create: `tests/settings.py`
- Create: `tests/base/test_imports.py`

- [ ] Write the failing test:

```python
# tests/base/test_imports.py
def test_base_package_imports() -> None:
    import angee.base

    assert angee.base.__all__ == ("BaseAddonConfig",)
```

- [ ] Run it:

`uv run pytest tests/base/test_imports.py -q`

Expected: fails because the package does not exist.

- [ ] Add the root project:

```toml
# pyproject.toml
[project]
name = "angee-django"
version = "0.1.0"
requires-python = ">=3.14"
dependencies = [
  "django>=6.0",
  "strawberry-graphql-django>=0.60",
  "django-zed-rebac>=0.9",
]

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.hatch.build.targets.wheel]
packages = ["src/angee"]

[dependency-groups]
dev = [
  "pytest>=8.4",
  "pytest-django>=4.11",
  "ruff>=0.12",
  "mypy>=1.17",
]

[tool.pytest.ini_options]
DJANGO_SETTINGS_MODULE = "tests.settings"
pythonpath = ["src"]
testpaths = ["tests"]
```

```python
# src/angee/__init__.py
"""Angee framework package."""
```

```python
# src/angee/base/__init__.py
from .apps import BaseAddonConfig

__all__ = ("BaseAddonConfig",)
```

```python
# src/angee/base/apps.py
from __future__ import annotations

from django.apps import AppConfig


class BaseAddonConfig(AppConfig):
    """AppConfig contract for one build-time Angee addon."""

    default = False
    angee_addon = True
    addon_name = "base"
    addon_label = "base"
    addon_kind = "framework"
    addon_depends_on: tuple[str, ...] = ()


class BaseConfig(BaseAddonConfig):
    default = True
    name = "angee.base"
    label = "base"
```

```python
# tests/settings.py
SECRET_KEY = "tests-secret-key-for-angee"
INSTALLED_APPS = [
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "angee.base",
]
DATABASES = {
    "default": {"ENGINE": "django.db.backends.sqlite3", "NAME": ":memory:"}
}
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
USE_TZ = True
```

- [ ] Run it again:

`uv run pytest tests/base/test_imports.py -q`

Expected: pass.

---

## Task 2: Addon Ordering

**Files:**
- Create: `src/angee/base/addons.py`
- Create: `tests/base/test_addons.py`
- Modify: `src/angee/base/__init__.py`

- [ ] Write the failing tests:

```python
# tests/base/test_addons.py
from __future__ import annotations

import pytest
from django.apps import AppConfig

from angee.base.addons import Addon, collect_addons
from angee.base.apps import BaseAddonConfig


class PlainConfig(AppConfig):
    name = "tests.plain"
    label = "plain"


class AlphaConfig(BaseAddonConfig):
    name = "tests.alpha"
    label = "alpha"
    addon_name = "alpha"
    addon_label = "alpha"


class BetaConfig(BaseAddonConfig):
    name = "tests.beta"
    label = "beta"
    addon_name = "beta"
    addon_label = "beta"
    addon_depends_on = ("alpha",)


def test_collect_addons_ignores_plain_django_apps() -> None:
    addons = collect_addons([PlainConfig("plain", object()), AlphaConfig("alpha", object())])

    assert addons == (
        Addon("alpha", "alpha", "framework", (), addons[0].config),
    )


def test_collect_addons_orders_dependencies_first() -> None:
    addons = collect_addons([BetaConfig("beta", object()), AlphaConfig("alpha", object())])

    assert [addon.name for addon in addons] == ["alpha", "beta"]


def test_collect_addons_rejects_duplicate_names() -> None:
    class OtherAlphaConfig(BaseAddonConfig):
        name = "tests.other_alpha"
        label = "other_alpha"
        addon_name = "alpha"
        addon_label = "other-alpha"

    with pytest.raises(ValueError, match="Duplicate addon name 'alpha'"):
        collect_addons([AlphaConfig("alpha", object()), OtherAlphaConfig("other_alpha", object())])
```

- [ ] Run them:

`uv run pytest tests/base/test_addons.py -q`

Expected: fail because `angee.base.addons` does not exist.

- [ ] Implement the module:

```python
# src/angee/base/addons.py
from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass

from django.apps import AppConfig
from django.apps import apps as django_apps


@dataclass(frozen=True, slots=True)
class Addon:
    name: str
    label: str
    kind: str
    depends_on: tuple[str, ...]
    config: AppConfig


def get_addons() -> tuple[Addon, ...]:
    """Return active Angee addons from Django's app registry."""

    return collect_addons(django_apps.get_app_configs())


def collect_addons(configs: Iterable[AppConfig]) -> tuple[Addon, ...]:
    addons = tuple(
        Addon(
            name=str(config.addon_name),
            label=str(config.addon_label),
            kind=str(getattr(config, "addon_kind", "framework")),
            depends_on=tuple(str(dep) for dep in getattr(config, "addon_depends_on", ())),
            config=config,
        )
        for config in configs
        if bool(getattr(config, "angee_addon", False))
    )
    return _order_addons(addons)


def _order_addons(addons: tuple[Addon, ...]) -> tuple[Addon, ...]:
    by_name: dict[str, Addon] = {}
    for addon in addons:
        if addon.name in by_name:
            raise ValueError(f"Duplicate addon name {addon.name!r}")
        by_name[addon.name] = addon

    missing = sorted(
        {
            dependency
            for addon in addons
            for dependency in addon.depends_on
            if dependency not in by_name
        }
    )
    if missing:
        raise ValueError(f"Unknown addon dependencies: {missing!r}")

    ordered: list[Addon] = []
    visiting: set[str] = set()
    visited: set[str] = set()

    def visit(name: str) -> None:
        if name in visited:
            return
        if name in visiting:
            raise ValueError(f"Cycle in addon dependencies at {name!r}")
        visiting.add(name)
        for dependency in sorted(by_name[name].depends_on):
            visit(dependency)
        visiting.remove(name)
        visited.add(name)
        ordered.append(by_name[name])

    for name in sorted(by_name):
        visit(name)
    return tuple(ordered)
```

```python
# src/angee/base/__init__.py
from .addons import Addon, get_addons
from .apps import BaseAddonConfig

__all__ = ("Addon", "BaseAddonConfig", "get_addons")
```

- [ ] Run them again:

`uv run pytest tests/base/test_addons.py -q`

Expected: pass.

---

## Task 3: Strawberry Schema Parts

**Files:**
- Create: `src/angee/base/graphql.py`
- Create: `tests/base/test_graphql.py`

- [ ] Write the failing tests:

```python
# tests/base/test_graphql.py
from __future__ import annotations

import strawberry
import strawberry_django
from django.db import models
from strawberry import auto

from angee.base.graphql import SchemaPart, build_schema


class Note(models.Model):
    title = models.CharField(max_length=200)
    internal = models.CharField(max_length=200)

    class Meta:
        app_label = "notes"


@strawberry_django.type(Note)
class PublicNote:
    id: auto
    title: auto


@strawberry_django.type(Note)
class ConsoleNote:
    id: auto
    title: auto
    internal: auto


@strawberry.type
class PublicQuery:
    ok: bool = True


@strawberry.type
class ConsoleQuery:
    note: ConsoleNote | None = None


def test_build_schema_uses_plain_strawberry_types() -> None:
    schema = build_schema([SchemaPart(query=PublicQuery, types=(PublicNote,))])

    text = schema.as_str()
    assert "type PublicNote" in text
    assert "title: String!" in text
    assert "internal" not in text


def test_different_schemas_can_use_different_model_projections() -> None:
    public_schema = build_schema([SchemaPart(query=PublicQuery, types=(PublicNote,))])
    console_schema = build_schema([SchemaPart(query=ConsoleQuery, types=(ConsoleNote,))])

    assert "internal" not in public_schema.as_str()
    assert "internal: String!" in console_schema.as_str()
```

- [ ] Run them:

`uv run pytest tests/base/test_graphql.py -q`

Expected: fail because `angee.base.graphql` does not exist.

- [ ] Implement the tiny Strawberry merge seam:

```python
# src/angee/base/graphql.py
from __future__ import annotations

import types
from collections.abc import Iterable
from dataclasses import dataclass
from typing import Any

import strawberry


@dataclass(frozen=True, slots=True)
class SchemaPart:
    """One addon's native Strawberry contribution to one named schema."""

    query: type[Any] | None = None
    mutation: type[Any] | None = None
    subscription: type[Any] | None = None
    types: tuple[type[Any], ...] = ()


def build_schema(parts: Iterable[SchemaPart], *, extensions: tuple[type[Any], ...] = ()) -> strawberry.Schema:
    """Build a Strawberry schema by composing addon root classes."""

    parts = tuple(parts)
    query = _compose_root("Query", tuple(part.query for part in parts if part.query is not None))
    mutation = _optional_root("Mutation", tuple(part.mutation for part in parts if part.mutation is not None))
    subscription = _optional_root(
        "Subscription",
        tuple(part.subscription for part in parts if part.subscription is not None),
    )
    return strawberry.Schema(
        query=query,
        mutation=mutation,
        subscription=subscription,
        types=_dedupe_types(part.types for part in parts),
        extensions=list(extensions),
    )


def _optional_root(name: str, bases: tuple[type[Any], ...]) -> type[Any] | None:
    if not bases:
        return None
    return _compose_root(name, bases)


def _compose_root(name: str, bases: tuple[type[Any], ...]) -> type[Any]:
    if not bases:
        return strawberry.type(type(name, (), {}))
    namespace = {"__module__": "angee.base.runtime"}
    return strawberry.type(name=name)(types.new_class(name, bases, {}, lambda ns: ns.update(namespace)))


def _dedupe_types(groups: Iterable[tuple[type[Any], ...]]) -> list[type[Any]]:
    result: list[type[Any]] = []
    seen: set[str] = set()
    for group in groups:
        for item in group:
            key = f"{item.__module__}.{item.__qualname__}"
            if key not in seen:
                seen.add(key)
                result.append(item)
    return result
```

- [ ] Run them again:

`uv run pytest tests/base/test_graphql.py -q`

Expected: pass.

---

## Task 4: Policy Collection And Composer

**Files:**
- Create: `src/angee/base/rebac.py`
- Create: `src/angee/base/composer.py`
- Create: `tests/base/test_composer.py`

- [ ] Write the failing test:

```python
# tests/base/test_composer.py
from __future__ import annotations

from pathlib import Path

import strawberry

from angee.base.composer import compose
from angee.base.graphql import SchemaPart


@strawberry.type
class PublicQuery:
    ok: bool = True


@strawberry.type
class ConsoleQuery:
    ready: bool = True


def test_compose_writes_named_schema_modules_and_preserves_field_backing(tmp_path: Path) -> None:
    policy = tmp_path / "permissions.zed"
    policy.write_text(
        "definition notes/note {\n"
        "    relation owner: auth/user // rebac:field=owner\n"
        "    permission read = owner\n"
        "}\n",
        encoding="utf-8",
    )

    result = compose(
        schema_parts={
            "public": [SchemaPart(query=PublicQuery)],
            "console": [SchemaPart(query=ConsoleQuery)],
        },
        policy_files=[policy],
        runtime_dir=tmp_path / "runtime",
    )

    assert result.schemas == ("console", "public")
    assert (tmp_path / "runtime" / "schema.console.graphql").exists()
    assert (tmp_path / "runtime" / "schema.public.graphql").exists()
    assert "rebac:field=owner" in (tmp_path / "runtime" / "permissions.zed").read_text(encoding="utf-8")
```

- [ ] Run it:

`uv run pytest tests/base/test_composer.py -q`

Expected: fail because `angee.base.composer` does not exist.

- [ ] Implement policy collection:

```python
# src/angee/base/rebac.py
from __future__ import annotations

from collections.abc import Iterable
from pathlib import Path


def read_policies(paths: Iterable[Path]) -> tuple[str, ...]:
    """Read REBAC policy text without converting relations into seed rows."""

    return tuple(path.read_text(encoding="utf-8") for path in sorted(paths))
```

- [ ] Implement the tiny composer:

```python
# src/angee/base/composer.py
from __future__ import annotations

from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from pathlib import Path

from .graphql import SchemaPart, build_schema
from .rebac import read_policies


@dataclass(frozen=True, slots=True)
class ComposeResult:
    schemas: tuple[str, ...]


def compose(
    *,
    schema_parts: Mapping[str, Iterable[SchemaPart]],
    policy_files: Iterable[Path],
    runtime_dir: Path,
) -> ComposeResult:
    """Write deterministic runtime artifacts from native Strawberry schema parts."""

    runtime_dir.mkdir(parents=True, exist_ok=True)
    schemas = tuple(sorted(schema_parts))
    for name in schemas:
        schema = build_schema(schema_parts[name])
        (runtime_dir / f"schema.{name}.graphql").write_text(schema.as_str() + "\n", encoding="utf-8")
    _write_policies(runtime_dir, policy_files)
    return ComposeResult(schemas=schemas)


def _write_policies(runtime_dir: Path, paths: Iterable[Path]) -> None:
    text = "\n".join(read_policies(paths))
    if text:
        if not text.endswith("\n"):
            text = f"{text}\n"
        (runtime_dir / "permissions.zed").write_text(text, encoding="utf-8")
```

- [ ] Run it again:

`uv run pytest tests/base/test_composer.py -q`

Expected: pass.

---

## Task 5: Verification

- [ ] Run all tests:

`uv run pytest -q`

Expected: pass.

- [ ] Run lint:

`uv run ruff check src tests`

Expected: pass.

- [ ] Run type checking:

`uv run mypy src`

Expected: pass.

- [ ] Search for placeholder markers:

`rg -n "T[O]DO|T[B]D|F[I]XME|X[X]X" src tests .agents/plans/2026-05-30-backend-foundation.md`

Expected: no matches.
