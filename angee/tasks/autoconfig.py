"""Settings fragments required by Angee's task seam."""

from __future__ import annotations

SETTINGS = {
    "CELERY_BROKER_URL": "redis://redis:6379/1",
    "CELERY_TASK_IGNORE_RESULT": True,
    "CELERY_TASK_SOFT_TIME_LIMIT": 840,
    "CELERY_TASK_TIME_LIMIT": 900,
    "CELERY_TASK_TRACK_STARTED": True,
    "CELERY_TIMEZONE": "UTC",
}
"""Django settings contributed when the framework task seam is installed."""
