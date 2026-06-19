"""Settings fragments required by the agents addon."""

from __future__ import annotations

SETTINGS = {
    # Inference providers select their backend with a provider-owned
    # ``backend_class`` field. ``manual`` lists no models; its catalogue is
    # hand-curated.
    "ANGEE_INFERENCE_BACKEND_CLASSES": {
        "manual": "angee.agents.backends.ManualInferenceBackend",
    },
    # The agents addon owns the MCP catalogue, so it supplies the bearer→actor
    # verifier the base ``angee.mcp`` runtime calls: it matches an inbound bearer to an
    # ``agents.MCPServer.credential`` and resolves the agent actor (see ``mcp_verifier``).
    "ANGEE_MCP_ACTOR_VERIFIER": "angee.agents.mcp_verifier.resolve_actor",
    # TTL of the per-actor chat route token minted by ``agentChatEndpoint`` (the
    # daemon caps it at 24h). The TTL policy lives here, not as a literal in the
    # resolver; mirrors ``ANGEE_OPERATOR_TOKEN_TTL`` for the GraphQL token.
    "ANGEE_AGENT_CHAT_TOKEN_TTL": "2h",
}
"""Django settings contributed when the agents addon is installed."""
