// Hand-authored console query for the resource import ledger. The resources
// backend owns the schema (`addons/angee/resources/schema.py`); this document
// mirrors it, the same no-codegen pattern IAM uses.

import { graphql, type DocumentType } from "@angee/gql/console";

export const ResourceLedger = graphql(`
  query ResourceLedger {
    resource_ledger {
      id
      source_addon
      source_path
      tier
      content_hash
      target_model
      target_id
      loaded_at
    }
  }
`);

/** One ledger row, derived from the `ResourceLedger` query result. */
export type ResourceLedgerRowData =
  DocumentType<typeof ResourceLedger>["resource_ledger"][number];
