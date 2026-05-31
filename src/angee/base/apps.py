"""Django application configuration for the Angee runtime foundation."""

from __future__ import annotations

from django.apps import AppConfig


class BaseConfig(AppConfig):
    """Django app configuration for Angee's runtime base app."""

    default_auto_field = "django.db.models.BigAutoField"
    label = "base"
    name = "angee.base"
