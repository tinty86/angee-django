import * as React from "react";
import { useForm } from "@tanstack/react-form";
import {
  useResourceMutation,
  useResourceRecord,
  type Row,
} from "@angee/sdk";

import { Button } from "../ui/button";
import { FieldControl, FieldLabel, FieldRoot } from "../ui/field";
import { Select, type SelectChoice } from "../ui/select";
import { Spinner } from "../ui/spinner";
import { Switch } from "../ui/switch";
import { Textarea } from "../ui/textarea";

/** How a field is rendered and edited. */
export type FieldKind = "text" | "textarea" | "select" | "switch" | "readonly";

/** One editable (or read-only) field on the form. */
export interface FormField {
  /** Key in the record/patch this field reads and writes. */
  name: string;
  /** Label shown above the control; defaults to the field name. */
  label?: React.ReactNode;
  kind: FieldKind;
  /** Choices for a `"select"` field. */
  options?: readonly SelectChoice[];
  placeholder?: string;
  /** Helper text shown beneath the control. */
  description?: React.ReactNode;
}

export interface FormViewProps {
  /** Model label, e.g. `"notes.Note"`. */
  model: string;
  /** Record id to edit; `null`/`undefined` creates a new record. */
  id?: string | null;
  /** Fields rendered, in order. Their names also seed the read selection. */
  fields: readonly FormField[];
  /** Selected back from the mutation (and seeded for edit). Defaults to names + `id`. */
  returning?: readonly string[];
  /** Called with the saved record after a successful create/update. */
  onSaved?: (row: Row) => void;
  /** Label for the submit button; defaults to "Create"/"Save". */
  submitLabel?: React.ReactNode;
  className?: string;
}

type Values = Record<string, unknown>;

/** Default value an empty draft uses for a field of the given kind. */
function emptyValue(kind: FieldKind): unknown {
  return kind === "switch" ? false : "";
}

/** A fresh draft for create mode: one empty value per editable field. */
function emptyDraft(fields: readonly FormField[]): Values {
  const draft: Values = {};
  for (const field of fields) draft[field.name] = emptyValue(field.kind);
  return draft;
}

/** Project a loaded record onto the form's fields, filling gaps with empties. */
function recordToValues(record: Row, fields: readonly FormField[]): Values {
  const values: Values = {};
  for (const field of fields) {
    values[field.name] = record[field.name] ?? emptyValue(field.kind);
  }
  return values;
}

/** A form bound to one record: reads it (edit) and writes create/update. */
export function FormView({
  model,
  id,
  fields,
  returning,
  onSaved,
  submitLabel,
  className,
}: FormViewProps): React.ReactElement {
  const isCreate = id == null;

  const selection = React.useMemo(() => {
    const paths = new Set<string>(["id"]);
    for (const field of fields) paths.add(field.name);
    for (const extra of returning ?? []) paths.add(extra);
    return [...paths];
  }, [fields, returning]);

  const { record, fetching: loading } = useResourceRecord(model, id ?? null, {
    fields: selection,
    enabled: !isCreate,
  });

  const [mutate, mutation] = useResourceMutation(
    model,
    isCreate ? "create" : "update",
    { fields: selection },
  );

  const form = useForm({
    defaultValues: emptyDraft(fields) as Values,
    onSubmit: async ({ value }) => {
      const data: Values = { ...value };
      if (!isCreate && id != null) data.id = id;
      const saved = await mutate({ data });
      if (saved) {
        form.reset(recordToValues(saved, fields));
        onSaved?.(saved);
      }
    },
  });

  // Seed once per loaded record id; afterwards the draft is the form's to own.
  const seededIdRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (isCreate) {
      if (seededIdRef.current !== null) {
        seededIdRef.current = null;
        form.reset(emptyDraft(fields));
      }
      return;
    }
    const recordId = typeof record?.id === "string" ? record.id : null;
    if (record && recordId && seededIdRef.current !== recordId) {
      seededIdRef.current = recordId;
      form.reset(recordToValues(record, fields));
    }
  }, [isCreate, record, fields, form]);

  return (
    <form
      className={["flex flex-col gap-4", className].filter(Boolean).join(" ")}
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      {loading ? (
        <div className="flex items-center gap-2 text-13 text-fg-muted">
          <Spinner size="sm" />
          Loading…
        </div>
      ) : null}

      {fields.map((field) => (
        <form.Field key={field.name} name={field.name}>
          {(api) => {
            const value = api.state.value;
            const label = field.label ?? field.name;
            const readOnly = field.kind === "readonly";
            return (
              <FieldRoot>
                <FieldLabel>{label}</FieldLabel>
                {field.kind === "textarea" ? (
                  <Textarea
                    name={field.name}
                    value={String(value ?? "")}
                    placeholder={field.placeholder}
                    rows={4}
                    onChange={(event) => api.handleChange(event.target.value)}
                    onBlur={api.handleBlur}
                  />
                ) : field.kind === "select" ? (
                  <Select
                    options={field.options ?? []}
                    value={value == null ? "" : String(value)}
                    placeholder={field.placeholder}
                    onValueChange={(next) => api.handleChange(next)}
                  />
                ) : field.kind === "switch" ? (
                  <Switch
                    checked={Boolean(value)}
                    onCheckedChange={(checked) => api.handleChange(checked)}
                  />
                ) : (
                  <FieldControl
                    name={field.name}
                    value={String(value ?? "")}
                    placeholder={field.placeholder}
                    readOnly={readOnly}
                    onChange={(event) => api.handleChange(event.target.value)}
                    onBlur={api.handleBlur}
                  />
                )}
                {field.description ? (
                  <p className="text-xs leading-5 text-fg-muted">
                    {field.description}
                  </p>
                ) : null}
                {api.state.meta.errors.length > 0 ? (
                  <p className="text-xs leading-5 text-danger-text">
                    {api.state.meta.errors.join(", ")}
                  </p>
                ) : null}
              </FieldRoot>
            );
          }}
        </form.Field>
      ))}

      {mutation.error ? (
        <p className="text-13 text-danger-text">{mutation.error.message}</p>
      ) : null}

      <div className="flex items-center gap-2">
        <Button type="submit" variant="primary" loading={mutation.fetching}>
          {submitLabel ?? (isCreate ? "Create" : "Save")}
        </Button>
      </div>
    </form>
  );
}
