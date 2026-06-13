"""Source models for Angee's integration runtime primitives.

This addon owns the integration layer: the third-party ``Vendor`` catalogue, the
first-class ``Connection`` an integration runs over, the abstract
``Capability``/``Bridge`` runtime, and outbound ``WebhookSubscription``. It draws
a ``Credential`` (and optionally an ``ExternalAccount``) from ``iam`` to
authenticate; it never owns identity.
"""

from __future__ import annotations

import json
import logging
from collections.abc import Iterable
from datetime import datetime, timedelta
from typing import Any, cast

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models, transaction
from django.utils import timezone
from rebac import system_context
from rebac.managers import RebacManager

from angee.base.fields import EncryptedField, SqidField, StateField
from angee.base.mixins import AuditMixin, SqidMixin
from angee.base.models import AngeeModel
from angee.integrate.events import EventKind
from angee.integrate.net import validate_public_url
from angee.integrate.webhooks import PinnedWebhookClient, WebhookDeliveryError

logger = logging.getLogger(__name__)


class CapabilityStatus(models.TextChoices):
    """Lifecycle state for a concrete integration capability."""

    ACTIVE = "active", "Active"
    PAUSED = "paused", "Paused"
    ERROR = "error", "Error"
    DISABLED = "disabled", "Disabled"


class Vendor(SqidMixin, AuditMixin, AngeeModel):
    """Admin-managed third-party catalogue (GitHub, Google, Slack, …).

    The single source of truth for "what is this third party" — branding and
    reference metadata only. New integration addons add their own row via an
    install-tier resource seed (``adopt: slug``). The login-side ``OAuthClient``
    in ``iam`` carries its own ``slug``; that is a deliberately independent
    namespace, not a foreign key into this catalogue.
    """

    runtime = True

    sqid = SqidField(real_field_name="id", prefix="vnd", min_length=8)
    slug = models.SlugField(unique=True)
    display_name = models.CharField(max_length=128)
    website_url = models.URLField(blank=True)
    icon = models.CharField(max_length=128, blank=True)
    description = models.TextField(blank=True)

    class Meta:
        """Django model options for integration vendors."""

        abstract = True
        ordering = ("slug",)
        rebac_resource_type = "integrate/vendor"
        rebac_id_attr = "sqid"

    def __str__(self) -> str:
        """Return the display label used by Django surfaces."""

        return self.display_name or self.slug


class ConnectionStatus(models.TextChoices):
    """Aggregate integration health for a connection, rolled up from its capabilities.

    Owns the rollup vocabulary that used to live on ``iam.AccountStatus``: a
    connection is the substrate capabilities run over, so it — not the identity
    account — aggregates their health.
    """

    ACTIVE = "active", "Active"
    DISABLED = "disabled", "Disabled"
    ERROR = "error", "Error"

    @classmethod
    def from_value(cls, value: object) -> ConnectionStatus:
        """Return the member for one string or enum connection-status value."""

        raw = str(getattr(value, "value", value))
        try:
            return cast(ConnectionStatus, cls(raw))
        except ValueError as error:
            raise ValueError(f"Unsupported connection status for rollup: {raw}") from error

    @classmethod
    def from_capability(cls, status: object) -> ConnectionStatus:
        """Return the connection status one capability status contributes to the rollup."""

        raw = str(getattr(status, "value", status))
        mapping = {
            "active": cls.from_value(cls.ACTIVE),
            "paused": cls.from_value(cls.DISABLED),
            "disabled": cls.from_value(cls.DISABLED),
            "error": cls.from_value(cls.ERROR),
        }
        try:
            return mapping[raw]
        except KeyError as error:
            raise ValueError(f"Unsupported capability status for connection rollup: {raw}") from error

    @classmethod
    def rollup(cls, statuses: Iterable[object]) -> ConnectionStatus:
        """Return the most severe connection status across capability contributions."""

        members = tuple(cls.from_value(status) for status in statuses)
        return max(members, key=lambda member: member.precedence) if members else cls.from_value(cls.ACTIVE)

    @property
    def precedence(self) -> int:
        """Return rollup precedence — the highest wins when statuses combine."""

        order = (ConnectionStatus.ACTIVE, ConnectionStatus.DISABLED, ConnectionStatus.ERROR)
        return order.index(self)

    @property
    def is_error(self) -> bool:
        """Return whether this connection is in an error state."""

        return self is ConnectionStatus.ERROR


