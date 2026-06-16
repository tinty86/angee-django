import * as React from "react";
import {
  OperatorTransportProvider,
  ServiceRow,
  StateTag,
  WorkspaceRow,
  useOperatorSubscription,
  type WorkspaceSourceStatus,
  type WorkspaceStatus,
} from "@angee/operator/runtime";
import { useResourceRecord, type Row } from "@angee/sdk";

import { useAgentsT } from "../i18n";

const AGENT_MODEL = "agents.Agent";

const PROVISION_FIELDS = [
  "id",
  "status",
  "lastError",
  "workspace",
  "service",
  "serviceTemplate.id",
  "workspaceTemplate.path",
] as const;

interface AgentProvisionRecord extends Row {
  status?: string | null;
  lastError?: string | null;
  workspace?: string | null;
  service?: string | null;
  serviceTemplate?: { id?: string | null } | null;
  workspaceTemplate?: { path?: string | null } | null;
}

export type AgentProvisioningPane = "service" | "workspace";

interface NameVariables extends Record<string, unknown> {
  name: string;
}

interface ServiceLogsData {
  onServiceLogs: string;
}

interface WorkspaceStatusData {
  onWorkspaceStatusChange: WorkspaceStatus;
}

const SERVICE_LOGS_SUBSCRIPTION = `
  subscription AgentServiceLogs($name: String!) {
    onServiceLogs(name: $name)
  }
`;

const WORKSPACE_STATUS_SUBSCRIPTION = `
  subscription AgentWorkspaceStatus($name: String!) {
    onWorkspaceStatusChange(name: $name) {
      name
      path
      exists
      state
      error
      innerError
      template
      processComposePort
      ttl
      ttlExpiresAt
      sources {
        slot
        source
        kind
        mode
        branch
        ref
        subpath
        path
        exists
        state
        currentRef
        dirty
        upstream
        ahead
        behind
        pushed
        unpushedReason
        error
      }
    }
  }
`;

/**
 * Service/workspace runtime panel for one agent. The form toolbar owns lifecycle
 * actions; these record tabs report the rendered operator state.
 */
