"""Credential kind registry for IAM connection secrets.

This registry is the seam for future credential kinds such as ``vault_ref``:
add a new ``CredentialKindHandler`` subclass that owns that material shape and
call ``register_handler()``. The ``Credential`` model stores only the common
columns and delegates kind-specific behavior here.
"""

from __future__ import annotations

import json
from typing import Any, ClassVar

from django.db import models


class CredentialKind(models.TextChoices):
    """Supported credential material kinds."""

    OAUTH = "oauth", "OAuth"
    STATIC_TOKEN = "static_token", "Static Token"


class CredentialKindHandler:
    """Base behavior contract for one credential material kind."""

    kind: ClassVar[str]

    def validate(self, material: dict[str, Any]) -> None:
        """Validate ``material`` before it is stored."""

    def auth_headers(self, credential: Any) -> dict[str, str]:
        """Return HTTP auth headers for ``credential``."""

        raise NotImplementedError

    def refresh(self, credential: Any) -> None:
        """Refresh ``credential`` in place when the kind supports it."""

        raise NotImplementedError

    def reveal(self, credential: Any) -> dict[str, Any]:
        """Return the decrypted JSON material for ``credential``."""

        return json.loads(credential.material or "{}")


_handlers: dict[str, CredentialKindHandler] = {}


def register_handler(handler: CredentialKindHandler) -> None:
    """Register one credential kind handler."""

    kind = getattr(handler, "kind", "")
    if not kind:
        raise ValueError("Credential kind handlers must define a non-empty kind.")
    _handlers[str(kind)] = handler


def handler_for(kind: str | CredentialKind) -> CredentialKindHandler:
    """Return the handler for ``kind`` or raise a clear configuration error."""

    kind_value = kind.value if isinstance(kind, CredentialKind) else str(kind)
    try:
        return _handlers[kind_value]
    except KeyError as exc:
        raise ValueError(f"No credential handler registered for kind {kind!r}.") from exc


class OAuthCredentialHandler(CredentialKindHandler):
    """Handler for OAuth bearer-token material."""

    kind = "oauth"

    def validate(self, material: dict[str, Any]) -> None:
        """Require the access token used for bearer authentication."""

        if not material.get("access_token"):
            raise ValueError("OAuth credential material requires access_token.")

    def auth_headers(self, credential: Any) -> dict[str, str]:
        """Return OAuth bearer authorization headers."""

        material = self.reveal(credential)
        return {"Authorization": f"Bearer {material['access_token']}"}

    def refresh(self, credential: Any) -> None:
        """Refresh OAuth tokens."""

        raise NotImplementedError("OAuth token refresh wired in S3")


class StaticTokenCredentialHandler(CredentialKindHandler):
    """Handler for static API key material."""

    kind = "static_token"

    def validate(self, material: dict[str, Any]) -> None:
        """Require the API key used for bearer authentication."""

        if not material.get("api_key"):
            raise ValueError("Static token credential material requires api_key.")

    def auth_headers(self, credential: Any) -> dict[str, str]:
        """Return static-token bearer authorization headers."""

        material = self.reveal(credential)
        return {"Authorization": f"Bearer {material['api_key']}"}

    def refresh(self, credential: Any) -> None:
        """Static tokens do not expire through a refresh flow."""


register_handler(OAuthCredentialHandler())
register_handler(StaticTokenCredentialHandler())
