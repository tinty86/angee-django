"""Tests for the SSRF-pinned outbound HTTP client (``integrate.http``).

These exercise the real ``PinnedTransport`` / ``_PinnedBackend`` over httpx. The
backend tests stub only ``socket.getaddrinfo`` (resolution) and httpcore's raw
dial, so the address gate, the resolve-then-pin (DNS-rebind) protection, the
dial-all fallback, and the ``OSError``-vs-``ValidationError`` distinction are
asserted against the production path. End-to-end tests confirm those exceptions
survive httpx, and a loopback server proves redirects are re-validated at each hop
and that a caller cannot displace the URL's Host. No external network or database
is used.
"""

from __future__ import annotations

import socket
import threading
from collections.abc import Iterator
from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, HTTPServer
from typing import Any

import httpcore
import pytest
from django.core.exceptions import ValidationError

from angee.integrate.http import HttpClient, PinnedTransport, _PinnedBackend, _response_status, _without_host

URL = "https://dav.example.test/path?x=1"


def _resolve_to(monkeypatch: pytest.MonkeyPatch, *addresses: str) -> None:
    """Make DNS resolution return the given address(es) for every hostname."""

    def fake_getaddrinfo(hostname: str, port: int | None, *, type: int) -> list[Any]:
        del hostname, type
        return [(socket.AF_INET, socket.SOCK_STREAM, 0, "", (address, port or 443)) for address in addresses]

    monkeypatch.setattr(socket, "getaddrinfo", fake_getaddrinfo)


def _record_dials(monkeypatch: pytest.MonkeyPatch, *, behaviors: list[Any] | None = None) -> list[str]:
    """Stub httpcore's raw dial; record the host dialled and replay behaviors.

    Each call pops one behavior: an ``Exception`` is raised (connection failure),
    anything else returns a stand-in stream (tests do not perform real I/O).
    """

    dialled: list[str] = []
    queue = list(behaviors or [])

    def fake_connect(self: Any, host: str, port: int, **kwargs: Any) -> Any:
        dialled.append(host)
        behavior = queue.pop(0) if queue else "ok"
        if isinstance(behavior, BaseException):
            raise behavior
        return object()

    monkeypatch.setattr(httpcore.SyncBackend, "connect_tcp", fake_connect)
    return dialled


def test_public_address_is_dialled_at_the_validated_ip(monkeypatch: pytest.MonkeyPatch) -> None:
    """A public host is dialled at the resolved IP (pinned), not a re-resolved host."""

    _resolve_to(monkeypatch, "93.184.216.34")
    dialled = _record_dials(monkeypatch)

    _PinnedBackend(allow_private=False).connect_tcp("dav.example.test", 443)

    assert dialled == ["93.184.216.34"]


@pytest.mark.parametrize("allow_private", [False, True])
@pytest.mark.parametrize(
    "address",
    [
        "169.254.169.254",  # AWS/GCP metadata
        "169.254.1.1",  # link-local generally
        "100.100.100.200",  # Alibaba metadata (RFC 6598 shared range)
        "224.0.0.1",  # multicast
        "0.0.0.0",  # unspecified
    ],
)
def test_metadata_and_escapes_blocked_in_both_modes(
    monkeypatch: pytest.MonkeyPatch, address: str, allow_private: bool
) -> None:
    """Metadata, link-local, the CGN range, multicast, and unspecified are always rejected — before any dial."""

    _resolve_to(monkeypatch, address)
    dialled = _record_dials(monkeypatch)

    with pytest.raises(ValidationError):
        _PinnedBackend(allow_private=allow_private).connect_tcp("h", 443)
    assert dialled == []


@pytest.mark.parametrize("address", ["10.0.0.1", "192.168.0.1", "172.16.0.1", "127.0.0.1"])
def test_private_and_loopback_rejected_in_public_mode(monkeypatch: pytest.MonkeyPatch, address: str) -> None:
    """Default (public) mode rejects RFC-1918 and loopback before any dial."""

    _resolve_to(monkeypatch, address)
    dialled = _record_dials(monkeypatch)

    with pytest.raises(ValidationError):
        _PinnedBackend(allow_private=False).connect_tcp("h", 443)
    assert dialled == []


@pytest.mark.parametrize("address", ["10.0.0.1", "192.168.0.1", "127.0.0.1"])
def test_private_and_loopback_permitted_in_private_mode(monkeypatch: pytest.MonkeyPatch, address: str) -> None:
    """``allow_private=True`` permits RFC-1918 / loopback (self-hosted connections)."""

    _resolve_to(monkeypatch, address)
    dialled = _record_dials(monkeypatch)

    _PinnedBackend(allow_private=True).connect_tcp("h", 443)

    assert dialled == [address]


