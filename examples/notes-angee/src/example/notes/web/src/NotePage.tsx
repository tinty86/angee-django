import * as React from "react";
import {
  AggregatePanel,
  DataPage,
  type FormField,
  type ListColumn,
} from "@angee/base";
import type { Row } from "@angee/sdk";

import { NOTE_STATUS_OPTIONS, NOTE_STATUS_TONES } from "./note-status";

const MODEL = "notes.Note";

const columns: readonly ListColumn[] = [
  { field: "title", header: "Title" },
  { field: "status", header: "Status", status: NOTE_STATUS_TONES },
  {
    field: "isStarred",
    header: "Starred",
    align: "center",
    render: (row: Row) => (row.isStarred ? "★" : "☆"),
  },
  {
    field: "updatedAt",
    header: "Updated",
    render: (row: Row) =>
      row.updatedAt == null
        ? ""
        : new Date(String(row.updatedAt)).toLocaleDateString(),
  },
  { field: "wordCount", header: "Words", align: "right" },
];

const formFields: readonly FormField[] = [
  { name: "title", label: "Title", kind: "text" },
  { name: "body", label: "Body", kind: "textarea" },
  {
    name: "status",
    label: "Status",
    kind: "select",
    options: NOTE_STATUS_OPTIONS,
  },
  { name: "isStarred", label: "Starred", kind: "switch" },
];

/** The notes console page: a count-by-status panel above the data table. */
export function NotePage(): React.ReactElement {
  const [recordId, setRecordId] = React.useState<string | null | undefined>(
    undefined,
  );
  const [creating, setCreating] = React.useState(false);

  return (
    <div className="flex flex-col gap-4">
      <AggregatePanel
        model={MODEL}
        dimensions={[{ by: "STATUS", field: "status", label: "By status" }]}
        title="Notes by status"
      />
      <DataPage
        model={MODEL}
        columns={columns}
        formFields={formFields}
        recordId={recordId}
        creating={creating}
        placement="drawer"
        onSelect={(id) => {
          setCreating(id === null);
          setRecordId(id);
        }}
        onClose={() => {
          setCreating(false);
          setRecordId(undefined);
        }}
      />
    </div>
  );
}
