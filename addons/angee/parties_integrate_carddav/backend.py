"""CardDAV directory backend: discover address books and sync their contacts.

Real RFC 6764 + RFC 6352 discovery — ``.well-known/carddav`` (or the configured
base) → ``current-user-principal`` → ``addressbook-home-set`` → enumerate the
address-book collections — then per collection a list-then-multiget fetch:
``PROPFIND Depth:1`` for the vCard hrefs + etags, then a batched
``addressbook-multiget`` REPORT for the cards. Everything goes over the shared
SSRF-pinned client (``allow_private=True`` — self-hosted CardDAV servers are
common), authenticated by the directory's Basic-auth credential, following one
level of redirect. ``vobject`` parses each card into a neutral ``ParsedContact``;
the idempotent ``(folder, source_uid)`` map onto parties is owned by
``Directory.sync`` + the parties managers, never here.
"""

from __future__ import annotations

import xml.etree.ElementTree as ElementTree
from typing import Any
from urllib.parse import urljoin, urlsplit, urlunsplit
from xml.sax.saxutils import escape

import vobject

from angee.parties.backends import (
    DirectoryBackend,
    ParsedAddress,
    ParsedAddressbook,
    ParsedContact,
)

_NS = {
    "d": "DAV:",
    "card": "urn:ietf:params:xml:ns:carddav",
    "cs": "http://calendarserver.org/ns/",
}
_MULTIGET_CHUNK = 100
_REDIRECT_STATUSES = (301, 302, 307, 308)

_PRINCIPAL_BODY = (
    '<?xml version="1.0" encoding="utf-8"?>'
    '<d:propfind xmlns:d="DAV:"><d:prop><d:current-user-principal/></d:prop></d:propfind>'
)
_HOME_BODY = (
    '<?xml version="1.0" encoding="utf-8"?>'
    '<d:propfind xmlns:d="DAV:" xmlns:card="urn:ietf:params:xml:ns:carddav">'
    "<d:prop><card:addressbook-home-set/></d:prop></d:propfind>"
)
_BOOKS_BODY = (
    '<?xml version="1.0" encoding="utf-8"?>'
    '<d:propfind xmlns:d="DAV:" xmlns:cs="http://calendarserver.org/ns/">'
    "<d:prop><d:resourcetype/><d:displayname/><cs:getctag/></d:prop></d:propfind>"
)
_LISTING_BODY = (
    '<?xml version="1.0" encoding="utf-8"?>'
    '<d:propfind xmlns:d="DAV:"><d:prop><d:getetag/><d:getcontenttype/></d:prop></d:propfind>'
)


class CardDavError(Exception):
    """Raised when the CardDAV server returns an unexpected response."""


class CardDavDirectoryBackend(DirectoryBackend):
    """Discovers a CardDAV account's address books and fetches each one's vCards.

    ``config["server_url"]`` is the account/server URL; discovery finds the
    collections, so the operator never pastes an exact collection URL. The
    directory's Basic-auth credential authenticates.
    """

    key = "carddav"
    label = "CardDAV"
    icon = "address-book"
    defaults = {"vendor": "carddav"}

    # --- discovery (DirectoryBackend contract) ---

    def discover(self) -> list[ParsedAddressbook]:
        """Resolve the account's principal → home-set → address-book collections."""

        base = self._base_url()
        if not base:
            return []
        principal = ""
        for candidate in (base, _well_known(base)):
            principal = self._first_href(candidate, _PRINCIPAL_BODY, ".//d:current-user-principal/d:href")
            if principal:
                break
        principal = principal or base
        home = self._first_href(principal, _HOME_BODY, ".//card:addressbook-home-set/d:href") or principal
        return self._enumerate(home)

    def fetch_contacts(self, addressbook: ParsedAddressbook) -> list[ParsedContact]:
        """List the collection's vCard hrefs, then multiget them in batches."""

        hrefs = self._list_vcard_hrefs(addressbook.href)
        contacts: list[ParsedContact] = []
        for start in range(0, len(hrefs), _MULTIGET_CHUNK):
            contacts.extend(self._multiget(addressbook.href, hrefs[start : start + _MULTIGET_CHUNK]))
        return contacts

    # --- transport ---

    def _request(self, method: str, url: str, body: str, *, depth: str = "0", _hops: int = 0) -> Any:
        """Send one DAV request, following a single redirect, and assert it succeeded."""

        headers = {"Depth": depth, "Content-Type": "application/xml; charset=utf-8", **self._auth()}
        response = self.http.request(
            method, url, headers=headers, body=body.encode("utf-8"), allow_private=True
        )
        if response.status in _REDIRECT_STATUSES and _hops < 3:
            location = response.header("location")
            if location:
                return self._request(method, urljoin(url, location), body, depth=depth, _hops=_hops + 1)
        if not (response.ok or response.status == 207):
            raise CardDavError(f"CardDAV {method} {url} returned HTTP {response.status}.")
        return response

    def _auth(self) -> dict[str, str]:
        """Return the directory credential's auth headers (empty if unconfigured)."""

        credential = self.bridge.credential
        return credential.auth_headers() if credential is not None else {}

    def _base_url(self) -> str:
        """Return the configured server URL."""

        return str((self.bridge.config or {}).get("server_url") or "").strip()

    # --- discovery helpers ---

    def _first_href(self, url: str, body: str, xpath: str) -> str:
        """PROPFIND ``url`` and return the first ``xpath`` href, absolutised, or ``""``."""

        try:
            response = self._request("PROPFIND", url, body, depth="0")
        except CardDavError:
            return ""
        node = _xml(response.body).find(xpath, _NS)
        return urljoin(url, node.text.strip()) if node is not None and node.text else ""

    def _enumerate(self, home: str) -> list[ParsedAddressbook]:
        """Return the address-book collections under ``home`` (Depth:1)."""

        response = self._request("PROPFIND", home, _BOOKS_BODY, depth="1")
        books: list[ParsedAddressbook] = []
        for resp in _xml(response.body).findall("d:response", _NS):
            if resp.find(".//d:resourcetype/card:addressbook", _NS) is None:
                continue
            href = _href(resp)
            if not href:
                continue
            books.append(
                ParsedAddressbook(
                    href=urljoin(home, href),
                    name=_text(resp, ".//d:displayname") or "Contacts",
                    ctag=_text(resp, ".//cs:getctag"),
                )
            )
        return books

    def _list_vcard_hrefs(self, collection: str) -> list[str]:
        """Return the hrefs of the vCard resources in ``collection`` (Depth:1)."""

        response = self._request("PROPFIND", collection, _LISTING_BODY, depth="1")
        hrefs: list[str] = []
        for resp in _xml(response.body).findall("d:response", _NS):
            if "vcard" not in _text(resp, ".//d:getcontenttype").lower():
                continue
            href = _href(resp)
            if href:
                hrefs.append(href)
        return hrefs

    def _multiget(self, collection: str, hrefs: list[str]) -> list[ParsedContact]:
        """REPORT ``addressbook-multiget`` for ``hrefs`` and parse the returned cards."""

        if not hrefs:
            return []
        body = (
            '<?xml version="1.0" encoding="utf-8"?>'
            '<card:addressbook-multiget xmlns:d="DAV:" xmlns:card="urn:ietf:params:xml:ns:carddav">'
            "<d:prop><d:getetag/><card:address-data/></d:prop>"
            + "".join(f"<d:href>{escape(href)}</d:href>" for href in hrefs)
            + "</card:addressbook-multiget>"
        )
        response = self._request("REPORT", collection, body, depth="1")
        contacts: list[ParsedContact] = []
        for resp in _xml(response.body).findall("d:response", _NS):
            data = _text(resp, ".//card:address-data")
            if not data.strip():
                continue
            try:
                card = vobject.readOne(data)
            except Exception:  # noqa: BLE001 — one malformed card must not abort the sync.
                continue
            contacts.append(_parse_vcard(card, etag=_text(resp, ".//d:getetag").strip('"'), href=_href(resp), raw=data))
        return contacts


