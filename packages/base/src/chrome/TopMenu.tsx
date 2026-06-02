import type { ReactElement } from "react";
import { parseAsStringLiteral, useQueryState } from "nuqs";

import { cn } from "../lib/cn";
import { useDataViewMaybe, type DataViewFilter } from "../views";
import { Glyph } from "./Glyph";

const TOP_TAB_IDS = ["all", "starred", "archive"] as const;
export type TopMenuTabId = (typeof TOP_TAB_IDS)[number];

export interface TopMenuTab {
  id: TopMenuTabId;
  label: string;
  icon?: string;
  filter: DataViewFilter;
}

const DEFAULT_TABS: readonly TopMenuTab[] = [
  { id: "all", label: "All notes", icon: "list", filter: {} },
  { id: "starred", label: "Starred", icon: "star", filter: { isStarred: true } },
  {
    id: "archive",
    label: "Archive",
    icon: "archive",
    filter: { status: { exact: "ARCHIVED" } },
  },
];

const tabClass =
  "inline-flex h-8 min-w-0 items-center gap-2 rounded-md px-3 text-13 font-medium text-on-rail-mut outline-none transition-colors hover:bg-rail-hi hover:text-on-rail-hi focus-visible:focus-ring aria-selected:bg-rail-hi aria-selected:text-on-rail-hi";

export interface TopMenuProps {
  className?: string;
  tabs?: readonly TopMenuTab[];
}

export function TopMenu({ className, tabs = DEFAULT_TABS }: TopMenuProps): ReactElement | null {
  const dataView = useDataViewMaybe();
  const [activeTab, setActiveTab] = useQueryState(
    "tab",
    parseAsStringLiteral(TOP_TAB_IDS).withDefault("all"),
  );

  if (!tabs.length) return null;

  return (
    <div
      role="tablist"
      aria-label="Collection views"
      className={cn("flex min-w-0 gap-1", className)}
    >
      {tabs.map((tab) => (
        <TopMenuTabButton
          key={tab.id}
          tab={tab}
          active={activeTab === tab.id}
          onSelect={() => {
            void setActiveTab(tab.id);
            dataView?.setFilter(tab.filter);
          }}
        />
      ))}
    </div>
  );
}

function TopMenuTabButton({
  tab,
  active,
  onSelect,
}: {
  tab: TopMenuTab;
  active: boolean;
  onSelect: () => void;
}): ReactElement {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      className={tabClass}
      onClick={onSelect}
    >
      {tab.icon ? <Glyph name={tab.icon} size={14} className="shrink-0" /> : null}
      <span className="truncate">{tab.label}</span>
    </button>
  );
}
