"""On-disk GraphQL SDL emission, checks, and drift detection.

:class:`GraphQLSdl` is the SDL counterpart of :class:`angee.compose.runtime.Runtime`:
it owns where the generated SDL lives (``runtime/schemas/<name>.graphql``), renders it
from the discovered :class:`~angee.graphql.schema.GraphQLSchemas`, and reconciles disk
against that render. The ``schema`` management command and the dev-serve boot hook
(:mod:`angee.asgi`) both delegate here, so the write/check/drift logic lives once.
"""

from __future__ import annotations

from pathlib import Path

from django.conf import settings

from angee.fs import write_atomic
from angee.graphql.schema import GraphQLSchemas


class GraphQLSdl:
    """Render, write, and check the generated GraphQL SDL for each schema."""

    def __init__(self, schemas: GraphQLSchemas, *, schema_dir: Path) -> None:
        """Create an SDL owner over ``schemas`` writing under ``schema_dir``."""

        self.schemas = schemas
        self.schema_dir = schema_dir

    @classmethod
    def from_discovery(cls) -> GraphQLSdl:
        """Return an SDL owner over the discovered schemas and the runtime dir."""

        return cls(
            GraphQLSchemas.from_discovery(),
            schema_dir=Path(settings.ANGEE_RUNTIME_DIR) / "schemas",
        )

    def render(self) -> dict[str, str]:
        """Return printed SDL per schema name (the single source of truth)."""

        return self.schemas.render_sdl()

    def emit(self) -> None:
        """Reconcile the owned SDL directory to the rendered schemas."""

        rendered = self.render()
        self._prune_orphans(rendered)
        for name, sdl in rendered.items():
            write_atomic(self.schema_dir / f"{name}.graphql", sdl)

    def emit_if_stale(self) -> bool:
        """Reconcile drifted SDL files and orphans; return whether any changed.

        Mirrors :meth:`angee.compose.runtime.Runtime.emit_if_stale`: drift-gated,
        idempotent, and converges the owned directory to the render.
        """

        drift = self._drift()
        if not drift:
            return False
        rendered = self.render()
        self._prune_orphans(rendered)
        for name in drift:
            if name in rendered:
                write_atomic(self.schema_dir / f"{name}.graphql", rendered[name])
        return True

    def check(self) -> None:
        """Raise when the on-disk SDL differs from the render."""

        drift = self._drift()
        if drift:
            rendered = ", ".join(f"schemas/{name}.graphql" for name in drift)
            raise RuntimeError(f"generated GraphQL SDL is stale: {rendered}")

    def _drift(self) -> list[str]:
        """Return schema names whose on-disk file differs from the render."""

        expected = self.render()
        actual = (
            {path.stem: path.read_text(encoding="utf-8") for path in sorted(self.schema_dir.glob("*.graphql"))}
            if self.schema_dir.exists()
            else {}
        )
        return sorted(
            (set(expected) ^ set(actual))
            | {name for name in expected.keys() & actual.keys() if expected[name] != actual[name]}
        )

    def _prune_orphans(self, rendered: dict[str, str]) -> None:
        """Remove SDL files for schema buckets that no longer render."""

        if not self.schema_dir.exists():
            return
        expected_names = set(rendered)
        for path in sorted(self.schema_dir.glob("*.graphql")):
            if path.stem not in expected_names:
                path.unlink()
