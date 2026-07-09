"""Small task submission API over Celery."""

from __future__ import annotations

from collections.abc import Mapping
from datetime import datetime
from typing import Any

from angee.tasks.celery import app as celery_app


def enqueue_task(
    name: str,
    *,
    kwargs: Mapping[str, Any],
    eta: datetime | None = None,
    queue: str | None = None,
) -> None:
    """Send one named Celery task."""

    celery_app.send_task(name, kwargs=dict(kwargs), eta=eta, queue=queue)
