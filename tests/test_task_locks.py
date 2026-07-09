"""Tests for the framework task lock abstraction."""

from __future__ import annotations

from angee.tasks.locks import LocalLockBackend, record_lock_key, task_lock


def test_record_lock_key_is_stable() -> None:
    """Record lock names are stable across processes and Python runs."""

    key = record_lock_key("messaging.Channel", 42, "sync")

    assert key.namespace == "record"
    assert key.parts == ("messaging.Channel", "42", "sync")
    assert key.name == "angee:record:messaging.Channel:42:sync"


def test_local_lock_backend_excludes_same_key() -> None:
    """The local backend models advisory lock exclusion for unit tests."""

    backend = LocalLockBackend()
    key = record_lock_key("messaging.Channel", 42, "sync")
    first = backend.try_acquire(key)
    second = backend.try_acquire(key)

    assert first is not None
    assert second is None
    first.release()
    assert backend.try_acquire(key) is not None


def test_task_lock_releases_after_context(settings) -> None:
    """The context helper releases an acquired lock when the task body exits."""

    settings.ANGEE_TASK_LOCK_BACKEND = "angee.tasks.locks.LocalLockBackend"
    key = record_lock_key("messaging.Channel", 42, "sync")

    with task_lock(key) as acquired:
        assert acquired is True
        with task_lock(key) as reacquired:
            assert reacquired is False

    with task_lock(key) as acquired_again:
        assert acquired_again is True
