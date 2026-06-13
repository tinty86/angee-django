"""GraphQL schema contributions for Angee integrations.

Owns the admin console surface for the third-party ``Vendor`` catalogue (moved
here from iam) and the first-class ``Integration`` an integration runs over. The
console is platform-admin gated, so ``Integration``'s REBAC-guarded relations
(credential/account from iam) are safe to expose — the const-admin reaches every
related row.
"""

from __future__ import annotations

import json
from typing import Any, cast

import strawberry
import strawberry_django
from django.apps import apps
from django.db import models
from django.utils import timezone
from rebac import system_context
from strawberry import auto, relay
from strawberry.scalars import JSON
from strawberry_django.pagination import OffsetPaginated

from angee.base.models import instance_from_public_id
from angee.graphql.actions import ActionResult
from angee.graphql.crud import crud
from angee.graphql.node import AngeeNode
from angee.graphql.subscriptions import changes
from angee.iam.permissions import ADMIN_PERMISSION_CLASSES as _ADMIN_PERMISSION_CLASSES
from angee.iam.schema import CredentialType, ExternalAccountType, UserType
from angee.integrate.registry import bridge_models

Vendor = apps.get_model("integrate", "Vendor")
Integration = apps.get_model("integrate", "Integration")
WebhookSubscription = apps.get_model("integrate", "WebhookSubscription")


@strawberry_django.type(Vendor)
class VendorType(AngeeNode):
    """GraphQL projection of an integration vendor catalogue row."""

    slug: auto
    display_name: auto
    website_url: auto
    icon: auto
    description: auto
    created_at: auto
    updated_at: auto


@strawberry_django.type(Integration)
class IntegrationType(AngeeNode):
    """Admin projection of an integration.

    Exposes the catalogue/identity associations as nested relations so the
    console form's ``many2one`` pickers auto-wire (mirrors iam's
    ``CredentialType.external_account``); safe because the surface is admin-gated.
    """

    vendor: VendorType
    credential: CredentialType | None
    account: ExternalAccountType | None
    owner: UserType
    status: auto
    config: JSON
    capability_statuses: JSON
    last_used_at: auto
    last_error: auto
    created_at: auto
    updated_at: auto

    @strawberry_django.field(only=["vendor", "status"])
    def display_name(self) -> str:
        """Return a human label for the record header and relation pickers.

        Integration has no natural string column; this gives ``recordRepresentation``
        a value (vendor + status) to show.
        """

        vendor = getattr(cast(Any, self), "vendor", None)
        label = str(getattr(vendor, "display_name", "") or getattr(vendor, "slug", "") or "integration")
        return f"{label} ({cast(Any, self).status})"


@strawberry.input
class VendorInput:
    """Fields accepted when creating a vendor."""

    slug: str
    display_name: str
    website_url: str = ""
    icon: str = ""
    description: str = ""


@strawberry.input
class VendorPatch:
    """Fields accepted when updating a vendor."""

    id: relay.GlobalID
    slug: str | None = strawberry.UNSET
    display_name: str | None = strawberry.UNSET
    website_url: str | None = strawberry.UNSET
    icon: str | None = strawberry.UNSET
    description: str | None = strawberry.UNSET


@strawberry_django.type(WebhookSubscription)
class WebhookSubscriptionType(AngeeNode):
    """Admin projection of an outbound webhook subscription.

    The signing ``secret`` is deliberately omitted (write-only) — unlike
    OAuthClient's revealed ``client_secret``, a webhook secret is never read back.
    """

    owner: UserType
    integration_filter: IntegrationType | None
    target_url: auto
    event_kinds: JSON
    impl_app_filter: JSON
    enabled: auto
    last_delivery_at: auto
    last_delivery_status: auto
    last_error: auto
    consecutive_failures: auto
    created_at: auto
    updated_at: auto


@strawberry.input
class WebhookSubscriptionInput:
    """Fields accepted when creating a webhook subscription."""

    owner: relay.GlobalID
    target_url: str
    secret: str
    event_kinds: JSON | None = None
    impl_app_filter: JSON | None = None
    integration_filter: relay.GlobalID | None = None
    enabled: bool = True