export function AgentProvisioning({
  agentId,
  pane,
}: {
  agentId: string;
  pane: AgentProvisioningPane;
}): React.ReactElement {
  const t = useAgentsT();
  const { record, fetching } = useResourceRecord(AGENT_MODEL, agentId, {
    fields: [...PROVISION_FIELDS],
  });

  const agent = record as AgentProvisionRecord | null;
  const workspace = stringField(agent, "workspace");
  const service = stringField(agent, "service");
  const status = agentStatus(agent);
  const active = isLifecycleActive(status);
  const expectsService = Boolean(agent?.serviceTemplate);
  const missingRenderedInstances =
    status === "RUNNING" && (!workspace || (expectsService && !service));
  const showRuntime = active || Boolean(workspace) || missingRenderedInstances;
  const hasWorkspaceTemplate = Boolean(agent?.workspaceTemplate?.path);

  // No poll: `agents.Agent` declares `changes(Agent, field="agentChanged")`, so the
  // record auto-invalidates live through the relay subscription, and the operator
  // workspace/service state streams in over `onWorkspaceStatusChange`/`onServiceLogs`.

  return (
    <div className="flex flex-col gap-5">
      {!agent ? (
        <p className="text-13 text-fg-muted">
          {fetching
            ? t("agents.provisioning.loading")
            : t("agents.provisioning.saveFirst")}
        </p>
      ) : (
        <>
          {agent.lastError ? (
            <p className="text-13 text-danger-text">{String(agent.lastError)}</p>
          ) : null}
          {showRuntime ? (
            <OperatorTransportProvider>
              <AgentOperatorRuntime
                expectsService={expectsService}
                pane={pane}
                service={service}
                status={status}
                workspace={workspace}
              />
            </OperatorTransportProvider>
          ) : (
            <div className="flex flex-col items-start gap-2">
              <p className="text-13 text-fg-muted">
                {t("agents.provisioning.intro")}
              </p>
              {!hasWorkspaceTemplate ? (
                <p className="text-13 text-fg-muted">
                  {t("agents.provisioning.needsTemplate")}
                </p>
              ) : null}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function AgentOperatorRuntime({
  expectsService,
  pane,
  service,
  status,
  workspace,
}: {
  expectsService: boolean;
  pane: AgentProvisioningPane;
  service: string;
  status: string;
  workspace: string;
}): React.ReactElement {
  const runtime = useProvisionRuntime(workspace, service);

  return pane === "service" ? (
    <ServiceRuntimeView
      error={runtime.error}
      expectsService={expectsService}
      log={runtime.serviceLog}
      service={service}
    />
  ) : (
    <WorkspaceRuntimeView
      error={runtime.error}
      status={runtime.workspaceStatus}
      workspace={workspace}
      lifecycleStatus={status}
    />
  );
}

function WorkspaceRuntimeView({
  error,
  lifecycleStatus,
  status,
  workspace,
}: {
  error: string;
  lifecycleStatus: string;
  status: WorkspaceStatus | null;
  workspace: string;
}): React.ReactElement {
  const t = useAgentsT();
  const sources = status?.sources ?? [];
  const workspaceError = status?.error ?? status?.innerError ?? "";

  return (
    <div className="flex flex-col gap-4">
      {error ? <p className="text-13 text-danger-text">{error}</p> : null}
      {workspace ? (
        <WorkspaceRow
          emptyMessage={t("agents.provisioning.activityWaiting")}
          name={workspace}
        />
      ) : (
        <p className="text-13 text-fg-muted">
          {isLifecycleActive(lifecycleStatus)
            ? t("agents.provisioning.activityWaiting")
            : t("agents.provisioning.none")}
        </p>
      )}
      {workspaceError ? (
        <p className="text-13 text-danger-text">{workspaceError}</p>
      ) : null}
      <SourceStatusTable sources={sources} />
    </div>
  );
}

function ServiceRuntimeView({
  error,
  expectsService,
  log,
  service,
}: {
  error: string;
  expectsService: boolean;
  log: string;
  service: string;
}): React.ReactElement {
  const t = useAgentsT();

  return (
    <div className="flex flex-col gap-4">
      {error ? <p className="text-13 text-danger-text">{error}</p> : null}
      {service ? (
        <ServiceRow
          emptyMessage={t("agents.provisioning.activityWaitingService")}
          name={service}
        />
      ) : (
        <p className="text-13 text-fg-muted">
          {expectsService
            ? t("agents.provisioning.activityWaitingService")
            : t("agents.provisioning.none")}
        </p>
      )}
      <LogPanel
        log={log}
        title={t("agents.provisioning.serviceLogs")}
      />
    </div>
  );
}

function SourceStatusTable({
  sources,
}: {
  sources: readonly WorkspaceSourceStatus[];
}): React.ReactElement {
  const t = useAgentsT();

  if (sources.length === 0) {
    return (
      <div>
        <h4 className="text-13 font-medium text-fg">
          {t("agents.provisioning.workspaceSources")}
        </h4>
        <p className="mt-1 text-13 text-fg-muted">
          {t("agents.provisioning.workspaceSourcesEmpty")}
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-md border border-border-subtle">
      <div className="border-b border-border-subtle px-3 py-2 text-13 font-medium text-fg">
        {t("agents.provisioning.workspaceSources")}
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-13">
          <thead className="bg-inset text-2xs uppercase text-fg-muted">
            <tr>
              <th className="px-3 py-2 font-medium">{t("agents.provisioning.sourceSlot")}</th>
              <th className="px-3 py-2 font-medium">{t("agents.provisioning.sourceState")}</th>
              <th className="px-3 py-2 font-medium">{t("agents.provisioning.sourceBranch")}</th>
              <th className="px-3 py-2 font-medium">{t("agents.provisioning.sourceDrift")}</th>
              <th className="px-3 py-2 font-medium">{t("agents.provisioning.sourcePath")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {sources.map((source) => (
              <tr key={`${source.slot}:${source.source}`}>
                <td className="px-3 py-2">
                  <div className="font-medium text-fg">{source.slot}</div>
                  <div className="text-fg-muted">{source.source}</div>
                </td>
                <td className="px-3 py-2">
                  <StateTag state={source.state} />
                  {source.error ? (
                    <div className="mt-1 text-danger-text">{source.error}</div>
                  ) : null}
                </td>
                <td className="px-3 py-2 text-fg-muted">
                  {source.branch ?? source.ref ?? source.currentRef ?? "—"}
                </td>
                <td className="px-3 py-2 text-fg-muted">{sourceDrift(source, t)}</td>
                <td className="max-w-80 truncate px-3 py-2 font-mono text-fg-muted">
                  {source.path}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LogPanel({
  log,
  title,
}: {
  log: string;
  title: string;
}): React.ReactElement {
  const t = useAgentsT();

  return (
    <div className="rounded-md border border-border-subtle bg-inset">
      <div className="border-b border-border-subtle px-3 py-2 text-13 font-medium text-fg">
        {title}
      </div>
      <pre className="max-h-72 min-h-24 overflow-auto whitespace-pre-wrap px-3 py-2 font-mono text-13 leading-relaxed text-fg-muted">
        {tailLog(log) || t("agents.provisioning.logsWaiting")}
      </pre>
    </div>
  );
}

function useProvisionRuntime(workspace: string, service: string): {
  error: string;
  serviceLog: string;
  workspaceStatus: WorkspaceStatus | null;
} {
  const [serviceLog, setServiceLog] = React.useState("");
  const workspaceVariables = React.useMemo<NameVariables>(
    () => ({ name: workspace }),
    [workspace],
  );
  const serviceVariables = React.useMemo<NameVariables>(
    () => ({ name: service }),
    [service],
  );
  React.useEffect(() => setServiceLog(""), [service]);

  const handleServiceLog = React.useCallback((data: ServiceLogsData) => {
    setServiceLog((current) => mergeLog(current, data.onServiceLogs));
  }, []);

  const workspaceStatusResult = useOperatorSubscription<WorkspaceStatusData, NameVariables>(
    WORKSPACE_STATUS_SUBSCRIPTION,
    workspaceVariables,
    { enabled: Boolean(workspace) },
  );
  const serviceLogs = useOperatorSubscription<ServiceLogsData, NameVariables>(
    SERVICE_LOGS_SUBSCRIPTION,
    serviceVariables,
    { enabled: Boolean(service), onData: handleServiceLog },
  );

  const workspaceStatus = workspaceStatusResult.data?.onWorkspaceStatusChange ?? null;
  const error =
    workspaceStatusResult.error?.message ??
    serviceLogs.error?.message ??
    "";

  return {
    error,
    serviceLog,
    workspaceStatus,
  };
}

function isLifecycleActive(status: string | null | undefined): boolean {
  return ["PROVISIONING", "DEPROVISIONING"].includes((status ?? "").toUpperCase());
}

function agentStatus(record: Row | null): string {
  return stringField(record, "status").toUpperCase();
}

function stringField(record: Row | null, key: string): string {
  const value = record?.[key];
  return typeof value === "string" ? value : "";
}

function mergeLog(current: string, next: string): string {
  if (!next) return current;
  if (!current || next.startsWith(current)) return next;
  if (current.endsWith(next)) return current;
  const separator = current.endsWith("\n") || next.startsWith("\n") ? "" : "\n";
  return `${current}${separator}${next}`;
}

function tailLog(log: string, lines = 120): string {
  return log.split(/\r?\n/).slice(-lines).join("\n").trimEnd();
}

function sourceDrift(
  source: WorkspaceSourceStatus,
  t: (key: string) => string,
): string {
  if (source.error) return source.error;
  if (source.dirty) return t("agents.provisioning.dirty");
  const ahead = source.ahead ?? 0;
  const behind = source.behind ?? 0;
  if (ahead || behind) return `+${ahead} / -${behind}`;
  if (source.pushed === false && source.unpushedReason) return source.unpushedReason;
  return t("agents.provisioning.clean");
}
