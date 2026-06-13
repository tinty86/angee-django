import {
  useMemo,
  useState,
  type FormEvent,
  type ReactElement,
  type ReactNode,
} from "react";

import {
  Alert,
  Badge,
  Button,
  FormView,
  Glyph,
  RowsListView,
  useToast,
} from "@angee/base";
import {
  useResourceList,
  useResourceMutation,
  type Row,
} from "@angee/sdk";

import type {
  IAMExternalAccountSummary,
  IAMOAuthClient,
} from "../documents";
import { userLabel } from "../identity-labels";
import { IAM_LIST_LIMIT } from "../list-config";
import {
  ExternalAccountDialog,
  ResourceFormDialog,
  emptyExternalAccountForm,
  externalAccountFormFromAccount,
  providerDefaultValues,
  providerFormGroups,
  type ExternalAccountFormState,
} from "./ConnectionDialogs";
import {
  externalAccountColumns,
  oauthClientColumns,
} from "./ConnectionListColumns";
import { ConnectionSummary } from "./ConnectionSummary";

const OAUTH_CLIENT_MODEL = "OAuthClient";
const EXTERNAL_ACCOUNT_MODEL = "ExternalAccount";
const USER_MODEL = "User";

const USER_OPTION_FIELDS = ["username", "email"] as const;
const OAUTH_CLIENT_FIELDS = [
  "displayName",
  "slug",
  "icon",
  "environment",
  "clientId",
  "clientSecret",
  "issuer",
  "authorizeEndpoint",
  "tokenEndpoint",
  "revokeEndpoint",
  "userinfoEndpoint",
  "jwksUri",
  "discoveryUrl",
  "isOidc",
  "isEnabled",
  "configurationState",
  "supportsRefresh",
  "refreshRotates",
  "supportsPkce",
  "maxRefreshAgeSeconds",
  "linkOnEmailMatch",
  "createOnLogin",
  "scopesCatalogue",
  "defaultScopes",
  "allowedEmailDomains",
] as const;
const EXTERNAL_ACCOUNT_FIELDS = [
  "externalId",
  "email",
  "displayName",
  "avatarUrl",
  "status",
  "credentialStatus",
  "lastUsedAt",
  "providerSlug",
  "providerLabel",
  "providerIcon",
] as const;

type DialogKind = "provider" | "account" | null;

interface UserOptionRow extends Row {
  id: string;
  username: string;
  email: string;
}

