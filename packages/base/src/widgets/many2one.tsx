import type { ReactElement } from "react";

import { Select } from "../ui/select";
import { widgetLabel } from "./label";
import type { WidgetDefinition, WidgetRenderProps } from "./types";

function Many2OneEdit({
  value,
  onChange,
  field,
  readOnly,
}: WidgetRenderProps<string>): ReactElement {
  return (
    <Select
      value={value ?? ""}
      options={field?.options ?? []}
      readOnly={readOnly}
      disabled={readOnly}
      aria-label={widgetLabel(field, "Related record")}
      placeholder={widgetLabel(field, "Related record")}
      onValueChange={(next) => onChange?.(next)}
    />
  );
}

function Many2OneRead({
  value,
  field,
}: WidgetRenderProps<string>): ReactElement {
  const label =
    field?.options?.find((option) => option.value === value)?.label ??
    value ??
    "";
  return <span className="text-13 text-fg">{label}</span>;
}

export const many2oneWidget = {
  edit: Many2OneEdit,
  read: Many2OneRead,
  cell: Many2OneRead,
} satisfies WidgetDefinition<string>;
