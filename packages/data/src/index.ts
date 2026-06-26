// @angee/data — a dissolving shell. Its modules now live with their owners:
// the metadata-driven data hooks moved to `@angee/ui` (their consumer, which
// already depends on `@angee/refine` + `@angee/resources`); the auth provider
// and the i18n provider moved to `@angee/refine` (they need only the Hasura
// dialect + rented libs). This barrel re-exports the same public surface from
// those owners — importing the moved modules through their narrow subpaths, not
// the `@angee/ui` index barrel, so a `@angee/data` import does not drag the
// rendered view tree back in — so every existing `@angee/data` consumer
// resolves unchanged while callers are retargeted. (Wave C of the Refine
// package split.)
export {
  ANONYMOUS_AUTH,
  CURRENT_USER_DOCUMENT,
  LOGIN_DOCUMENT,
  LOGOUT_DOCUMENT,
  UPDATE_PREFERENCES_DOCUMENT,
  UPDATE_PREFERENCES_MUTATION,
  AuthProvider,
  UserPreferencesProvider,
  createAngeeAuthProvider,
  createAngeeAuthProviderFromRequest,
  currentUserToAuthState,
  parseCurrentUser,
  updatePreferencesRequest,
  useAuth,
  useLoginWithPassword,
  useLogout,
  useRuntimeAuthState,
  useUpdatePreferences,
  useUserPreferences,
  createAngeeI18nProvider,
  interpolateMessage,
  translateAngeeMessage,
  translateWithFallback,
  type AngeeAuthProviderOptions,
  type AuthState,
  type AuthUser,
  type CurrentUserPayload,
  type LoginCredentials,
  type LoginResult,
  type UpdatePreferencesRequest,
  type UseRuntimeAuthStateResult,
  type UseUpdatePreferencesOptions,
  type UseUpdatePreferencesResult,
  type UserPreferences,
  type UserPreferencesState,
  type AngeeI18nProviderOptions,
  type I18nResources,
  type MessageResources,
  type MessageVars,
} from "@angee/refine";
export {
  useAngeeAggregate,
  useActionMutation,
  useAngeeDeletePreview,
  useAngeeFacets,
  useAngeeGroupBy,
  type ActionMutate,
  type UseActionMutationOptions,
  type UseActionMutationState,
  type UseAngeeAggregateResult,
  type UseAngeeDeletePreviewResult,
  type UseAngeeFacetsOptions,
  type UseAngeeFacetsResult,
  type UseAngeeGroupByResult,
} from "@angee/ui/data/hooks";
export {
  useAuthoredMutation,
  useAuthoredQuery,
  type AuthoredMutate,
  type AuthoredMutationOptions,
  type AuthoredOperationOptions,
  type AuthoredQueryOptions,
  type AuthoredQueryResult,
} from "@angee/ui/data/authored-hooks";
export {
  useResourceRevisions,
  type UseResourceRevisionsOptions,
  type UseResourceRevisionsResult,
} from "@angee/ui/data/revisions";
