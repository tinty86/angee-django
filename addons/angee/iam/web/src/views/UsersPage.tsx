import * as React from "react";
import { Action, Column, DataPage, Field, Form, Group, List } from "@angee/base";

const MODEL = "User";

const userList = (
  <List model={MODEL}>
    <Column field="username" />
    <Column field="email" />
    <Column field="isStaff" />
    <Column field="isActive" />
  </List>
);

const userForm = (
  <Form model={MODEL}>
    <Field name="username" title />
    <Group label="Profile" columns={2}>
      <Field name="email" />
      <Field name="firstName" />
      <Field name="lastName" />
    </Group>
    <Group label="Access" columns={2}>
      <Field name="isStaff" />
      <Field name="isActive" />
    </Group>
    {/* Write-only: set on create, hashed server-side; password reset is separate. */}
    <Field name="password" widget="text" kind="string" createOnly />
    {/* Reset password collects a value and patches it through update (hashed server-side). */}
    <Action
      id="reset-password"
      label="Reset password"
      prompt={{
        title: "Reset password",
        body: "Set a new password for this user.",
        fields: [{ name: "password", label: "New password", type: "password" }],
      }}
    />
    <Action
      id="deactivate"
      label="Deactivate"
      danger
      set={{ isActive: false }}
      visibleWhen={(record) => record.isActive === true}
    />
    <Action
      id="activate"
      label="Activate"
      set={{ isActive: true }}
      visibleWhen={(record) => record.isActive === false}
    />
  </Form>
);

/** Users (full CRUD; password is write-only and hashed server-side). */
export function UsersPage(): React.ReactElement {
  return (
    <DataPage model={MODEL} placement="inline" routed>
      {userList}
      {userForm}
    </DataPage>
  );
}