export function ConnectionsPage(): ReactElement {
  const toast = useToast();
  const users = useResourceList(USER_MODEL, {
    fields: USER_OPTION_FIELDS,
    pageSize: IAM_LIST_LIMIT,
  });
  const oauthClients = useResourceList(OAUTH_CLIENT_MODEL, {
    fields: OAUTH_CLIENT_FIELDS,
    pageSize: IAM_LIST_LIMIT,
  });
  const externalAccounts = useResourceList(EXTERNAL_ACCOUNT_MODEL, {
    fields: EXTERNAL_ACCOUNT_FIELDS,
    pageSize: IAM_LIST_LIMIT,
  });
  const [createExternalAccount, createAccountState] = useResourceMutation(
    EXTERNAL_ACCOUNT_MODEL,
    "create",
    { fields: EXTERNAL_ACCOUNT_FIELDS },
  );
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [providerId, setProviderId] = useState<string | null>(null);
  const [accountForm, setAccountForm] = useState<ExternalAccountFormState>(() =>
    emptyExternalAccountForm(""),
  );
  const [actionError, setActionError] = useState<string | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);

  const oauthClientOptions = useMemo(
    () =>
      (oauthClients.rows as unknown as readonly IAMOAuthClient[]).map(
        (client) => ({
          value: client.id,
          label: client.displayName || client.slug,
        }),
      ),
    [oauthClients.rows],
  );
  const userOptions = useMemo(
    () =>
      (users.rows as unknown as readonly UserOptionRow[]).map((user) => ({
        value: String(user.id),
        label: userLabel(user),
      })),
    [users.rows],
  );
  const firstOauthClientId = oauthClientOptions[0]?.value ?? "";
  const providerGroups = useMemo(() => providerFormGroups(), []);
  const providerDefaults = useMemo(() => providerDefaultValues(), []);

  function refetchConnections(): void {
    oauthClients.refetch();
    externalAccounts.refetch();
    setRefreshVersion((current) => current + 1);
  }

  function closeDialog(): void {
    setDialog(null);
    setActionError(null);
  }

  function openProvider(client?: { id: string }): void {
    setProviderId(client?.id ?? null);
    setDialog("provider");
  }

  function openExternalAccount(account?: IAMExternalAccountSummary): void {
    setAccountForm(
      account
        ? // Edit: resolve the exact originating client by its unique (slug,
          // environment) key. On a miss leave it empty so the user must pick
          // explicitly — never silently re-point the account at another client.
          externalAccountFormFromAccount(account, clientIdForAccount(account))
        : emptyExternalAccountForm(firstOauthClientId),
    );
    setActionError(null);
    setDialog("account");
  }

  function clientIdForAccount(account: IAMExternalAccountSummary): string {
    const match = (
      oauthClients.rows as unknown as readonly IAMOAuthClient[]
    ).find(
      (client) =>
        client.slug === account.providerSlug &&
        client.environment === account.providerEnvironment,
    );
    return match?.id ?? "";
  }

  async function handleAccountSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!accountForm.oauthClient || !accountForm.externalId.trim()) {
      setActionError("Login provider and external ID are required.");
      return;
    }
    setActionError(null);
    try {
      await createExternalAccount({
        data: {
          oauthClient: accountForm.oauthClient,
          externalId: accountForm.externalId.trim(),
          owner: accountForm.owner || null,
          email: accountForm.email.trim(),
          displayName: accountForm.displayName.trim(),
          avatarUrl: accountForm.avatarUrl.trim(),
          status: accountForm.status,
        },
      });
      toast.success({ title: "External account saved" });
      closeDialog();
      refetchConnections();
    } catch (caught) {
      setActionError(
        caught instanceof Error ? caught.message : "Could not save external account.",
      );
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <OptionsError
        oauthClients={oauthClients.error}
        users={users.error}
      />
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button
          type="button"
          variant="secondary"
          disabled={oauthClientOptions.length === 0}
          onClick={() => openExternalAccount()}
        >
          <Glyph name="plus" />
          New external account
        </Button>
        <Button
          type="button"
          variant="primary"
          onClick={() => openProvider()}
        >
          <Glyph name="plus" />
          New OIDC provider
        </Button>
      </div>
      <ConnectionSummary
        refreshVersion={refreshVersion}
        onAccountEdit={openExternalAccount}
        onProviderEdit={openProvider}
      />
      <ManagementSection
        title="OIDC providers"
        total={oauthClients.total ?? oauthClients.rows.length}
      >
        <RowsListView
          rows={oauthClients.rows as unknown as readonly IAMOAuthClient[]}
          columns={oauthClientColumns}
          fetching={oauthClients.fetching}
          error={oauthClients.error}
          onRowClick={openProvider}
          pageSize={50}
        />
      </ManagementSection>
      <ManagementSection
        title="External accounts"
        total={externalAccounts.total ?? externalAccounts.rows.length}
      >
        <RowsListView
          rows={externalAccounts.rows as unknown as readonly IAMExternalAccountSummary[]}
          columns={externalAccountColumns}
          fetching={externalAccounts.fetching}
          error={externalAccounts.error}
          onRowClick={openExternalAccount}
          pageSize={50}
        />
      </ManagementSection>
      <ResourceFormDialog
        open={dialog === "provider"}
        title={providerId ? "Edit OIDC provider" : "New OIDC provider"}
        size="lg"
        onClose={closeDialog}
      >
        <FormView
          model={OAUTH_CLIENT_MODEL}
          id={providerId}
          groups={providerGroups}
          returning={OAUTH_CLIENT_FIELDS}
          defaultValues={providerDefaults}
          submitLabel={providerId ? "Save provider" : "Create provider"}
          onSaved={() =>
            handleResourceSaved(
              providerId ? "OIDC provider updated" : "OIDC provider created",
            )
          }
        />
      </ResourceFormDialog>
      <ExternalAccountDialog
        open={dialog === "account"}
        form={accountForm}
        oauthClients={oauthClientOptions}
        users={userOptions}
        error={actionError ?? createAccountState.error?.message ?? null}
        pending={createAccountState.fetching}
        onFormChange={setAccountForm}
        onSubmit={handleAccountSubmit}
        onClose={closeDialog}
      />
    </div>
  );

  function handleResourceSaved(title: string): void {
    toast.success({ title });
    closeDialog();
    refetchConnections();
  }
}

function OptionsError({
  oauthClients,
  users,
}: {
  oauthClients: Error | null;
  users: Error | null;
}): ReactElement | null {
  if (!oauthClients && !users) return null;
  return (
    <>
      {oauthClients ? (
        <Alert intent="danger" title="Login providers unavailable">
          {oauthClients.message}
        </Alert>
      ) : null}
      {users ? (
        <Alert intent="danger" title="Users unavailable">
          {users.message}
        </Alert>
      ) : null}
    </>
  );
}

function ManagementSection({
  title,
  total,
  children,
}: {
  title: string;
  total: number;
  children: ReactNode;
}): ReactElement {
  return (
    <section className="grid gap-2">
      <div className="flex items-center justify-between gap-3">
        <h2 className="m-0 text-sm font-semibold text-fg">{title}</h2>
        <Badge>{total.toLocaleString()}</Badge>
      </div>
      {children}
    </section>
  );
}
