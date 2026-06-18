// Public-schema operations for the unauthenticated login surface: the available
// SSO connections and the OAuth login start/complete handshake. These root fields
// live in the `public` runtime schema, so this file is globbed against it by the
// per-schema codegen (the `documents.public.ts` filename is load-bearing — see
// `codegen.shared.ts`). Console/admin operations stay in `./documents`.

import { graphql, type DocumentType } from "@angee/gql/public";

export const IamAvailableConnections = graphql(`
  query IamAvailableConnections {
    availableConnections {
      results {
        oauthClientSqid
        oauthClientDisplayName
        oauthClientSlug
        oauthClientIcon
        isOidc
      }
    }
  }
`);

/** One `availableConnections.results` item — a sign-in provider button. */
export type AvailableConnection =
  DocumentType<typeof IamAvailableConnections>["availableConnections"]["results"][number];

export const IamLoginStart = graphql(`
  mutation IamLoginStart(
    $oauthClientSqid: String!
    $redirectUri: String!
    $next: String!
  ) {
    loginStart(
      oauthClientSqid: $oauthClientSqid
      redirectUri: $redirectUri
      next: $next
    ) {
      authorizeUrl
      error
    }
  }
`);

export const IamLoginComplete = graphql(`
  mutation IamLoginComplete(
    $code: String!
    $state: String!
    $redirectUri: String!
  ) {
    loginComplete(code: $code, state: $state, redirectUri: $redirectUri) {
      ok
      next
      error
    }
  }
`);
