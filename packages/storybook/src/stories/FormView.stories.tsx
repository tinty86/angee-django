import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  AppRuntimeProvider,
  GraphQLClientProvider,
  type AngeeUrqlClientOptions,
  type SlotContribution,
} from "@angee/sdk";
import {
  FormView,
  ModalsHost,
  baseIcons,
  defaultWidgets,
  formViewNotebookSlot,
  type FormField,
  type PageGroupDescriptor,
} from "@angee/base";

const statusOptions = [
  { value: "DRAFT", label: "Draft" },
  { value: "ACTIVE", label: "Active" },
  { value: "ARCHIVED", label: "Archived" },
];

const storyRecord = {
  id: "note_7u9e3b1f",
  title: "Launch readiness review",
  status: "ACTIVE",
  owner: "Ada Lovelace",
  priority: "HIGH",
  visibility: "TEAM",
  tags: ["release", "support", "imports"],
  createdAt: "2026-05-28T10:00:00Z",
  updatedAt: "2026-06-01T15:30:00Z",
  words: 842,
  body:
    "## Review goals\n\n- Confirm release notes and owner handoff.\n- Verify import smoke tests against the seeded workspace.\n- Close support-facing follow ups before the launch window.\n\n## Open items\n\nThe final permissions review is scheduled after the data import check.",
};

const titleField = {
  name: "title",
  label: "Title",
  widget: "text",
  title: true,
  placeholder: storyRecord.title,
} satisfies FormField;
const statusField = {
  name: "status",
  label: "Status",
  widget: "statusbar",
  options: statusOptions,
} satisfies FormField;
const ownerField = {
  name: "owner",
  label: "Owner",
  widget: "text",
  readOnly: true,
} satisfies FormField;
const priorityField = {
  name: "priority",
  label: "Priority",
  widget: "select",
  options: [
    { value: "LOW", label: "Low" },
    { value: "MEDIUM", label: "Medium" },
    { value: "HIGH", label: "High" },
  ],
} satisfies FormField;
const visibilityField = {
  name: "visibility",
  label: "Visibility",
  widget: "select",
  options: [
    { value: "PRIVATE", label: "Private" },
    { value: "TEAM", label: "Team" },
    { value: "PUBLIC", label: "Public" },
  ],
} satisfies FormField;
const tagsField = {
  name: "tags",
  label: "Tags",
  widget: "tagInput",
} satisfies FormField;
const createdAtField = {
  name: "createdAt",
  label: "Created At",
  widget: "datetime",
  readOnly: true,
} satisfies FormField;
const updatedAtField = {
  name: "updatedAt",
  label: "Updated At",
  widget: "datetime",
  readOnly: true,
} satisfies FormField;
const wordsField = {
  name: "words",
  label: "Words",
  widget: "integer",
  readOnly: true,
} satisfies FormField;
const bodyField = {
  name: "body",
  label: "Description",
  widget: "markdown.editor",
  body: true,
} satisfies FormField;

const editableFields = [
  titleField,
  statusField,
  ownerField,
  priorityField,
  visibilityField,
  tagsField,
  createdAtField,
  updatedAtField,
  wordsField,
  bodyField,
] satisfies readonly FormField[];

const editableGroups = [
  {
    label: "Details",
    columns: 2,
    fields: [
      ownerField,
      priorityField,
      visibilityField,
      createdAtField,
      updatedAtField,
      wordsField,
      tagsField,
    ],
    actions: [],
  },
] satisfies readonly PageGroupDescriptor[];

const readOnlyTitleField = {
  ...titleField,
  readOnly: true,
} satisfies FormField;
const readOnlyStatusField = {
  ...statusField,
  readOnly: true,
} satisfies FormField;
const readOnlyOwnerField = {
  ...ownerField,
  readOnly: true,
} satisfies FormField;
const readOnlyPriorityField = {
  ...priorityField,
  readOnly: true,
} satisfies FormField;
const readOnlyVisibilityField = {
  ...visibilityField,
  readOnly: true,
} satisfies FormField;
const readOnlyTagsField = {
  ...tagsField,
  readOnly: true,
} satisfies FormField;
const readOnlyCreatedAtField = {
  ...createdAtField,
  readOnly: true,
} satisfies FormField;
const readOnlyUpdatedAtField = {
  ...updatedAtField,
  readOnly: true,
} satisfies FormField;
const readOnlyWordsField = {
  ...wordsField,
  readOnly: true,
} satisfies FormField;
const readOnlyBodyField = {
  ...bodyField,
  readOnly: true,
} satisfies FormField;

