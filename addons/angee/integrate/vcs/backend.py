"""The host-agnostic git-backend contract.

A :class:`VCSBackend` is bound to one ``Integration`` and reads its remote over the
host's REST API — listing repositories, walking trees, reading blobs, resolving
refs, and verifying inbound webhooks. It never clones: git transport belongs to
the operator. Concrete hosts (``integrate_github.GitHubBackend``) implement the
primitives; ``VCSIntegration`` owns the shared enumeration walk over them. This
module imports no models, so it breaks no import cycle.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class TreeEntry:
    """One entry in a repository tree at a ref."""

    path: str
    """Full path of the entry relative to the repository root."""
    type: str
    """``"tree"`` for a directory, ``"blob"`` for a file."""
    oid: str = ""

    @property
    def name(self) -> str:
        """Return the entry's basename."""

        return self.path.rsplit("/", 1)[-1]


@dataclass(frozen=True)
class RepoDescriptor:
    """A repository as reported by a host's repo listing.

    The shape :meth:`VCSBackend.ls_repos` returns and ``Repository`` reconcile
    upserts into rows.
    """

    name: str
    """The ``owner/repo`` path on the host."""
    org: str
    """The owning org/account login (used to group/sort the listing)."""
    remote: str
    """The HTTPS remote URL the operator clones."""
    ssh_remote: str = ""
    remote_id: str = ""
    default_branch: str = "main"
    visibility: str = "private"
    web_url: str = ""
    archived: bool = False
    extra: dict[str, Any] = field(default_factory=dict)


class VCSBackend:
    """Abstract REST backend for a git host, bound to one ``Integration``.

    Concrete hosts implement the primitives below; ``VCSIntegration`` calls into
    them. The constructor receives the integration so the backend can read its
    credential (``integration.credential.auth_headers()``) and config.
    """

    def __init__(self, integration: Any) -> None:
        """Bind this backend to the integration whose credential it authenticates with."""

        self.integration = integration

    def ls_repos(self, *, org: str = "") -> list[RepoDescriptor]:
        """List repositories visible to this integration, optionally within ``org``."""

        raise NotImplementedError("VCSBackend subclasses must implement ls_repos().")

    def ls_tree(self, repository: Any, *, ref: str, path: str, recursive: bool = False) -> list[TreeEntry]:
        """List the tree under ``path`` at ``ref`` (recursively when asked)."""

        raise NotImplementedError("VCSBackend subclasses must implement ls_tree().")

    def cat_file(self, repository: Any, *, ref: str, path: str) -> bytes:
        """Return the bytes of one blob at ``ref``; raise ``FileNotFoundError`` if absent."""

        raise NotImplementedError("VCSBackend subclasses must implement cat_file().")

    def rev_parse(self, repository: Any, ref: str) -> str:
        """Resolve ``ref`` to a commit oid."""

        raise NotImplementedError("VCSBackend subclasses must implement rev_parse().")

    def verify_webhook(self, vcs_integration: Any, request: Any) -> bool:
        """Return whether an inbound webhook request is authentic for this integration."""

        raise NotImplementedError("VCSBackend subclasses must implement verify_webhook().")

    def search_repos(self, query: str, *, org: str = "") -> list[RepoDescriptor]:
        """Return repositories whose name matches ``query`` — the typeahead source."""

        raise NotImplementedError("VCSBackend subclasses must implement search_repos().")

    def get_repo(self, name: str) -> RepoDescriptor:
        """Return one repository by its ``owner/repo`` name; raise ``FileNotFoundError`` if absent."""

        raise NotImplementedError("VCSBackend subclasses must implement get_repo().")


class NoopVCSBackend(VCSBackend):
    """Null-object backend for a VCS integration with no real host provider.

    ``integrate`` is host-agnostic and ships no host backend, but
    ``ImplClassField`` requires a non-empty registry, so this is the ``none``
    default in ``ANGEE_VCS_BACKEND_CLASSES``: it enumerates nothing and
    authenticates no webhook. Installing a host provider addon (e.g.
    ``integrate_github``) adds a real backend that a ``VCSIntegration`` row selects
    instead.
    """

    def ls_repos(self, *, org: str = "") -> list[RepoDescriptor]:
        """Return no repositories."""

        del org
        return []

    def ls_tree(self, repository: Any, *, ref: str, path: str, recursive: bool = False) -> list[TreeEntry]:
        """Return an empty tree."""

        del repository, ref, path, recursive
        return []

    def cat_file(self, repository: Any, *, ref: str, path: str) -> bytes:
        """Raise: a noop backend has no blobs to read."""

        del repository, ref
        raise FileNotFoundError(path)

    def rev_parse(self, repository: Any, ref: str) -> str:
        """Return no resolved commit oid."""

        del repository, ref
        return ""

    def verify_webhook(self, vcs_integration: Any, request: Any) -> bool:
        """Reject every inbound webhook: a noop backend trusts nothing."""

        del vcs_integration, request
        return False

    def search_repos(self, query: str, *, org: str = "") -> list[RepoDescriptor]:
        """Return no candidates."""

        del query, org
        return []

    def get_repo(self, name: str) -> RepoDescriptor:
        """Raise: a noop backend resolves no repository."""

        raise FileNotFoundError(name)
