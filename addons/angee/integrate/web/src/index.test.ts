import { MenuTree, type BaseMenuItem, type ChromeMenuItem } from "@angee/base";
import { describe, expect, test } from "vitest";

import integrate from "./index";

describe("integrate addon manifest", () => {
  test("registers the integrations landing on the console shell with a component", () => {
    const integrations = (integrate.routes ?? []).find(
      (route) => route.name === "integrate.integrations",
    );
    expect(integrations?.path).toBe("/integrate");
    expect(integrations?.shell).toBe("console");
    expect(integrations?.component).toBeTypeOf("function");
    // No `menu:` — the route-less root no longer references this route, so a
    // `menu` would mismatch (createApp throws "item does not reference the route").
    expect(integrations?.menu).toBeUndefined();
  });

  test("nests each record route under its list, no component", () => {
    for (const [name, parent] of [
      ["integrate.integration", "integrate.integrations"],
      ["integrate.vendor", "integrate.vendors"],
      ["integrate.webhook", "integrate.webhooks"],
    ] as const) {
      const record = (integrate.routes ?? []).find((route) => route.name === name);
      expect(record?.path).toContain("/$id");
      expect(record?.parent).toBe(parent);
      expect(record?.component).toBeUndefined();
    }
  });

  test("keeps vendors/webhooks as static siblings, not integration ids", () => {
    const vendors = (integrate.routes ?? []).find((route) => route.name === "integrate.vendors");
    expect(vendors?.path).toBe("/integrate/vendors");
    expect(vendors?.component).toBeTypeOf("function");
  });

  test("exposes an Integrations menu with integrations/vendors/webhooks children", () => {
    expect(integrate.menus).toHaveLength(1);
    const menu = integrate.menus?.[0] as BaseMenuItem | undefined;
    expect(menu?.id).toBe("integrate");
    // Route-less root: target inherited from the first child (Integrations).
    expect(menu?.route).toBeUndefined();
    expect(menu?.group).toBe("platform");
    expect(menu?.children?.map((child) => child.route)).toEqual([
      "integrate.integrations",
      "integrate.vendors",
      "integrate.webhooks",
    ]);
  });

  test("references the landing route from exactly one menu item (chrome derivation)", () => {
    const tree = MenuTree.from(integrate.menus as readonly ChromeMenuItem[]);
    expect(tree.itemsForRoute("integrate.integrations")).toHaveLength(1);
  });

  test("registers its glyphs", () => {
    expect(integrate.icons?.integrate).toBeDefined();
    expect(integrate.icons?.integration).toBeDefined();
    expect(integrate.icons?.vendor).toBeDefined();
    expect(integrate.icons?.webhook).toBeDefined();
  });
});
