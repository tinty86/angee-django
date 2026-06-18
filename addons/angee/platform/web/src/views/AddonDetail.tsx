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

import { PlatformExplorer } from "../documents";
import {
  addonDetailPath,
  fieldsPath,
  modelDetailPath,
  modelsPath,
} from "../lib/paths";
import { LinkedChips, useRouteNavigate } from "../lib/cells";

const shortName = (dep: string): string => dep.split(".").pop() ?? dep;

export function AddonDetail(): ReactElement {
  const params = useParams({ strict: false });
  const id = "id" in params && typeof params.id === "string" ? params.id : undefined;
  const query = useAuthoredQuery(PlatformExplorer);
  const addons = query.data?.platformExplorer?.addons ?? [];
  const addon = useMemo(() => addons.find((a) => a.id === id), [addons, id]);
  const ids = useMemo(() => new Set(addons.map((a) => a.id)), [addons]);
  const dependsOn = useMemo(
    () => (addon?.dependsOn ?? []).filter((dep) => ids.has(dep)).sort(),
    [addon, ids],
  );
  const dependedBy = useMemo(
    () => addons.filter((a) => a.dependsOn.includes(id ?? "")).map((a) => a.id).sort(),
    [addons, id],
  );
  const modelLabels = useMemo(
    () => [...new Set(addon?.modelLabels ?? [])].sort(),
    [addon],
  );
  const go = useRouteNavigate();

  if (query.fetching && !addon) return <LoadingPanel message="Loading addon…" />;
  if (!addon) {
    return <EmptyState fill icon="list" title="Addon not found" description={id} />;
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <RecordHeader
        title={addon.label}
        meta={
          <>
            <Code tone="muted">{addon.id}</Code>
            <Badge tone="neutral">{addon.namespace}</Badge>
            <Badge tone={addon.kind === "required" ? "info" : "neutral"}>{addon.kind}</Badge>
          </>
        }
      />

      <MetricStrip
        metrics={[
          {
            label: "Models",
            value: addon.modelCount,
            icon: "grid",
            href: addon.modelCount ? modelsPath({ addon: addon.id }) : undefined,
            onNavigate: go,
          },
          {
            label: "Fields",
            value: addon.fieldCount,
            icon: "columns",
            href: addon.fieldCount ? fieldsPath({ addon: addon.id }) : undefined,
            onNavigate: go,
          },
          { label: "Resources", value: addon.resourceCount, icon: "files" },
        ]}
      />

      <Card>
        <CardHeader><CardTitle>Dependencies</CardTitle></CardHeader>
        <CardContent>
          <MetaGrid
            rows={[
              ["Depends on", <LinkedChips items={dependsOn} href={addonDetailPath} format={shortName} />],
              ["Depended by", <LinkedChips items={dependedBy} href={addonDetailPath} format={shortName} />],
            ]}
          />
        </CardContent>
      </Card>

      {modelLabels.length ? (
        <Card>
          <CardHeader><CardTitle>{`Models (${modelLabels.length})`}</CardTitle></CardHeader>
          <CardContent>
            <LinkedChips items={modelLabels} href={modelDetailPath} />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