def _well_known(base: str) -> str:
    """Return ``{origin}/.well-known/carddav`` for a base URL."""

    parts = urlsplit(base)
    return urlunsplit((parts.scheme, parts.netloc, "/.well-known/carddav", "", ""))


def _xml(body: bytes) -> Any:
    """Parse a DAV multistatus body."""

    return ElementTree.fromstring(body)


def _href(response_el: Any) -> str:
    """Return the ``d:href`` text of one multistatus response element, or ``""``."""

    node = response_el.find("d:href", _NS)
    return node.text.strip() if node is not None and node.text else ""


def _text(element: Any, xpath: str) -> str:
    """Return the stripped text at ``xpath`` under ``element``, or ``""``."""

    node = element.find(xpath, _NS)
    return (node.text or "").strip() if node is not None else ""


def _parse_vcard(card: Any, *, etag: str, href: str, raw: str) -> ParsedContact:
    """Map one parsed vCard into a neutral :class:`ParsedContact`.

    ``uid`` falls back to ``FN`` then the resource ``href`` so every contact has a
    stable per-folder key even when the server omits ``UID``.
    """

    name = getattr(getattr(card, "n", None), "value", None)
    org_values = getattr(getattr(card, "org", None), "value", None) or []
    return ParsedContact(
        uid=_prop(card, "uid") or _prop(card, "fn") or href,
        etag=etag,
        display_name=_prop(card, "fn"),
        name_prefix=str(getattr(name, "prefix", "") or ""),
        given_name=str(getattr(name, "given", "") or ""),
        additional_name=str(getattr(name, "additional", "") or ""),
        family_name=str(getattr(name, "family", "") or ""),
        name_suffix=str(getattr(name, "suffix", "") or ""),
        nickname=_prop(card, "nickname"),
        notes=_prop(card, "note"),
        organization=str(org_values[0]) if org_values else "",
        title=_prop(card, "title"),
        emails=tuple(_labelled(item) for item in card.contents.get("email", [])),
        phones=tuple(_labelled(item) for item in card.contents.get("tel", [])),
        addresses=tuple(_address(item) for item in card.contents.get("adr", [])),
        raw_vcard=raw,
    )


def _prop(card: Any, prop: str) -> str:
    """Return a single-valued vCard property's text, or ``""``."""

    component = getattr(card, prop, None)
    return str(component.value) if component is not None and component.value else ""


def _labelled(component: Any) -> tuple[str, str]:
    """Return ``(value, label)`` for an EMAIL/TEL component using its first TYPE."""

    types = component.params.get("TYPE", []) if hasattr(component, "params") else []
    return str(component.value or ""), (str(types[0]).lower() if types else "")


def _address(component: Any) -> ParsedAddress:
    """Return a :class:`ParsedAddress` from an ADR component."""

    value = component.value
    types = component.params.get("TYPE", []) if hasattr(component, "params") else []
    return ParsedAddress(
        label=str(types[0]).lower() if types else "",
        po_box=str(getattr(value, "box", "") or ""),
        extended=str(getattr(value, "extended", "") or ""),
        street=str(getattr(value, "street", "") or ""),
        city=str(getattr(value, "city", "") or ""),
        region=str(getattr(value, "region", "") or ""),
        postal_code=str(getattr(value, "code", "") or ""),
        country=str(getattr(value, "country", "") or ""),
    )
