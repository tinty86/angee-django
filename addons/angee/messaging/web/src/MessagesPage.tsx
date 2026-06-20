import * as React from "react";
import {
  Column,
  DataPage,
  Field,
  Form,
  Group,
  GroupListView,
  List,
  useRelationFacet,
  type DataToolbarFilterField,
  type DataToolbarFilterOption,
  type DataToolbarGroupOption,
} from "@angee/base";

const MODEL = "messaging.Message";

/**
 * The inbox: cross-thread "smart aggregation" over messages. Sender / channel /
 * thread are shared `useRelationFacet`s (the same SDL-derived facet any relation
 * gets), and the list groups by status / thread — composed on `DataPage` +
 * `GroupListView`, not a hand-rolled inbox. Messages arrive via channel sync, so
 * the list creates nothing; status is the one human-editable field.
 */
export function MessagesPage(): React.ReactElement {
  const senderFacet = useRelationFacet(MODEL, { field: "sender", label: "Sender" });
  const channelFacet = useRelationFacet(MODEL, { field: "channel", label: "Channel" });
  const threadFacet = useRelationFacet(MODEL, { field: "thread", label: "Thread" });

  const filters = React.useMemo<readonly DataToolbarFilterOption[]>(
    () => [...senderFacet.filters, ...channelFacet.filters, ...threadFacet.filters],
    [senderFacet.filters, channelFacet.filters, threadFacet.filters],
  );
  const filterFields = React.useMemo<readonly DataToolbarFilterField[]>(
    () => [...senderFacet.filterFields, ...channelFacet.filterFields, ...threadFacet.filterFields],
    [senderFacet.filterFields, channelFacet.filterFields, threadFacet.filterFields],
  );
  const groupOptions = React.useMemo<readonly DataToolbarGroupOption[]>(
    () => [
      ...(threadFacet.groupOption ? [threadFacet.groupOption] : []),
      ...(senderFacet.groupOption ? [senderFacet.groupOption] : []),
      ...(channelFacet.groupOption ? [channelFacet.groupOption] : []),
      { id: "status", label: "Status", group: { field: "status" } },
    ],
    [threadFacet.groupOption, senderFacet.groupOption, channelFacet.groupOption],
  );

  return (
    <DataPage model={MODEL} placement="inline" routed hideCreate>
      <List
        model={MODEL}
        list={GroupListView}
        filters={filters}
        filterFields={filterFields}
        groupOptions={groupOptions}
        defaultGroups={{ list: { field: "status" } }}
      >
        <Column field="subject" />
        <Column field="sender.value" header="Sender" />
        <Column field="thread.subject" header="Thread" />
        <Column field="status" widget="statusBadge" />
        <Column field="sentAt" />
      </List>
      <Form model={MODEL}>
        <Field name="subject" readOnly />
        <Field name="status" />
        <Group label="Envelope" columns={2}>
          <Field name="platform" readOnly />
          <Field name="direction" readOnly />
          <Field name="sentAt" readOnly />
          <Field name="externalId" readOnly />
        </Group>
        <Field name="preview" readOnly />
      </Form>
    </DataPage>
  );
}
