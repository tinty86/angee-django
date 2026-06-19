import * as React from "react";
import {
  Action,
  type ActionContext,
  Column,
  DataPage,
  Field,
  Form,
  Group,
  GroupListView,
  List,
  useEnumOptions,
  type DataToolbarFilterOption,
  type DataToolbarGroupOption,
} from "@angee/base";
import { useActionMutation, useResourceList } from "@angee/sdk";
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

  return (
    <DataPage model={PROVIDER_MODEL} placement="inline" routed>
      <List model={PROVIDER_MODEL}>
        <Column field="name" />
        <Column field="integration.implLabel" header="Implementation" />
        <Column field="integration.status" header="Status" widget="statusBadge" />
      </List>
      <Form model={PROVIDER_MODEL}>
        <Field name="name" title />
        <Field name="integration" createOnly />
        <Group label={t("agents.inference.backend")} columns={2}>
          <Field name="baseUrl" />
        </Group>
        <Field name="config" widget="json" />
        <Action id="refresh-models" label={t("agents.inference.refreshModels")} icon="refresh" run={refreshModels} />
      </Form>
    </DataPage>
  );
}

export function InferenceModelsPage(): React.ReactElement {
  const t = useAgentsT();
  const modelUseOptions = useEnumOptions(MODEL_MODEL, "modelUse");
  const providers = useResourceList(PROVIDER_MODEL, {
    fields: ["id", "name"],
    pageSize: 100,
  });
  const providerFilters = React.useMemo<readonly DataToolbarFilterOption[]>(
    () =>
      providers.rows
        .flatMap((provider) => {
          const id = typeof provider.id === "string" ? provider.id : "";
          const name = typeof provider.name === "string" ? provider.name : "";
          if (!id || !name) return [];
          return [{
            id: `provider:${id}`,
            label: name,
            chipLabel: name,
            filter: { providerId: { exact: id } },
          }];
        })
        .sort((left, right) => String(left.label).localeCompare(String(right.label))),
    [providers.rows],
  );
  const groupOptions = React.useMemo<readonly DataToolbarGroupOption[]>(
    () => [
      {
        id: "provider.name",
        label: t("agents.inference.provider"),
        group: {
          field: "provider.name",
          aggregateField: "provider",
          aggregateKey: "providerId",
        },
      },
      {
        id: "modelUse",
        label: t("agents.inference.capability"),
        group: { field: "modelUse" },
      },
      {
        id: "status",
        label: t("agents.inference.status"),
        group: { field: "status" },
      },
    ],
    [t],
  );

  return (
    <DataPage model={MODEL_MODEL} placement="inline" routed>
      <List
        model={MODEL_MODEL}
        list={GroupListView}
        filters={providerFilters}
        groupOptions={groupOptions}
        defaultGroups={{
          list: { field: "modelUse" },
          board: {
            field: "provider.name",
            aggregateField: "provider",
            aggregateKey: "providerId",
          },
        }}
      >
        <Column field="name" />
        <Column field="provider.name" header={t("agents.inference.provider")} />
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
