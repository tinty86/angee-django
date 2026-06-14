import * as React from "react";
import { useModelMetadata } from "@angee/sdk";

import type { WidgetOption } from "../widgets";

/**
 * SDL-derived `<select>` options for an enum field, with lower-cased values.
 *
 * An enum reads as the UPPERCASE member name but its create/patch input is a
 * lowercase `String` value, so a bare metadata-driven select submits the member
 * name and the input rejects it. Pair these options with a `createOnly` field so
 * the read casing never round-trips through the select (see the enum read/write
 * pitfall in docs/frontend/guidelines.md).
 */
export function useEnumOptions(model: string, field: string): readonly WidgetOption[] {
  const metadata = useModelMetadata(model);
  return React.useMemo<readonly WidgetOption[]>(
    () =>
      (metadata?.fields[field]?.values ?? []).map((value) => ({
        value: value.value.toLowerCase(),
        label: value.label,
      })),
    [metadata, field],
  );
}
