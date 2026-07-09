"""Live locks for integration bridge jobs."""

from __future__ import annotations

import threading
import zlib
from collections.abc import Iterator
from contextlib import contextmanager
from typing import Any

from django.db import connection

_FALLBACK_LOCK = threading.Lock()
_FALLBACK_KEYS: set[tuple[int, int]] = set()


def _bridge_lock_key(bridge: Any) -> tuple[int, int]:
    """Return the two-int advisory lock key for one bridge row."""

    model_label = str(bridge._meta.label_lower)
    classid = zlib.crc32(model_label.encode("utf-8")) & 0x7FFFFFFF
    objid = int(bridge.pk or 0) & 0x7FFFFFFF
    return classid, objid


@contextmanager
def bridge_advisory_lock(bridge: Any) -> Iterator[bool]:
    """Try to hold the live sync lock for ``bridge`` during a job.

    Postgres owns the production lock so process death releases it naturally.
    SQLite tests use a process-local fallback with the same non-blocking shape.
    """

    key = _bridge_lock_key(bridge)
    if key[1] == 0:
        yield False
        return

    if connection.vendor == "postgresql":
        with connection.cursor() as cursor:
            cursor.execute("SELECT pg_try_advisory_lock(%s, %s)", key)
            acquired = bool(cursor.fetchone()[0])
        if not acquired:
            yield False
            return
        try:
            yield True
        finally:
            with connection.cursor() as cursor:
                cursor.execute("SELECT pg_advisory_unlock(%s, %s)", key)
        return

    with _FALLBACK_LOCK:
        if key in _FALLBACK_KEYS:
            yield False
            return
        _FALLBACK_KEYS.add(key)
    try:
        yield True
    finally:
        with _FALLBACK_LOCK:
            _FALLBACK_KEYS.discard(key)


def bridge_is_locked(bridge: Any) -> bool:
    """Return whether the live sync lock for ``bridge`` is currently held."""

    key = _bridge_lock_key(bridge)
    if key[1] == 0:
        return False

    if connection.vendor == "postgresql":
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT EXISTS (
                    SELECT 1
                    FROM pg_locks
                    WHERE locktype = 'advisory'
                      AND classid = %s
                      AND objid = %s
                      AND granted
                )
                """,
                key,
            )
            return bool(cursor.fetchone()[0])

    with _FALLBACK_LOCK:
        return key in _FALLBACK_KEYS


__all__ = ["bridge_advisory_lock", "bridge_is_locked"]
