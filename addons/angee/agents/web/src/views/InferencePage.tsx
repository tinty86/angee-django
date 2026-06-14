import * as React from "react";
import { Action, type ActionContext, Column, DataPage, Field, Form, Group, List } from "@angee/base";
import { useAuthoredMutation } from "@angee/sdk";

import {
  REFRESH_PROVIDER_MODELS_MUTATION,
  type IdVariables,
  type RefreshProviderModelsData,
} from "../documents";
import { useEnumOptions } from "../enum-options";

const PROVIDER_MODEL = "agents.InferenceProvider";
const MODEL_MODEL = "agents.InferenceModel";

export function InferenceProvidersPage(): React.ReactElement {
  const [refreshProviderModels] = useAuthoredMutation<RefreshProviderModelsData, IdVariables>(
    REFRESH_PROVIDER_MODELS_MUTATION,
  );

  const refreshModels = React.useCallback(
    async (ctx: ActionContext) => {
      if (typeof ctx.record?.id !== "string") return;
      const result = await refreshProviderModels({ id: ctx.record.id });
      ctx.refresh();
      const outcome = result?.refreshProviderModels;
      // A business failure returns ok:false (not a thrown error); surface it as an
      // error toast rather than a green success.
      if (outcome && !outcome.ok) throw new Error(outcome.message);
      return outcome?.message;
    },
    [refreshProviderModels],
  );

  const backendClassOptions = useEnumOptions(PROVIDER_MODEL, "backendClass");

  return (
    <DataPage model={PROVIDER_MODEL} placement="inline" routed>
      <List model={PROVIDER_MODEL} pageSize={50}>
        <Column field="name" />
        <Column field="backendClass" />
        <Column field="status" widget="statusBadge" />
      </List>
      <Form model={PROVIDER_MODEL}>
        <Field name="name" title />
        <Field name="integration" createOnly />
        <Group label="Backend" columns={2}>
          <Field name="backendClass" widget="select" options={backendClassOptions} createOnly />
          <Field name="baseUrl" />
        </Group>
        <Field name="status" widget="statusbar" />
        <Field name="config" widget="json" />
        <Action id="refresh-models" label="Refresh models" icon="refresh" run={refreshModels} />
      </Form>
    </DataPage>
  );
}

export function InferenceModelsPage(): React.ReactElement {
  const modelUseOptions = useEnumOptions(MODEL_MODEL, "modelUse");

  return (
    <DataPage model={MODEL_MODEL} placement="inline" routed>
      <List model={MODEL_MODEL} pageSize={50}>
        <Column field="name" />
        <Column field="displayName" />
        <Column field="modelUse" />
        <Column field="status" widget="statusBadge" />
      </List>
      <Form model={MODEL_MODEL}>
        <Field name="name" title />
        <Field name="displayName" />
        <Group label="Catalogue" columns={2}>
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
