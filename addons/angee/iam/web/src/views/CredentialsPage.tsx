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

// Create uses the addon-registered `Credential` form override (a kind dropdown
// that swaps the material field); this declared form is the lifecycle editor
// (status / revoke / health) the detail shows on edit.
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

/** Per-user credential health (list / status / revoke); create via the form override. */
export function CredentialsPage(): React.ReactElement {
  return (
    <DataPage model={MODEL} placement="inline" routed>
      {credentialList}
      {credentialForm}
    </DataPage>
  );
}