const readOnlyFields = [
  readOnlyTitleField,
  readOnlyStatusField,
  readOnlyOwnerField,
  readOnlyPriorityField,
  readOnlyVisibilityField,
  readOnlyTagsField,
  readOnlyCreatedAtField,
  readOnlyUpdatedAtField,
  readOnlyWordsField,
  readOnlyBodyField,
] satisfies readonly FormField[];

const readOnlyGroups = [
  {
    label: "Details",
    columns: 2,
    fields: [
      readOnlyOwnerField,
      readOnlyPriorityField,
      readOnlyVisibilityField,
      readOnlyCreatedAtField,
      readOnlyUpdatedAtField,
      readOnlyWordsField,
      readOnlyTagsField,
    ],
    actions: [],
  },
] satisfies readonly PageGroupDescriptor[];

const storyNotebookSlots = [
  {
    slot: formViewNotebookSlot("notes.Note"),
    id: "linked-notes",
    sequence: 10,
    content: {
      label: "Linked notes",
      count: 2,
      children: (
        <div className="grid gap-2 p-4 text-13">
          <NotebookRow title="Support handoff" detail="Updated yesterday" />
          <NotebookRow title="Import smoke test" detail="Owner: Sofia Marin" />
        </div>
      ),
    },
  },
  {
    slot: formViewNotebookSlot("notes.Note"),
    id: "activity",
    sequence: 20,
    content: {
      label: "Activity",
      count: 4,
      children: (
        <div className="grid gap-2 p-4 text-13 text-fg-muted">
          <p>4 updates are ready to render in this notebook panel.</p>
        </div>
      ),
    },
  },
] satisfies readonly SlotContribution[];

const storySchemas = {
  public: {
    url: "/graphql/public/",
    fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes("/auth/csrf/")) {
        return jsonResponse({ token: "storybook" });
      }
      const payload = requestPayload(init);
      const patch = isRecord(payload.variables.data)
        ? payload.variables.data
        : {};

      if (payload.query.includes("mutation updateNote")) {
        return jsonResponse({ data: { updateNote: { ...storyRecord, ...patch } } });
      }
      if (payload.query.includes("mutation createNote")) {
        return jsonResponse({
          data: { createNote: { ...storyRecord, id: "note-new", ...patch } },
        });
      }
      return jsonResponse({ data: { note: storyRecord } });
    },
  },
} satisfies Record<string, AngeeUrqlClientOptions>;

const meta = {
  title: "Views/FormView",
  parameters: { layout: "padded" },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const EditMode: Story = {
  render: () => (
    <FormViewFixture fields={editableFields} groups={editableGroups} />
  ),
};

export const ReadOnlyMode: Story = {
  render: () => (
    <FormViewFixture fields={readOnlyFields} groups={readOnlyGroups} />
  ),
};

function FormViewFixture({
  fields,
  groups,
}: {
  fields: readonly FormField[];
  groups: readonly PageGroupDescriptor[];
}) {
  return (
    <ModalsHost>
      <GraphQLClientProvider config={storySchemas} schema="public">
        <AppRuntimeProvider
          runtime={{
            icons: baseIcons,
            slots: storyNotebookSlots,
            widgets: defaultWidgets,
          }}
        >
          <FormView
            model="notes.Note"
            id={storyRecord.id}
            fields={fields}
            groups={groups}
            returning={[
              "owner",
              "priority",
              "visibility",
              "tags",
              "createdAt",
              "updatedAt",
              "words",
              "body",
            ]}
          />
        </AppRuntimeProvider>
      </GraphQLClientProvider>
    </ModalsHost>
  );
}

function NotebookRow({
  detail,
  title,
}: {
  detail: string;
  title: string;
}) {
  return (
    <div className="rounded border border-border-subtle bg-inset px-3 py-2">
      <p className="font-medium text-fg">{title}</p>
      <p className="mt-1 text-xs text-fg-muted">{detail}</p>
    </div>
  );
}

function requestPayload(init?: RequestInit): {
  query: string;
  variables: Record<string, unknown>;
} {
  if (typeof init?.body !== "string") return { query: "", variables: {} };
  const parsed: unknown = JSON.parse(init.body);
  if (!isRecord(parsed)) return { query: "", variables: {} };
  return {
    query: typeof parsed.query === "string" ? parsed.query : "",
    variables: isRecord(parsed.variables) ? parsed.variables : {},
  };
}

function jsonResponse(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    headers: { "content-type": "application/json" },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
