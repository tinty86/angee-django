"""Tests for the nexus tie rollup and the cross-channel person timeline."""

from __future__ import annotations

import importlib
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from django.core.management import call_command
from django.db import connection
from rebac import system_context

from angee.messaging.backends import ParsedHandle, ParsedMessage, ParsedPart
from angee.nexus.models import Tie as AbstractTie

# Registers the Channel/Person/Organization/PartyHandle concretes the messaging
# and parties schemas resolve — the nexus schema import below pulls both in.
from tests import test_messaging_graphql  # noqa: F401  (import for side effect)
from tests.conftest import _clear_model_tables, _create_missing_tables, make_integration
from tests.test_messaging import (
    MESSAGING_TEST_MODELS,
    Handle,
    Message,
    Party,
    _ingest,
    _parsed,
)


class Tie(AbstractTie):
    """Concrete tie model used to import the nexus schema."""

    class Meta(AbstractTie.Meta):
        """Django model options for the canonical test tie."""

        abstract = False
        app_label = "nexus"
        db_table = "test_nexus_tie"
        rebac_resource_type = "nexus/tie"
        rebac_id_attr = "sqid"


# Import after the concrete test models are registered; the source schema resolves
# the composer-emitted runtime models through Django's app registry.
nexus_schema = importlib.import_module("angee.nexus.schema")

NEXUS_TEST_MODELS = (*MESSAGING_TEST_MODELS, Tie)

_T0 = datetime(2026, 1, 10, 12, 0, tzinfo=UTC)


@pytest.fixture
def nexus_tables(transactional_db: Any) -> Iterator[None]:
    """Create the concrete nexus/messaging tables and sync the REBAC schema."""

    del transactional_db
    created_models = _create_missing_tables(NEXUS_TEST_MODELS)
    call_command("rebac", "sync", verbosity=0)
    try:
        yield
    finally:
        _clear_model_tables(NEXUS_TEST_MODELS)
        if created_models:
            with connection.schema_editor() as schema_editor:
                for model in reversed(created_models):
                    schema_editor.delete_model(model)


@pytest.fixture
def channel(nexus_tables: None) -> Any:
    """Provide an Integration row to stand in as the ingest channel."""

    del nexus_tables
    return make_integration("nexuschan")


def _link_sender(value: str, display_name: str) -> Any:
    """Create a party and materialise it as the owner of one ingested handle."""

    party = Party._base_manager.create(display_name=display_name)
    Handle._base_manager.filter(value=value).update(party=party)
    return party


def test_gravity_is_zero_without_reciprocity_or_history() -> None:
    """The composite score zeroes one-directional streams and empty rollups."""

    now = _T0
    assert Tie.compute_gravity(
        message_count=0, outbound_count=0, inbound_count=0, last_at=None, platform_count=0, now=now
    ) == 0.0
    # A newsletter: all inbound, nothing outbound → reciprocity zeroes it.
    assert Tie.compute_gravity(
        message_count=40, outbound_count=0, inbound_count=40, last_at=now, platform_count=1, now=now
    ) == 0.0


def test_gravity_rewards_volume_recency_and_diversity() -> None:
    """More messages, fresher contact, and extra platforms each raise the score."""

    now = _T0
    base = dict(message_count=20, outbound_count=10, inbound_count=10, platform_count=1)
    fresh = Tie.compute_gravity(last_at=now, now=now, **base)
    stale = Tie.compute_gravity(last_at=now - timedelta(days=90), now=now, **base)
    assert fresh > stale > 0.0
    two_platforms = Tie.compute_gravity(last_at=now, now=now, **{**base, "platform_count": 2})
    assert two_platforms == pytest.approx(fresh * 1.1)


def test_fading_adapts_to_the_relationship_rhythm() -> None:
    """The silence threshold is 8× the average interval with a 60-day floor."""

    now = _T0
    # Ten messages over 90 days → avg interval 10d → threshold 80d.
    first = now - timedelta(days=170)
    last = now - timedelta(days=80)
    assert not Tie.check_fading(message_count=10, first_at=first, last_at=last, now=last + timedelta(days=79))
    assert Tie.check_fading(message_count=10, first_at=first, last_at=last, now=last + timedelta(days=81))
    # Daily rhythm: the 60-day floor dominates 8×1d.
    first = now - timedelta(days=9)
    assert not Tie.check_fading(message_count=10, first_at=first, last_at=now, now=now + timedelta(days=59))
    assert Tie.check_fading(message_count=10, first_at=first, last_at=now, now=now + timedelta(days=61))
    # Fewer than two messages establish no rhythm.
    assert not Tie.check_fading(message_count=1, first_at=now, last_at=now, now=now + timedelta(days=400))


