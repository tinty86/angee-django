import * as React from "react";
import { Action, Column, DataPage, Field, Form, Group, List } from "@angee/base";

const MODEL = "Credential";

const credentialList = (
  <List model={MODEL} pageSize={50}>
    <Column field="displayName" />
    <Column field="kind" />
    <Column field="status" widget="statusBadge" />
    <Column field="expiresAt" />
    <Column field="lastRefreshAt" />
  </List>
);

// Credentials are minted by the OAuth login flow (or static-token API); the
// console manages their lifecycle (status / revoke), so Create is hidden.
const credentialForm = (
  <Form model={MODEL}>
    <Field name="displayName" title readOnly />
    <Field name="status" widget="statusbar" />
    <Group label="Health" columns={2}>
      <Field name="kind" readOnly />
      <Field name="expiresAt" readOnly />
      <Field name="lastRefreshAt" readOnly />
      <Field name="lastRefreshStatus" readOnly />
    </Group>
    <Action
      id="revoke"
      label="Revoke"
      danger
      set={{ status: "revoked" }}
      confirm={{
        title: "Revoke this credential?",
        body: "Anything using it to authenticate will stop working.",
        danger: true,
      }}
      visibleWhen={(record) =>
        String(record.status ?? "").toUpperCase() !== "REVOKED"
      }
    />
  </Form>
);

/** Per-user credential health (list / status / revoke; minted via login). */
export function CredentialsPage(): React.ReactElement {
  return (
    <DataPage model={MODEL} placement="inline" routed hideCreate>
      {credentialList}
      {credentialForm}
    </DataPage>
  );
}
