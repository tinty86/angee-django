import { Button, Skeleton, useConfirm } from "@angee/base";
import { useState, type ReactNode } from "react";

import {
  SERVICE_DESTROY_MUTATION,
  SERVICE_RESTART_MUTATION,
  SERVICE_START_MUTATION,
  SERVICE_STOP_MUTATION,
} from "../../data/documents";
import { useOperatorT } from "../../i18n";
import { useOperatorAction, useOperatorSnapshot } from "../../data/transport";
import type { ServiceState } from "../../data/types";
import {
  DaemonResourceTable,
  DaemonResourceTableSkeleton,
  type DaemonResourceAction,
} from "../parts/DaemonResourceTable";
import { OperatorSection } from "../parts/OperatorSection";
import { StateTag } from "../parts/StateTag";
import { runDaemonAction, type DaemonActionData } from "../parts/run-action";

interface ServiceActionVars extends Record<string, unknown> {
  name: string;
}
interface ServiceAction {
  field: string;
  label: string;
  variant: "secondary" | "ghost";
  /** Destructive — require a styled confirmation naming the service first. */
  dangerous?: boolean;
  run: (variables: ServiceActionVars) => Promise<DaemonActionData>;
}

export interface ServicesSectionProps {
  /** Restrict the table to these service names; omit to show every service. */
  names?: readonly string[];
  /** Override the pane title (e.g. when embedded for one agent's service). */
  title?: ReactNode;
}

/** Services pane: a daemon service table with lifecycle actions. */
export function ServicesSection({ names, title }: ServicesSectionProps = {}): ReactNode {
  const {
    actionError,
    actions,
    busy,
    result,
    services,
    snapshot,
    t,
  } = useServiceControls(names);

  return (
    <OperatorSection
      title={title === undefined ? t("section.operator.services.title") : title}
      loading={result.fetching && !snapshot}
      error={result.error && !snapshot ? result.error : null}
      loadingMessage={t("operator.services.loading")}
      loadingContent={<DaemonResourceTableSkeleton columnCount={4} actions />}
      actionError={actionError}
    >
      <DaemonResourceTable
        actions={actions}
        actionsLabel={t("operator.table.actions")}
        busy={busy}
        columns={[
          {
            header: t("operator.services.column.name"),
            cell: (service) => <span className="font-medium text-fg">{service.name}</span>,
          },
          {
            header: t("operator.services.column.runtime"),
            cell: (service) => <span className="text-13 text-fg-muted">{service.runtime}</span>,
          },
          {
            header: t("operator.services.column.status"),
            cell: (service) => <StateTag state={service.status} />,
          },
          {
            header: t("operator.services.column.health"),
            cell: (service) => <span className="text-13 text-fg-muted">{service.health ?? "—"}</span>,
          },
        ]}
        emptyMessage={t("operator.services.empty")}
        rowKey={(service) => service.name}
        rows={services}
      />
    </OperatorSection>
  );
}

export interface ServiceRowProps {
  /** The single service name owned by the embedding object. */
  name: string;
  /** Optional empty-state text when the daemon has not rendered the service yet. */
  emptyMessage?: ReactNode;
}

/** Compact single-service row for views that already own the service identity. */
export function ServiceRow({ name, emptyMessage }: ServiceRowProps): ReactNode {
  const {
    actionError,
    actions,
    busy,
    result,
    services,
    snapshot,
    t,
  } = useServiceControls([name]);
  const service = services[0] ?? null;

  return (
    <OperatorSection
      loading={result.fetching && !snapshot}
      error={result.error && !snapshot ? result.error : null}
      loadingMessage={t("operator.services.loading")}
      loadingContent={<ServiceRowSkeleton />}
      actionError={actionError}
    >
      {service ? (
        <ServiceControlRow
          actions={actions}
          busy={busy}
          service={service}
        />
      ) : (
        <p className="border-y border-border-subtle py-3 text-13 text-fg-muted">
          {emptyMessage ?? t("operator.services.empty")}
        </p>
      )}
    </OperatorSection>
  );
}

