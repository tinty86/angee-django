import * as React from "react";
import {
  Column,
  DataPage,
  Field,
  Form,
  Group,
  List,
  useRelationFacet,
  type DataToolbarGroupOption,
} from "@angee/base";

const MODEL = "parties.Person";

const peopleForm = (
  <Form model={MODEL}>
    <Field name="displayName" title />
    <Group label="Name" columns={2}>
      <Field name="givenName" label="Given name" />
      <Field name="familyName" label="Family name" />
      <Field name="additionalName" label="Middle name" />
      <Field name="nickname" label="Nickname" />
      <Field name="namePrefix" label="Prefix" />
      <Field name="nameSuffix" label="Suffix" />
    </Group>
    <Group label="Details" columns={2}>
      <Field name="birthday" label="Birthday" />
      <Field name="anniversary" label="Anniversary" />
      <Field name="folder" label="Folder" readOnly />
    </Group>
    <Field name="notes" />
  </Form>
);

/**
 * People (the person-kind contacts): full create/edit/list/detail, browsable by
 * folder. The folder facet is the shared `useRelationFacet` over the `folder`
 * relation — the same SDL-derived facet any model with a to-one relation gets, so
 * the folder navigation is reusable rather than a bespoke parties widget.
 */
export function PeoplePage(): React.ReactElement {
  const folderFacet = useRelationFacet(MODEL, { field: "folder", label: "Folder" });
  const groupOptions = React.useMemo<readonly DataToolbarGroupOption[]>(
    () => (folderFacet.groupOption ? [folderFacet.groupOption] : []),
    [folderFacet.groupOption],
  );
  return (
    <DataPage model={MODEL} placement="inline" routed>
      <List
        model={MODEL}
        filters={folderFacet.filters}
        filterFields={folderFacet.filterFields}
        groupOptions={groupOptions}
      >
        <Column field="displayName" />
        <Column field="folder.name" header="Folder" />
        <Column field="givenName" />
        <Column field="familyName" />
        <Column field="createdAt" />
      </List>
      {peopleForm}
    </DataPage>
  );
}
