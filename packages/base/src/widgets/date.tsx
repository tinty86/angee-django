import { useState, type ReactElement } from "react";
import { format, isValid, parseISO } from "date-fns";

import { Glyph } from "../chrome/Glyph";
import { Button } from "../ui/button";
import { Calendar } from "../ui/calendar";
import {
  PopoverContent,
  PopoverPortal,
  PopoverPositioner,
  PopoverRoot,
  PopoverTrigger,
} from "../ui/popover";
import { widgetLabel } from "./label";
import type { WidgetDefinition, WidgetRenderProps } from "./types";

type DateWidgetValue = string | Date | null;

function DateEdit({
  value,
  onChange,
  field,
  readOnly,
}: WidgetRenderProps<DateWidgetValue>): ReactElement {
  const [open, setOpen] = useState(false);
  const date = dateFromValue(value);
  const label = formatDate(date) || widgetLabel(field, "Select date");

  if (readOnly) return <DateRead value={value} />;

  return (
    <PopoverRoot open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className="inline-flex h-9 w-full min-w-0 items-center justify-between gap-2 rounded border border-border bg-inset px-2 text-left text-13 text-fg outline-none transition-colors hover:border-border-strong focus-visible:border-border-focus focus-visible:focus-ring"
        aria-label={widgetLabel(field, "Date")}
      >
        <span className="min-w-0 truncate">{label}</span>
        <Glyph name="calendar" className="shrink-0 text-fg-muted" />
      </PopoverTrigger>
      <PopoverPortal>
        <PopoverPositioner sideOffset={4} align="start">
          <PopoverContent
            aria-label={widgetLabel(field, "Date")}
            surface="sheet"
          >
            <Calendar
              fixedWeeks
              mode="single"
              selected={date ?? undefined}
              showOutsideDays
              onSelect={(next) => {
                onChange?.(next ? format(next, "yyyy-MM-dd") : null);
                setOpen(false);
              }}
            />
            {date ? (
              <div className="border-t border-border-subtle p-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="w-full"
                  onClick={() => {
                    onChange?.(null);
                    setOpen(false);
                  }}
                >
                  Clear
                </Button>
              </div>
            ) : null}
          </PopoverContent>
        </PopoverPositioner>
      </PopoverPortal>
    </PopoverRoot>
  );
}

function DateRead({
  value,
}: WidgetRenderProps<DateWidgetValue>): ReactElement {
  const date = dateFromValue(value);
  const label = formatDate(date);
  return (
    <span className="text-13 tabular-nums text-fg" title={valueLabel(value)}>
      {label}
    </span>
  );
}

export const dateWidget = {
  edit: DateEdit,
  read: DateRead,
  cell: DateRead,
} satisfies WidgetDefinition<DateWidgetValue>;

function dateFromValue(value: DateWidgetValue | undefined): Date | null {
  if (value instanceof Date) return isValid(value) ? value : null;
  if (!value) return null;
  const parsed = parseISO(value);
  return isValid(parsed) ? parsed : null;
}

function formatDate(value: Date | null): string {
  return value ? format(value, "MMM d, yyyy") : "";
}

function valueLabel(value: DateWidgetValue | undefined): string {
  if (value instanceof Date) return value.toISOString();
  return value ?? "";
}
