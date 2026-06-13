import * as React from "react";
import { Action, Column, DataPage, Field, Form, Group, List } from "@angee/base";

const MODEL = "ExternalAccount";

const accountList = (
  <List model={MODEL} pageSize={50}>
    <Column field="providerLabel" />
    <Column field="externalId" />
    <Column field="email" />
    <Column field="status" widget="statusBadge" />
    <Column field="credentialStatus" />
    <Column field="lastUsedAt" />
  </List>
);

// Identity (provider + externalId) is fixed at link time; the console edits the
// scalar profile/status. Creation happens through the OAuth login flow, so the
// Create button is hidden here.
const accountForm = (
  <Form model={MODEL}>
    <Field name="displayName" title />
    <Field name="status" widget="statusbar" />
    <Group label="Identity" columns={2}>
      <Field name="providerLabel" label="Provider" readOnly />
      <Field name="externalId" readOnly />
      <Field name="email" />
      <Field name="avatarUrl" />
    </Group>
    <Action
      id="revoke"
      label="Revoke"
      danger
      set={{ status: "revoked" }}
      confirm={{
        title: "Revoke this account?",
        body: "The linked identity can no longer be used to sign in.",
        danger: true,
      }}
      visibleWhen={(record) =>
        String(record.status ?? "").toUpperCase() !== "REVOKED"
      }
    />
  </Form>
);

/** Linked external identities (list / edit / delete; created via OAuth login). */
export function ExternalAccountsPage(): React.ReactElement {
  return (
    <DataPage model={MODEL} placement="inline" routed hideCreate>
      {accountList}
      {accountForm}
    </DataPage>
  );
}
