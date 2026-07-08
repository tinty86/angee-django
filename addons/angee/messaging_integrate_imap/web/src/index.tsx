import { defineBaseAddon } from "@angee/app";
import { MESSAGING_CHANNEL_TOOLBAR_SLOT } from "@angee/messaging";

import { ConnectImapChannelAction } from "./ConnectImapChannelAction";
import { enMessagingImapMessages } from "./i18n";

const messagingIntegrateImap = defineBaseAddon({
  id: "messaging-integrate-imap",
  i18n: { messaging: enMessagingImapMessages },
  slots: [
    {
      slot: MESSAGING_CHANNEL_TOOLBAR_SLOT,
      id: "messaging-integrate-imap.connect",
      sequence: 10,
      content: <ConnectImapChannelAction />,
    },
  ],
});

export default messagingIntegrateImap;
