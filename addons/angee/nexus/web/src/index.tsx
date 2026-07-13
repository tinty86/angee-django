import { defineBaseAddon, resourcePageRoutes } from "@angee/app";
import { type BaseMenuItem } from "@angee/ui";
import { lazyRouteComponent } from "@tanstack/react-router";
import { History, Radar, UserCheck } from "lucide-react";

import { enNexusMessages } from "./i18n";
import { TIMELINE_MODELS, TimelinePane } from "./TimelinePane";

const nexusMenu: readonly BaseMenuItem[] = [
  {
    id: "nexus",
    label: "Connections",
    icon: "radar",
    children: [
      { id: "nexus.review", label: "Review", route: "nexus.review", icon: "user-check" },
      { id: "nexus.ties", label: "Ties", route: "nexus.ties", icon: "radar" },
    ],
  },
];

const nexus = defineBaseAddon({
  id: "nexus",
  routes: [
    {
      name: "nexus.review",
      path: "/nexus/review",
      layout: "console",
      component: lazyRouteComponent(() => import("./ReviewPage"), "ReviewPage"),
    },
    ...resourcePageRoutes("nexus.ties", "/nexus/ties", lazyRouteComponent(() => import("./TiesPage"), "TiesPage"), "nexus.Tie"),
  ],
  menus: nexusMenu,
  icons: { radar: Radar, "user-check": UserCheck, timeline: History },
  i18n: { nexus: enNexusMessages },
  // The cross-channel timeline rides the record chatter seam and self-gates to
  // party records: a null render on any other model drops the tab entirely.
  chatter: [
    {
      id: "timeline",
      sequence: 30,
      label: "Timeline",
      icon: "timeline",
      render: (context) => {
        const model = context.route?.modelLabel;
        const partyId = context.view.kind === "record" ? context.view.sqid : undefined;
        if (!model || !partyId || !TIMELINE_MODELS.has(model)) return null;
        return <TimelinePane partyId={partyId} />;
      },
    },
  ],
});

export default nexus;
