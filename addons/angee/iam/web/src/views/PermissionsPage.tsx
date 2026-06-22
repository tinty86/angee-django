import * as React from "react";
import { Column, DataPage, Field, Form, GroupListView, List } from "@angee/base";

const MODEL = "iam.Permission";

const permissionList = (
  <List model={MODEL} list={GroupListView} order={{ codename: "ASC" }}>
    <Column field="appLabel" />
    <Column field="model" />
    <Column field="codename" />
    <Column field="name" />
  </List>
);

const permissionForm = (
  <Form model={MODEL}>
    <Field name="name" title readOnly />
    <Field name="codename" readOnly />
    <Field name="appLabel" readOnly />
    <Field name="model" readOnly />
  </Form>
);

export function PermissionsPage(): React.ReactElement {
  return (
    <DataPage model={MODEL} placement="inline" routed hideCreate>
      {permissionList}
      {permissionForm}
    </DataPage>
  );
}
