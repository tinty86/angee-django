"""Django app configuration for Angee resource commands."""

from __future__ import annotations

from django.apps import AppConfig


class ResourcesConfig(AppConfig):
    """Plain Django app config for the resource subsystem."""

    default_auto_field = "django.db.models.BigAutoField"
    name = "angee.resources"
