import * as React from "react";
import {
  Column,
  DataPage,
  Field,
  Form,
  Group,
  List,
  type RecordPanelContext,
  type RecordTabDescriptor,
} from "@angee/base";
import { useResourceList } from "@angee/sdk";

const MODEL = "messaging.Thread";
const MESSAGE_MODEL = "messaging.Message";

/** The messages in a thread, listed on the thread's detail panel. */
function ThreadMessagesTab({ recordId }: RecordPanelContext): React.ReactElement {
  const { rows } = useResourceList(MESSAGE_MODEL, {
    filter: { thread: { exact: recordId } },
    fields: ["id", "subject", "preview", "status", "sentAt"],
    order: { sentAt: "ASC" },
  });
  if (rows.length === 0) {
    return <p className="px-1 py-3 text-13 text-fg-muted">No messages in this thread yet.</p>;
  }
  return (
    <ul className="flex flex-col gap-2">
      {rows.map((message) => (
        <li key={String(message.id)} className="rounded-md border border-border bg-sheet px-3 py-2">
          <div className="truncate text-13 text-fg">{String(message.subject ?? "")}</div>
          <div className="truncate text-12 text-fg-muted">{String(message.preview ?? "")}</div>
        </li>
      ))}
    </ul>
  );
}

/** Threads: list + detail, the detail carrying the thread's Messages. */
export function ThreadsPage(): React.ReactElement {
  const recordTabs: readonly RecordTabDescriptor[] = [
    { id: "messages", label: "Messages", render: (context) => <ThreadMessagesTab {...context} /> },
  ];
  return (
    <DataPage model={MODEL} placement="inline" routed hideCreate recordTabs={recordTabs}>
      <List model={MODEL}>
        <Column field="subject" />
        <Column field="modality" />
        <Column field="messageCount" header="Messages" />
        <Column field="lastMessageAt" />
      </List>
      <Form model={MODEL}>
        <Field name="subject" />
        <Group label="About" columns={2}>
          <Field name="platform" readOnly />
          <Field name="modality" readOnly />
          <Field name="visibility" />
          <Field name="messageCount" readOnly />
        </Group>
      </Form>
    </DataPage>
  );
}
