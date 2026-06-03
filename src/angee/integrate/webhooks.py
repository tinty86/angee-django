"""Inbound and outbound webhook orchestration for integration capabilities."""

from __future__ import annotations

import hashlib
import hmac
import http.client
import ipaddress
import json
import logging
import socket
import ssl
from dataclasses import dataclass
from typing import Any
from urllib.parse import SplitResult, urlsplit, urlunsplit

from django.core.exceptions import ValidationError
from django.utils import timezone
from rebac import system_context

from angee.integrate.events import EventKind
from angee.integrate.models import WebhookSubscription
from angee.integrate.validators import ALLOWED_WEBHOOK_SCHEMES, _is_unsafe_address

HTTP_TIMEOUT_SECONDS = 10
"""Timeout used for outbound webhook POSTs."""

SIGNATURE_HEADER = "X-Angee-Signature"
"""Header carrying the HMAC-SHA256 signature for outbound webhook bodies."""

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class _PinnedAddress:
    """One resolver answer validated for webhook delivery."""

    family: socket.AddressFamily
    socktype: socket.SocketKind
    proto: int
    address: str
    sockaddr: Any


class _PinnedHTTPConnection(http.client.HTTPConnection):
    """HTTP connection that dials the validated IP instead of resolving host again."""

    def __init__(
        self,
        host: str,
        *,
        port: int,
        timeout: int,
        pinned_address: _PinnedAddress,
    ) -> None:
        """Store the pinned resolver answer while preserving the original host."""

        super().__init__(host, port=port, timeout=timeout)
        self._pinned_address = pinned_address
        self._delivery_timeout = timeout

    def connect(self) -> None:
        """Open the TCP connection to the pinned resolver answer."""

        self.sock = _open_pinned_socket(self._pinned_address, timeout=self._delivery_timeout)


class _PinnedHTTPSConnection(http.client.HTTPSConnection):
    """HTTPS connection that dials the validated IP but verifies the original host."""

    def __init__(
        self,
        host: str,
        *,
        port: int,
        timeout: int,
        pinned_address: _PinnedAddress,
        tls_hostname: str,
        context: ssl.SSLContext,
    ) -> None:
        """Store the pinned address and TLS hostname for certificate validation."""

        super().__init__(host, port=port, timeout=timeout, context=context)
        self._pinned_address = pinned_address
        self._delivery_timeout = timeout
        self._tls_hostname = tls_hostname
        self._tls_context = context

    def connect(self) -> None:
        """Open TLS to the pinned IP while checking the original hostname."""

        sock = _open_pinned_socket(self._pinned_address, timeout=self._delivery_timeout)
        try:
            self.sock = self._tls_context.wrap_socket(sock, server_hostname=self._tls_hostname)
        except OSError:
            sock.close()
            raise


class WebhookDeliveryError(Exception):
    """Raised when a webhook endpoint returns a non-success HTTP status."""

    def __init__(self, message: str, *, status: str = "") -> None:
        """Record the delivery status when one is available."""

        super().__init__(message)
        self.status = status


def deliver_event(
    *,
    kind: EventKind | str,
    payload: Any,
    impl_app: str = "",
    account: Any | None = None,
) -> dict[str, int]:
    """Deliver one integration event to every matching enabled subscription."""

    kind_value = _choice_value(kind)
    body = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
    delivered = 0
    errors = 0

    with system_context(reason="integrate.webhooks.deliver"):
        subscriptions = WebhookSubscription.objects.filter(enabled=True).order_by("pk")
        for subscription in subscriptions:
            if not _subscription_matches(
                subscription,
                kind=kind_value,
                impl_app=impl_app,
                account=account,
            ):
                continue
            try:
                status = _post_subscription(subscription, body)
            except Exception as exc:
                logger.exception("Webhook delivery failed for subscription %s.", subscription.public_id)
                _record_failure(subscription, exc)
                errors += 1
            else:
                _record_success(subscription, status)
                delivered += 1

    return {"delivered": delivered, "errors": errors}


