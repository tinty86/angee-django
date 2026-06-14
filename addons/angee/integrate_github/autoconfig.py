"""Settings fragments required by the GitHub VCS-backend addon."""

from __future__ import annotations

SETTINGS = {
    # Contribute the GitHub backend into the host-agnostic registry the
    # ``integrate`` addon declares. A ``VCSIntegration`` row selects it with
    # ``backend_class = "github"``. Dotted key so it merges, not replaces.
    "ANGEE_VCS_BACKEND_CLASSES.github": "angee.integrate_github.backend.GitHubBackend",
}
"""Django settings contributed when the GitHub VCS-backend addon is installed."""
