import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  useConfirm,
} from "@angee/base";
import { useT } from "@angee/sdk";
import { useState, type FormEvent, type ReactNode } from "react";

import { SECRET_DELETE_MUTATION, SECRET_SET_MUTATION } from "../../data/documents";
import { useOperatorAction, useOperatorSnapshot } from "../../data/transport";
import type { SecretRef } from "../../data/types";
import { DaemonResourceTable } from "../parts/DaemonResourceTable";
import { OperatorSection } from "../parts/OperatorSection";
import { runDaemonAction, type DaemonActionData } from "../parts/run-action";

interface SecretSetVars extends Record<string, unknown> {
  name: string;
  value: string;
}
interface SecretDeleteVars extends Record<string, unknown> {
  name: string;
}

/** Secrets pane: declared secrets (presence only) + set/delete. */
export function SecretsSection(): ReactNode {
  const t = useT("operator");
  const confirm = useConfirm();
  const { snapshot, result, refetch } = useOperatorSnapshot({ secrets: true });
  const [actionError, setActionError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [value, setValue] = useState("");

  const setSecret = useOperatorAction<DaemonActionData, SecretSetVars>(SECRET_SET_MUTATION);
  const deleteSecret = useOperatorAction<DaemonActionData, SecretDeleteVars>(SECRET_DELETE_MUTATION);
  const busy = setSecret.result.fetching || deleteSecret.result.fetching;

  const secrets = snapshot?.secrets ?? [];
  const canSet = name.trim().length > 0 && value.length > 0 && !busy;

  async function submitSet(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!canSet) return;
    const succeeded = await runDaemonAction({
      run: setSecret.run,
      field: "secretSet",
      variables: { name: name.trim(), value },
      label: "Set secret",
      setError: setActionError,
      refetch,
    });
    // Keep the value on failure so the operator can retry without re-typing it.
    if (succeeded) {
      setValue("");
    }
  }

  function handleDelete(secret: SecretRef): void {
    void (async () => {
      const ok = await confirm({
        title: "Delete secret?",
        body: `“${secret.name}” will be removed from the secrets backend.`,
        confirm: "Delete",
        danger: true,
      });
      if (!ok) return;
      await runDaemonAction({
        run: deleteSecret.run,
        field: "secretDelete",
        variables: { name: secret.name },
        label: "Delete secret",
        setError: setActionError,
        refetch,
      });
    })();
  }

  return (
    <OperatorSection
      title={t("section.operator.secrets.title")}
      loading={result.fetching && !snapshot}
      error={result.error && !snapshot ? result.error : null}
      loadingMessage="Loading secrets"
      actionError={actionError}
    >
      <Card>
        <CardHeader>
          <CardTitle>Set a secret</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="flex flex-wrap items-end gap-2" onSubmit={(event) => void submitSet(event)}>
            <label className="flex flex-col gap-1 text-13 text-fg-muted">
              Name
              <Input
                onChange={(event) => setName(event.target.value)}
                placeholder="SECRET_NAME"
                value={name}
              />
            </label>
            <label className="flex flex-col gap-1 text-13 text-fg-muted">
              Value
              <Input
                onChange={(event) => setValue(event.target.value)}
                placeholder="value"
                type="password"
                value={value}
              />
            </label>
            <Button disabled={!canSet} size="sm" type="submit" variant="secondary">
              Set
            </Button>
          </form>
        </CardContent>
      </Card>

      <DaemonResourceTable
        columns={[
          {
            header: "Name",
            cell: (secret) => <span className="font-medium text-fg">{secret.name}</span>,
          },
          {
            header: "Declared",
            cell: (secret) => (
              <span className="text-13 text-fg-muted">{secret.declared ? "yes" : "no"}</span>
            ),
          },
          {
            header: "Has value",
            cell: (secret) => (
              <Badge density="compact" shape="pill" tone={secret.hasValue ? "success" : "neutral"}>
                {secret.hasValue ? "set" : "empty"}
              </Badge>
            ),
          },
          {
            header: "Required",
            cell: (secret) =>
              secret.required ? (
                <Badge density="compact" shape="pill" tone="warning">
                  yes
                </Badge>
              ) : (
                <span className="text-fg-muted">—</span>
              ),
          },
          {
            header: "Env var",
            cell: (secret) => (
              <span className="font-mono text-13 text-fg-muted">{secret.envVar ?? "—"}</span>
            ),
          },
          {
            header: "Actions",
            align: "end",
            cell: (secret) =>
              secret.required || secret.generated ? (
                // Required/generated secrets are control-plane (e.g. the
                // generated operator bearer shared by Django + the daemon);
                // deleting one can brick minting, so the console withholds it.
                <span
                  className="text-13 text-fg-muted"
                  title="Control-plane secret (required or generated) — cannot be deleted from the console."
                >
                  Protected
                </span>
              ) : (
                <Button
                  disabled={busy}
                  onClick={() => handleDelete(secret)}
                  size="sm"
                  variant="ghost"
                >
                  Delete
                </Button>
              ),
          },
        ]}
        emptyMessage="No declared secrets."
        rowKey={(secret) => secret.name}
        rows={secrets}
      />
    </OperatorSection>
  );
}
