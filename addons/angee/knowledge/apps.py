"""Django config for Angee's knowledge addon."""

from __future__ import annotations

from django.apps import AppConfig


class KnowledgeConfig(AppConfig):
    """Source app manifest for the knowledge addon."""

    default = True
    name = "angee.knowledge"

    def ready(self) -> None:
        """Register the backlink index signal after app population."""

        super().ready()
        # App-populate phase 1 imports this config before models are ready;
        # importing signals here registers the post_save receiver.
        from angee.knowledge import signals  # noqa: F401
