"""Django config for the Anthropic inference integration addon."""

from __future__ import annotations

from django.apps import AppConfig


class AgentsIntegrateAnthropicConfig(AppConfig):
    """Source app manifest for Anthropic's inference backend."""

    default = True
    angee_addon = True
    default_auto_field = "django.db.models.BigAutoField"
    name = "angee.agents_integrate_anthropic"
    label = "agents_integrate_anthropic"
    depends_on = ("angee.agents", "angee.integrate")
