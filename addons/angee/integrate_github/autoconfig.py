"""Settings fragments required by the GitHub VCS implementation addon."""

from __future__ import annotations

SETTINGS = {
    # Contribute the GitHub backend into integrate's unified implementation
    # registry. An ``Integration`` row selects it with ``impl_class = "github"``.
    # Dotted key so it merges, not replaces.
    "ANGEE_INTEGRATION_IMPLS.github": "angee.integrate_github.backend.GitHubBackend",
}
"""Django settings contributed when the GitHub VCS implementation addon is installed."""
