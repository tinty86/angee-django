"""Load and inspect addon resources."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any, cast

from django.apps import apps
from django.core.management.base import (
    BaseCommand,
    CommandParser,
)

from angee.base.resources.models import Resource

DEFAULT_TIERS = ("master", "install")


class Command(BaseCommand):
    """Expose resource maintenance actions through Django management."""

    help = "Validate, load, and inspect addon resources."
    requires_system_checks: list[str] = []

    def add_arguments(self, parser: CommandParser) -> None:
        """Add subcommands.

        Each action selects ``master``+``install`` by default; a positional
        tier narrows to one, and ``--include-demo`` adds the demo tier.
        """

        subcommands = parser.add_subparsers(dest="subcommand", required=True)

        validate = subcommands.add_parser("validate")
        self._add_selection_arguments(validate)
        validate.set_defaults(handler=self._handle_validate)

        load = subcommands.add_parser("load")
        self._add_selection_arguments(load)
        load.add_argument("--allow-non-dev", action="store_true")
        load.add_argument("--dry-run", action="store_true")
        load.set_defaults(handler=self._handle_load)

        diff = subcommands.add_parser("diff")
        self._add_selection_arguments(diff)
        diff.set_defaults(handler=self._handle_diff)

    def _add_selection_arguments(self, parser: CommandParser) -> None:
        """Add the shared tier/``--include-demo`` selection arguments."""

        parser.add_argument(
            "tier",
            nargs="?",
            choices=Resource.Tier.values,
            default=None,
        )
        parser.add_argument("--include-demo", action="store_true")

    def handle(self, *args: Any, **options: Any) -> None:
        """Dispatch the selected resource subcommand."""

        del args
        handler = cast(Callable[[dict[str, Any]], None], options["handler"])
        handler(options)

    def _handle_validate(self, options: dict[str, Any]) -> None:
        """Validate resource files for the selected tiers."""

        tiers = self._selected_tiers(options)
        result = self._resource_model().objects.validate_addons(tiers=tiers)
        self.stdout.write(
            self.style.SUCCESS(
                f"resources validate ({', '.join(tiers)}): "
                f"{result.checked_files} files, {result.checked_rows} rows"
            )
        )

    def _handle_load(self, options: dict[str, Any]) -> None:
        """Load resource files for the selected tiers."""

        tiers = self._selected_tiers(options)
        dry_run = bool(options.get("dry_run"))
        result = self._resource_model().objects.load_addons(
            tiers=tiers,
            allow_non_dev=bool(options["allow_non_dev"]),
            dry_run=dry_run,
        )
        suffix = " (dry run)" if dry_run else ""
        self.stdout.write(
            self.style.SUCCESS(
                f"resources load {', '.join(tiers)}{suffix}: "
                f"{result.created} created, {result.updated} updated, "
                f"{result.skipped} unchanged"
            )
        )

    def _handle_diff(self, options: dict[str, Any]) -> None:
        """Print resource file row counts for the selected tiers."""

        tiers = self._selected_tiers(options)
        counts = self._resource_model().objects.diff_addons(tiers=tiers)
        lines = [f"tiers: {', '.join(tiers)}"]
        lines.extend(f"{display}: {count} rows" for display, count in counts)
        self.stdout.write("\n".join(lines))

    def _selected_tiers(self, options: dict[str, Any]) -> tuple[str, ...]:
        """Return the selected tiers: an explicit tier, or master+install."""

        tier = options.get("tier")
        tiers = [tier] if tier else list(DEFAULT_TIERS)
        if options.get("include_demo") and "demo" not in tiers:
            tiers.append("demo")
        return tuple(tiers)

    def _resource_model(self) -> type[Resource]:
        """Return the concrete runtime Resource model."""

        return cast(type[Resource], apps.get_model("base", "Resource"))
