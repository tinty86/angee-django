import type { ReactNode } from "react";

import { cn } from "../lib/cn";

export interface PublicShellProps {
  /** Card body — typically a sign-in form. */
  children: ReactNode;
  /** Brand mark or title rendered above the card; omit for a bare card. */
  brand?: ReactNode;
  /** Footer docked below the card — e.g. a demo-credentials hint. */
  footer?: ReactNode;
  className?: string;
}

/**
 * The anonymous surface frame: a centred card on a `bg-canvas` + `bg-grid`
 * backdrop. The page supplies the brand, card body, and footer; the shell owns
 * the backdrop geometry and the centred column.
 */
export function PublicShell({
  children,
  brand,
  footer,
  className,
}: PublicShellProps): ReactNode {
  return (
    <div
      className={cn(
        "relative grid min-h-screen w-full place-items-center bg-canvas px-4 py-10 text-fg",
        className,
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-grid"
      />
      <div className="relative z-10 flex w-full max-w-sm flex-col items-stretch gap-6">
        {brand ? (
          <div className="flex flex-col items-center gap-2 text-center">
            {brand}
          </div>
        ) : null}
        <div className="rounded-lg border border-border bg-sheet p-6 shadow-md sm:p-8">
          {children}
        </div>
        {footer ? (
          <div className="text-center text-xs text-fg-muted">{footer}</div>
        ) : null}
      </div>
    </div>
  );
}
