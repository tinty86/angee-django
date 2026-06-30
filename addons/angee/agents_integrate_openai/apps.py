"""Django config for the OpenAI inference integration addon."""

from __future__ import annotations

from django.apps import AppConfig


class AgentsIntegrateOpenAIConfig(AppConfig):
    """Source app manifest for OpenAI's inference backend."""

    default = True
    angee_addon = True
    name = "angee.agents_integrate_openai"
    label = "agents_integrate_openai"
