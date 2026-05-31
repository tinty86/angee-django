import type { BaseAddon } from "@angee/base";

import { NotePage } from "./NotePage";

/** The notes addon: one console route and a menu entry pointing at it. */
const notes: BaseAddon = {
  id: "notes",
  routes: [
    {
      name: "notes.home",
      path: "/notes",
      shell: "console",
      component: NotePage,
    },
  ],
  menus: [{ id: "notes", label: "Notes", to: "/notes" }],
};

export default notes;
