import type { ReactNode } from "react";
import type { Row } from "@angee/sdk";

import { PAGE_ELEMENT_SLOT } from "./types";
import type { WidgetOption } from "../../widgets/types";

export const FIELD_SLOT = Symbol.for("@angee/base.page.field");

export type PageFieldKind =
  | "text"
  | "textarea"
  | "select"
  | "switch"
  | "readonly"
  | "selection"
  | (string & {});

export interface FieldProps {
  name: string;
  label?: ReactNode;
  widget?: string;
  readOnly?: boolean;
  /** Editable only while creating; read-only (and never patched) on an edit. */
  createOnly?: boolean;
  /** Editable only while editing; read-only (and never sent) on a create. */
  editOnly?: boolean;
  /**
   * Render (and submit) this field only when the predicate matches the form's
   * current values — the form's discriminated-field mechanism. Mirrors
   * `Action.visibleWhen`, but evaluates against live form values so a `kind`
   * select can swap the body. A hidden field is never sent.
   */
  showWhen?: (values: Row) => boolean;
  title?: boolean;
  body?: boolean;
  kind?: PageFieldKind;
  options?: readonly WidgetOption[];
  placeholder?: string;
  description?: ReactNode;
}

export interface FieldDescriptor {
  name: string;
  label?: ReactNode;
  widget?: string;
  readOnly?: boolean;
  /** Editable only while creating; read-only (and never patched) on an edit. */
  createOnly?: boolean;
  /** Editable only while editing; read-only (and never sent) on a create. */
  editOnly?: boolean;
  /** Render and submit this field only when the predicate matches form values (see `FieldProps`). */
  showWhen?: (values: Row) => boolean;
  title?: boolean;
  body?: boolean;
  kind?: PageFieldKind;
  options?: readonly WidgetOption[];
  placeholder?: string;
  description?: ReactNode;
}

function FieldMarker(_props: FieldProps): null {
  return null;
}

export const Field = Object.assign(FieldMarker, {
  [PAGE_ELEMENT_SLOT]: "field" as const,
  [FIELD_SLOT]: true,
});
