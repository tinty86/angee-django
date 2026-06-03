"""Source models for Angee's integration runtime primitives.

Migration note: account-scoped webhook subscriptions now cascade with their
account; a human must run ``uv run examples/notes-angee/manage.py makemigrations integrate``.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

from django.conf import settings
from django.db import models, transaction
from django.utils import timezone
from django_sqids import SqidsField
from rebac import system_context
from rebac.managers import RebacManager

from angee.base.fields import EncryptedField, StateField
from angee.base.mixins import AuditMixin, SqidMixin
from angee.base.models import AngeeModel
from angee.base.relations import grant_owner
from angee.integrate.validators import validate_public_url


class CapabilityStatus(models.TextChoices):
    """Lifecycle state for a concrete integration capability."""

    ACTIVE = "active", "Active"
    PAUSED = "paused", "Paused"
    ERROR = "error", "Error"
    DISABLED = "disabled", "Disabled"


class Capability(SqidMixin, AuditMixin, AngeeModel):
    """Abstract base for domain-owned capabilities.

    The concrete domain subclass owns its ``rebac_resource_type``.
    """

    account = models.ForeignKey("iam.ExternalAccount", on_delete=models.PROTECT, related_name="+")
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
        """Record local status telemetry and push this capability's account contribution.

        The caller owns persistence for this capability row. ``ExternalAccount``
        owns its rollup write and tracks each capability by the reporting
        capability primary key.
        """

        reported_at = timezone.now()
        self.status = status  # type: ignore[assignment]  # StateField descriptor unmodeled by django-stubs
        self.last_used_at = reported_at
        self.last_used_status = str(status.value if isinstance(status, CapabilityStatus) else status)
        self.last_error = error
        self.last_error_at = reported_at if error else None

        self.account.note_capability_status(capability_key=str(self.pk), status=status, error=error)


class Bridge(Capability):
    """Abstract base for capabilities that synchronize or subscribe to vendor data."""

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

    def record_sync(self, result: Any, *, now: datetime) -> None:
        """Persist one successful scheduler sync result and healthy status report."""

        self.last_sync_completed_at = now
        self.last_sync_status = "ok"
        self.last_sync_items = result if isinstance(result, int) and not isinstance(result, bool) else 0
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

    def sync(self) -> Any:
        """Synchronize this bridge with its external system."""

        raise NotImplementedError("Bridge subclasses must implement sync().")

    def handle_webhook(self, payload: Any) -> None:
        """Apply one verified inbound webhook payload to this bridge."""

        raise NotImplementedError("Bridge subclasses must implement handle_webhook().")

    def verify_webhook(self, request: Any) -> bool:
        """Return whether an inbound webhook request is authentic for this bridge."""

        raise NotImplementedError("Bridge subclasses must implement verify_webhook().")

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
    """Manager for webhook subscriptions and their owner relationship grants."""

    def create(self, **kwargs: Any) -> Any:
        """Create a subscription, then grant its owner under a narrow bypass.

        The create itself stays REBAC-authorized (the integrate/webhook_subscription
        ``create`` permission gates it); only the owner-relation write — which no
        actor holds permission for — runs under ``system_context``.
        """

        with transaction.atomic():
            instance = super().create(**kwargs)
            with system_context(reason="integrate.webhook_subscription.owner_grant"):
                grant_owner(instance, instance.owner)
        return instance


class WebhookSubscription(SqidMixin, AuditMixin, AngeeModel):
    """Outbound webhook endpoint owned by one user."""

    sqid = SqidsField(real_field_name="id", prefix="whs", min_length=8)
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="webhook_subscriptions",
    )
    target_url = models.URLField(max_length=2048, validators=(validate_public_url,))
    secret = EncryptedField()
    event_kinds = models.JSONField(default=list)
    impl_app_filter = models.JSONField(default=list)
    account_filter = models.ForeignKey(
        "iam.ExternalAccount",
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
