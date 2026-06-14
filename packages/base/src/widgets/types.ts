import type { ComponentType, ReactNode } from "react";

export interface WidgetOption {
  value: string;
  label: ReactNode;
  disabled?: boolean;
}

/**
 * The label for an option `value`: the matching option's `label`, else the raw
 * value, else "". The one owner of the
 * `options.find(o => o.value === v)?.label ?? v ?? ""` lookup the scalar and
 * relation widgets each re-spelled.
 */
export function optionLabel(
  options: readonly WidgetOption[] | undefined,
  value: string | null | undefined,
): ReactNode {
  return options?.find((option) => option.value === value)?.label ?? value ?? "";
}

export interface WidgetField {
  name?: string;
  label?: ReactNode;
  options?: readonly WidgetOption[];
}

export interface WidgetRenderProps<TValue = unknown, TRow = unknown> {
  value?: TValue | null;
  row?: TRow;
  field?: WidgetField;
  readOnly?: boolean;
  onChange?: (value: TValue) => void;
}

export interface WidgetDefinition<TValue = unknown, TRow = unknown> {
  edit?: ComponentType<WidgetRenderProps<TValue, TRow>>;
  read: ComponentType<WidgetRenderProps<TValue, TRow>>;
  cell?: ComponentType<WidgetRenderProps<TValue, TRow>>;
}
