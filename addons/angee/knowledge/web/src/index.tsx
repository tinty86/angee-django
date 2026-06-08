import type { BaseAddon, BaseAddonRoute, BaseMenuItem } from "@angee/base";
import { BookOpen, FileStack, FileText, Library, Link2 } from "lucide-react";

import { KnowledgePage, PageCrumb } from "./views/KnowledgePage";

const KNOWLEDGE_ID = "knowledge";

const knowledgeRoutes: readonly BaseAddonRoute[] = [
  {
    name: "knowledge.home",
    path: "/knowledge",
    shell: "console",
    menu: KNOWLEDGE_ID,
    component: KnowledgePage,
  },
  {
    // The page reader nests under the wiki; `KnowledgePage` (the parent) reads
    // the `$id` param and renders that page, so this route carries only the crumb.
    name: "knowledge.page",
    path: "/knowledge/$id",
    shell: "console",
    parent: "knowledge.home",
    crumb: (match) => (
      <PageCrumb id={String((match.params as { id?: string }).id ?? "")} />
    ),
  },
];

const knowledgeMenu: readonly BaseMenuItem[] = [
  {
    id: KNOWLEDGE_ID,
    label: "Knowledge",
    icon: "knowledge",
    group: "platform",
    route: "knowledge.home",
  },
];

// Glyphs the wiki reaches for that the base registry doesn't carry.
const knowledge: BaseAddon = {
  id: KNOWLEDGE_ID,
  routes: knowledgeRoutes,
  menus: knowledgeMenu,
  icons: {
    knowledge: BookOpen,
    vault: Library,
    note: FileText,
    template: FileStack,
    link: Link2,
  },
};

export default knowledge;
