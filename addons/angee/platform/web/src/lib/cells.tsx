import { Chip, MetricTile, TextLink } from "@angee/base";
import { Link } from "@tanstack/react-router";
import type { ReactElement, ReactNode } from "react";

// In-app SPA navigation for a string href that may carry a `?model=`/`?addon=`
// scope. TanStack `<Link>` owns client navigation; splitting the query out of the
// href keeps one string-href API across `paths.ts` and every linked cell.
function parseHref(href: string): { to: string; search: Record<string, string> } {
  const cut = href.indexOf("?");
  if (cut === -1) return { to: href, search: {} };
  const search: Record<string, string> = {};
  for (const [key, value] of new URLSearchParams(href.slice(cut + 1))) {
    search[key] = value;
  }
  return { to: href.slice(0, cut), search };
}

/**
 * A plain in-app navigation wrapper (no decoration) for non-text children —
 * chips and tiles. The router owns navigation; this only splits the scope query.
 */
export function RouterLink({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: ReactNode;
}): ReactElement {
  const { to, search } = parseHref(href);
  return (
    <Link to={to} search={search} className={className}>
      {children}
    </Link>
  );
}

/**
 * An inline text link: `TextLink` owns the link styling, TanStack `<Link>` owns
 * the SPA navigation. `asChild` renders the `<Link>` with `TextLink`'s recipe, so
 * the cell composes both owners instead of hand-rolling a link class.
 */
export function TextRouteLink({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: ReactNode;
}): ReactElement {
  const { to, search } = parseHref(href);
  return (
    <TextLink asChild className={className}>
      <Link to={to} search={search}>
        {children}
      </Link>
    </TextLink>
  );
}

const MAX_CHIPS = 6;

/**
 * A wrap of linked chips for a dependency summary (depends-on / depended-by):
 * each chip navigates to a detail page, overflow collapses to a count. A local
 * cell renderer composed from `RouterLink` + `Chip` (the role p1's
 * `LinkedSummaryCell` played) — not a new design-system surface.
 */
export function LinkedChips({
  items,
  href,
  format,
}: {
  items: readonly string[];
  href: (item: string) => string;
  format?: (item: string) => string;
}): ReactElement {
  if (items.length === 0) {
    return <span className="text-fg-muted">—</span>;
  }
  const shown = items.slice(0, MAX_CHIPS);
  const overflow = items.length - shown.length;
  return (
    <span className="flex flex-wrap items-center gap-1">
      {shown.map((item) => (
        <RouterLink key={item} href={href(item)}>
          <Chip tone="muted" size="sm">{format ? format(item) : item}</Chip>
        </RouterLink>
      ))}
      {overflow > 0 ? <Chip tone="muted" size="sm">{`+${overflow}`}</Chip> : null}
    </span>
  );
}

/**
 * A metric tile that navigates on click when `href` is set — the linked-stat
 * affordance p1 called a "smart button", composed from `RouterLink` + `MetricTile`.
 */
export function StatTile({
  label,
  value,
  icon,
  detail,
  href,
}: {
  label: ReactNode;
  value: ReactNode;
  icon?: string;
  detail?: ReactNode;
  href?: string;
}): ReactElement {
  const tile = <MetricTile label={label} value={value} icon={icon} detail={detail} />;
  if (!href) return tile;
  return (
    <RouterLink
      href={href}
      className="block rounded-lg outline-none transition hover:ring-2 hover:ring-border-focus focus-visible:ring-2 focus-visible:ring-border-focus"
    >
      {tile}
    </RouterLink>
  );
}