class Connection(SqidMixin, AuditMixin, AngeeModel):
    """A product/workspace integration to a vendor account.

    The first-class "what we're connected to and what runs over it": it draws a
    ``credential`` (and optionally an ``account``) from ``iam`` to authenticate,
    points at a catalogue ``vendor``, and owns the capability-health rollup. Its
    capabilities/bridges (``integrate.Capability``) point back at it.
    """

    runtime = True

    sqid = SqidField(real_field_name="id", prefix="con", min_length=8)
    vendor = models.ForeignKey("integrate.Vendor", on_delete=models.PROTECT, related_name="connections")
    # PROTECT: the credential is the connection's authentication. It may belong to
    # a principal other than ``owner`` (an org/app-install credential), so deleting
    # a credential still in use is refused rather than silently breaking the
    # integration. The owner does not have to own the credential.
    credential = models.ForeignKey("iam.Credential", on_delete=models.PROTECT, related_name="connections")
    account = models.ForeignKey(
        "iam.ExternalAccount",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="connections",
    )
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="connections")
    config = models.JSONField(default=dict)
    """Connection-scoped settings (endpoints, options); per-capability settings live on ``Capability.config``."""
    status = StateField(choices_enum=ConnectionStatus, default=ConnectionStatus.ACTIVE)
    capability_statuses = models.JSONField(default=dict)
    last_used_at = models.DateTimeField(null=True, blank=True)
    last_error = models.TextField(blank=True)
    last_error_at = models.DateTimeField(null=True, blank=True)

    objects = RebacManager()

    class Meta:
        """Django model options for integration connections."""

        abstract = True
        ordering = ("-updated_at",)
        rebac_resource_type = "integrate/connection"
        rebac_id_attr = "sqid"

    def __str__(self) -> str:
        """Return a stable vendor-qualified connection label."""

        vendor_slug = getattr(getattr(self, "vendor", None), "slug", "?")
        return f"{vendor_slug}:{self.public_id}"

    def note_capability_status(self, *, capability_key: Any, status: Any, error: str = "") -> None:
        """Record one capability contribution, recompute this connection, and persist.

        The connection owns this write: direct callers do not need an ambient
        ``system_context`` or transaction, and scheduler callers safely nest
        inside their own framework operation context. Unsaved instances are
        updated in memory only because there is no connection row to persist.
        """

        reported_at = timezone.now()
        incoming_status = ConnectionStatus.from_capability(status)
        capability_statuses = dict(self.capability_statuses or {})
        # Deleted capabilities can leave stale contributions until pruning has an owner.
        capability_statuses[str(capability_key)] = incoming_status.value
        rolled_status = ConnectionStatus.rollup(capability_statuses.values())

        self.capability_statuses = capability_statuses
        self.status = rolled_status
        self.last_used_at = reported_at
        if rolled_status.is_error:
            if error:
                self.last_error = error
            self.last_error_at = reported_at
        else:
            self.last_error = ""
            self.last_error_at = None

        if self.pk is None:
            return

        with system_context(reason="integrate.connection.rollup"), transaction.atomic():
            self.save(
                update_fields=[
                    "capability_statuses",
                    "last_error",
                    "last_error_at",
                    "last_used_at",
                    "status",
                    "updated_at",
                ]
            )


class Capability(SqidMixin, AuditMixin, AngeeModel):
    """Abstract base for domain-owned capabilities.

    The concrete domain subclass owns its ``rebac_resource_type``. This pure base
    stays out of runtime emission by leaving ``runtime`` unset.
    """

    connection = models.ForeignKey("integrate.Connection", on_delete=models.PROTECT, related_name="capabilities")
    config = models.JSONField(default=dict)
    status = StateField(choices_enum=CapabilityStatus, default=CapabilityStatus.ACTIVE)
    last_used_at = models.DateTimeField(null=True, blank=True)
    last_used_status = models.CharField(max_length=64, blank=True)
    use_count_24h = models.PositiveIntegerField(default=0)
    error_count_24h = models.PositiveIntegerField(default=0)
    last_error = models.TextField(blank=True)
    last_error_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        """Django model options for abstract capability inheritance."""

        abstract = True

    def report_status(self, *, status: CapabilityStatus | str, error: str = "") -> None:
        """Record local status telemetry and push this capability's connection contribution.

        The caller owns persistence for this capability row. ``Connection`` owns
        its rollup write and tracks each capability by the reporting capability
        primary key.
        """

        reported_at = timezone.now()
        self.status = status  # type: ignore[assignment]  # StateField descriptor unmodeled by django-stubs
        self.last_used_at = reported_at
        self.last_used_status = str(status)
        self.last_error = error
        self.last_error_at = reported_at if error else None

        self.connection.note_capability_status(capability_key=str(self.pk), status=status, error=error)


