"""Django config for the Anthropic inference integration addon."""

from __future__ import annotations

from django.apps import AppConfig


class AgentsIntegrateAnthropicConfig(AppConfig):
    """Source app manifest for Anthropic's inference backend."""

    default = True
    angee_addon = True
    name = "angee.agents_integrate_anthropic"
    label = "agents_integrate_anthropic"
