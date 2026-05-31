import type { BadgeVariant, SelectChoice } from "@angee/base";

/** The lifecycle a note moves through. */
export type NoteStatus = "DRAFT" | "ACTIVE" | "ARCHIVED";

/** Choices for the status select, in lifecycle order. */
export const NOTE_STATUS_OPTIONS: readonly SelectChoice[] = [
  { value: "DRAFT", label: "Draft" },
  { value: "ACTIVE", label: "Active" },
  { value: "ARCHIVED", label: "Archived" },
];

/** Badge tone per status for the list column. */
export const NOTE_STATUS_TONES: Record<string, BadgeVariant> = {
  ACTIVE: "success",
  DRAFT: "warning",
  ARCHIVED: "default",
};
