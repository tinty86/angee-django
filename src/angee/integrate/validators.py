"""Validators for integration runtime declarations."""

from __future__ import annotations

import ipaddress
import socket
from urllib.parse import urlsplit

from django.core.exceptions import ValidationError

ALLOWED_WEBHOOK_SCHEMES = frozenset({"http", "https"})
"""URL schemes accepted for webhook delivery targets."""

METADATA_IPS = frozenset(
    {
        ipaddress.ip_address("169.254.169.254"),
        ipaddress.ip_address("fd00:ec2::254"),
    }
)
"""Well-known cloud metadata service addresses that must never receive callbacks."""


def validate_public_url(value: object) -> None:
    """Raise when ``value`` is not an HTTP(S) URL resolving only to public IPs."""

    url = str(value)
    try:
        parsed = urlsplit(url)
        port = parsed.port
    except ValueError as error:
        raise ValidationError("Webhook URL is invalid.") from error
    if parsed.scheme not in ALLOWED_WEBHOOK_SCHEMES:
        raise ValidationError("Webhook URL must use http or https.")
    if not parsed.hostname:
        raise ValidationError("Webhook URL must include a host.")

    for address in _resolved_addresses(parsed.hostname, port):
        if _is_unsafe_address(address):
            raise ValidationError("Webhook URL host must resolve only to public IP addresses.")


def _resolved_addresses(hostname: str, port: int | None) -> tuple[ipaddress.IPv4Address | ipaddress.IPv6Address, ...]:
    """Return every IP address currently resolved for ``hostname``."""

    try:
        return (ipaddress.ip_address(hostname),)
    except ValueError:
        pass

    try:
        results = socket.getaddrinfo(
            hostname,
            port,
            type=socket.SOCK_STREAM,
        )
    except OSError as error:
        raise ValidationError("Webhook URL host could not be resolved.") from error

    addresses = []
    for result in results:
        sockaddr = result[4]
        addresses.append(ipaddress.ip_address(sockaddr[0]))
    if not addresses:
        raise ValidationError("Webhook URL host could not be resolved.")
    return tuple(dict.fromkeys(addresses))


def _is_unsafe_address(address: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    """Return whether ``address`` is forbidden for outbound webhook delivery."""

    return (
        address in METADATA_IPS
        or address.is_loopback
        or address.is_private
        or address.is_link_local
        or address.is_unspecified
        or address.is_multicast
        or address.is_reserved
    )
