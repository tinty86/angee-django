"""Host-agnostic VCS inventory support for the integrate addon.

Holds the model-free git-backend contract (:mod:`backend`) and the template-manifest
parser (:mod:`templates`). It owns *enumeration over a host's REST API*; it never
clones — git transport (clone/fetch/worktree) is the operator's job. Host-specific
backends (e.g. GitHub) live in their own addon and subclass
:class:`~angee.integrate.vcs.backend.VCSBackend`, registered into
``ANGEE_INTEGRATION_IMPLS`` and named per ``Integration.impl_class`` row by an
``ImplClassField``.
"""
