import { useCallback, useMemo, type ReactNode } from "react";

import { type UserPreferences, useAuth } from "./auth";
import { useUpdatePreferences } from "./auth-hooks";
import { makeContext } from "./make-context";

export interface UserPreferencesState {
  preferences: UserPreferences;
  setPreferences: (preferences: UserPreferences) => Promise<void>;
}

const EMPTY_PREFERENCES: UserPreferences = {};

const DEFAULT_STATE: UserPreferencesState = {
  preferences: EMPTY_PREFERENCES,
  setPreferences: async () => undefined,
};

const UserPreferencesContext =
  makeContext<UserPreferencesState>("UserPreferencesProvider");

/**
 * Provide the current user's private preference object. Isolated stories/tests
 * can omit the provider and get an inert empty preference store.
 */
export function UserPreferencesProvider({
  children,
}: {
  children: ReactNode;
}): ReactNode {
  const { user } = useAuth();
  const { updatePreferences } = useUpdatePreferences();
  const preferences = user?.preferences ?? EMPTY_PREFERENCES;
  const setPreferences = useCallback(
    async (next: UserPreferences): Promise<void> => {
      if (!user) return;
      await updatePreferences(next);
    },
    [updatePreferences, user],
  );
  const value = useMemo<UserPreferencesState>(
    () => ({ preferences, setPreferences }),
    [preferences, setPreferences],
  );
  return UserPreferencesContext.Provider({ value, children });
}

/** Current user preferences, or an inert empty preference store when unprovided. */
export function useUserPreferences(): UserPreferencesState {
  return UserPreferencesContext.useMaybe() ?? DEFAULT_STATE;
}
