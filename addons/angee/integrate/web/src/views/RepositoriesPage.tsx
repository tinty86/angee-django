import * as React from "react";
import { Column, DataPage, Field, Form, Group, List } from "@angee/base";

import { AddRepositoryControl } from "./AddRepositoryControl";

const MODEL = "integrate.Repository";

const repositoryList = (
  <List model={MODEL}>
    <Column field="org" />
    <Column field="name" />
    <Column field="visibility" widget="statusBadge" />
    <Column field="defaultBranch" />
    <Column field="webUrl" />
  </List>
);

// Repositories are inventoried by the add typeahead and `discover`, never
// hand-created or edited, so the detail is read-only; DataPage still wires the
// per-record delete (the only Repository mutation).
const repositoryForm = (
  <Form model={MODEL}>
    <Field name="vcsIntegration" readOnly />
    <Group label="Repository" columns={2}>
      <Field name="org" readOnly />
      <Field name="name" readOnly />
      <Field name="defaultBranch" readOnly />
      <Field name="visibility" readOnly />
    </Group>
    <Group label="Remote" columns={2}>
      <Field name="remote" readOnly />
      <Field name="sshRemote" readOnly />
    </Group>
    <Field name="webUrl" readOnly />
    <Field name="archived" readOnly />
  </Form>
);

/**
 * The inventoried repositories, with the "Add repository" typeahead in the
 * control band. The list creates nothing (`hideCreate`); rows arrive via the
 * typeahead or `discover` and leave via the per-record delete.
 */
export function RepositoriesPage(): React.ReactElement {
  return (
    <>
      <AddRepositoryControl />
      <DataPage model={MODEL} placement="inline" routed hideCreate>
        {repositoryList}
        {repositoryForm}
      </DataPage>
    </>
  );
}
