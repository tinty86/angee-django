// @vitest-environment happy-dom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import * as React from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";

const actionMocks = vi.hoisted(() => ({
  authoredMutation: vi.fn(async () => ({ connect_imap_channel: { id: "chn_1" } })),
  mutationOptions: null as Record<string, unknown> | null,
  dialogProps: null as Record<string, unknown> | null,
}));

vi.mock("@angee/refine", () => ({
  useAuthoredMutation: (_document: unknown, options: Record<string, unknown>) => {
    actionMocks.mutationOptions = options;
    return [actionMocks.authoredMutation];
  },
}));

vi.mock("@angee/ui", () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
  Glyph: ({ name }: { name: string }) => <span aria-hidden>{name}</span>,
  MutationDialog: (props: Record<string, unknown>) => {
    actionMocks.dialogProps = props;
    if (!props.open) return null;
    return (
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const onSubmit = props.onSubmit as (values: Record<string, unknown>) => Promise<unknown>;
          void onSubmit({
            name: "Ada Mail",
            host: "imap.example.com",
            security: "starttls",
            port: 143,
            username: "ada@example.com",
            password: "mail-password",
            mailboxes: "INBOX\nArchive",
            ownAddresses: "ada@example.com\nalias@example.com",
          });
        }}
      >
        <button type="submit">{props.submitLabel as string}</button>
      </form>
    );
  },
}));

vi.mock("./i18n", () => ({
  useMessagingImapT: () => (key: string) => key,
}));

import { ConnectImapChannelAction } from "./ConnectImapChannelAction";

describe("ConnectImapChannelAction", () => {
  beforeEach(() => {
    actionMocks.authoredMutation.mockClear();
    actionMocks.mutationOptions = null;
    actionMocks.dialogProps = null;
  });

  test("opens the IMAP dialog and submits normalized variables", async () => {
    render(<ConnectImapChannelAction />);

    expect(actionMocks.mutationOptions).toEqual({ invalidateModels: ["messaging.Channel"] });
    fireEvent.click(screen.getByRole("button", { name: /channel.connect.button/ }));

    const fields = actionMocks.dialogProps?.fields as readonly { name: string }[];
    expect(actionMocks.dialogProps?.title).toBe("channel.connect.title");
    expect(fields.map((field) => field.name)).toEqual([
      "name",
      "host",
      "security",
      "port",
      "username",
      "password",
      "mailboxes",
      "ownAddresses",
    ]);

    fireEvent.click(screen.getByRole("button", { name: "channel.connect.submit" }));
    await waitFor(() =>
      expect(actionMocks.authoredMutation).toHaveBeenCalledWith({
        name: "Ada Mail",
        host: "imap.example.com",
        security: "starttls",
        port: 143,
        username: "ada@example.com",
        password: "mail-password",
        mailboxes: ["INBOX", "Archive"],
        ownAddresses: ["ada@example.com", "alias@example.com"],
      }),
    );
  });
});
