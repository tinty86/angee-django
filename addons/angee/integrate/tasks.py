"""Procrastinate task wrappers for the integrate bridge scheduler."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from django.db import transaction
from django.utils import timezone
from procrastinate import RetryStrategy
from procrastinate import exceptions as procrastinate_exceptions
from procrastinate.contrib.django import app
from rebac import system_context

from angee.integrate import scheduler
from angee.integrate.sync_runner import run_bridge_sync_job


def queue_bridge_sync(bridge: Any, *, now: datetime | None = None) -> None:
    """Persist queued state and defer one bridge sync task."""

    if bridge.pk is None:
        raise ValueError("Cannot queue an unsaved bridge.")
    timestamp = now or timezone.now()
    bridge.sync_stage = bridge.SyncStage.QUEUED
    bridge.sync_error = ""
    bridge.sync_progress = {"stage": bridge.SyncStage.QUEUED, "queued_at": timestamp.isoformat()}
    with system_context(reason="integrate.queue_bridge_sync"), transaction.atomic():
        bridge.save(update_fields=["sync_error", "sync_progress", "sync_stage", "updated_at"])
    try:
        app.configure_task(
            "integrate.sync_bridge_now",
            queueing_lock=f"integrate.sync_bridge_now:{bridge._meta.label_lower}:{bridge.pk}",
        ).defer(
            model_label=bridge._meta.label_lower,
            pk=bridge.pk,
            timestamp=timestamp.isoformat(),
        )
    except procrastinate_exceptions.AlreadyEnqueued:
        return


@app.task(name="integrate.sync_bridge_now", retry=RetryStrategy(max_attempts=3, exponential_wait=30))
def sync_bridge_now(model_label: str, pk: int, timestamp: str | None = None) -> dict[str, Any]:
    """Run one queued bridge sync task."""

    return run_bridge_sync_job(model_label, pk, timestamp)


@app.periodic(cron="* * * * *", periodic_id="integrate.sync_due_bridges")
@app.task(name="integrate.sync_due_bridges", retry=RetryStrategy(max_attempts=3, exponential_wait=30))
def sync_due_bridges(timestamp: int) -> None:
    """Run every bridge row whose ``next_sync_at`` is due.

    The scan uses the wall clock rather than the injected periodic timestamp so a
    tick delayed by queue backlog still picks up everything due by the time it
    actually runs; per-bridge failures are recorded as telemetry by ``run_sync``.
    """

    del timestamp
    scheduler.run_due_bridges()
