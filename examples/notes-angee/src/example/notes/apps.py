"""Django config for the notes addon."""

from __future__ import annotations

from typing import ClassVar

from angee.base.apps import BaseAddonConfig


class NotesConfig(BaseAddonConfig):
    """Source app manifest for the notes addon."""

    default = True
    name = "example.notes"
    label = "notes"
    depends_on: ClassVar[tuple[str, ...]] = ("base",)
    resources: ClassVar[dict[str, tuple[str, ...]]] = {
        "demo": (
            "resources/demo/010_auth.user.csv",
            "resources/demo/020_notes.note.yaml",
        ),
    }

    def ready(self) -> None:
        """Wire note ownership relationships to the model lifecycle."""

        super().ready()
        from example.notes import signals

        signals.connect()
