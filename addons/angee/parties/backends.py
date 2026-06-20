"""Directory backend contract — sync a contacts source into parties.

A :class:`~angee.parties.models.Directory` (an ``integrate.Integration`` child +
``Bridge``) selects one ``DirectoryBackend`` by registry key. The backend does the
per-source *transport* + *parse* in two steps: :meth:`DirectoryBackend.discover`
enumerates the address books (each becomes a :class:`~angee.parties.models.Folder`)
and :meth:`DirectoryBackend.fetch_contacts` returns one address book's contacts as
neutral :class:`ParsedContact` rows. The *map* onto parties — the idempotent
``(folder, source_uid)`` upsert and the purge of vanished contacts — is owned by
``Directory.sync`` + the parties managers, so every source shares one write path.
The ``parties_integrate_carddav`` addon contributes the ``carddav`` backend; the
``manual`` null-object keeps the registry non-empty when no source is installed.
"""

from __future__ import annotations

from dataclasses import dataclass

from angee.integrate.http import HttpClientMixin
from angee.integrate.impl import BridgeImpl


@dataclass(frozen=True)
class ParsedAddressbook:
    """One address-book collection discovered on a source.

    ``href`` is its stable collection URL (the folder dedup key). ``ctag`` and
    ``sync_token`` are the incremental cursors: an unchanged ``ctag`` lets the sync
    skip the whole collection, and ``sync_token`` (RFC 6578) drives delta fetches.
    """

    href: str
    name: str = "Contacts"
    ctag: str = ""
    sync_token: str = ""


@dataclass(frozen=True)
class ParsedAddress:
    """One physical address parsed from a directory source."""

    label: str = ""
    po_box: str = ""
    extended: str = ""
    street: str = ""
    city: str = ""
    region: str = ""
    postal_code: str = ""
    country: str = ""


@dataclass(frozen=True)
class ParsedContact:
    """One contact parsed from a directory source, neutral of the wire format.

    ``uid`` is the source's stable id (a vCard ``UID``); it is the per-folder
    idempotency key, so it must be stable across syncs. ``etag`` is the
    per-resource version (for change detection) and ``raw_vcard`` is kept for
    lossless round-trip. Emails/phones are ``(value, label)`` pairs.
    """

    uid: str = ""
    etag: str = ""
    display_name: str = ""
    name_prefix: str = ""
    given_name: str = ""
    additional_name: str = ""
    family_name: str = ""
    name_suffix: str = ""
    nickname: str = ""
    notes: str = ""
    organization: str = ""
    title: str = ""
    emails: tuple[tuple[str, str], ...] = ()
    phones: tuple[tuple[str, str], ...] = ()
    addresses: tuple[ParsedAddress, ...] = ()
    raw_vcard: str = ""


class DirectoryBackend(BridgeImpl, HttpClientMixin):
    """Abstract backend that discovers and fetches a contacts source.

    ``self.bridge`` is the ``Directory`` row — its ``config`` carries the server
    URL and ``self.bridge.credential`` authenticates — and ``self.http`` is the
    shared SSRF-pinned client (a self-hosted source passes ``allow_private=True``).
    """

    category = "directory"
    label = "Directory"
    icon = "address-book"

    def discover(self) -> list[ParsedAddressbook]:
        """Return every address-book collection the source exposes."""

        raise NotImplementedError("DirectoryBackend subclasses must implement discover().")

    def fetch_contacts(self, addressbook: ParsedAddressbook) -> list[ParsedContact]:
        """Return every contact in one address book as neutral dataclasses."""

        raise NotImplementedError("DirectoryBackend subclasses must implement fetch_contacts().")


class ManualDirectoryBackend(DirectoryBackend):
    """The null-object default: a directory with no source backend syncs nothing.

    Keeps ``ANGEE_DIRECTORY_BACKEND_CLASSES`` non-empty when no source addon is
    installed (``ImplClassField`` requires a non-empty registry), so the GraphQL
    enum is never empty and a draft directory always has a selectable backend.
    """

    key = "manual"
    label = "Manual"

    def discover(self) -> list[ParsedAddressbook]:
        """Return no address books — a manual directory is populated by hand."""

        return []

    def fetch_contacts(self, addressbook: ParsedAddressbook) -> list[ParsedContact]:
        """Return no contacts — a manual directory is populated by hand."""

        return []
