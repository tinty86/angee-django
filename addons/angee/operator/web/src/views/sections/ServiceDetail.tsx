import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Code,
  EmptyState,
  LoadingPanel,
  LogStream,
  MetaGrid,
  RecordHeader,
  TextLink,
} from "@angee/base";
import { useMemo, useState, type ReactElement } from "react";
import { useParams } from "@tanstack/react-router";
import { useQuery } from "urql";

import {
  SERVICE_ENDPOINT_QUERY,
  SERVICE_LOGS_QUERY,
  SERVICE_LOGS_SUBSCRIPTION,
} from "../../data/documents";
import { useOperatorT } from "../../i18n";
import { useOperatorSnapshot, useOperatorSubscription } from "../../data/transport";
import { StateTag } from "../parts/StateTag";
import { ServiceActions, useServiceActions } from "./service-actions";

const HISTORY_LIMIT = 500;
const MAX_LIVE_LINES = 2000;

interface ServiceEndpointData {
  serviceEndpoint: {
    routed: boolean;
    url: string;
    internalHost: string;
    internalPort: number;
  } | null;
}

/**
 * The service's log buffer (one-shot history query) followed by the live tail
 * (v0.6 streams `onServiceLogs` line-by-line). The subscription's `onData`
 * accumulates each emission, so no line is dropped between renders.
 */
function useServiceLogs(name: string | undefined): readonly string[] {
  const [history] = useQuery<{ serviceLogs: string }>({
    query: SERVICE_LOGS_QUERY,
    variables: { name: name ?? "", limit: HISTORY_LIMIT },
    pause: !name,
  });
  const [live, setLive] = useState<readonly string[]>([]);
  useOperatorSubscription<{ onServiceLogs: string }, { name: string }>(
    SERVICE_LOGS_SUBSCRIPTION,
    { name: name ?? "" },
    {
      enabled: Boolean(name),
      onData: (value) => {
        const line = value.onServiceLogs;
        if (line == null) return;
        setLive((prev) => {
          const next = [...prev, line];
          return next.length > MAX_LIVE_LINES ? next.slice(-MAX_LIVE_LINES) : next;
        });
      },
    },
  );
  return useMemo(() => {
    const text = history.data?.serviceLogs ?? "";
    const historyLines = text === "" ? [] : text.replace(/\n$/, "").split("\n");
    return [...historyLines, ...live];
  }, [history.data, live]);
}

/** Service detail: state + lifecycle actions + the live log tail. */
export function ServiceDetail(): ReactElement {
  const t = useOperatorT();
  const params = useParams({ strict: false });
  const name = "name" in params && typeof params.name === "string" ? params.name : undefined;
  const { snapshot, result, refetch } = useOperatorSnapshot({ services: true });
  const { actions, busy } = useServiceActions(refetch);
  const [endpoint] = useQuery<ServiceEndpointData>({
    query: SERVICE_ENDPOINT_QUERY,
    variables: { name: name ?? "" },
    pause: !name,
  });
  const logs = useServiceLogs(name);

  const service = (snapshot?.services ?? []).find((candidate) => candidate.name === name) ?? null;
  const resolved = endpoint.data?.serviceEndpoint ?? null;

  if (result.fetching && !snapshot) {
    return <LoadingPanel message={t("operator.services.loading")} />;
  }
  if (!service) {
    return (
      <EmptyState
        fill
        icon="server"
        title={t("operator.services.detail.notFound")}
        description={name}
      />
    );
  }

  return (
    <div className="flex min-h-0 flex-col gap-4 p-4">
      <RecordHeader
        title={service.name}
        meta={
          <>
            <StateTag state={service.status} />
            <span className="text-fg-muted">{service.runtime}</span>
          </>
        }
      />

      <ServiceActions
        actions={actions}
        busy={busy}
        service={service}
        className="flex flex-wrap gap-1"
      />

      <Card>
        <CardHeader>
          <CardTitle>{t("operator.services.detail.overview")}</CardTitle>
        </CardHeader>
        <CardContent>
          <MetaGrid
            rows={[
              [t("operator.services.column.runtime"), service.runtime],
              [t("operator.services.column.status"), <StateTag state={service.status} />],
              [t("operator.services.column.health"), service.health ?? "—"],
              [
                t("operator.services.detail.endpoint"),
                resolved?.url ? (
                  <TextLink href={resolved.url} target="_blank">{resolved.url}</TextLink>
                ) : (
                  "—"
                ),
              ],
              [
                t("operator.services.detail.internal"),
                resolved ? (
                  <Code truncate>{`${resolved.internalHost}:${resolved.internalPort}`}</Code>
                ) : (
                  "—"
                ),
              ],
            ]}
          />
        </CardContent>
      </Card>

      <Card className="flex min-h-0 flex-1 flex-col">
        <CardHeader>
          <CardTitle>{t("operator.services.detail.logs")}</CardTitle>
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col">
          <LogStream
            lines={logs}
            className="min-h-64 flex-1"
            emptyMessage={t("operator.services.detail.logs.empty")}
          />
        </CardContent>
      </Card>
    </div>
  );
}
