"""Unit tests for the CardDAV vCard parser (pure functions, no database).

The directory-sync map and `purge_missing` are exercised live against the example
database; these cover the transport-parse boundary the live run can't assert
deterministically — full field mapping and the UID fallback whose empty result the
sync deliberately skips (an empty key would collapse keyless cards onto one row).
"""

from __future__ import annotations

import vobject

from angee.parties_integrate_carddav.backend import _parse_vcard

_FULL_VCARD = """BEGIN:VCARD
VERSION:3.0
UID:abc-123
FN:Ada Lovelace
N:Lovelace;Ada;Augusta;Ms.;PhD
NICKNAME:Countess
EMAIL;TYPE=HOME:ada@example.com
EMAIL;TYPE=WORK:ada@work.example.com
TEL;TYPE=CELL:+15550100
ADR;TYPE=HOME:;;12 Analytical St;London;;EC1;UK
ORG:Analytical Engines;Research
TITLE:Mathematician
NOTE:First programmer.
END:VCARD"""


def _parse(text: str, *, href: str = "/ab/ada.vcf") -> object:
    return _parse_vcard(vobject.readOne(text), etag="v1", href=href, raw=text)


def test_parse_full_vcard_maps_every_field() -> None:
    """A complete vCard maps to all neutral ParsedContact fields."""

    contact = _parse(_FULL_VCARD)
    assert contact.uid == "abc-123"
    assert contact.etag == "v1"
    assert contact.display_name == "Ada Lovelace"
    assert contact.name_prefix == "Ms."
    assert contact.given_name == "Ada"
    assert contact.additional_name == "Augusta"
    assert contact.family_name == "Lovelace"
    assert contact.name_suffix == "PhD"
    assert contact.nickname == "Countess"
    assert contact.notes == "First programmer."
    assert contact.organization == "Analytical Engines"
    assert contact.title == "Mathematician"
    assert contact.emails == (("ada@example.com", "home"), ("ada@work.example.com", "work"))
    assert contact.phones == (("+15550100", "cell"),)
    assert len(contact.addresses) == 1
    address = contact.addresses[0]
    assert (address.street, address.city, address.postal_code, address.country) == (
        "12 Analytical St",
        "London",
        "EC1",
        "UK",
    )
    assert contact.raw_vcard == _FULL_VCARD


def test_uid_falls_back_to_fn_then_href() -> None:
    """A card without UID keys on FN; without UID and FN, on the resource href."""

    no_uid = "BEGIN:VCARD\nVERSION:3.0\nFN:Grace Hopper\nEMAIL:grace@example.com\nEND:VCARD"
    assert _parse(no_uid, href="/ab/grace.vcf").uid == "Grace Hopper"

    bare = "BEGIN:VCARD\nVERSION:3.0\nEMAIL:anon@example.com\nEND:VCARD"
    assert _parse(bare, href="/ab/anon.vcf").uid == "/ab/anon.vcf"


def test_no_stable_key_yields_empty_uid() -> None:
    """With no UID, FN, or href the uid is empty — the sync skips these (no collapse)."""

    bare = "BEGIN:VCARD\nVERSION:3.0\nEMAIL:anon@example.com\nEND:VCARD"
    assert _parse(bare, href="").uid == ""
