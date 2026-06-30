"""Django config for the agents addon."""

from __future__ import annotations

from django.apps import AppConfig


class AgentsConfig(AppConfig):
    """Source app manifest for the agent catalogue."""

    default = True
    angee_addon = True
    name = "angee.agents"
    label = "agents"
