import { useMemo, type ReactElement, type ReactNode } from "react";

import { Tree, type TreeNode } from "../ui/tree";

/**
 * The hierarchical View: flat `rows` carrying a self-referential `parent`
 * pointer are folded into a `Tree` (folders/files, nested records). The host
 * gives the field names; `renderRow` overrides a node's label for richer rows.
 * A peer View in a `DataPage` — the Explorer navigator pairs it with a list.
 */
export interface TreeViewProps<
  TRow extends Record<string, unknown> = Record<string, unknown>,
> {
  rows?: readonly TRow[];
  /** Field holding the parent row's id; empty/absent means a root node. */
  parent?: keyof TRow & string;
  /** Field holding the node label. */
  label?: keyof TRow & string;
  /** Field holding a right-aligned numeric count. */
  badge?: keyof TRow & string;
  /** Field holding the stable node id. */
  rowKey?: keyof TRow & string;
  /** Field holding an icon registry name. */
  icon?: keyof TRow & string;
  selectedId?: string;
  onSelect?: (row: TRow) => void;
  renderRow?: (row: TRow) => ReactNode;
  className?: string;
}

export function TreeView<TRow extends Record<string, unknown>>({
  rows = [],
  parent = "parentId" as keyof TRow & string,
  label = "name" as keyof TRow & string,
  badge,
  rowKey = "id" as keyof TRow & string,
  icon,
  selectedId,
  onSelect,
  renderRow,
  className,
}: TreeViewProps<TRow>): ReactElement {
  const rowsById = useMemo(
    () => new Map(rows.map((row) => [String(row[rowKey] ?? ""), row])),
    [rows, rowKey],
  );
  const nodes = useMemo(
    () => buildTree(rows, { parent, label, badge, rowKey, icon, renderRow }),
    [rows, parent, label, badge, rowKey, icon, renderRow],
  );

  return (
    <Tree
      nodes={nodes}
      selectedId={selectedId}
      className={className}
      onSelect={
        onSelect
          ? (id) => {
              const row = rowsById.get(id);
              if (row) onSelect(row);
            }
          : undefined
      }
    />
  );
}

function buildTree<TRow extends Record<string, unknown>>(
  rows: readonly TRow[],
  options: {
    parent: keyof TRow & string;
    label: keyof TRow & string;
    badge: (keyof TRow & string) | undefined;
    rowKey: keyof TRow & string;
    icon: (keyof TRow & string) | undefined;
    renderRow?: (row: TRow) => ReactNode;
  },
): TreeNode[] {
  const byParent = new Map<string, TRow[]>();
  for (const row of rows) {
    const parentId = String(row[options.parent] ?? "");
    const bucket = byParent.get(parentId);
    if (bucket) bucket.push(row);
    else byParent.set(parentId, [row]);
  }

  const toNode = (row: TRow): TreeNode => {
    const id = String(row[options.rowKey] ?? "");
    const count = options.badge ? Number(row[options.badge]) : undefined;
    return {
      id,
      label: options.renderRow?.(row) ?? String(row[options.label] ?? id),
      ...(options.icon && typeof row[options.icon] === "string"
        ? { icon: row[options.icon] as string }
        : {}),
      ...(count !== undefined && Number.isFinite(count) ? { count } : {}),
      children: (byParent.get(id) ?? []).map(toNode),
    };
  };

  return (byParent.get("") ?? []).map(toNode);
}
