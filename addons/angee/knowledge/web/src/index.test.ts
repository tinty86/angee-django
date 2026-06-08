import type { BaseMenuItem } from "@angee/base";
import { describe, expect, test } from "vitest";

import knowledge from "./index";

describe("knowledge addon manifest", () => {
  test("registers the wiki route on the console shell with a component", () => {
    const routes = knowledge.routes ?? [];
    expect(routes).toHaveLength(2);
    expect(routes[0]?.name).toBe("knowledge.home");
    expect(routes[0]?.path).toBe("/knowledge");
    expect(routes[0]?.shell).toBe("console");
    expect(routes[0]?.component).toBeTypeOf("function");
  });

  test("nests the page reader route under the wiki with a crumb", () => {
    const record = (knowledge.routes ?? []).find(
      (route) => route.name === "knowledge.page",
    );
    expect(record?.path).toBe("/knowledge/$id");
    expect(record?.parent).toBe("knowledge.home");
    expect(record?.component).toBeUndefined();
    expect(record?.crumb).toBeTypeOf("function");
  });

  test("exposes a single Knowledge menu targeting the wiki", () => {
    expect(knowledge.menus).toHaveLength(1);
    const menu = knowledge.menus?.[0] as BaseMenuItem | undefined;
    expect(menu?.id).toBe("knowledge");
    expect(menu?.route).toBe("knowledge.home");
    expect(menu?.group).toBe("platform");
  });

  test("registers its vault/note glyphs", () => {
    expect(knowledge.icons?.vault).toBeDefined();
    expect(knowledge.icons?.note).toBeDefined();
    expect(knowledge.icons?.template).toBeDefined();
  });
});
