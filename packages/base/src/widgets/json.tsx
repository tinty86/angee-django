import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ReactElement,
} from "react";

import { Code } from "../ui/code";
import { Textarea } from "../ui/textarea";
import { widgetLabel } from "./label";
import type { WidgetDefinition, WidgetRenderProps } from "./types";

type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

type JsonParseResult =
  | { ok: true; value: JsonValue }
  | { ok: false };

function JsonEdit({
  value,
  onChange,
  field,
  readOnly,
}: WidgetRenderProps<JsonValue>): ReactElement {
  const formatted = formatJson(value);
  const lastValue = useRef(formatted);
  const [draft, setDraft] = useState(formatted);
  const parsed = parseJsonDraft(draft);

  useEffect(() => {
    if (formatted === lastValue.current) return;
    lastValue.current = formatted;
    setDraft(formatted);
  }, [formatted]);

  function handleChange(event: ChangeEvent<HTMLTextAreaElement>): void {
    const next = event.currentTarget.value;
    setDraft(next);
    const nextParsed = parseJsonDraft(next);
    if (!nextParsed.ok) return;
    lastValue.current = formatJson(nextParsed.value);
    onChange?.(nextParsed.value);
  }

  function handleBlur(): void {
    if (!parsed.ok) return;
    const next = formatJson(parsed.value);
    lastValue.current = next;
    setDraft(next);
  }

  return (
    <Textarea
      value={draft}
      readOnly={readOnly}
      invalid={!readOnly && !parsed.ok}
      aria-label={widgetLabel(field, "JSON")}
      placeholder={widgetLabel(field, "JSON")}
      rows={6}
      className="font-mono"
      onBlur={handleBlur}
      onChange={handleChange}
    />
  );
}

function JsonRead({
  value,
}: WidgetRenderProps<JsonValue>): ReactElement {
  return (
    <Code surface="inset" truncate className="max-w-full">
      {compactJson(value)}
    </Code>
  );
}

export const jsonWidget = {
  edit: JsonEdit,
  read: JsonRead,
  cell: JsonRead,
} satisfies WidgetDefinition<JsonValue>;

function parseJsonDraft(input: string): JsonParseResult {
  const trimmed = input.trim();
  if (!trimmed) return { ok: true, value: null };
  try {
    return { ok: true, value: JSON.parse(trimmed) as JsonValue };
  } catch {
    return { ok: false };
  }
}

function formatJson(value: JsonValue | undefined): string {
  if (value === undefined) return "";
  return JSON.stringify(value, null, 2) ?? "";
}

function compactJson(value: JsonValue | undefined): string {
  if (value === undefined) return "";
  return JSON.stringify(value) ?? "";
}
