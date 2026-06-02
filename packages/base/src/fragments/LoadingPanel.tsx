import * as React from "react";

import { Card } from "../ui/card";
import { Spinner } from "../ui/spinner";

export interface LoadingPanelProps {
  message?: string;
}

export function LoadingPanel({ message }: LoadingPanelProps): React.ReactElement {
  const label = message ?? "Loading";

  return (
    <div className="grid h-full place-content-center p-8">
      <Card
        aria-live="polite"
        className="w-72 px-6 py-5 shadow-none"
        role="status"
      >
        <div className="flex items-center gap-3">
          <Spinner size="md" tone="brand" />
          <span className="text-13 font-medium text-fg">{label}</span>
        </div>
        <div className="mt-4 grid gap-2" aria-hidden="true">
          <span className="h-3 w-32 animate-pulse rounded bg-inset" />
          <span className="h-3 w-full animate-pulse rounded bg-inset" />
          <span className="h-3 w-5/6 animate-pulse rounded bg-inset" />
        </div>
      </Card>
    </div>
  );
}

