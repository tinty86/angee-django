import { useEffect, useState, type ReactElement } from "react";

import { cn } from "../lib/cn";
import { widgetLabel } from "./label";
import type { WidgetDefinition, WidgetRenderProps } from "./types";

type ThemeValue = "light" | "dark" | "system";

const THEME_STORAGE_KEY = "angee:theme";
const THEME_OPTIONS = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
] satisfies readonly { value: ThemeValue; label: string }[];

function ThemePickerEdit({
  value,
  onChange,
  field,
  readOnly,
}: WidgetRenderProps<ThemeValue>): ReactElement {
  const [storedTheme, setStoredTheme] = useState<ThemeValue>("system");
  const theme = normaliseTheme(value) ?? storedTheme;

  useEffect(() => {
    const initial = storedThemeValue();
    setStoredTheme(initial);
    applyTheme(initial);
  }, []);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    if (theme !== "system" || typeof window === "undefined") return;
    const query = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!query) return;
    const update = () => applyTheme("system");
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, [theme]);

  function selectTheme(next: ThemeValue): void {
    if (readOnly) return;
    setStoredTheme(next);
    persistTheme(next);
    applyTheme(next);
    onChange?.(next);
  }

  return (
    <span
      className="inline-flex min-w-0 flex-wrap items-center gap-1"
      role="group"
      aria-label={widgetLabel(field, "Theme")}
    >
      {THEME_OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          disabled={readOnly}
          aria-pressed={theme === option.value}
          className={cn(
            "inline-flex h-8 items-center gap-2 rounded-md border border-border bg-sheet px-2 text-13 text-fg outline-none transition-colors hover:bg-inset focus-visible:focus-ring disabled:cursor-default disabled:opacity-70",
            theme === option.value &&
              "border-brand bg-brand-soft text-brand-soft-text",
          )}
          onClick={() => selectTheme(option.value)}
        >
          <span
            className={cn(
              "size-4 shrink-0 rounded-full border border-border-subtle",
              swatchClass(option.value),
            )}
            aria-hidden
          />
          <span>{option.label}</span>
        </button>
      ))}
    </span>
  );
}

function ThemePickerRead({
  value,
}: WidgetRenderProps<ThemeValue>): ReactElement {
  const theme = normaliseTheme(value) ?? "system";
  const label =
    THEME_OPTIONS.find((item) => item.value === theme)?.label ?? "System";
  return (
    <span className="inline-flex items-center gap-2 text-13 text-fg">
      <span
        className={cn(
          "size-4 rounded-full border border-border-subtle",
          swatchClass(theme),
        )}
        aria-hidden
      />
      {label}
    </span>
  );
}

export const themePickerWidget = {
  edit: ThemePickerEdit,
  read: ThemePickerRead,
  cell: ThemePickerRead,
} satisfies WidgetDefinition<ThemeValue>;

function normaliseTheme(value: string | null | undefined): ThemeValue | null {
  return value === "light" || value === "dark" || value === "system"
    ? value
    : null;
}

function storedThemeValue(): ThemeValue {
  if (typeof window === "undefined") return "system";
  return (
    normaliseTheme(window.localStorage.getItem(THEME_STORAGE_KEY)) ?? "system"
  );
}

function persistTheme(value: ThemeValue): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(THEME_STORAGE_KEY, value);
}

function applyTheme(value: ThemeValue): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = resolvedTheme(value);
}

function resolvedTheme(value: ThemeValue): "light" | "dark" {
  if (value !== "system") return value;
  if (typeof window === "undefined") return "light";
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function swatchClass(value: ThemeValue): string {
  if (value === "dark") return "bg-fg";
  if (value === "system") {
    return "bg-[linear-gradient(135deg,var(--color-fg)_0_50%,var(--color-sheet)_50%_100%)]";
  }
  return "bg-sheet";
}