@pytest.mark.django_db(transaction=True)
def test_recompute_rolls_up_participants_by_party(channel: Any) -> None:
    """One aggregation pass fills counts, recency, platforms, gravity, and fading."""

    times = [_T0 + timedelta(days=index) for index in range(3)]
    _ingest([_parsed(f"<m{index}@x>", sent_at=times[index]) for index in range(3)], channel=channel)
    with system_context(reason="test nexus"):
        alice = _link_sender("alice@example.com", "Alice")
        # Alice replied once: make one message outbound so reciprocity is non-zero.
        Message._base_manager.filter(external_id="<m1@x>").update(direction="outbound")
        live = Tie.objects.recompute(now=times[-1] + timedelta(days=1))

        assert live == 1
        tie = Tie._base_manager.get(party=alice)
        assert tie.message_count == 3
        assert tie.outbound_count == 1
        assert tie.inbound_count == 2
        assert tie.thread_count >= 1
        assert tie.platforms == ["email"]
        assert tie.first_interaction_at == times[0]
        assert tie.last_interaction_at == times[2]
        assert tie.gravity > 0.0
        assert tie.is_fading is False

        # Idempotent: a second pass converges to the same rollup.
        assert Tie.objects.recompute(now=times[-1] + timedelta(days=1)) == 1
        again = Tie._base_manager.get(party=alice)
        assert (again.message_count, again.gravity) == (tie.message_count, tie.gravity)


@pytest.mark.django_db(transaction=True)
def test_recompute_zeroes_stale_ties_but_keeps_cadence(channel: Any) -> None:
    """A party whose messages vanished is zeroed, not deleted — cadence survives."""

    _ingest([_parsed("<gone@x>", sent_at=_T0)], channel=channel)
    with system_context(reason="test nexus"):
        alice = _link_sender("alice@example.com", "Alice")
        Tie.objects.recompute(now=_T0 + timedelta(days=1))
        tie = Tie._base_manager.get(party=alice)
        tie.cadence_days = 14
        tie.save(update_fields=["cadence_days"])
        assert tie.touch_due_at == _T0 + timedelta(days=14)

        Message._base_manager.all().delete()
        assert Tie.objects.recompute(now=_T0 + timedelta(days=2)) == 0
        tie.refresh_from_db()
        assert tie.message_count == 0
        assert tie.gravity == 0.0
        assert tie.last_interaction_at is None
        assert tie.touch_due_at is None
        assert tie.cadence_days == 14


@pytest.mark.django_db(transaction=True)
def test_timeline_pages_only_the_party_messages(channel: Any) -> None:
    """The person timeline filters by resolved party and keysets newest-first."""

    times = [_T0 + timedelta(days=index) for index in range(3)]
    _ingest(
        [_parsed(f"<t{index}@x>", sent_at=times[index], subject=f"S{index}") for index in range(3)],
        channel=channel,
    )
    _ingest(
        [
            ParsedMessage(
                external_id="<other@x>",
                platform="email",
                subject="Unrelated",
                sender=ParsedHandle(platform="email", value="carol@example.com", display_name="Carol"),
                sent_at=_T0 + timedelta(days=10),
                body=ParsedPart(type="text/plain", role="body", text="Different sender"),
            )
        ],
        channel=channel,
    )
    with system_context(reason="test nexus"):
        alice = _link_sender("alice@example.com", "Alice")
        _link_sender("carol@example.com", "Carol")

        page, count = Message.objects.timeline_for_party(alice)
        assert count == 3
        assert [message.external_id for message in page] == ["<t0@x>", "<t1@x>", "<t2@x>"]

        newest, count = Message.objects.timeline_for_party(alice, limit=2)
        assert count == 3
        assert [message.external_id for message in newest] == ["<t1@x>", "<t2@x>"]
        older, _count = Message.objects.timeline_for_party(alice, limit=2, before=newest[0].sqid)
        assert [message.external_id for message in older] == ["<t0@x>"]

        found, _count = Message.objects.timeline_for_party(alice, search="Body")
        assert len(found) == 3
        none_found, _count = Message.objects.timeline_for_party(alice, search="zzzmissing")
        assert none_found == []
