import * as React from "react";
import { createPortal } from "react-dom";

import { Glyph } from "../chrome/Glyph";
import { cn } from "../lib/cn";

// Host node for the shell's statusline row. Mirrors the control band:
//   undefined   — no ConsoleShell above (standalone/test) → render inline.
//   null        — shell present but the area-status host has not mounted yet.
//   HTMLElement — portal the statusline into the host.
const StatuslineContext =
  React.createContext<HTMLElement | null | undefined>(undefined);

export interface StatuslineProviderProps {
  children: React.ReactNode;
  host: HTMLElement | null;
}

export function StatuslineProvider({
  children,
  host,
}: StatuslineProviderProps): React.ReactElement {
  return (
    <StatuslineContext.Provider value={host}>
      {children}
    </StatuslineContext.Provider>
  );
}

export interface StatuslineProps {
  /** Segments shown left of the spacer; pair with `<StatuslineSpacer />`. */
  children: React.ReactNode;
  className?: string;
}

/**
 * The page's flush statusline in the shell's `area-status` row — a low-profile
 * bottom bar of `StatusSegment`s (save state, counts, sync, cursor, …). It is
 * opt-in: a page renders `<Statusline>` to fill the row, which otherwise stays
 * collapsed. Under a `ConsoleShell` it portals into `area-status`; standalone
 * it renders inline. Use `<StatuslineSpacer />` to push trailing segments right.
 */
export function Statusline({
  children,
  className,
}: StatuslineProps): React.ReactElement | React.ReactPortal | null {
  const host = React.useContext(StatuslineContext);
  const bar = (
    <footer
      className={cn(
        "flex h-7 items-center gap-4 border-t border-border-subtle bg-sheet px-3.5 text-2xs text-fg-muted",
        className,
      )}
    >
      {children}
    </footer>
  );

  if (host) return createPortal(bar, host);
  return host === undefined ? bar : null;
}

export interface StatusSegmentProps {
  /** Icon registry name shown before the label. */
  icon?: string;
  /** Semantic tone (e.g. a saved/synced affordance reads as success). */
  tone?: "default" | "success" | "danger";
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}

/** One statusline segment: an optional glyph plus a short label. */
export function StatusSegment({
  icon,
  tone = "default",
  children,
  className,
  onClick,
}: StatusSegmentProps): React.ReactElement {
  const content = (
    <>
      {icon ? <Glyph name={icon} className="size-3.5" /> : null}
      {children}
    </>
  );
  const tones = {
    default: "text-fg-muted",
    success: "text-success-text",
    danger: "text-danger-text",
  } as const;
  const base = cn("flex items-center gap-1.5", tones[tone], className);
  return onClick ? (
    <button type="button" className={cn(base, "hover:text-fg")} onClick={onClick}>
      {content}
    </button>
  ) : (
    <span className={base}>{content}</span>
  );
}

/** Push the segments after it to the right edge of the statusline. */
export function StatuslineSpacer(): React.ReactElement {
  return <span className="flex-1" />;
}
