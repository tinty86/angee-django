import * as React from "react";

import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";

export interface SurfacePanelProps {
  title: string;
  summary?: string;
  actions?: React.ReactNode;
  children: React.ReactElement;
}

export function SurfacePanel({
  title,
  summary,
  actions,
  children,
}: SurfacePanelProps): React.ReactElement {
  return (
    <Card asChild className="overflow-hidden shadow-none">
      <section>
        <CardHeader
          className="flex-row items-center justify-between gap-3 border-b border-border-subtle px-4 py-3"
          density="md"
        >
          <div className="min-w-0">
            <CardTitle className="truncate text-15" density="md">
              {title}
            </CardTitle>
          </div>
          {summary || actions ? (
            <div className="flex shrink-0 items-center gap-2">
              {summary ? (
                <span className="text-2xs text-fg-muted">{summary}</span>
              ) : null}
              {actions}
            </div>
          ) : null}
        </CardHeader>
        <CardContent className="p-0" density="md">
          {children}
        </CardContent>
      </section>
    </Card>
  );
}

