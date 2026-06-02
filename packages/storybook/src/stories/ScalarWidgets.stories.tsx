import { useState, type ReactElement } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  defaultWidgets,
  type WidgetDefinition,
  type WidgetField,
} from "@angee/base";

const selectionOptions = [
  { value: "draft", label: "Draft" },
  { value: "active", label: "Active" },
  { value: "archived", label: "Archived" },
];

type JsonWidgetValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonWidgetValue[]
  | { readonly [key: string]: JsonWidgetValue };

const meta = {
  title: "Widgets/Scalar Fields",
  parameters: {
    layout: "padded",
  },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const EditAndRead: Story = {
  render: () => (
    <div className="max-w-6xl overflow-x-auto">
      <div className="min-w-[860px] rounded-md border border-border bg-sheet">
        <div className="grid grid-cols-[9rem_minmax(12rem,1fr)_minmax(12rem,1fr)_minmax(12rem,1fr)] gap-3 border-b border-border-subtle px-4 py-2 text-2xs font-semibold uppercase text-fg-muted">
          <span>Kind</span>
          <span>Edit</span>
          <span>Read</span>
          <span>Cell</span>
        </div>
        <div className="divide-y divide-border-subtle">
          <WidgetExample<number | null>
            kind="integer"
            widget={defaultWidgets.integer}
            initialValue={42}
            field={{ label: "Quantity" }}
          />
          <WidgetExample<number | null>
            kind="float"
            widget={defaultWidgets.float}
            initialValue={19.75}
            field={{ label: "Rate" }}
          />
          <WidgetExample
            kind="email"
            widget={defaultWidgets.email}
            initialValue="ada@example.com"
            field={{ label: "Email" }}
          />
          <WidgetExample
            kind="url"
            widget={defaultWidgets.url}
            initialValue="https://angee.dev/docs"
            field={{ label: "Website" }}
          />
          <WidgetExample
            kind="phone"
            widget={defaultWidgets.phone}
            initialValue="+1 555 010 1842"
            field={{ label: "Phone" }}
          />
          <WidgetExample
            kind="boolean"
            widget={defaultWidgets.boolean}
            initialValue={true}
            field={{ label: "Approved" }}
          />
          <WidgetExample
            kind="booleanToggle"
            widget={defaultWidgets.booleanToggle}
            initialValue={false}
            field={{ label: "Published" }}
          />
          <WidgetExample<JsonWidgetValue>
            kind="json"
            widget={defaultWidgets.json}
            initialValue={{
              flags: ["import", "sync"],
              owner: "Ada Lovelace",
              retries: 2,
            }}
            field={{ label: "Metadata" }}
          />
          <WidgetExample
            kind="selection"
            widget={defaultWidgets.selection}
            initialValue="active"
            field={{ label: "Status", options: selectionOptions }}
          />
        </div>
      </div>
    </div>
  ),
};

function WidgetExample<TValue>({
  kind,
  widget,
  initialValue,
  field,
}: {
  kind: string;
  widget: WidgetDefinition<TValue>;
  initialValue: TValue;
  field: WidgetField;
}): ReactElement {
  const [value, setValue] = useState<TValue>(initialValue);
  const Edit = widget.edit ?? widget.read;
  const Read = widget.read;
  const Cell = widget.cell ?? widget.read;
  const widgetField = { name: kind, ...field };

  return (
    <div className="grid grid-cols-[9rem_minmax(12rem,1fr)_minmax(12rem,1fr)_minmax(12rem,1fr)] items-start gap-3 px-4 py-3">
      <span className="pt-1.5 font-mono text-xs text-fg-muted">{kind}</span>
      <div className="min-w-0">
        <Edit value={value} field={widgetField} onChange={setValue} />
      </div>
      <div className="min-w-0 pt-1.5">
        <Read value={value} field={widgetField} readOnly />
      </div>
      <div className="min-w-0 pt-1.5">
        <Cell value={value} field={widgetField} readOnly />
      </div>
    </div>
  );
}
