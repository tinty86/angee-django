import {
  Alert,
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  LogStream,
} from "@angee/base";
import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "urql";

import { useOperatorT } from "../../i18n";
import { useOperatorSubscription } from "../../data/transport";

const HISTORY_LIMIT = 500;
const MAX_LIVE_LINES = 2000;

export interface DaemonLogStream {
  lines: readonly string[];
  /** The subscription/history error, if the stream failed to connect. */
  error: Error | null;
  /** The subscription is open and receiving. */
  streaming: boolean;
}

/**
 * A daemon log tail: the one-shot history query for first paint, then the live
 * subscription (v0.6 streams these line-by-line). The subscription's `onData`
 * accumulates each emission so none are dropped; its error/connection state is
 * surfaced so an empty pane is never ambiguous (idle service vs failed stream).
 */
export function useDaemonLogStream({
  name,
  historyQuery,
  historyField,
  streamSubscription,
  streamField,
}: {
  name: string | undefined;
  historyQuery: string;
  historyField: string;
  streamSubscription: string;
  streamField: string;
}): DaemonLogStream {
  const [history] = useQuery<Record<string, string | null>>({
    query: historyQuery,
    variables: { name: name ?? "", limit: HISTORY_LIMIT },
    pause: !name,
  });
  const [live, setLive] = useState<readonly string[]>([]);
  const stream = useOperatorSubscription<Record<string, string | null>, { name: string }>(
    streamSubscription,
    { name: name ?? "" },
    {
      enabled: Boolean(name),
      onData: (value) => {
        const line = value[streamField];
        if (line == null) return;
        setLive((prev) => {
          const next = [...prev, line];
          return next.length > MAX_LIVE_LINES ? next.slice(-MAX_LIVE_LINES) : next;
        });
      },
    },
  );

  const lines = useMemo(() => {
    const text = history.data?.[historyField] ?? "";
    const historyLines = text === "" ? [] : text.replace(/\n$/, "").split("\n");
    return [...historyLines, ...live];
  }, [history.data, historyField, live]);

  return {
    lines,
    error: stream.error ?? history.error ?? null,
    streaming: stream.fetching && stream.error == null,
  };
}

/** A titled log card with a connection-status badge and the {@link LogStream} tail. */
export function LogPanel({
  logs,
  title,
}: {
  logs: DaemonLogStream;
  title: ReactNode;
}): ReactNode {
  const t = useOperatorT();
  const status = logs.error
    ? { tone: "danger" as const, label: t("operator.logs.error") }
    : logs.streaming
      ? { tone: "success" as const, label: t("operator.logs.live") }
      : { tone: "neutral" as const, label: t("operator.logs.connecting") };

  return (
    <Card className="flex min-h-0 flex-1 flex-col">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle>{title}</CardTitle>
        <Badge density="compact" shape="pill" tone={status.tone}>
          {status.label}
        </Badge>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-2">
        {logs.error ? <Alert tone="danger">{logs.error.message}</Alert> : null}
        <LogStream
          lines={logs.lines}
          className="min-h-64 flex-1"
          emptyMessage={t("operator.logs.empty")}
        />
      </CardContent>
    </Card>
  );
}
