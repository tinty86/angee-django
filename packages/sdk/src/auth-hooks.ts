import { useCallback, useMemo } from "react";

import {
  currentUserToAuthState,
  parseCurrentUser,
  type AuthState,
  type CurrentUserPayload,
  type UserPreferences,
} from "./auth";
import { useDocumentMutation } from "./document-mutation";
import { useDocumentQuery } from "./document-query";
import { useResetClient } from "./graphql-provider";

const USER_SELECTION = "id username firstName lastName email isStaff isActive preferences";

/** Read the signed-in user; a client reset (login/logout) keeps it current. */
export const CURRENT_USER_DOCUMENT = `query angeeCurrentUser { currentUser { ${USER_SELECTION} } }`;

/** Exchange a username/password for a session. */
export const LOGIN_DOCUMENT =
  `mutation angeeLogin($username: String!, $password: String!) { ` +
  `login(username: $username, password: $password) { ok user { ${USER_SELECTION} } } }`;

/** End the current session; the verb resolves to a boolean. */
export const LOGOUT_DOCUMENT = "mutation angeeLogout { logout }";

/** Replace the current user's private preference object. */
export const UPDATE_PREFERENCES_DOCUMENT =
  `mutation angeeUpdatePreferences($preferences: JSON!) { ` +
  `updatePreferences(preferences: $preferences) { ${USER_SELECTION} } }`;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Resolve the current auth state from `currentUser`, refetched on reset. */
export function useRuntimeAuthState(): {
  auth: AuthState;
  fetching: boolean;
  error: Error | null;
} {
  const run = useDocumentQuery(CURRENT_USER_DOCUMENT, {}, true);
  const auth = useMemo(() => {
    const value = isRecord(run.data) ? run.data.currentUser : null;
    return currentUserToAuthState(parseCurrentUser(value));
  }, [run.data]);
  return { auth, fetching: run.fetching, error: run.error };
}

export interface LoginCredentials {
  username: string;
  password: string;
}

export interface LoginResult {
  ok: boolean;
  user?: CurrentUserPayload | null;
}

/**
 * Sign in with a password. On success the client pool resets, dropping any
 * cache built while anonymous and refetching `currentUser` as the new actor.
 */
export function useLoginWithPassword(): {
  login: (credentials: LoginCredentials) => Promise<LoginResult>;
  fetching: boolean;
  error: Error | null;
} {
  const { execute, fetching, error } = useDocumentMutation<
    { login: LoginResult },
    LoginCredentials
  >(LOGIN_DOCUMENT);
  const reset = useResetClient();
  const login = useCallback(
    async (credentials: LoginCredentials): Promise<LoginResult> => {
      const data = await execute(credentials);
      const payload = data?.login ?? { ok: false };
      if (payload.ok) reset();
      return payload;
    },
    [execute, reset],
  );
  return { login, fetching, error };
}

/** Sign out. On success the client pool resets, discarding the actor's cache. */
export function useLogout(): {
  logout: () => Promise<boolean>;
  fetching: boolean;
  error: Error | null;
} {
  const { execute, fetching, error } = useDocumentMutation<{ logout: boolean }>(
    LOGOUT_DOCUMENT,
  );
  const reset = useResetClient();
  const logout = useCallback(async (): Promise<boolean> => {
    const data = await execute({});
    const ok = Boolean(data?.logout);
    if (ok) reset();
    return ok;
  }, [execute, reset]);
  return { logout, fetching, error };
}

/** Replace the signed-in user's private preference object and refresh auth state. */
export function useUpdatePreferences(): {
  updatePreferences: (preferences: UserPreferences) => Promise<CurrentUserPayload | null>;
  fetching: boolean;
  error: Error | null;
} {
  const { execute, fetching, error } = useDocumentMutation<
    { updatePreferences: CurrentUserPayload | null },
    { preferences: UserPreferences }
  >(UPDATE_PREFERENCES_DOCUMENT);
  const reset = useResetClient();
  const updatePreferences = useCallback(
    async (preferences: UserPreferences): Promise<CurrentUserPayload | null> => {
      const data = await execute({ preferences });
      reset();
      return data?.updatePreferences ?? null;
    },
    [execute, reset],
  );
  return { updatePreferences, fetching, error };
}
