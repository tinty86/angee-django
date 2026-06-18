"""Django config for Angee's GitHub VCS-backend addon."""

from __future__ import annotations

from django.apps import AppConfig


class IntegrateGithubConfig(AppConfig):
    """Source app manifest for the GitHub VCS backend.

    Carries no models, schema, or permissions of its own: it contributes the
    :class:`~angee.integrate_github.backend.GitHubBackend` into
    ``ANGEE_INTEGRATION_IMPLS`` (via ``autoconfig``), named per
    ``Integration.impl_class`` row.
    """

    default = True
    angee_addon = True
    default_auto_field = "django.db.models.BigAutoField"
    name = "angee.integrate_github"
    label = "integrate_github"
    depends_on = ("angee.integrate",)
