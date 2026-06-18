// Hand-authored console query for the resource import ledger. The resources
// backend owns the schema (`addons/angee/resources/schema.py`); this document
// mirrors it, the same no-codegen pattern IAM uses.

import { graphql, type DocumentType } from "@angee/gql/console";

export const ResourceLedger = graphql(`
  query ResourceLedger {
    resourceLedger {
      id
      sourceAddon
      sourcePath
      tier
      contentHash
      targetModel
      targetId
      loadedAt
    }
  }
`);

/** One ledger row, derived from the `ResourceLedger` query result. */
export type ResourceLedgerRowData =
  DocumentType<typeof ResourceLedger>["resourceLedger"][number];