@strawberry.input
class WebhookSubscriptionPatch:
    """Fields accepted when updating a webhook subscription."""

    id: relay.GlobalID
    target_url: str | None = strawberry.UNSET
    secret: str | None = strawberry.UNSET
    event_kinds: JSON | None = strawberry.UNSET
    impl_app_filter: JSON | None = strawberry.UNSET
    integration_filter: relay.GlobalID | None = strawberry.UNSET
    enabled: bool | None = strawberry.UNSET


@strawberry.input
class IntegrationInput:
    """Fields accepted when creating an integration.

    FK GlobalIDs resolve to instances via strawberry-django (like storage's
    ``DriveInput.backend``); ``owner`` is field-backed REBAC, so writing it
    derives the owner tuple.
    """

    vendor: relay.GlobalID
    credential: relay.GlobalID
    owner: relay.GlobalID
    account: relay.GlobalID | None = None
    config: JSON | None = None
    status: str | None = None


@strawberry.input
class IntegrationPatch:
    """Fields accepted when updating an integration."""

    id: relay.GlobalID
    vendor: relay.GlobalID | None = strawberry.UNSET
    credential: relay.GlobalID | None = strawberry.UNSET
    account: relay.GlobalID | None = strawberry.UNSET
    owner: relay.GlobalID | None = strawberry.UNSET
    config: JSON | None = strawberry.UNSET
    status: str | None = strawberry.UNSET


@strawberry.type
class IntegrateConsoleQuery:
    """Admin integration catalogue and integration queries."""

    vendors: OffsetPaginated[VendorType] = strawberry_django.offset_paginated(
        permission_classes=_ADMIN_PERMISSION_CLASSES,
    )
    vendor: VendorType | None = strawberry_django.node(
        permission_classes=_ADMIN_PERMISSION_CLASSES,
    )
    integrations: OffsetPaginated[IntegrationType] = strawberry_django.offset_paginated(
        permission_classes=_ADMIN_PERMISSION_CLASSES,
    )
    integration: IntegrationType | None = strawberry_django.node(
        permission_classes=_ADMIN_PERMISSION_CLASSES,
    )
    webhook_subscriptions: OffsetPaginated[WebhookSubscriptionType] = strawberry_django.offset_paginated(
        permission_classes=_ADMIN_PERMISSION_CLASSES,
    )
    webhook_subscription: WebhookSubscriptionType | None = strawberry_django.node(
        permission_classes=_ADMIN_PERMISSION_CLASSES,
    )


_VENDOR_MUTATION = crud(
    VendorType,
    create=VendorInput,
    update=VendorPatch,
    delete=True,
    permission_classes=_ADMIN_PERMISSION_CLASSES,
    name="vendor",
    write_context="integrate.graphql.vendor",
)
"""Admin vendor CRUD: const-admin gated by ``PlatformAdminPermission``, written elevated."""

_INTEGRATION_MUTATION = crud(
    IntegrationType,
    create=IntegrationInput,
    update=IntegrationPatch,
    delete=True,
    permission_classes=_ADMIN_PERMISSION_CLASSES,
    name="integration",
    write_context="integrate.graphql.integration",
)
"""Admin integration CRUD: FK inputs resolve via strawberry-django; written elevated."""

_WEBHOOK_MUTATION = crud(
    WebhookSubscriptionType,
    create=WebhookSubscriptionInput,
    update=WebhookSubscriptionPatch,
    delete=True,
    permission_classes=_ADMIN_PERMISSION_CLASSES,
    name="webhook_subscription",
    write_context="integrate.graphql.webhook_subscription",
)
"""Admin outbound-webhook CRUD: secret is write-only; written elevated."""


@strawberry.type
class RotatedSecret:
    """A freshly rotated webhook signing secret, returned once for display."""

    ok: bool
    secret: str


def _resolve(model: type[models.Model], gid: relay.GlobalID, *, reason: str) -> Any:
    """Return the elevated instance addressed by ``gid`` for an action write.

    Admin authorization is enforced by the field's ``permission_classes`` (with
    the request actor) before the resolver runs; the row read/write then runs
    elevated, the same shape as ``crud(..., write_context=…)``.
    """

    with system_context(reason=reason):
        instance = instance_from_public_id(model, gid.node_id, queryset=model._default_manager.all())
    if instance is None:
        raise ValueError(f"{model._meta.object_name} {gid.node_id!r} was not found.")
    return instance


