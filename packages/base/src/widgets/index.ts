import { useWidget, type WidgetMap } from "@angee/sdk";

import { booleanWidget } from "./boolean";
import { datetimeWidget } from "./datetime";
import { jsonWidget } from "./json";
import { markdownEditorWidget, markdownPreviewWidget } from "./markdown";
import { floatWidget, integerWidget } from "./number";
import { emailWidget, phoneWidget, urlWidget } from "./scalarText";
import { selectionWidget, selectWidget } from "./select";
import { statusbarWidget } from "./statusbar";
import { booleanToggleWidget, switchWidget } from "./switch";
import { tagInputWidget } from "./tagInput";
import { textareaWidget } from "./textarea";
import { textWidget } from "./text";
import { userRefWidget } from "./userRef";
import type { WidgetDefinition } from "./types";

export type {
  WidgetDefinition,
  WidgetField,
  WidgetOption,
  WidgetRenderProps,
} from "./types";
export { widgetLabel } from "./label";

export const defaultWidgets = {
  text: textWidget,
  textarea: textareaWidget,
  integer: integerWidget,
  float: floatWidget,
  email: emailWidget,
  url: urlWidget,
  phone: phoneWidget,
  boolean: booleanWidget,
  booleanToggle: booleanToggleWidget,
  json: jsonWidget,
  datetime: datetimeWidget,
  statusbar: statusbarWidget,
  tagInput: tagInputWidget,
  "markdown.editor": markdownEditorWidget,
  "markdown.preview": markdownPreviewWidget,
  select: selectWidget,
  selection: selectionWidget,
  switch: switchWidget,
  userRef: userRefWidget,
} satisfies WidgetMap;

export function useResolvedWidget(
  id: string,
): WidgetDefinition | undefined {
  return asWidgetDefinition(useWidget(id));
}

export function asWidgetDefinition(
  value: unknown,
): WidgetDefinition | undefined {
  return isWidgetDefinition(value) ? value : undefined;
}

export function isWidgetDefinition(value: unknown): value is WidgetDefinition {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<PropertyKey, unknown>;
  return (
    typeof record.edit === "function" ||
    typeof record.read === "function" ||
    typeof record.cell === "function"
  );
}
