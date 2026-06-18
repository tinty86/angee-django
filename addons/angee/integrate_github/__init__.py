"""GitHub VCS-backend addon for Angee's integration layer.

Host-specific implementation of the host-agnostic ``integrate`` VCS inventory: a
:class:`~angee.integrate_github.backend.GitHubBackend` reads a GitHub remote over the
REST API. It is named per ``Integration`` row through ``impl_class`` (resolved via
``ANGEE_INTEGRATION_IMPLS``) and never imported by the ``integrate`` core, so
the dependency stays one-way (``integrate_github`` → ``integrate``).
"""