def dispatch_inbound(*, bridge: Any, request_or_payload: Any) -> bool:
    """Verify an inbound webhook and dispatch it to the bridge when authentic."""

    if not bridge.verify_webhook(request_or_payload):
        return False
    bridge.handle_webhook(request_or_payload)
    return True


def _post_subscription(subscription: WebhookSubscription, body: bytes) -> str:
    """POST ``body`` to ``subscription`` and return the HTTP status code."""

    parsed = _parse_delivery_url(str(subscription.target_url))
    hostname = _delivery_hostname(parsed)
    port = _delivery_port(parsed)
    pinned_address = _resolve_public_addresses(hostname, port)[0]
    connection = _connection_for(parsed, pinned_address)
    try:
        connection.request(
            "POST",
            _request_target(parsed),
            body=body,
            headers={
                "Accept": "application/json",
                "Content-Type": "application/json",
                "Host": _host_header(parsed),
                SIGNATURE_HEADER: _signature(subscription.secret, body),
            },
        )
        response = connection.getresponse()
        status = _response_status(response)
    finally:
        connection.close()

    if status < 200 or status >= 300:
        raise WebhookDeliveryError(f"HTTP {status}", status=str(status))
    return str(status)


def _parse_delivery_url(url: str) -> SplitResult:
    """Return a parsed HTTP(S) delivery URL, raising Django validation errors."""

    try:
        parsed = urlsplit(url)
        parsed.port
    except ValueError as error:
        raise ValidationError("Webhook URL is invalid.") from error
    if parsed.scheme not in ALLOWED_WEBHOOK_SCHEMES:
        raise ValidationError("Webhook URL must use http or https.")
    if not parsed.hostname:
        raise ValidationError("Webhook URL must include a host.")
    return parsed


def _delivery_hostname(parsed: SplitResult) -> str:
    """Return the validated hostname from ``parsed``."""

    if parsed.hostname is None:
        raise ValidationError("Webhook URL must include a host.")
    return parsed.hostname


def _delivery_port(parsed: SplitResult) -> int:
    """Return the effective port for one delivery URL."""

    if parsed.port is not None:
        return parsed.port
    return _default_port(parsed.scheme)


def _default_port(scheme: str) -> int:
    """Return the default port for an allowed webhook URL scheme."""

    if scheme == "https":
        return http.client.HTTPS_PORT
    return http.client.HTTP_PORT


def _resolve_public_addresses(hostname: str, port: int) -> tuple[_PinnedAddress, ...]:
    """Resolve ``hostname`` once and return validated public resolver answers."""

    try:
        results = socket.getaddrinfo(
            hostname,
            port,
            type=socket.SOCK_STREAM,
        )
    except OSError as error:
        raise ValidationError("Webhook URL host could not be resolved.") from error

    addresses: list[_PinnedAddress] = []
    seen: set[tuple[int, str, int]] = set()
    for family, socktype, proto, _canonname, sockaddr in results:
        address = ipaddress.ip_address(sockaddr[0])
        if _is_unsafe_address(address):
            raise ValidationError("Webhook URL host must resolve only to public IP addresses.")
        key = (int(family), str(address), int(proto))
        if key in seen:
            continue
        seen.add(key)
        addresses.append(
            _PinnedAddress(
                family=socket.AddressFamily(family),
                socktype=socket.SocketKind(socktype),
                proto=proto,
                address=str(address),
                sockaddr=sockaddr,
            )
        )
    if not addresses:
        raise ValidationError("Webhook URL host could not be resolved.")
    return tuple(addresses)


