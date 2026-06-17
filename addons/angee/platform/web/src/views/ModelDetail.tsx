import { useMemo, type ReactElement } from "react";
import { useParams } from "@tanstack/react-router";

import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Code,
  EmptyState,
  LoadingPanel,
  MetaGrid,
  MetricStrip,
  RecordHeader,
} from "@angee/base";
import { useAuthoredQuery } from "@angee/sdk";

import { PLATFORM_EXPLORER_QUERY, type PlatformExplorerResult } from "../documents";
import {
  addonDetailPath,
  fieldsPath,
  graphPath,
  modelDetailPath,
} from "../lib/paths";
import { LinkedChips, RouterLink, useRouteNavigate } from "../lib/cells";

export function ModelDetail(): ReactElement {
  const params = useParams({ strict: false });
  const id = "id" in params && typeof params.id === "string" ? params.id : undefined;
  const query = useAuthoredQuery<PlatformExplorerResult>(PLATFORM_EXPLORER_QUERY);
  const models = query.data?.platformExplorer?.models ?? [];
  const model = useMemo(() => models.find((m) => m.label === id), [models, id]);
  const dependedBy = useMemo(
    () => models.filter((m) => m.dependsOn.includes(id ?? "")).map((m) => m.label).sort(),
    [models, id],
  );
  const go = useRouteNavigate();

  if (query.fetching && !model) return <LoadingPanel message="Loading model…" />;
  if (!model) {
    return <EmptyState fill icon="grid" title="Model not found" description={id} />;
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <RecordHeader
        title={model.modelName}
        meta={
          <>
            <Code tone="muted">{model.label}</Code>
            <RouterLink href={addonDetailPath(model.addonId)}>
              <Badge tone="info">{model.addonLabel}</Badge>
            </RouterLink>
          </>
        }
      />

      <MetricStrip
        metrics={[
          { label: "Fields", value: model.fieldCount, icon: "columns", href: fieldsPath({ model: model.label }), onNavigate: go },
          { label: "Relations", value: model.relationCount, icon: "share" },
          { label: "Addon", value: model.addonLabel, icon: "grid", href: addonDetailPath(model.addonId), onNavigate: go },
          { label: "Graph", value: "Open", icon: "share", href: graphPath(model.label), onNavigate: go },
        ]}
      />

      <Card>
        <CardHeader><CardTitle>Definition</CardTitle></CardHeader>
        <CardContent>
          <MetaGrid
            rows={[
              ["Table", <Code truncate>{model.dbTable}</Code>],
              ["App label", model.appLabel],
              ...(model.resourceType
                ? [["Resource type", <Code truncate>{model.resourceType}</Code>] as const]
                : []),
            ]}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Dependencies</CardTitle></CardHeader>
        <CardContent>
          <MetaGrid
            rows={[
              ["Depends on", <LinkedChips items={model.dependsOn} href={modelDetailPath} />],
              ["Depended by", <LinkedChips items={dependedBy} href={modelDetailPath} />],
            ]}
          />
        </CardContent>
      </Card>
    </div>
  );
}
