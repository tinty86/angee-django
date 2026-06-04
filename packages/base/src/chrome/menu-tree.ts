import type { MenuItem } from "@angee/sdk";

import { titleCase } from "../lib/titleCase";

export type ChromeMenuGroup = "domain" | "platform";
export type ChromeMenuStatus = "active" | "future";
export type ChromeMenuTone =
  | "brand"
  | "danger"
  | "info"
  | "muted"
  | "success"
  | "warning";

export interface ChromeMenuItem extends MenuItem {
  children?: readonly ChromeMenuItem[];
  parent?: string;
  parentId?: string;
  description?: string;
  group?: ChromeMenuGroup;
  status?: ChromeMenuStatus;
  tone?: ChromeMenuTone;
  badge?: number;
}

export class ChromeMenuNode implements ChromeMenuItem {
  id: string;
  label?: string;
  to?: string;
  icon?: string;
  children?: readonly ChromeMenuNode[];
  parent?: string;
  parentId?: string;
  description?: string;
  group?: ChromeMenuGroup;
  status?: ChromeMenuStatus;
  tone?: ChromeMenuTone;
  badge?: number;

  constructor(item: ChromeMenuItem) {
    const { children: _children, ...clone } = item;
    Object.assign(this, clone);
    this.id = item.id;
  }

  get target(): string | undefined {
    return this.to ?? this.children?.find((child) => child.to)?.to;
  }

  get displayLabel(): string {
    return this.label ?? titleCase(this.id);
  }

  get iconName(): string {
    return this.icon ?? this.id;
  }

  get parentKey(): string | undefined {
    return this.parentId ?? this.parent;
  }

  get targetedChildren(): readonly ChromeMenuNode[] {
    return (this.children ?? []).filter((child) => child.target);
  }

  matchesPath(pathname: string): boolean {
    const target = this.target;
    if (!target || target === "#") return false;
    return pathname === target || pathname.startsWith(`${target}/`);
  }

  appendChild(child: ChromeMenuNode): void {
    this.children = [...(this.children ?? []), child];
  }
}

export class MenuTree {
  readonly roots: readonly ChromeMenuNode[];
  readonly byId: ReadonlyMap<string, ChromeMenuNode>;

  constructor(
    roots: readonly ChromeMenuNode[],
    byId: ReadonlyMap<string, ChromeMenuNode>,
  ) {
    this.roots = roots;
    this.byId = byId;
  }

  static from(itemsOrTree: readonly ChromeMenuItem[] | MenuTree): MenuTree {
    return itemsOrTree instanceof MenuTree
      ? itemsOrTree
      : buildMenuTree(itemsOrTree);
  }

  railMenuItems(): readonly ChromeMenuNode[] {
    return this.roots.filter((item) => {
      if (CHROME_MENU_PARENT_IDS.has(item.id)) return false;
      return Boolean(item.target);
    });
  }

  /**
   * The active app's section links for the top bar: the children of the root
   * the current path belongs to, rendered flat. Apps live in the rail /
   * app-switcher; the top bar navigates *within* the active app, so a sibling
   * app's sections never leak here. A single-page app (a root with no children,
   * e.g. Notes) contributes nothing.
   */
  appSectionItems(pathname: string): readonly ChromeMenuNode[] {
    const active = this.activeAppRoot(pathname);
    return active?.targetedChildren ?? [];
  }

  /**
   * The root the current path belongs to — the app whose own target or a
   * child's target is the longest prefix of `pathname` (most-specific wins).
   */
  activeAppRoot(pathname: string): ChromeMenuNode | undefined {
    let best: ChromeMenuNode | undefined;
    let bestLength = -1;
    for (const root of this.roots) {
      for (const candidate of [root, ...(root.children ?? [])]) {
        const target = candidate.target;
        if (!target || !candidate.matchesPath(pathname)) continue;
        if (target.length > bestLength) {
          best = root;
          bestLength = target.length;
        }
      }
    }
    return best;
  }
}

const CHROME_MENU_PARENT_IDS = new Set(["systray", "user"]);

export function buildMenuTree(
  items: readonly ChromeMenuItem[],
): MenuTree {
  const byId = new Map<string, ChromeMenuNode>();
  const childIds = new Set<string>();
  const ordered: ChromeMenuNode[] = [];

  for (const item of items) {
    const clone = new ChromeMenuNode(item);
    byId.set(clone.id, clone);
    ordered.push(clone);
  }

  for (const item of items) {
    const clone = byId.get(item.id);
    if (!clone || !item.children?.length) continue;
    clone.children = item.children.map((child) => {
      const childClone = new ChromeMenuNode(child);
      byId.set(childClone.id, childClone);
      childIds.add(childClone.id);
      return childClone;
    });
  }

  for (const item of ordered) {
    const parentId = item.parentKey;
    if (!parentId) continue;
    const parent = byId.get(parentId);
    if (!parent) continue;
    parent.appendChild(item);
    childIds.add(item.id);
  }

  return new MenuTree(
    ordered.filter((item) => {
      if (childIds.has(item.id)) return false;
      return !item.parentKey;
    }),
    byId,
  );
}
