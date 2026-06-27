# ACP SDK migration — off the dead `@zed-industries/*` packages onto `@agentclientprotocol/*`

Date: 2026-06-26

## Why

Both ACP packages we depend on are dead/renamed, and the resulting version skew is a live bug:
- **Client:** `@zed-industries/agent-client-protocol@0.4.5` is frozen (last of a renamed package).
- **Agent:** `@zed-industries/claude-code-acp` is **deprecated** (npm: *"renamed to
  `@agentclientprotocol/claude-agent-acp`"*); we install it **unpinned** in the Dockerfile, so it
  floats to `0.16.2`, which vendors `@agentclientprotocol/sdk@0.14.1`.
- The skew breaks `session/update` `tool_call_update`: 0.16.2 sends `rawOutput: string|ContentBlock[]`,
  our 0.4.5 schema types it `z.record(z.unknown())` → `-32602 Invalid params` → the completion
  notification is dropped → **tool-call cards stay "pending" with no result** (real data loss, not just
  console noise). Full root-cause in the investigation; symptom seen live (`read_note(pending)`).

## Target (zero skew, both alive)

| | dead → live | version |
|---|---|---|
| Client lib | `@zed-industries/agent-client-protocol` → **`@agentclientprotocol/sdk`** | **1.0.0** (latest; what the live agent vendors) |
| Agent | `@zed-industries/claude-code-acp` → **`@agentclientprotocol/claude-agent-acp`** | **0.52.0** (latest; vendors sdk 1.0.0) |

Both land on **sdk 1.0.0** → no skew. (Don't pin the client to 0.14.1 "to match the agent" — that was
reasoning against the *dead* agent; the live agent uses 1.0.0.)

## 1.0.0 API deltas that make this a real migration (verified against the installed dist)

- **`setSessionModel` REMOVED.** Model selection is now a session **config option**:
  - `NewSessionResponse.models` → `configOptions?: SessionConfigOption[]`.
  - The model is the option with `category: "model"`, `type: "select"`, carrying `currentValue:
    SessionConfigValueId` + `options: SessionConfigSelectOptions` (id/name values) + `id: SessionConfigId`.
  - Set via `connection.setSessionConfigOption({ sessionId, configId: option.id, value: <valueId> })`.
  - So **`selectSessionModel` (useAcpRuntime.ts) must be rewritten** to: find the `category:"model"`
    select option; if absent → defer (env-pinned, like the current opencode path); match `modelHandle`
    to a value (id/name); skip if `currentValue` already matches; throw loudly if not found;
    `setSessionConfigOption`. Update its unit tests in `useAcpRuntime.test.ts`.
- **set_model wire bug fixed** → DELETE the `acp-transport.ts` shim (`patchSetModelWireMethod`,
  `rewriteBrokenSetModelRequest`, `isRecord`, the `AnyMessage` import); `stream: ndJsonStream(output, input)`;
  remove the shim's tests in `acp-transport.test.ts`.
- **`rawOutput`/`rawInput` now `z.unknown()`** → the `-32602` rejection is gone; `tool_call_update`
  flows → tool cards complete with results (verify the `acp-log.ts` `mergeToolPart` reader still maps
  status/rawOutput/content correctly against the 1.0.0 shape).
- **Unchanged / compatible:** `ndJsonStream(output, input)` signature; `ClientSideConnection`,
  `PROTOCOL_VERSION`, `AnyMessage`, and all types (`ContentBlock`, `SessionNotification`,
  `AvailableCommand`, `ToolCallStatus`, `PromptCapabilities`, …) re-export from the `@agentclientprotocol/sdk`
  barrel; peerDep accepts zod 3 or 4. New `sessionUpdate` kinds (`config_option_update`, …) are still
  safely dropped by `acp-log`'s default branch (handle `config_option_update` only if we surface model
  state in the UI later).

## Steps

1. **Client dep:** `pnpm --filter @angee/agents remove @zed-industries/agent-client-protocol`
   `&& pnpm --filter @angee/agents add @agentclientprotocol/sdk@1.0.0`.
2. **Import-specifier rename** `@zed-industries/agent-client-protocol` → `@agentclientprotocol/sdk` in
   the 10 files under `addons/angee/agents/web/src` (`useAcpRuntime.ts`, `acp-transport.ts`, `acp-log.ts`,
   `acp-session.ts`, `views/slash-commands.tsx` + the test files; comment ref in `acp-error.ts`).
3. **Rewrite `selectSessionModel`** for config-options (above) + update its tests.
4. **Delete the set-model shim** + its tests; simplify `openAcpTransport`'s `stream`.
5. **Agent image:** `templates/services/claude-code/template/docker/Dockerfile:11` —
   `npm install -g @zed-industries/claude-code-acp` → `@agentclientprotocol/claude-agent-acp@0.52.0`
   (PINNED). The binary is now `claude-agent-acp` (was `claude-code-acp`): update
   `start-claude-code-acp.sh` (`exec stdio-to-ws claude-agent-acp`); optionally rename the wrapper
   script + `CMD` to `start-claude-agent-acp` for cleanliness. (Edit the template, not the generated
   `.angee/**` service copies.)
6. **`docs/stack.md`** — update the ACP row to `@agentclientprotocol/sdk` (+ note the agent package).
7. **Static verify:** `pnpm --filter @angee/agents typecheck` + `test`; `pnpm --filter @angee/ui` unaffected.

## LIVE verification gate (required before "done")

The model-selection rewrite is a behavior change and the whole point is client↔agent interop on 1.0.0,
so it MUST be verified on the running stack (needs a logged-in session + the rebuilt agent):
1. Rebuild the agent service image so the container runs `claude-agent-acp@0.52.0` (sdk 1.0.0); re-provision.
2. In the side chat confirm: a tool call (e.g. the notes MCP `read_note`) **completes with its result**
   (no longer stuck "pending"); **no `-32602`** in the console; the selected model applies; slash + the
   view-record + image attach still work.

Per AGENTS.md (Mechanical Overrides / verify-before-done) do not land this without the live check.