def _connection_for(parsed: SplitResult, pinned_address: _PinnedAddress) -> http.client.HTTPConnection:
    """Return a connection that dials ``pinned_address`` and preserves URL host semantics."""

    hostname = _delivery_hostname(parsed)
    port = _delivery_port(parsed)
    if parsed.scheme == "https":
        return _PinnedHTTPSConnection(
            hostname,
            port=port,
            timeout=HTTP_TIMEOUT_SECONDS,
            pinned_address=pinned_address,
            tls_hostname=hostname,
            context=ssl.create_default_context(),
        )
    return _PinnedHTTPConnection(
        hostname,
        port=port,
        timeout=HTTP_TIMEOUT_SECONDS,
        pinned_address=pinned_address,
    )


def _open_pinned_socket(address: _PinnedAddress, *, timeout: int) -> socket.socket:
    """Open one socket to a previously validated resolver answer."""

    sock = socket.socket(address.family, address.socktype, address.proto)
    try:
        sock.settimeout(timeout)
        sock.connect(address.sockaddr)
    except OSError:
        sock.close()
        raise
    return sock


def _request_target(parsed: SplitResult) -> str:
    """Return the origin-form request target for ``parsed``."""

    return urlunsplit(("", "", parsed.path or "/", parsed.query, ""))


def _host_header(parsed: SplitResult) -> str:
    """Return the Host header for one delivery URL."""

    hostname = _delivery_hostname(parsed)
    if ":" in hostname and not hostname.startswith("["):
        hostname = f"[{hostname}]"
    port = parsed.port
    if port is None or port == _default_port(parsed.scheme):
        return hostname
    return f"{hostname}:{port}"


def _subscription_matches(
    subscription: WebhookSubscription,
    *,
    kind: str,
    impl_app: str,
    account: Any | None,
) -> bool:
    """Return whether one subscription should receive an event."""

    if kind not in {str(value) for value in subscription.event_kinds or ()}:
        return False

    impl_app_filter = tuple(str(value) for value in subscription.impl_app_filter or ())
    if impl_app_filter and impl_app not in impl_app_filter:
        return False

    account_filter_id = subscription.account_filter_id
    if account_filter_id is None:
        return True
    return account is not None and account_filter_id == getattr(account, "pk", None)


def _record_success(subscription: WebhookSubscription, status: str) -> None:
    """Persist success telemetry for one webhook delivery attempt."""

    subscription.last_delivery_at = timezone.now()
    subscription.last_delivery_status = status
    subscription.last_error = ""
    subscription.consecutive_failures = 0
    subscription.save(
        update_fields=[
            "consecutive_failures",
            "last_delivery_at",
            "last_delivery_status",
            "last_error",
            "updated_at",
        ]
    )


def _record_failure(subscription: WebhookSubscription, exc: Exception) -> None:
    """Persist failure telemetry for one webhook delivery attempt."""

    subscription.last_delivery_at = timezone.now()
    subscription.last_delivery_status = _failure_status(exc)
    subscription.last_error = _error_message(exc)
    subscription.consecutive_failures = int(subscription.consecutive_failures or 0) + 1
    subscription.save(
        update_fields=[
            "consecutive_failures",
            "last_delivery_at",
            "last_delivery_status",
            "last_error",
            "updated_at",
        ]
    )


def _signature(secret: str, body: bytes) -> str:
    """Return the Angee webhook signature header value for ``body``."""

    digest = hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()
    return f"sha256={digest}"


def _response_status(response: Any) -> int:
    """Return the integer HTTP status from a stdlib response or test double."""

    status = getattr(response, "status", None)
    if status is not None:
        return int(status)
    getcode = getattr(response, "getcode", None)
    if callable(getcode):
        return int(getcode())
    return 200


def _failure_status(exc: Exception) -> str:
    """Return an HTTP status string from ``exc`` when one is available."""

    if isinstance(exc, WebhookDeliveryError):
        return exc.status
    return ""


def _error_message(exc: Exception) -> str:
    """Return a compact message for telemetry storage."""

    if isinstance(exc, ValidationError):
        return "; ".join(str(message) for message in exc.messages)
    return f"{type(exc).__name__}: {exc}"


def _choice_value(value: Any) -> str:
    """Return the string value for a Django choices enum or plain string."""

    return str(getattr(value, "value", value))
