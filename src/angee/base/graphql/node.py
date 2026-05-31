"""Relay identity primitives for Angee GraphQL types."""

from __future__ import annotations

from strawberry import relay


class AngeeNode(relay.Node):
    """Relay node whose object id is the model's public sqid."""

    sqid: relay.NodeID[str]
