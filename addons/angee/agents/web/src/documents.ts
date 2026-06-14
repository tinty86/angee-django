// Non-CRUD console operations the agents pages invoke. Model CRUD is derived from
// the SDL by the DataPage; only bespoke action mutations are authored here.

import type { ActionOutcome, ByIdVariables } from "@angee/sdk";

export const REFRESH_PROVIDER_MODELS_MUTATION = `
  mutation RefreshProviderModels($id: ID!) {
    refreshProviderModels(id: $id) {
      ok
      message
    }
  }
`;

/** `{ ok, message }` action outcome — the shared SDK contract. */
export type ActionResultData = ActionOutcome;

export interface RefreshProviderModelsData {
  refreshProviderModels: ActionResultData;
}

/** Single-id action variables — the shared SDK contract. */
export type IdVariables = ByIdVariables;
