"""Django config for the notes addon."""

from __future__ import annotations

from django.apps import AppConfig


class NotesConfig(AppConfig):
    """Source app manifest for the notes addon."""

    default = True
    angee_addon = True
    name = "example.notes"
    label = "notes"
