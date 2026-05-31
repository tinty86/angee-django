import type { ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { LogOut } from "lucide-react";
import { useAuth, useLogout, useMenus, type MenuItem } from "@angee/sdk";

import { Button } from "../ui/button";
import { ScrollArea } from "../ui/scroll-area";
import { Separator } from "../ui/separator";

export interface ConsoleShellProps {
  /** Brand mark or product name rendered at the head of the rail. */
  brand?: ReactNode;
  /** Page content rendered in the scrollable main area. */
  children: ReactNode;
}

/**
 * The authenticated app frame: a left rail listing the merged menu tree, a
 * topbar showing the signed-in user with a logout control, and a scrollable
 * content area. Navigation goes through TanStack Router `Link`s; logout returns
 * to `/login`.
 */
export function ConsoleShell({ brand, children }: ConsoleShellProps): ReactNode {
  const menus = useMenus();
  const { user } = useAuth();
  const { logout, fetching } = useLogout();
  const navigate = useNavigate();

  async function onLogout(): Promise<void> {
    if (await logout()) navigate({ to: "/login" });
  }

  return (
    <div className="console-grid-no-control h-screen w-screen bg-canvas text-fg">
      <aside className="area-rail flex min-h-0 flex-col border-r border-border bg-rail text-on-rail">
        {brand ? (
          <div className="flex h-topbar-h items-center px-4 font-semibold">
            {brand}
          </div>
        ) : null}
        <ScrollArea className="min-h-0 flex-1" viewportClassName="px-2 py-3">
          <nav className="flex flex-col gap-0.5">
            {menus.map((item) => (
              <RailLink key={item.id} item={item} />
            ))}
          </nav>
        </ScrollArea>
      </aside>

      <header className="area-topbar flex items-center justify-end gap-3 border-b border-border bg-sheet px-4">
        {user ? (
          <span className="text-13 text-fg-muted">{user.name}</span>
        ) : null}
        <Separator orientation="vertical" className="h-5" />
        <Button
          variant="ghost"
          size="sm"
          loading={fetching}
          onClick={onLogout}
        >
          <LogOut className="glyph" aria-hidden />
          Sign out
        </Button>
      </header>

      <main className="area-content min-h-0 min-w-0 overflow-auto bg-canvas">
        {children}
      </main>
    </div>
  );
}

function RailLink({ item }: { item: MenuItem }): ReactNode {
  const label = item.label ?? item.id;
  if (!item.to) {
    return (
      <span className="px-3 py-2 text-2xs font-medium uppercase tracking-wider text-on-rail-mut">
        {label}
      </span>
    );
  }
  return (
    <Link
      to={item.to}
      className="rounded-md px-3 py-2 text-13 text-on-rail-mut transition-colors hover:bg-rail-hover hover:text-on-rail-hi [&.active]:bg-rail-hi [&.active]:text-on-rail-hi"
      activeProps={{ className: "active" }}
    >
      {label}
    </Link>
  );
}
