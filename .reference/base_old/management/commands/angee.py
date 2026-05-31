"""Angee backend build commands."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any, cast

from django.core.management.base import (
    BaseCommand,
    CommandError,
    CommandParser,
)

from angee.base.compose.pipeline import DriftError, clean_runtime, run


class Command(BaseCommand):
    """Expose Angee maintenance actions through Django management."""

    help = "Run Angee build commands."
    requires_system_checks: list[str] = []

    def add_arguments(self, parser: CommandParser) -> None:
        """Add subcommands."""

        subcommands = parser.add_subparsers(dest="subcommand", required=True)

        build = subcommands.add_parser("build")
        build.add_argument("--no-apply", action="store_true")
        build.add_argument("--check", action="store_true")
        build.set_defaults(handler=self._handle_build)

        clean = subcommands.add_parser("clean")
        clean.set_defaults(handler=self._handle_clean)

    def handle(self, *args: Any, **options: Any) -> None:
        """Dispatch the selected Angee subcommand."""

        del args
        handler = cast(Callable[[dict[str, Any]], None], options["handler"])
        handler(options)

    def _handle_build(self, options: dict[str, Any]) -> None:
        """Run the build."""

        try:
            result = run(
                apply=not bool(options["no_apply"]),
                check=bool(options["check"]),
            )
        except DriftError as exc:
            raise CommandError(str(exc)) from exc
        self.stdout.write(
            self.style.SUCCESS(
                "angee build: "
                f"emitted={result.emitted} "
                f"applied={result.applied} "
                f"checked={result.checked}"
            )
        )

    def _handle_clean(self, options: dict[str, Any]) -> None:
        """Clean generated runtime files."""

        del options
        clean_runtime()
        self.stdout.write(self.style.SUCCESS("angee clean: ok"))
