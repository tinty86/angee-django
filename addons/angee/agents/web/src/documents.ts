// Non-CRUD console operations the agents pages invoke. Model CRUD is derived from
// the SDL by the DataPage; only bespoke *custom* operations are authored here as
// typed `graphql()` documents (no hand-written result types). Single-id
// `{ ok, message }` action mutations use `useActionMutation(field)` at the call
// site — no document is authored here.

import { graphql, type DocumentType } from "@angee/gql/console";
import * as v from "valibot";

// The browser-reachable chat endpoint for a running agent: the routed WebSocket URL
// (no token), a per-actor route token to append as `?token=`, the selected model handle
// to apply via ACP `session/set_model`, and the agent's rendered MCP server map to
// advertise on the ACP session. A mutation, not a query: each call mints a fresh,
// short-lived route token server-side (a side effect).
export const AgentChatEndpointMutation = graphql(`
  mutation AgentChatEndpoint($id: ID!) {
    agentChatEndpoint(id: $id) {
      url
      token
      expiresAt
      mcpServers
      modelHandle
    }
  }
`);

// One MCP server entry inside the endpoint's `mcpServers` map. The map crosses the
// GraphQL `JSON` scalar, so its shape is opaque on the wire and must be parsed (not
// asserted) at the network boundary — `AgentChatEndpointSchema` does that with valibot.
const McpServerConfigSchema = v.object({
  type: v.string(),
  url: v.string(),
  headers: v.optional(v.record(v.string(), v.string())),
});

export type McpServerConfig = v.InferOutput<typeof McpServerConfigSchema>;

// The endpoint payload, with the opaque `mcpServers` JSON map narrowed per entry. The
// `agentChatEndpoint` mutation field is non-null server-side, so the wrapping data is
// required; only `mcpServers` rides the JSON scalar and so is validated here.
export const AgentChatEndpointSchema = v.object({
  url: v.string(),
  token: v.string(),
  expiresAt: v.string(),
  mcpServers: v.record(v.string(), McpServerConfigSchema),
  modelHandle: v.string(),
});

export type AgentChatEndpoint = v.InferOutput<typeof AgentChatEndpointSchema>;

// Render the `<system_context>` block for the agent and the user's open view. Called
// each send and prefixed to the user's text, so the agent reads what the user sees.
export const RenderAgentPrompt = graphql(`
  mutation RenderAgentPrompt($id: ID!, $view: JSON!) {
    renderAgentPrompt(id: $id, view: $view)
  }
`);

export const ConnectInferenceProvider = graphql(`
  mutation ConnectInferenceProvider(
    $id: ID!
    $redirectUri: String!
    $next: String!
  ) {
    connectInferenceProvider(
      id: $id
      redirectUri: $redirectUri
      next: $next
    ) {
      attached
      authorizeUrl
      error
      mode
      state
      redirectUri
      integration { id status }
    }
  }
`);

// The view envelope the chat sends to `renderAgentPrompt`: what the user is looking at.
export interface AgentChatView extends Record<string, unknown> {
  kind: "record" | "list" | "dashboard";
  type: string;
  sqid?: string;
  sqids?: string[];
  params?: Record<string, unknown>;
}

// Resolve which agent serves the user's current view (the side chatter). Returns the
// agent identity only — the client then mints its chat endpoint with `agentChatEndpoint`;
// `null` means the user has no running agent (the chatter shows a call-to-action).
export const ResolveSessionForView = graphql(`
  mutation ResolveSessionForView($view: JSON!) {
    resolveSessionForView(view: $view) {
      agentId
      agentName
      status
      modelHandle
    }
  }
`);

/** The resolved running-agent identity for a view; `null` when none runs. */
export type AgentSession = NonNullable<
  DocumentType<typeof ResolveSessionForView>["resolveSessionForView"]
>;
