// Bespoke action mutations for the integrate console. Model CRUD is model-driven
// (DataPage reads the SDL); these are the non-CRUD operations a DataPage `<Action>`
// invokes, typed the same way as other authored ops (e.g. iam's grant/revoke).

import { graphql, type DocumentType } from "@angee/gql/console";
import type { ActionOutcome, ByIdVariables } from "@angee/sdk";

export const SYNC_INTEGRATION_MUTATION = `
  mutation SyncIntegration($id: ID!) {
    syncIntegration(id: $id) { ok message }
  }
`;

export const TEST_CONNECTION_MUTATION = `
  mutation TestConnection($id: ID!) {
    testConnection(id: $id) { ok message }
  }
`;

/** `{ ok, message }` action outcome — the shared SDK contract. */
export type ActionResultData = ActionOutcome;

export interface SyncIntegrationData {
  syncIntegration: ActionResultData;
}

export interface TestConnectionData {
  testConnection: ActionResultData;
}

/** Single-id action variables — the shared SDK contract. */
export type IdVariables = ByIdVariables;

export const TEST_WEBHOOK_DELIVERY_MUTATION = `
  mutation TestWebhookDelivery($id: ID!) {
    testWebhookDelivery(id: $id) { ok message }
  }
`;

export const RotateWebhookSecret = graphql(`
  mutation RotateWebhookSecret($id: ID!) {
    rotateWebhookSecret(id: $id) { ok secret }
  }
`);

export interface TestWebhookDeliveryData {
  testWebhookDelivery: ActionResultData;
}

// --- VCS console: integration picker, repo typeahead, and inventory actions --
// VCSIntegration/Source CRUD and Repository delete stay model-driven (DataPage
// reads the SDL). These are the bespoke reads the VCS views need — the
// integration picker for the add dialog and the repo search typeahead — plus the
// non-CRUD action mutations a button invokes.

/** VCS integrations for the add-repository dialog's integration picker. */
export const IntegrateVcsIntegrations = graphql(`
  query IntegrateVcsIntegrations($pagination: OffsetPaginationInput) {
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

/** Refresh every repository's sources for one VCS integration. */
export const SYNC_VCS_INTEGRATION_MUTATION = `
  mutation IntegrateSyncVcsIntegration($id: ID!) {
    syncVcsIntegration(id: $id) { ok message }
  }
`;

/** Re-read one source's ref+path from its repository. */
export const REFRESH_SOURCE_MUTATION = `
  mutation IntegrateRefreshSource($id: ID!) {
    refreshSource(id: $id) { ok message }
  }
`;

/** Selection result for `IntegrateSyncVcsIntegration`. */
export interface SyncVcsIntegrationData {
  syncVcsIntegration: ActionResultData;
}

/** Selection result for `IntegrateRefreshSource`. */
export interface RefreshSourceData {
  refreshSource: ActionResultData;
}

/** One host repository candidate the add typeahead lists (the SDL `RepoCandidate`). */
export type RepoCandidate = DocumentType<
  typeof IntegrateSearchRepositories
>["searchRepositories"][number];
