// Bespoke action mutations for the integrate console. Model CRUD is model-driven
// (DataPage reads the SDL); these are the non-CRUD operations a DataPage `<Action>`
// invokes, typed the same way as other authored ops (e.g. iam's grant/revoke).

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

export interface ActionResultData {
  ok: boolean;
  message: string;
}

export interface SyncIntegrationData {
  syncIntegration: ActionResultData;
}

export interface TestConnectionData {
  testConnection: ActionResultData;
}

export interface IdVariables extends Record<string, unknown> {
  id: string;
}

export const TEST_WEBHOOK_DELIVERY_MUTATION = `
  mutation TestWebhookDelivery($id: ID!) {
    testWebhookDelivery(id: $id) { ok message }
  }
`;

export const ROTATE_WEBHOOK_SECRET_MUTATION = `
  mutation RotateWebhookSecret($id: ID!) {
    rotateWebhookSecret(id: $id) { ok secret }
  }
`;

export interface TestWebhookDeliveryData {
  testWebhookDelivery: ActionResultData;
}

export interface RotateWebhookSecretData {
  rotateWebhookSecret: { ok: boolean; secret: string };
}
