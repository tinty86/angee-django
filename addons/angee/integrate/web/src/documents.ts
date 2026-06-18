// Bespoke custom operations for the integrate console. Model CRUD is model-driven
// (DataPage reads the SDL); these are the non-CRUD operations a DataPage needs that
// aren't single-id `{ ok, message }` actions. Single-id action mutations use
// `useActionMutation(field)` at the call site — no document is authored here.

import { graphql, type DocumentType } from "@angee/gql/console";

export const ConnectIntegration = graphql(`
  mutation ConnectIntegration(
    $integrationId: ID!
    $redirectUri: String!
    $next: String!
  ) {
    connectIntegration(
      integrationId: $integrationId
      redirectUri: $redirectUri
      next: $next
    ) {
      attached
      authorizeUrl
      error
      mode
      state
      redirectUri
      integration {
        id
        status
      }
    }
  }
`);

export const RotateWebhookSecret = graphql(`
  mutation RotateWebhookSecret($id: ID!) {
    rotateWebhookSecret(id: $id) { ok secret }
  }
`);

// --- VCS console: bridge picker, repo typeahead, and inventory actions ---
// VcsBridge/Source CRUD and Repository delete stay model-driven (DataPage
// reads the SDL). These are the bespoke reads the VCS views need: the bridge
// picker for the add dialog, the repo search typeahead, and the bulk-discover
// mutation whose variables do not match the single-id ActionResult helper.

/** VCS bridges for the add-repository dialog's bridge picker. */
export const IntegrateVcsBridges = graphql(`
  query IntegrateVcsBridges($pagination: OffsetPaginationInput) {
    vcsIntegrations(pagination: $pagination) {
      results {
        id
        displayName
      }
    }
  }
`);

/** The add typeahead: host repositories matching a typed query, not yet inventoried. */
export const IntegrateSearchRepositories = graphql(`
  query IntegrateSearchRepositories($vcsIntegrationId: ID!, $query: String!) {
    searchRepositories(vcsIntegrationId: $vcsIntegrationId, query: $query) {
      name
      org
      defaultBranch
      visibility
      webUrl
    }
  }
`);

/** Inventory one picked repository; returns the created row. */
export const IntegrateAddRepository = graphql(`
  mutation IntegrateAddRepository($vcsIntegrationId: ID!, $name: String!) {
    addRepository(vcsIntegrationId: $vcsIntegrationId, name: $name) {
      id
      org
      name
    }
  }
`);

/** Bulk-inventory every repository an account exposes. */
export const IntegrateDiscoverRepositories = graphql(`
  mutation IntegrateDiscoverRepositories($vcsIntegrationId: ID!, $org: String!) {
    discoverRepositories(vcsIntegrationId: $vcsIntegrationId, org: $org) { ok message }
  }
`);

/** Selection result for one `vcsIntegrations.results` item (the picker option). */
export type VcsBridgeOption =
  DocumentType<typeof IntegrateVcsBridges>["vcsIntegrations"]["results"][number];

/** One host repository candidate the add typeahead lists (the SDL `RepoCandidate`). */
export type RepoCandidate = DocumentType<
  typeof IntegrateSearchRepositories
>["searchRepositories"][number];
