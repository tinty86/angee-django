"""Build pipeline for composed Angee runtime output."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from django.conf import settings
from django.core.management import call_command

from angee.base.apps import BaseAddonConfig
from angee.base.compose.emission import (
    check_runtime,
    check_schema_sdl,
    emit_runtime_sources,
    emit_schema_sdl,
    import_runtime_models,
    normalize_migration_headers,
    plan_runtime,
    reset_runtime_dir,
)
from angee.base.compose.rebac import sync_permissions
from angee.base.discovery import discover_addons


@dataclass(slots=True)
class BuildResult:
    """Summary of a build command."""

    emitted: int
    """Number of runtime model modules emitted."""

    applied: bool
    """Whether migrations and permission sync were applied."""

    checked: bool
    """Whether the build only checked for generated-source drift."""


class DriftError(RuntimeError):
    """Raised when ``angee build --check`` finds generated-source drift."""


def run(
    *,
    addons: tuple[BaseAddonConfig, ...] | None = None,
    apply: bool,
    check: bool = False,
) -> BuildResult:
    """Build runtime source and optionally apply migrations."""

    discovered = discover_addons() if addons is None else addons
    plan = plan_runtime(discovered)
    runtime_dir = Path(settings.ANGEE_RUNTIME_DIR)
    if check:
        try:
            check_runtime(runtime_dir, plan)
            check_schema_sdl(runtime_dir, plan)
        except RuntimeError as exc:
            raise DriftError(str(exc)) from exc
        return BuildResult(
            emitted=len(plan.labels),
            applied=False,
            checked=True,
        )

    reset_runtime_dir(runtime_dir, plan)
    emit_runtime_sources(runtime_dir, plan)
    import_runtime_models(plan)
    emit_schema_sdl(runtime_dir, plan)
    Path(settings.ANGEE_DATA_DIR).mkdir(parents=True, exist_ok=True)
    if plan.labels:
        call_command(
            "makemigrations",
            *plan.labels,
            interactive=False,
            verbosity=0,
        )
        normalize_migration_headers(runtime_dir, plan)
    if apply:
        call_command("migrate", interactive=False, verbosity=0)
        sync_permissions()
    return BuildResult(
        emitted=len(plan.labels),
        applied=apply,
        checked=False,
    )


def clean_runtime() -> None:
    """Delete generated runtime files while keeping the runtime root."""

    runtime_dir = Path(settings.ANGEE_RUNTIME_DIR)
    if not (runtime_dir / ".angee-manifest.json").exists():
        raise RuntimeError(f"{runtime_dir} is not an Angee runtime directory")
    for path in sorted(runtime_dir.rglob("*"), reverse=True):
        if path.is_file():
            path.unlink()
        elif path.is_dir():
            path.rmdir()