class Bridge(Capability):
    """Abstract base for capabilities that synchronize or subscribe to vendor data.

    Another pure base: a domain bridge that materializes declares
    ``runtime = True`` on that class.
    """

    cursor = models.JSONField(default=dict)
    poll_interval = models.PositiveIntegerField(default=300)
    subscription_state = models.JSONField(default=dict)
    next_subscription_refresh_at = models.DateTimeField(null=True, blank=True)
    last_sync_started_at = models.DateTimeField(null=True, blank=True)
    last_sync_completed_at = models.DateTimeField(null=True, blank=True)
    last_sync_status = models.CharField(max_length=64, blank=True)
    last_sync_items = models.PositiveIntegerField(default=0)
    next_sync_at = models.DateTimeField(null=True, blank=True, db_index=True)

    class Meta:
        """Django model options for abstract bridge inheritance."""

        abstract = True

    def mark_sync_started(self, *, now: datetime) -> None:
        """Persist the start timestamp for one scheduler sync attempt."""

        self.last_sync_started_at = now
        with transaction.atomic():
            self.save(update_fields=["last_sync_started_at", "updated_at"])

    def record_sync(self, result: int, *, now: datetime) -> None:
        """Persist one successful scheduler sync result and healthy status report."""

        self.last_sync_completed_at = now
        self.last_sync_status = "ok"
        self.last_sync_items = result
        self.next_sync_at = self._next_sync_at(now=now)
        with transaction.atomic():
            self.report_status(status="active")
            self.save(
                update_fields=[
                    "cursor",
                    "last_error",
                    "last_error_at",
                    "last_sync_completed_at",
                    "last_sync_items",
                    "last_sync_status",
                    "last_used_at",
                    "last_used_status",
                    "next_sync_at",
                    "status",
                    "updated_at",
                ]
            )

    def record_sync_error(self, error: Exception, *, now: datetime) -> None:
        """Persist one failed scheduler sync result and error status report."""

        error_message = f"{type(error).__name__}: {error}"[:500]
        self.last_sync_status = "error"
        self.next_sync_at = self._next_sync_at(now=now)
        with transaction.atomic():
            self.report_status(status="error", error=error_message)
            self.save(
                update_fields=[
                    "last_error",
                    "last_error_at",
                    "last_sync_status",
                    "last_used_at",
                    "last_used_status",
                    "next_sync_at",
                    "status",
                    "updated_at",
                ]
            )

    def sync(self) -> int:
        """Synchronize this bridge with its external system."""

        raise NotImplementedError("Bridge subclasses must implement sync().")

    def handle_webhook(self, payload: Any) -> None:
        """Apply one verified inbound webhook payload to this bridge."""

        raise NotImplementedError("Bridge subclasses must implement handle_webhook().")

    def verify_webhook(self, request: Any) -> bool:
        """Return whether an inbound webhook request is authentic for this bridge."""

        raise NotImplementedError("Bridge subclasses must implement verify_webhook().")

    def dispatch_inbound(self, request_or_payload: Any) -> bool:
        """Verify one inbound webhook and apply it to this bridge when authentic."""

        if not self.verify_webhook(request_or_payload):
            return False
        self.handle_webhook(request_or_payload)
        return True

    def start_live(self) -> None:
        """Start or renew this bridge's live vendor subscription."""

        raise NotImplementedError("Bridge subclasses must implement start_live().")

    def stop_live(self) -> None:
        """Stop this bridge's live vendor subscription."""

        raise NotImplementedError("Bridge subclasses must implement stop_live().")

    def _next_sync_at(self, *, now: datetime) -> datetime:
        """Return the next polling timestamp from this bridge's interval."""

        return now + timedelta(seconds=int(self.poll_interval))


