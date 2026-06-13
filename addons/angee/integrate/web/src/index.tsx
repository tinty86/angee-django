import type { BaseAddon, BaseAddonRoute, BaseMenuItem } from "@angee/base";
import { Link2, Plug, Store, Webhook } from "lucide-react";

import { IntegrationsPage } from "./views/IntegrationsPage";
import { VendorsPage } from "./views/VendorsPage";
import { WebhooksPage } from "./views/WebhooksPage";

const INTEGRATE_ID = "integrate";

const integrateRoutes: readonly BaseAddonRoute[] = [
  {
    // No `menu:` — the route is referenced by exactly one menu item (the
    // Integrations child), so chrome derivation needs no disambiguation.
    name: "integrate.integrations",
    path: "/integrate",
    shell: "console",
    component: IntegrationsPage,
  },
  {
    // The integration record nests under the list; `IntegrationsPage` reads the
    // `$id` param and swaps to the detail form, so this route carries only the URL.
    name: "integrate.integration",
    path: "/integrate/$id",
    shell: "console",
    parent: "integrate.integrations",
  },
  {
    // Static `/integrate/vendors` outranks the `/integrate/$id` param route.
    name: "integrate.vendors",
    path: "/integrate/vendors",
    shell: "console",
    component: VendorsPage,
  },
  {
    name: "integrate.vendor",
    path: "/integrate/vendors/$id",
    shell: "console",
    parent: "integrate.vendors",
  },
  {
    name: "integrate.webhooks",
    path: "/integrate/webhooks",
    shell: "console",
    component: WebhooksPage,
  },
  {
    name: "integrate.webhook",
    path: "/integrate/webhooks/$id",
    shell: "console",
    parent: "integrate.webhooks",
  },
];

const integrateMenu: readonly BaseMenuItem[] = [
  {
    // Route-less app root: the rail icon inherits its target from the first
    // child (Integrations), avoiding a duplicate route reference.
    id: INTEGRATE_ID,
    label: "Integrations",
    icon: "integrate",
    group: "platform",
    children: [
      { id: "integrate.integrations", label: "Integrations", icon: "integration", route: "integrate.integrations" },
      { id: "integrate.vendors", label: "Vendors", icon: "vendor", route: "integrate.vendors" },
      { id: "integrate.webhooks", label: "Webhooks", icon: "webhook", route: "integrate.webhooks" },
    ],
  },
];

const integrate: BaseAddon = {
  id: INTEGRATE_ID,
  routes: integrateRoutes,
  menus: integrateMenu,
  icons: {
    integrate: Plug,
    integration: Link2,
    vendor: Store,
    webhook: Webhook,
  },
};

export default integrate;
