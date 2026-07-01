import {
  defineBaseAddon,
  type BaseAddonRoute,
} from "@angee/app";
import { type BaseMenuItem } from "@angee/ui";
import { lazyRouteComponent } from "@tanstack/react-router";
import { Inbox, MessagesSquare, Send } from "lucide-react";

import { enMessagingMessages } from "./i18n";
import { RecordActivityPane } from "./RecordActivityPane";
import { RecordChatterPane } from "./RecordChatterPane";

// Each page is a routed ResourceList: a list route + a `$id` detail child the list
// swaps to inline. `resource` tags the collection route so relation fields targeting
// it can follow to this detail page.
const consolePage = (
  name: string,
  path: string,
  component: BaseAddonRoute["component"],
  resource?: string,
): readonly BaseAddonRoute[] => [
  { name, path, layout: "console", component, ...(resource ? { resource } : {}) },
  { name: `${name}.record`, path: `${path}/$id`, layout: "console", parent: name },
];

const messagingMenu: readonly BaseMenuItem[] = [
  {
    id: "messaging",
    label: "Messaging",
    icon: "inbox",
    children: [
      { id: "messaging.inbox", label: "Inbox", route: "messaging.inbox", icon: "inbox" },
      { id: "messaging.threads", label: "Threads", route: "messaging.threads", icon: "threads" },
    ],
  },
];

const messaging = defineBaseAddon({
  id: "messaging",
  routes: [
    ...consolePage("messaging.inbox", "/messaging/inbox", lazyRouteComponent(() => import("./MessagesPage"), "MessagesPage"), "messaging.Message"),
    ...consolePage("messaging.threads", "/messaging/threads", lazyRouteComponent(() => import("./ThreadsPage"), "ThreadsPage"), "messaging.Thread"),
  ],
  menus: messagingMenu,
  icons: { inbox: Inbox, threads: MessagesSquare, send: Send },
  i18n: { messaging: enMessagingMessages },
  chatter: [
    {
      id: "comments",
      sequence: 10,
      label: "Comments",
      icon: "comments",
      render: (context) => <RecordChatterPane context={context} />,
    },
    {
      id: "activity",
      sequence: 20,
      label: "Activity",
      icon: "activity",
      render: (context) => <RecordActivityPane context={context} />,
    },
  ],
});

export default messaging;
