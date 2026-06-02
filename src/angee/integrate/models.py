"""Abstract source bases for domain-owned integration capabilities."""

from __future__ import annotations

from typing import Any

from django.db import models
from django.utils import timezone

from angee.base.fields import StateField
from angee.base.mixins import AuditMixin, SqidMixin
from angee.base.models import AngeeModel


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
        """Record local status telemetry and push the account rollup when available.

        The caller owns persistence (``save(update_fields=...)``); the account
        rollup is a no-op until S8 adds ``ExternalAccount.note_capability_status``.
        """

        reported_at = timezone.now()
        self.status = status  # type: ignore[assignment]  # StateField descriptor unmodeled by django-stubs
        self.last_used_at = reported_at
        self.last_used_status = str(status.value if isinstance(status, CapabilityStatus) else status)
        self.last_error = error
        self.last_error_at = reported_at if error else None

        # account rollup wired in S8 (ExternalAccount.note_capability_status)
        note_capability_status = getattr(self.account, "note_capability_status", None)
        if callable(note_capability_status):
            note_capability_status(status=status, error=error)


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

    def sync(self) -> None:
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
