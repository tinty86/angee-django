import * as React from "react";
import {
  Action,
  Column,
  DataPage,
  Field,
  Form,
  List,
  type ActionContext,
} from "@angee/base";
import { runActionResult, useActionMutation, useAuthoredMutation } from "@angee/sdk";
import type { ActionFieldName } from "@angee/gql/console/actions";

import { useIntegrateT } from "../i18n";
import { IntegrateDiscoverRepositories } from "../documents";

const MODEL = "integrate.VcsBridge";

/**
 * VCS bridges: related rows that bind an existing `Integration` to repository
 * discovery and source sync.
 */
export function VcsBridgesPage(): React.ReactElement {
  const t = useIntegrateT();
  const [syncVcs] = useActionMutation<ActionFieldName>("syncVcsIntegration");
  const [discover] = useAuthoredMutation(IntegrateDiscoverRepositories);

  const sync = React.useCallback(
    async (ctx: ActionContext) => {
      if (typeof ctx.record?.id !== "string") return;
      const message = await syncVcs(ctx.record.id);
      ctx.refresh();
      return message;
    },
    [syncVcs],
  );
  const discoverAll = React.useCallback(
    async (ctx: ActionContext) => {
      if (typeof ctx.record?.id !== "string") return;
      const result = await discover({ vcsIntegrationId: ctx.record.id, org: "" });
      ctx.refresh();
      return runActionResult(result?.discoverRepositories);
    },
    [discover],
  );

  return (
    <DataPage model={MODEL} placement="inline" routed>
      <List model={MODEL}>
        <Column field="displayName" />
        <Column
          field="integration.implLabel"
          header={t("integrate.integrations.implClass")}
        />
        <Column
          field="integration.status"
          header={t("integrate.col.status")}
          widget="statusBadge"
        />
        <Column field="lastSyncCompletedAt" />
      </List>
      <Form model={MODEL}>
        {/* The implementation lives on the owning Integration. */}
        <Field name="integration" createOnly />
        <Field name="lastSyncStatus" readOnly />
        {/* Write-only signing secret — set on create, never read back. */}
        <Field name="webhookSecret" widget="text" kind="string" createOnly />
        <Action id="sync" label={t("integrate.action.syncNow")} icon="refresh" run={sync} />
        <Action id="discover" label={t("integrate.vcs.discover")} run={discoverAll} />
      </Form>
    </DataPage>
  );
}
