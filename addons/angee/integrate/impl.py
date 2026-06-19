"""Integration implementation descriptors.

An ``Integration`` row stores the registry key for integration-level behaviour.
Concrete addons contribute subclasses through ``ANGEE_INTEGRATION_IMPLS``; persisted
domain state belongs on real child models, not on descriptor-owned companion rows.
"""

from __future__ import annotations

from typing import Any

from angee.base.impl import ImplBase


class IntegrationImpl(ImplBase):
    """Base descriptor for one row-selected integration implementation."""

    category = "none"
    label = "Integration"
    icon = ""
    oauth_client = ""

    def __init__(self, integration: Any) -> None:
        """Bind this implementation to its owning integration row."""

        self.integration = integration


class NullIntegrationImpl(IntegrationImpl):
    """Neutral implementation for a draft row with no chosen implementation."""

    key = "none"
    label = "Draft"


class BridgeImpl(IntegrationImpl):
    """Base descriptor for an inbound bridge — it pulls/subscribes to external data.

    Bridges run on a schedule (``run_due_bridges`` over ``Bridge.next_sync_at``) and
    keep their sync state on a concrete ``Bridge`` child model.
    """

    category = "bridge"
    label = "Bridge"
    icon = "plug"

    @property
    def bridge(self) -> Any:
        """Return the concrete bridge child this implementation is bound to."""

        return self.integration


class Client(IntegrationImpl):
    """Base descriptor for an outbound client — it calls out to an external service.

    The counterpart of :class:`BridgeImpl` (which pulls data in): a client sends
    requests to a remote API. The call itself lives on the concrete subclass; this
    base only carries the ``client`` category.
    """

    category = "client"
    label = "Client"
    icon = "send"


class QueuedClient(Client):
    """Base for a client whose work is meant to run asynchronously, with retries.

    The vocabulary for calls too slow or failure-prone to run inline — outbound
    sends, or long-running remote jobs like training / video inference. A concrete
    subclass implements :meth:`run`; ``max_retries``/``retry_backoff_base_seconds``
    declare its retry policy.

    NOTE: no async dispatcher is wired yet. The stack earmarks Celery for queues and
    retries (``docs/stack.md``) but it is not locked, so this base only fixes the
    contract a future Celery (or due-time scanner) layer will drive — it must not be
    relied on for dispatch until that lands. A provider that submits a remote job and
    polls would persist the remote handle on its owning child model and reschedule
    until done.
    """

    max_retries: int = 5
    retry_backoff_base_seconds: int = 10

    def run(self, payload: dict[str, Any]) -> Any:
        """Perform one unit of queued work; implemented by the concrete client."""

        raise NotImplementedError
