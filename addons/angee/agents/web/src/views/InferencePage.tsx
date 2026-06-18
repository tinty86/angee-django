import * as React from "react";
import { Action, type ActionContext, Column, DataPage, Field, Form, Group, List, useEnumOptions } from "@angee/base";
import { useActionMutation } from "@angee/sdk";
import type { ActionFieldName } from "@angee/gql/console/actions";

import { useAgentsT } from "../i18n";

const PROVIDER_MODEL = "agents.InferenceProvider";
const MODEL_MODEL = "agents.InferenceModel";

export function InferenceProvidersPage(): React.ReactElement {
  const t = useAgentsT();
  const [refreshProviderModels] = useActionMutation<ActionFieldName>("refreshProviderModels");

  const refreshModels = React.useCallback(
    async (ctx: ActionContext) => {
      if (typeof ctx.record?.id !== "string") return;
      const message = await refreshProviderModels(ctx.record.id);
      ctx.refresh();
      return message;
    },
    [refreshProviderModels],
  );

  const backendClassOptions = useEnumOptions(PROVIDER_MODEL, "backendClass");

  return (
    <DataPage model={PROVIDER_MODEL} placement="inline" routed>
      <List model={PROVIDER_MODEL}>
        <Column field="name" />
        <Column field="backendClass" />
        <Column field="status" widget="statusBadge" />
      </List>
      <Form model={PROVIDER_MODEL}>
        <Field name="name" title />
        <Field name="integration" createOnly />
        <Group label={t("agents.inference.backend")} columns={2}>
          <Field name="backendClass" widget="select" options={backendClassOptions} createOnly />
          <Field name="baseUrl" />
        </Group>
        <Field name="status" widget="statusbar" />
        <Field name="config" widget="json" />
        <Action id="refresh-models" label={t("agents.inference.refreshModels")} icon="refresh" run={refreshModels} />
      </Form>
    </DataPage>
  );
}

export function InferenceModelsPage(): React.ReactElement {
  const t = useAgentsT();
  const modelUseOptions = useEnumOptions(MODEL_MODEL, "modelUse");
  return (
    <DataPage model={MODEL_MODEL} placement="inline" routed>
      <List model={MODEL_MODEL}>
        <Column field="name" />
        <Column field="displayName" />
        <Column field="modelUse" />
        <Column field="status" widget="statusBadge" />
      </List>
      <Form model={MODEL_MODEL}>
        <Field name="name" title />
        <Field name="displayName" />
        <Group label={t("agents.inference.catalogue")} columns={2}>
          <Field name="provider" createOnly />
          <Field name="publisher" />
          <Field name="modelUse" widget="select" options={modelUseOptions} createOnly />
          <Field name="status" widget="statusbar" />
          <Field name="isDefault" />
          <Field name="contextWindow" />
          <Field name="maxOutputTokens" />
        </Group>
        <Field name="description" />
        <Field name="capabilities" widget="json" />
        <Field name="config" widget="json" />
      </Form>
    </DataPage>
  );
}
