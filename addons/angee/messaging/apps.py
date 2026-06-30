"""Django config for the messaging addon."""

from __future__ import annotations

from django.apps import AppConfig


class MessagingConfig(AppConfig):
    """Messaging addon: threads, messages, and the channel-bridge substrate.

    Built on the parties contacts foundation — a message's sender and participants
    are ``parties.Handle`` rows — so the dependency points one way (messaging →
    parties). Channels are ``integrate.Integration`` children (bridges) that ingest
    messages from email/social sources.
    """

    default = True
    angee_addon = True
    name = "angee.messaging"
    label = "messaging"