@strawberry.type
class IntegrationActionMutation:
    """Operational actions on an integration (sync, connection test)."""

    @strawberry.mutation(permission_classes=_ADMIN_PERMISSION_CLASSES)
    def sync_integration(self, id: relay.GlobalID) -> ActionResult:
        """Run every bridge of one integration now (eager variant of the scheduler)."""

        integration = _resolve(Integration, id, reason="integrate.graphql.sync_integration")
        now = timezone.now()
        ran = 0
        errors = 0
        items = 0
        with system_context(reason="integrate.graphql.sync_integration"):
            for model in bridge_models():
                for bridge in model._default_manager.filter(integration=integration).order_by("pk"):
                    ran += 1
                    bridge.mark_sync_started(now=now)
                    try:
                        result = bridge.sync()
                    except Exception as error:  # noqa: BLE001 — report any bridge failure as telemetry
                        bridge.record_sync_error(error, now=now)
                        errors += 1
                    else:
                        bridge.record_sync(result, now=now)
                        items += result
        if ran == 0:
            return ActionResult(ok=True, message="No bridges to sync.")
        return ActionResult(
            ok=errors == 0,
            message=f"Synced {items} item(s) across {ran} bridge(s); {errors} error(s).",
        )

    @strawberry.mutation(permission_classes=_ADMIN_PERMISSION_CLASSES)
    def test_connection(self, id: relay.GlobalID) -> ActionResult:
        """Probe the integration's credential so the operator sees it is usable."""

        integration = _resolve(Integration, id, reason="integrate.graphql.test_connection")
        with system_context(reason="integrate.graphql.test_connection"):
            credential = integration.credential
            if credential is None:
                return ActionResult(ok=False, message="No credential is attached.")
            try:
                credential.auth_headers()
            except Exception as error:  # noqa: BLE001 — surface any handler failure to the operator
                return ActionResult(ok=False, message=f"Credential is not usable: {error}")
        return ActionResult(ok=True, message="Credential is usable.")


@strawberry.type
class WebhookActionMutation:
    """Operational actions on an outbound webhook subscription."""

    @strawberry.mutation(permission_classes=_ADMIN_PERMISSION_CLASSES)
    def test_webhook_delivery(self, id: relay.GlobalID) -> ActionResult:
        """Send a test event to one subscription and report the delivery outcome."""

        subscription = _resolve(WebhookSubscription, id, reason="integrate.graphql.test_webhook_delivery")
        body = json.dumps(
            {"type": "test", "subscription": subscription.public_id},
            sort_keys=True,
            separators=(",", ":"),
        ).encode("utf-8")
        with system_context(reason="integrate.graphql.test_webhook_delivery"):
            try:
                status = subscription.deliver(body)
            except Exception as error:  # noqa: BLE001 — delivery failure is the result, not a 500
                message = "; ".join(error.messages) if hasattr(error, "messages") else str(error)
                subscription.record_delivery_failure(status="", error=message)
                return ActionResult(ok=False, message=f"Delivery failed: {message}")
            subscription.record_delivery(status)
        return ActionResult(ok=True, message=f"Delivered (status {status}).")

    @strawberry.mutation(permission_classes=_ADMIN_PERMISSION_CLASSES)
    def rotate_webhook_secret(self, id: relay.GlobalID) -> RotatedSecret:
        """Roll one subscription's signing secret and return the new value once."""

        subscription = _resolve(WebhookSubscription, id, reason="integrate.graphql.rotate_webhook_secret")
        with system_context(reason="integrate.graphql.rotate_webhook_secret"):
            secret = subscription.rotate_secret()
        return RotatedSecret(ok=True, secret=secret)


# Extracted with an explicit annotation: a bare homogeneous list of two
# AngeeNode-decorated types infers as ``list[type[AngeeNode]]`` and trips mypy's
# invariance check; ``list[type]`` widens it. (iam's inline lists are heterogeneous,
# so they don't hit this.)
_CONSOLE_TYPES: list[type] = [VendorType, IntegrationType, WebhookSubscriptionType]

schemas = {
    "console": {
        "query": [IntegrateConsoleQuery],
        "mutation": [
            _VENDOR_MUTATION,
            _INTEGRATION_MUTATION,
            _WEBHOOK_MUTATION,
            IntegrationActionMutation,
            WebhookActionMutation,
        ],
        "subscription": [changes(Integration, field="integrationChanged")],
        "types": _CONSOLE_TYPES,
    },
}
"""GraphQL contributions installed by the integrate addon."""
