"""Settings fragments required by the Anthropic inference addon."""

from __future__ import annotations

SETTINGS = {
    # Contribute Anthropic into integrate's unified implementation registry. An
    # ``Integration`` row selects it with ``impl_class = "anthropic"``.
    "ANGEE_INTEGRATION_IMPLS.anthropic": (
        "angee.agents_integrate_anthropic.backend.AnthropicInferenceBackend"
    ),
}
"""Django settings contributed when the Anthropic inference addon is installed."""
