"""Settings fragments required by Angee integration."""

from __future__ import annotations

SETTINGS = {
    # OAuth connection substrate. Host-provided OAuth client registrations (secrets
    # included) are declared here and synced by ``manage.py oauth_clients``; the
    # public catalogue is seeded from install-tier resources instead. The TTL bounds
    # the single-use redirect state record (shared by connect and OIDC login). OIDC
    # discovery TTL belongs to the ``iam_integrate_oidc`` addon.
    "ANGEE_INTEGRATE_OAUTH_CLIENTS": (),
    "ANGEE_INTEGRATE_OAUTH_STATE_TTL": 600,
    "ANGEE_OAUTH_PROVIDER_TYPES": {
        "generic_oauth2": "angee.integrate.oauth.providers.GenericOAuth2",
    },
    # The ``Integration.impl_class`` registry: each key a parent-only
    # ``Integration`` row may name → the dotted path of its integration-level
    # behavior. ``none`` is the neutral draft/null-object implementation
    # (``ImplClassField`` requires a non-empty registry). Concrete child models
    # own their domain backend field/registry (e.g. ``VcsBridge.backend_class``).
    # See ``angee.base.fields.ImplClassField``.
    "ANGEE_INTEGRATION_IMPLS": {
        "none": "angee.integrate.impl.NullIntegrationImpl",
    },
    # VCS bridge backends. ``local`` inventories a local working tree with no
    # network (dev/offline template + skill discovery); host addons add their own
    # backends with yamlconf dotted keys (``"ANGEE_VCS_BACKEND_CLASSES.github"``).
    "ANGEE_VCS_BACKEND_CLASSES": {
        "local": "angee.integrate.vcs.backend.LocalVCSBackend",
    },
}
"""Django settings contributed when the integrate addon is installed."""
