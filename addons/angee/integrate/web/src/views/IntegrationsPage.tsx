import * as React from "react";
import {
  Action,
  Column,
  DataPage,
  Field,
  Form,
  Group,
  List,
  type ActionContext,
} from "@angee/base";
import { useActionMutation, type Row } from "@angee/sdk";
import type { ActionFieldName } from "@angee/gql/console/actions";

import { useIntegrateT } from "../i18n";

const MODEL = "integrate.Integration";

const integrationList = (
  <List model={MODEL}>
    <Column field="displayName" />
    <Column field="status" widget="statusBadge" />
    <Column field="lastUsedAt" />
  </List>
);

const isActive = (record: Row): boolean =>
  String(record.status ?? "").toUpperCase() === "ACTIVE";

/** Integrations landing: the first-class integrations, their health, and operations. */
export function IntegrationsPage(): React.ReactElement {
  const t = useIntegrateT();
  const [syncIntegration] = useActionMutation<ActionFieldName>("syncIntegration");
  const [testConnection] = useActionMutation<ActionFieldName>("testConnection");

  const sync = React.useCallback(
    async (ctx: ActionContext) => {
      if (typeof ctx.record?.id !== "string") return;
      const message = await syncIntegration(ctx.record.id);
      ctx.refresh();
      return message;
    },
    [syncIntegration],
  );
  const test = React.useCallback(
    async (ctx: ActionContext) => {
      if (typeof ctx.record?.id !== "string") return;
      return testConnection(ctx.record.id);
    },
    [testConnection],
  );

  return (
    <DataPage model={MODEL} placement="inline" routed>
      {integrationList}
      <Form model={MODEL}>
        <Field name="vendor" />
        <Field name="status" widget="statusbar" />
        <Group label={t("integrate.integrations.authentication")} columns={2}>
          <Field name="credential" />
          <Field name="account" />
          <Field name="owner" />
        </Group>
        <Field name="config" widget="json" />
        <Action id="sync" label={t("integrate.action.syncNow")} icon="refresh" run={sync} />
        <Action id="test" label={t("integrate.integrations.testConnection")} run={test} />
        <Action
          id="disable"
          label={t("integrate.action.disable")}
          danger
          set={{ status: "disabled" }}
          visibleWhen={isActive}
        />
        <Action
          id="activate"
          label={t("integrate.integrations.activate")}
          set={{ status: "active" }}
          visibleWhen={(record: Row) => !isActive(record)}
        />
      </Form>
    </DataPage>
  );
}
