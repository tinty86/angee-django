// Non-CRUD console operations the agents pages invoke. Model CRUD is derived from
// the SDL by the DataPage; only bespoke action mutations are authored here.

export const REFRESH_PROVIDER_MODELS_MUTATION = `
  mutation RefreshProviderModels($id: ID!) {
    refreshProviderModels(id: $id) {
      ok
      message
    }
  }
`;

export interface ActionResultData {
  ok: boolean;
  message: string;
}

export interface RefreshProviderModelsData {
  refreshProviderModels: ActionResultData;
}

// Re-discover a skill source's skills — the integrate `refreshSource` action,
// invoked from the agents Skills → Sources tab.
export const REFRESH_SOURCE_MUTATION = `
  mutation AgentsRefreshSource($id: ID!) {
    refreshSource(id: $id) {
      ok
      message
    }
  }
`;

export interface RefreshSourceData {
  refreshSource: ActionResultData;
}

export interface IdVariables extends Record<string, unknown> {
  id: string;
}
