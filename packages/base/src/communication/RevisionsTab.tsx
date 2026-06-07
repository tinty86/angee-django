import * as React from "react";
import { useResourceRevisions, type ResourceRevision } from "@angee/sdk";

import { EmptyState } from "../fragments/EmptyState";
import { ErrorBanner } from "../fragments/ErrorBanner";
import { LoadingPanel } from "../fragments/LoadingPanel";
import { TimelineEntry } from "../fragments/TimelineEntry";

export interface RevisionsTabProps {
  model: string;
  recordId: string | null | undefined;
  enabled?: boolean;
}

const REVISION_META_FIELDS = new Set(["id", "createdAt", "comment", "__typename"]);

export function RevisionsTab({
  enabled = true,
  model,
  recordId,
}: RevisionsTabProps): React.ReactElement {
  const activeRecordId = typeof recordId === "string" && recordId !== ""
    ? recordId
    : null;
  const revisions = useResourceRevisions(model, activeRecordId, {
    enabled: enabled && activeRecordId !== null,
  });

  if (!activeRecordId) {
    return (
      <EmptyState
        icon="activity"
        title="No record selected"
        description="Open a record to view revisions."
        className="min-h-48 p-4"
      />
    );
  }
  if (revisions.error) {
    return (
      <ErrorBanner
        title="Revisions unavailable"
        message={revisions.error.message}
      />
    );
  }
  if (revisions.fetching && revisions.revisions.length === 0) {
    return <LoadingPanel message="Loading revisions" />;
  }
  if (revisions.revisions.length === 0) {
    return (
      <EmptyState
        icon="activity"
        title="No revisions yet"
        description="Field changes will appear here."
        className="min-h-48 p-4"
      />
    );
  }

  return (
    <ol className="flex flex-col gap-3">
      {revisions.revisions.map((revision) => (
        <TimelineEntry
          key={revision.id}
          title={revision.comment ?? "Record updated"}
          timestamp={revision.createdAt}
          body={revisionSnapshot(revision)}
        />
      ))}
    </ol>
  );
}

function revisionSnapshot(revision: ResourceRevision): unknown {
  for (const [field, value] of Object.entries(revision)) {
    if (!REVISION_META_FIELDS.has(field) && value != null) return value;
  }
  return "";
}
