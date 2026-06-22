import * as React from "react";
import { Column, DataPage, Field, Form, GroupListView, List } from "@angee/base";

const MODEL = "iam.Group";

const groupList = (
  <List model={MODEL} list={GroupListView} order={{ name: "ASC" }}>
    <Column field="name" />
  </List>
);

const groupForm = (
  <Form model={MODEL}>
    <Field name="name" title readOnly />
  </Form>
);

export function GroupsPage(): React.ReactElement {
  return (
    <DataPage model={MODEL} placement="inline" routed hideCreate>
      {groupList}
      {groupForm}
    </DataPage>
  );
}
