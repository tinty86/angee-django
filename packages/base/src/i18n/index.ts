import { useCallback } from "react";

import {
  translateWithFallback,
  useT,
  type MessageVars,
} from "@angee/sdk";

import { enBaseMessages } from "./en";

export { enBaseBundle, enBaseMessages } from "./en";

export type BaseMessageVars = MessageVars;

// A translator bound to the `base` namespace. Resolves against the host
// runtime's merged i18n first, then falls back to the bundled English strings.
export function useBaseT(): (
  key: string,
  vars?: BaseMessageVars,
) => string {
  const t = useT("base");
  // Stable identity (t is memoized by useT) so consumers can list the translator
  // in a useMemo/useEffect dep array without re-running every render.
  return useCallback(
    (key: string, vars?: BaseMessageVars) =>
      translateWithFallback(t, enBaseMessages, key, vars),
    [t],
  );
}
