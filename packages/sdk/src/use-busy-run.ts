import { useCallback, useState } from "react";

export interface BusyRun {
  /** True while a `run(...)` action is in flight. */
  busy: boolean;
  /** Run an async action, tracking `busy` and firing `onChanged` on success. */
  run: <T>(action: () => Promise<T>) => Promise<T>;
}

/**
 * Wrap async write verbs so a surface gets one `busy` flag plus a post-success
 * `onChanged` callback (e.g. to refetch). One owner for the
 * `setBusy(true)/await/onChanged/finally setBusy(false)` shape that addon action
 * hooks would otherwise each re-spell.
 */
export function useBusyRun(onChanged?: () => void): BusyRun {
  const [busy, setBusy] = useState(false);
  const run = useCallback(
    async <T>(action: () => Promise<T>): Promise<T> => {
      setBusy(true);
      try {
        const result = await action();
        onChanged?.();
        return result;
      } finally {
        setBusy(false);
      }
    },
    [onChanged],
  );
  return { busy, run };
}