function useServiceControls(names?: readonly string[]): {
  actionError: string | null;
  actions: readonly DaemonResourceAction<ServiceState>[];
  busy: boolean;
  result: ReturnType<typeof useOperatorSnapshot>["result"];
  services: readonly ServiceState[];
  snapshot: ReturnType<typeof useOperatorSnapshot>["snapshot"];
  t: ReturnType<typeof useOperatorT>;
} {
  const t = useOperatorT();
  const confirm = useConfirm();
  const { snapshot, result, refetch } = useOperatorSnapshot({ services: true });
  const [actionError, setActionError] = useState<string | null>(null);

  const start = useOperatorAction<DaemonActionData, ServiceActionVars>(SERVICE_START_MUTATION);
  const stop = useOperatorAction<DaemonActionData, ServiceActionVars>(SERVICE_STOP_MUTATION);
  const restart = useOperatorAction<DaemonActionData, ServiceActionVars>(SERVICE_RESTART_MUTATION);
  const destroy = useOperatorAction<DaemonActionData, ServiceActionVars>(SERVICE_DESTROY_MUTATION);
  const busy =
    start.result.fetching ||
    stop.result.fetching ||
    restart.result.fetching ||
    destroy.result.fetching;

  const services = (snapshot?.services ?? []).filter(
    (service) => names === undefined || names.includes(service.name),
  );
  const actions: readonly ServiceAction[] = [
    { field: "serviceStart", label: t("operator.services.start"), variant: "secondary", run: start.run },
    { field: "serviceRestart", label: t("operator.services.restart"), variant: "ghost", run: restart.run },
    { field: "serviceStop", label: t("operator.services.stop"), variant: "ghost", run: stop.run },
    {
      field: "serviceDestroy",
      label: t("operator.services.destroy"),
      variant: "ghost",
      dangerous: true,
      run: destroy.run,
    },
  ];

  function handle(action: ServiceAction, service: ServiceState): void {
    void (async () => {
      if (action.dangerous) {
        const ok = await confirm({
          title: t("operator.services.destroy.confirm.title"),
          body: t("operator.services.destroy.confirm.body", { name: service.name }),
          confirm: action.label,
          danger: true,
        });
        if (!ok) return;
      }
      await runDaemonAction({
        run: action.run,
        field: action.field,
        variables: { name: service.name },
        label: action.label,
        setError: setActionError,
        refetch,
      });
    })();
  }

  return {
    actionError,
    actions: actions.map(
      (action): DaemonResourceAction<ServiceState> => ({
        label: action.label,
        variant: action.variant,
        run: (service) => handle(action, service),
      }),
    ),
    busy,
    result,
    services,
    snapshot,
    t,
  };
}

function ServiceControlRow({
  actions,
  busy,
  service,
}: {
  actions: readonly DaemonResourceAction<ServiceState>[];
  busy: boolean;
  service: ServiceState;
}): ReactNode {
  return (
    <div
      className={
        "grid min-w-0 grid-cols-[minmax(0,1fr)_7rem_8rem_max-content] " +
        "items-center gap-6 border-y border-border-subtle py-2 text-13"
      }
    >
      <span className="min-w-0 truncate font-medium text-fg">
        {service.name}
      </span>
      <span className="whitespace-nowrap text-fg-muted">
        {service.runtime}
      </span>
      <span className="whitespace-nowrap">
        <StateTag state={service.status} />
      </span>
      <div className="flex shrink-0 justify-end gap-1 whitespace-nowrap">
        {actions.map((action, index) => (
          <Button
            disabled={busy}
            key={index}
            onClick={() => void action.run(service)}
            size="sm"
            variant={action.variant}
          >
            {action.label}
          </Button>
        ))}
      </div>
    </div>
  );
}

function ServiceRowSkeleton(): ReactNode {
  return (
    <div
      aria-hidden="true"
      className={
        "grid min-w-0 grid-cols-[minmax(0,1fr)_7rem_8rem_max-content] " +
        "items-center gap-6 border-y border-border-subtle py-2"
      }
    >
      <Skeleton shape="text" size="sm" className="h-5" />
      <Skeleton shape="text" size="sm" className="h-5" />
      <Skeleton shape="text" size="sm" className="h-6" />
      <div className="flex shrink-0 justify-end gap-1">
        <Skeleton className="h-btn-sm w-14" />
        <Skeleton className="h-btn-sm w-16" />
        <Skeleton className="h-btn-sm w-14" />
      </div>
    </div>
  );
}