class WebhookSubscriptionManager(RebacManager):
    """Manager for webhook subscriptions."""

    def deliver_event(
        self,
        *,
        kind: EventKind,
        payload: Any,
        impl_app: str = "",
        connection: Any | None = None,
    ) -> dict[str, int]:
        """Deliver one integration event to every matching enabled subscription.

        Actor-less framework fan-out: it reads subscriptions across all owners, so
        it runs under ``system_context``. Each subscription matches and delivers
        itself; this method only owns the row-set loop and the success/error tally.
        """

        body = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
        delivered = 0
        errors = 0
        with system_context(reason="integrate.webhooks.deliver"):
            for subscription in self.filter(enabled=True).order_by("pk"):
                if not subscription.matches(kind=kind, impl_app=impl_app, connection=connection):
                    continue
                try:
                    status = subscription.deliver(body)
                except Exception as exc:
                    logger.exception("Webhook delivery failed for subscription %s.", subscription.public_id)
                    subscription.record_delivery_failure(
                        status=self._failure_status(exc),
                        error=self._error_message(exc),
                    )
                    errors += 1
                else:
                    subscription.record_delivery(status)
                    delivered += 1
        return {"delivered": delivered, "errors": errors}

    @staticmethod
    def _failure_status(exc: Exception) -> str:
        """Return an HTTP status string from a delivery exception when available."""

        if isinstance(exc, WebhookDeliveryError):
            return exc.status
        return ""

    @staticmethod
    def _error_message(exc: Exception) -> str:
        """Return a compact telemetry message for a delivery exception."""

        if isinstance(exc, ValidationError):
            return "; ".join(str(message) for message in exc.messages)
        return f"{type(exc).__name__}: {exc}"


class WebhookSubscription(SqidMixin, AuditMixin, AngeeModel):
    """Outbound webhook endpoint owned by one user."""

    runtime = True

    sqid = SqidField(real_field_name="id", prefix="whs", min_length=8)
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="webhook_subscriptions",
    )
    target_url = models.URLField(max_length=2048, validators=(validate_public_url,))
    secret = EncryptedField()
    event_kinds = models.JSONField(default=list)
    impl_app_filter = models.JSONField(default=list)
    connection_filter = models.ForeignKey(
        "integrate.Connection",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    enabled = models.BooleanField(default=True, db_index=True)
    last_delivery_at = models.DateTimeField(null=True, blank=True)
    last_delivery_status = models.CharField(max_length=64, blank=True, default="")
    last_error = models.TextField(blank=True, default="")
    consecutive_failures = models.PositiveIntegerField(default=0)

    objects = WebhookSubscriptionManager()

    class Meta:
        """Django model options for webhook subscriptions."""

        abstract = True
        rebac_resource_type = "integrate/webhook_subscription"
        rebac_id_attr = "sqid"

    _delivery_update_fields = (
        "consecutive_failures",
        "last_delivery_at",
        "last_delivery_status",
        "last_error",
        "updated_at",
    )

    def matches(self, *, kind: str, impl_app: str, connection: Any | None) -> bool:
        """Return whether this subscription should receive one event."""

        if kind not in {str(value) for value in self.event_kinds or ()}:
            return False
        impl_app_filter = tuple(str(value) for value in self.impl_app_filter or ())
        if impl_app_filter and impl_app not in impl_app_filter:
            return False
        if self.connection_filter_id is None:
            return True
        return connection is not None and self.connection_filter_id == getattr(connection, "pk", None)

    def deliver(self, body: bytes) -> str:
        """POST one signed event body to this subscription's pinned target; raise on non-2xx."""

        return PinnedWebhookClient(str(self.target_url)).post(secret=str(self.secret), body=body)

    def record_delivery(self, status: str) -> None:
        """Persist success telemetry for one delivery attempt (mirrors ``Bridge.record_sync``)."""

        self.last_delivery_at = timezone.now()
        self.last_delivery_status = status
        self.last_error = ""
        self.consecutive_failures = 0
        self.save(update_fields=self._delivery_update_fields)

    def record_delivery_failure(self, *, status: str, error: str) -> None:
        """Persist failure telemetry for one delivery attempt (mirrors ``Bridge.record_sync_error``).

        Takes the already-classified ``status``/``error``: the delivery layer
        owns turning a delivery exception into those strings.
        """

        self.last_delivery_at = timezone.now()
        self.last_delivery_status = status
        self.last_error = error
        # Atomic add so concurrent fan-outs to the same subscription don't lose an
        # increment — this counter is the thing failure policy gates on.
        self.consecutive_failures = models.F("consecutive_failures") + 1
        self.save(update_fields=self._delivery_update_fields)