def test_dial_falls_back_to_the_next_validated_address(monkeypatch: pytest.MonkeyPatch) -> None:
    """When the first validated IP is unreachable, the next one is tried."""

    _resolve_to(monkeypatch, "93.184.216.34", "93.184.216.35")
    dialled = _record_dials(monkeypatch, behaviors=[httpcore.ConnectError("down"), "ok"])

    _PinnedBackend(allow_private=False).connect_tcp("h", 443)

    assert dialled == ["93.184.216.34", "93.184.216.35"]


def test_all_addresses_unreachable_raises_os_error(monkeypatch: pytest.MonkeyPatch) -> None:
    """If every validated address fails, a transport ``OSError`` surfaces — not ``ValidationError``."""

    _resolve_to(monkeypatch, "93.184.216.34", "93.184.216.35")
    _record_dials(monkeypatch, behaviors=[httpcore.ConnectError("a"), httpcore.ConnectError("b")])

    with pytest.raises(OSError):
        _PinnedBackend(allow_private=False).connect_tcp("h", 443)


def test_httpclient_surfaces_validation_error_for_an_unsafe_host(monkeypatch: pytest.MonkeyPatch) -> None:
    """The SSRF gate's ``ValidationError`` survives httpx end-to-end."""

    _resolve_to(monkeypatch, "169.254.169.254")

    with pytest.raises(ValidationError):
        HttpClient().get(URL)


def test_httpclient_surfaces_os_error_when_unreachable(monkeypatch: pytest.MonkeyPatch) -> None:
    """A transport failure surfaces as ``OSError`` end-to-end (webhook telemetry relies on it)."""

    _resolve_to(monkeypatch, "93.184.216.34")
    _record_dials(monkeypatch, behaviors=[httpcore.ConnectError("down")])

    with pytest.raises(OSError):
        HttpClient().get(URL)


def test_caller_host_header_is_stripped() -> None:
    """A caller-supplied Host header is removed (case-insensitively) so httpx sets the URL host."""

    assert _without_host({"Host": "evil.example.com", "X-Test": "1"}) == {"X-Test": "1"}
    assert _without_host({"host": "evil.example.com"}) == {}
    assert _without_host(None) == {}


def test_pinned_transport_installs_the_pinned_backend() -> None:
    """The SSRF pin is actually wired into the transport — a direct guard so a future
    httpx/httpcore rename of the private backend attribute fails the suite loudly rather
    than silently dialling un-pinned."""

    assert isinstance(PinnedTransport(allow_private=False)._pool._network_backend, _PinnedBackend)


def test_response_without_status_raises_rather_than_defaulting_to_200() -> None:
    """A response carrying no status is an error, not a silent success."""

    class Bare:
        pass

    class WithStatus:
        status_code = 204

    with pytest.raises(ValueError):
        _response_status(Bare())
    assert _response_status(WithStatus()) == 204


class _RedirectHandler(BaseHTTPRequestHandler):
    """Loopback handler that records the received Host and 302s to a fixed location."""

    location = ""
    received_host: str | None = None

    def do_GET(self) -> None:  # noqa: N802 — BaseHTTPRequestHandler API
        type(self).received_host = self.headers.get("Host")
        self.send_response(302)
        self.send_header("Location", type(self).location)
        self.end_headers()

    def log_message(self, *args: Any) -> None:
        """Silence the default stderr request logging."""


@contextmanager
def _loopback_redirect_server(location: str) -> Iterator[int]:
    """Run a loopback server that 302s to ``location``; yield its port."""

    _RedirectHandler.location = location
    _RedirectHandler.received_host = None
    server = HTTPServer(("127.0.0.1", 0), _RedirectHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield server.server_address[1]
    finally:
        server.shutdown()
        thread.join()


def test_redirect_to_an_unsafe_host_is_rejected_at_the_hop() -> None:
    """Following a redirect re-enters the pinned backend, so a 30x to metadata is rejected."""

    with _loopback_redirect_server("http://169.254.169.254/") as port:
        with pytest.raises(ValidationError):
            HttpClient().get(f"http://127.0.0.1:{port}/", allow_private=True, follow_redirects=True)


def test_redirect_not_followed_by_default_and_host_is_the_url_host() -> None:
    """Without ``follow_redirects`` the 30x is returned as-is, and the sent Host is the URL host."""

    with _loopback_redirect_server("http://169.254.169.254/") as port:
        response = HttpClient().get(
            f"http://127.0.0.1:{port}/", headers={"Host": "evil.example.com"}, allow_private=True
        )

    assert response.status == 302
    assert _RedirectHandler.received_host == f"127.0.0.1:{port}"
