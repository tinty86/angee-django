import { describe, expect, test } from "vitest";

import { MenuTree, type ChromeMenuItem } from "./menu-tree";

// Two apps with sections plus a single-page app. The top bar navigates within
// the active app, so it shows that app's sections and never a sibling's.
const MENU: readonly ChromeMenuItem[] = [
  {
    id: "notes",
    label: "Notes",
    to: "/notes",
    children: [
      { id: "notes.all", label: "All", to: "/notes" },
      { id: "notes.archive", label: "Archived", to: "/notes/archive" },
    ],
  },
  {
    id: "operator",
    label: "Operator",
    icon: "operator",
    children: [
      { id: "operator.overview", label: "Overview", to: "/operator" },
      { id: "operator.services", label: "Services", to: "/operator/services" },
    ],
  },
  { id: "single", label: "Single", to: "/single" },
];

describe("appSectionItems", () => {
  test("returns the active app's sections, flat", () => {
    expect(MenuTree.from(MENU).appSectionItems("/operator/services").map((item) => item.id)).toEqual([
      "operator.overview",
      "operator.services",
    ]);
  });

  test("scopes to the app the path belongs to — a sibling app never leaks", () => {
    expect(MenuTree.from(MENU).appSectionItems("/notes").map((item) => item.id)).toEqual([
      "notes.all",
      "notes.archive",
    ]);
  });

  test("matches the app from a nested section path", () => {
    expect(MenuTree.from(MENU).appSectionItems("/notes/archive").map((item) => item.id)).toEqual([
      "notes.all",
      "notes.archive",
    ]);
  });

  test("a single-page app (no children) contributes nothing", () => {
    expect(MenuTree.from(MENU).appSectionItems("/single")).toEqual([]);
  });

  test("an unmatched path yields no sections", () => {
    expect(MenuTree.from(MENU).appSectionItems("/nope")).toEqual([]);
  });
});
