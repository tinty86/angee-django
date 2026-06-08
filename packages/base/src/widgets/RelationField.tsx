import { useMemo, useState, type ReactElement, type ReactNode } from "react";
import { Command } from "cmdk";

import { Glyph } from "../chrome/Glyph";
import { cn } from "../lib/cn";
import {
  PopoverContent,
  PopoverPortal,
  PopoverPositioner,
  PopoverRoot,
  PopoverTrigger,
} from "../ui/popover";

/** One selectable related record. */
export interface RelationOption {
  value: string;
  label: string;
}

export interface RelationFieldProps {
  value?: string | null;
  onChange?: (value: string) => void;
  options: readonly RelationOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  readOnly?: boolean;
  disabled?: boolean;
  /** Accessible name for the trigger and the search list. */
  "aria-label"?: string;
  className?: string;
  /**
   * When set, the popover offers a "Create …" row for the typed query whenever
   * it matches no option — the searchable, in-place create affordance.
   */
  onCreate?: (query: string) => void;
  /** Footer label for the create row; defaults to `Create "<query>"`. */
  createLabel?: (query: string) => ReactNode;
}

const TRIGGER_CLASS =
  "flex h-9 w-full items-center gap-2 rounded-md border border-border bg-sheet px-3 " +
  "text-left text-13 text-fg outline-none transition-colors hover:border-border-strong " +
  "focus-visible:focus-ring disabled:cursor-not-allowed disabled:opacity-60";
const ITEM_CLASS =
  "flex h-8 cursor-pointer items-center gap-2 rounded-md px-2 text-13 text-fg outline-none " +
  "data-[selected=true]:bg-inset [&_.glyph]:size-3.5 [&_.glyph]:text-fg-muted";

/**
 * A searchable relation picker: a trigger showing the selected record, and a
 * popover with a search box, the filtered options, and — when `onCreate` is
 * given and the typed query matches nothing — a "Create …" row. Pure UI; the
 * caller owns the options and what happens on create (`RelationPicker` wires it
 * to an inline create form).
 */
export function RelationField({
  value,
  onChange,
  options,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  readOnly,
  disabled,
  "aria-label": ariaLabel,
  className,
  onCreate,
  createLabel,
}: RelationFieldProps): ReactElement {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selected = useMemo(
    () => options.find((option) => option.value === value),
    [options, value],
  );
  const normalized = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!normalized) return options;
    return options.filter((option) =>
      `${option.label} ${option.value}`.toLowerCase().includes(normalized),
    );
  }, [options, normalized]);
  const exactMatch = options.some(
    (option) => option.label.trim().toLowerCase() === normalized,
  );
  const showCreate = Boolean(onCreate) && normalized.length > 0 && !exactMatch;

  function dismiss(): void {
    setOpen(false);
    setQuery("");
  }

  return (
    <PopoverRoot
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <PopoverTrigger
        className={cn(TRIGGER_CLASS, className)}
        disabled={readOnly || disabled}
        aria-label={ariaLabel}
      >
        <span className={cn("min-w-0 flex-1 truncate", !selected && "text-fg-muted")}>
          {selected ? selected.label : placeholder}
        </span>
        <Glyph decorative name="chevron-down" className="shrink-0 text-fg-muted" />
      </PopoverTrigger>
      <PopoverPortal>
        <PopoverPositioner sideOffset={4} align="start">
          <PopoverContent className="min-w-56 p-0">
            <Command shouldFilter={false} label={ariaLabel}>
              <div className="flex h-9 items-center gap-2 border-b border-border-subtle px-3 text-fg">
                <Glyph decorative name="search" className="text-fg-muted" />
                <Command.Input
                  autoFocus
                  value={query}
                  onValueChange={setQuery}
                  placeholder={searchPlaceholder}
                  className="h-full min-w-0 flex-1 bg-transparent text-13 outline-none placeholder:text-fg-muted"
                />
              </div>
              <Command.List className="max-h-64 overflow-y-auto p-1">
                {filtered.map((option) => (
                  <Command.Item
                    key={option.value}
                    value={option.value}
                    onSelect={() => {
                      onChange?.(option.value);
                      dismiss();
                    }}
                    className={ITEM_CLASS}
                  >
                    <span className="min-w-0 flex-1 truncate">{option.label}</span>
                    {option.value === value ? (
                      <Glyph decorative name="check" />
                    ) : null}
                  </Command.Item>
                ))}
                {showCreate ? (
                  <Command.Item
                    value={`__create__:${query}`}
                    onSelect={() => {
                      onCreate?.(query.trim());
                      dismiss();
                    }}
                    className={cn(ITEM_CLASS, "text-brand-text")}
                  >
                    <Glyph decorative name="plus" />
                    <span className="min-w-0 flex-1 truncate">
                      {createLabel ? createLabel(query.trim()) : `Create “${query.trim()}”`}
                    </span>
                  </Command.Item>
                ) : null}
                {filtered.length === 0 && !showCreate ? (
                  <div className="px-3 py-6 text-center text-13 text-fg-muted">
                    No matches.
                  </div>
                ) : null}
              </Command.List>
            </Command>
          </PopoverContent>
        </PopoverPositioner>
      </PopoverPortal>
    </PopoverRoot>
  );
}
