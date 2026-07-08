import { expectValidBaseAddon } from "@angee/app/testing";
import { MESSAGING_CHANNEL_TOOLBAR_SLOT } from "@angee/messaging";
import { describe, expect, test } from "vitest";

import messagingIntegrateImap from "./index";

describe("messaging_integrate_imap addon manifest", () => {
  test("satisfies the rendered-addon invariants", () => {
    expect(() => expectValidBaseAddon(messagingIntegrateImap)).not.toThrow();
  });

  test("contributes the IMAP connect action to messaging's channel toolbar", () => {
    expect(messagingIntegrateImap.slots?.[0]).toMatchObject({
      slot: MESSAGING_CHANNEL_TOOLBAR_SLOT,
      id: "messaging-integrate-imap.connect",
      sequence: 10,
    });
    expect(messagingIntegrateImap.i18n?.messaging?.["channel.connect.button"]).toBe("Connect IMAP");
  });

  test("contributes an IMAP-labelled menu entry under Messaging", () => {
    expect(messagingIntegrateImap.menus?.[0]).toMatchObject({
      id: "messaging.imap",
      label: "IMAP",
      to: "/messaging/channels",
      parentId: "messaging",
      description: "Connect IMAP mailbox channels",
    });
  });
});
