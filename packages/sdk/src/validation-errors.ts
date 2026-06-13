/** Field- and form-level validation messages extracted from a save failure. */
export interface ValidationErrors {
  /** Messages keyed by SDL (camelCase) field name. */
  fieldErrors: Record<string, string[]>;
  /** Non-field / form-level messages. */
  formErrors: string[];
}

interface GraphQLErrorLike {
  message?: unknown;
  extensions?: Record<string, unknown> | null;
}

/**
 * Extract per-field and form-level validation messages from a mutation error.
 *
 * The GraphQL runtime surfaces Django model-validation failures as a
 * `validationErrors` extension — messages keyed by camelCase field name — plus a
 * `formErrors` list (see `AngeeSchema._apply_validation_error`). A form binds
 * each field message under its field; everything else is one form-level message.
 * When no structured extension is present the whole error is a form-level message.
 */
export function validationErrorsFromError(error: unknown): ValidationErrors {
  const fieldErrors: Record<string, string[]> = {};
  const formErrors: string[] = [];
  let structured = false;

  for (const graphQLError of graphQLErrorsOf(error)) {
    const extensions = graphQLError.extensions ?? undefined;
    const validation = extensions?.validationErrors;
    if (isStringListMap(validation)) {
      structured = true;
      for (const [field, messages] of Object.entries(validation)) {
        fieldErrors[field] = [...(fieldErrors[field] ?? []), ...messages];
      }
    }
    const form = extensions?.formErrors;
    if (Array.isArray(form)) {
      structured = true;
      for (const message of form) {
        if (typeof message === "string") formErrors.push(message);
      }
    }
  }

  if (!structured) {
    const message = errorMessage(error);
    if (message) formErrors.push(message);
  }
  return { fieldErrors, formErrors };
}

/** Read an error's `graphQLErrors` array (urql `CombinedError` shape), if any. */
function graphQLErrorsOf(error: unknown): readonly GraphQLErrorLike[] {
  if (error && typeof error === "object" && "graphQLErrors" in error) {
    const list = (error as { graphQLErrors?: unknown }).graphQLErrors;
    if (Array.isArray(list)) return list as GraphQLErrorLike[];
  }
  return [];
}

/** Narrow an unknown value to a `Record<string, string[]>`. */
function isStringListMap(value: unknown): value is Record<string, string[]> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.values(value).every(
    (entry) =>
      Array.isArray(entry) && entry.every((item) => typeof item === "string"),
  );
}

/** A human-facing message for a non-structured error, without urql's `[GraphQL]` tag. */
function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message.replace(/^\[\w+\]\s*/, "");
  if (typeof error === "string") return error.replace(/^\[\w+\]\s*/, "");
  return "Could not save record.";
}
