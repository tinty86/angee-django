import * as React from "react";
import { Column, DataPage, Field, Form, Group, List } from "@angee/base";
import { fromRelayGlobalId, useResourceRecord, type Row } from "@angee/sdk";

import { useAgentsT } from "../i18n";
import { AgentChat } from "./AgentChat";
import { AgentProvisioning } from "./AgentProvisioning";
import type { AgentChatView } from "../documents";

const MODEL = "agents.Agent";

// Just what the chat gate needs: a running, service-backed agent gets the chat panel.
// (`sqid` is not a GraphQL field — the agent's public id is recovered from the relay
// `id` for the view envelope; see below.)
const CHAT_FIELDS = ["id", "status", "service"] as const;

/** Read a string field off the boundary record (`Record<string, unknown>`), or "". */
function stringField(record: Row | null, key: string): string {
  const value = record?.[key];
  return typeof value === "string" ? value : "";
}

/**
 * The agent detail's chat panel, shown only once the agent is RUNNING and has a
 * rendered `service` (the routed WebSocket the browser connects to). The view envelope
 * tells the agent the user is looking at this agent record.
 */
function AgentChatPanel({ agentId }: { agentId: string }): React.ReactElement | null {
  const { record } = useResourceRecord(MODEL, agentId, { fields: [...CHAT_FIELDS] });
  if (stringField(record, "status") !== "RUNNING" || stringField(record, "service") === "") {
    return null;
  }
  const view: AgentChatView = { kind: "record", type: "agents/agent", sqid: fromRelayGlobalId(agentId) };
  return <AgentChat agentId={agentId} view={view} />;
}

// One model, two list tabs: the server-side ``isTemplate`` filter is the only
// difference between Agents and Templates, and a create on either tab defaults
// ``isTemplate`` to match. A real agent renders into the operator; a template is a
// reusable blueprint, so only the Agents tab carries the provisioning panel. The
// translated group label is passed in because `useAgentsT` must be called at a
// component's render top level.
function agentDataPage(isTemplate: boolean, modelTemplatesLabel: string): React.ReactElement {
  return (
    <DataPage
      model={MODEL}
      placement="inline"
      routed
      filter={{ isTemplate: { exact: isTemplate } }}
      createDefaults={{ isTemplate }}
      recordExtras={
        isTemplate
          ? undefined
          : ({ recordId, reload }) => (
              <>
                <AgentProvisioning agentId={recordId} onChanged={reload} />
                <AgentChatPanel agentId={recordId} />
              </>
            )
      }
    >
      <List model={MODEL} pageSize={50}>
        <Column field="name" />
        <Column field="status" widget="statusBadge" />
        <Column field="updatedAt" />
      </List>
      <Form model={MODEL}>
        <Field name="name" title />
        <Field name="description" />
        <Field name="instructions" />
        <Field name="isTemplate" />
        <Group label={modelTemplatesLabel} columns={2}>
          <Field name="model" />
          <Field name="owner" createOnly />
          <Field name="serviceTemplate" />
          <Field name="workspaceTemplate" />
        </Group>
        <Field name="serviceInputs" widget="json" />
        <Field name="workspaceInputs" widget="json" />
        <Field name="status" widget="statusbar" />
      </Form>
    </DataPage>
  );
}

export function AgentsPage(): React.ReactElement {
  const t = useAgentsT();
  return agentDataPage(false, t("agents.agent.modelTemplates"));
}

export function TemplatesPage(): React.ReactElement {
  const t = useAgentsT();
  return agentDataPage(true, t("agents.agent.modelTemplates"));
}
