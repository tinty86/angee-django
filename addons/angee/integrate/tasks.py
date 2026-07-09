"""Celery task wrappers for the integrate bridge scheduler."""

from __future__ import annotations

from typing import Any

from celery import shared_task

from angee.integrate import scheduler
from angee.integrate.sync_runner import run_bridge_sync_job


@shared_task(
    name="integrate.sync_bridge_now",
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_kwargs={"max_retries": 3},
)
def sync_bridge_now(model_label: str, pk: int, timestamp: str | None = None) -> dict[str, Any]:
    """Run one queued bridge sync task."""

    return run_bridge_sync_job(model_label, pk, timestamp, require_queue_token=True)


@shared_task(
    name="integrate.sync_due_bridges",
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_kwargs={"max_retries": 3},
)
def sync_due_bridges(timestamp: int | None = None) -> None:
    """Queue every bridge row whose ``next_sync_at`` is due."""

    del timestamp
    scheduler.enqueue_due_bridges()
