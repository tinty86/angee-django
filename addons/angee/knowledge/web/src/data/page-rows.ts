import { PAGE_TYPE, VAULT_TYPE, relationGlobalId, toGlobalId } from "../lib/global-id";
import type { KnowledgePage } from "./documents";

// The browser fetches every vault/page once and scopes client-side, so this
// transform owns the projection: a vault's pages → navigator tree rows, folded
// by their (normalised) parent pointer.

/** A page projected for the navigator tree. */
export interface KnowledgeTreeRow extends Record<string, unknown> {
  id: string;
  title: string;
  parent: string;
  icon: string;
}

/** Registry glyph for a page's kind. */
export function pageIcon(kind: string): string {
  switch (kind) {
    case "folder":
      return "folder";
    case "template":
      return "template";
    default:
      return "note";
  }
}

/** Build the navigator rows for one vault's pages, folders before notes. */
export function pageTreeRows(
  pages: readonly KnowledgePage[],
  vaultId: string,
): KnowledgeTreeRow[] {
  return pages
    .filter((page) => toGlobalId(VAULT_TYPE, page.vault) === vaultId)
    .slice()
    .sort(comparePages)
    .map((page) => ({
      id: page.id,
      title: page.title,
      parent: relationGlobalId(PAGE_TYPE, page.parent) ?? "",
      icon: pageIcon(page.kind),
    }));
}

function comparePages(left: KnowledgePage, right: KnowledgePage): number {
  const leftFolder = left.kind === "folder" ? 0 : 1;
  const rightFolder = right.kind === "folder" ? 0 : 1;
  if (leftFolder !== rightFolder) return leftFolder - rightFolder;
  return left.title.localeCompare(right.title);
}

/** The selected page's list record, by its node id. */
export function pageById(
  pages: readonly KnowledgePage[],
  id: string | null,
): KnowledgePage | null {
  if (!id) return null;
  return pages.find((page) => page.id === id) ?? null;
}
