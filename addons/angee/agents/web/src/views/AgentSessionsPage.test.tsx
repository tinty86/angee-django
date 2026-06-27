// @vitest-environment happy-dom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { AgentRosterItem } from "../documents";

const routerMocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  params: {} as Record<string, string>,
}));

const sdkMocks = vi.hoisted(() => ({
  useAuthoredQuery: vi.fn(),
}));

vi.mock("@tanstack/react-router", async () => {
  const React = await import("react");
  return {
    useNavigate: () => routerMocks.navigate,
    useParams: () => routerMocks.params,
    // A capturing anchor: keeps the `to` href and spreads the merged props (className,
    // aria-current, data-active) that `SessionRailItem`'s `useRender` injects.
    Link: React.forwardRef<HTMLAnchorElement, { to?: unknown; children?: React.ReactNode }>(
      function Link({ to, children, ...rest }, ref) {
        return React.createElement(
          "a",
          { ref, href: typeof to === "string" ? to : String(to ?? ""), ...rest },
          children,
        );
      },
    ),
  };
});

// `@angee/ui` carries the real rail/empty/skeleton primitives + `recordPath`; only the
// data hook and the namespace translator are overridden.
vi.mock("@angee/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@angee/ui")>();
  return {
    ...actual,
    useAuthoredQuery: sdkMocks.useAuthoredQuery,
    useNamespaceT:
      (_namespace: string, messages: Record<string, string>) =>
      (key: string) =>
        messages[key] ?? key,
  };
});

// Stub the chat surface so the test never pulls in the assistant-ui runtime — it only
// needs to prove which agent each kept-alive instance is bound to.
vi.mock("./AgentChat", () => ({
  AgentChat: ({ agentId }: { agentId: string }) => (
    <div data-testid="agent-chat" data-agent-id={agentId} />
  ),
}));

import { AgentSessionsPage } from "./AgentSessionsPage";

function agent(
  id: string,
  name: string,
  overrides: Partial<AgentRosterItem> = {},
): AgentRosterItem {
  return {
    id,
    name,
    runtime_status: "RUNNING",
    is_template: false,
    updated_at: "2026-06-26T00:00:00Z",
    model: { name: "claude-opus" },
    ...overrides,
  } as AgentRosterItem;
}

function queryResult(data: unknown, fetching = false) {
  return { data, fetching, error: null, refetch: vi.fn() };
}

beforeEach(() => {
  routerMocks.params = {};
  routerMocks.navigate.mockReset();
  sdkMocks.useAuthoredQuery.mockReset();
});

afterEach(() => {
  cleanup();
});

describe("AgentSessionsPage", () => {
  test("loading renders skeleton rail rows and no chat", () => {
    sdkMocks.useAuthoredQuery.mockReturnValue(queryResult(undefined, true));

    render(<AgentSessionsPage />);

    expect(screen.getByRole("navigation", { name: "Running agents" })).toBeTruthy();
    expect(screen.getAllByRole("listitem")).toHaveLength(4);
    expect(screen.queryByTestId("agent-chat")).toBeNull();
  });

  test("no running agent renders the provision empty state linking to /agents", () => {
    sdkMocks.useAuthoredQuery.mockReturnValue(
      queryResult({
        agents: [
          agent("t1", "Template", { is_template: true }),
          agent("s1", "Stopped", { runtime_status: "STOPPED" }),
        ],
      }),
    );

    render(<AgentSessionsPage />);

    expect(screen.getByText("No agent yet")).toBeTruthy();
    const cta = screen.getByRole("link", { name: "Set up your assistant" });
    expect(cta.getAttribute("href")).toBe("/agents");
    expect(screen.queryByTestId("agent-chat")).toBeNull();
  });

  test("filters out templates + non-running agents, one rail row each", () => {
    sdkMocks.useAuthoredQuery.mockReturnValue(
      queryResult({
        agents: [
          agent("a1", "Scout"),
          agent("t1", "Template", { is_template: true }),
          agent("s1", "Stopped", { runtime_status: "STOPPED" }),
        ],
      }),
    );
    routerMocks.params = { id: "a1" };

    render(<AgentSessionsPage />);

    expect(screen.getByText("Scout")).toBeTruthy();
    expect(screen.queryByText("Template")).toBeNull();
    expect(screen.queryByText("Stopped")).toBeNull();
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
  });

  test("the running list shows name + handle + a labelled dot, marks the active row, and offers + New", () => {
    sdkMocks.useAuthoredQuery.mockReturnValue(
      queryResult({
        agents: [
          agent("a1", "Scout", { model: { name: "claude-opus" } }),
          agent("a2", "Ranger", { model: { name: "claude-haiku" } }),
        ],
      }),
    );
    routerMocks.params = { id: "a2" };

    render(<AgentSessionsPage />);

    expect(screen.getByText("Scout")).toBeTruthy();
    expect(screen.getByText("claude-haiku")).toBeTruthy();
    // Every runtime-status dot carries a text alternative (never color-only).
    expect(screen.getAllByRole("img", { name: "Running" })).toHaveLength(2);
    // The active row is the URL's :id (aria-current=page), not aria-selected.
    expect(screen.getByRole("link", { current: "page" }).getAttribute("href")).toBe(
      "/agents/sessions/a2",
    );
    expect(screen.getByRole("link", { name: "New agent" }).getAttribute("href")).toBe(
      "/agents",
    );
  });

  test("no :id with agents redirects to the first running agent", () => {
    sdkMocks.useAuthoredQuery.mockReturnValue(
      queryResult({ agents: [agent("a1", "Scout"), agent("a2", "Ranger")] }),
    );

    render(<AgentSessionsPage />);

    expect(routerMocks.navigate).toHaveBeenCalledWith({
      to: "/agents/sessions/a1",
      replace: true,
    });
  });

  test("a stopped/invalid :id falls through to the first running agent", () => {
    sdkMocks.useAuthoredQuery.mockReturnValue(
      queryResult({ agents: [agent("a1", "Scout"), agent("a2", "Ranger")] }),
    );
    routerMocks.params = { id: "gone" };

    render(<AgentSessionsPage />);

    expect(routerMocks.navigate).toHaveBeenCalledWith({
      to: "/agents/sessions/a1",
      replace: true,
    });
    // An absent id never mounts a chat that would error on mintEndpoint.
    expect(screen.queryByTestId("agent-chat")).toBeNull();
  });

  test("switching :id keeps both agents' chats mounted (keep-alive), hiding the inactive one", () => {
    sdkMocks.useAuthoredQuery.mockReturnValue(
      queryResult({ agents: [agent("a1", "Scout"), agent("a2", "Ranger")] }),
    );
    routerMocks.params = { id: "a1" };

    const view = render(<AgentSessionsPage />);
    expect(screen.getByTestId("agent-chat").getAttribute("data-agent-id")).toBe("a1");

    routerMocks.params = { id: "a2" };
    view.rerender(<AgentSessionsPage />);

    const chats = screen.getAllByTestId("agent-chat");
    expect(chats.map((c) => c.getAttribute("data-agent-id")).sort()).toEqual(["a1", "a2"]);
    const a1 = chats.find((c) => c.getAttribute("data-agent-id") === "a1");
    const a2 = chats.find((c) => c.getAttribute("data-agent-id") === "a2");
    // The previous agent stays mounted but hidden (its transcript + socket preserved);
    // the selected one is shown.
    expect(a1?.parentElement?.hasAttribute("hidden")).toBe(true);
    expect(a2?.parentElement?.hasAttribute("hidden")).toBe(false);
  });
});
