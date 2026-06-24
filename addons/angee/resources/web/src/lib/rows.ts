import { formatDateTime } from "@angee/base";

import type { ResourceLedgerRowData } from "../documents";

export interface ResourceRow extends Record<string, unknown> {
  id: string;
  sourceAddon: string;
  sourcePath: string;
  tier: string;
  target: string;
  targetId: string;
  hash: string;
  loaded: string;
}

export function resourceRows(
  ledger: readonly ResourceLedgerRowData[],
): ResourceRow[] {
  return ledger.map((row) => ({
    id: row.id,
    sourceAddon: row.source_addon,
    sourcePath: row.source_path,
    tier: row.tier,
    target: row.target_model,
    targetId: row.target_id,
    hash: row.content_hash.slice(0, 12),
    loaded: formatDateTime(row.loaded_at),
  }));
}
