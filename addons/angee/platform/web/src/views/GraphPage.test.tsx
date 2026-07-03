// @vitest-environment happy-dom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const platformMocks = vi.hoisted(() => ({
  modelScope: null as string | null,
  navigate: vi.fn(),
  usePlatformModelGraph: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => platformMocks.navigate,
}));

vi.mock("nuqs", () => ({
  parseAsString: {},
  useQueryState: () => [platformMocks.modelScope],
}));

vi.mock("@angee/ui", () => ({
  GraphView: ({ className }: { className?: string }) => (
    <div data-testid="graph-view" className={className} />
  ),
}));

vi.mock("../lib/explorer", () => ({
  usePlatformModelGraph: platformMocks.usePlatformModelGraph,
}));

import { GraphPage } from "./GraphPage";

beforeEach(() => {
  platformMocks.modelScope = null;
  platformMocks.navigate.mockClear();
  platformMocks.usePlatformModelGraph.mockReturnValue({
    nodes: [],
    edges: [],
    error: null,
  });
});

afterEach(() => cleanup());

describe("GraphPage", () => {
  test("declares a concrete console canvas height for React Flow", () => {
    render(<GraphPage />);

    const graph = screen.getByTestId("graph-view");

    expect(graph.parentElement?.className).toContain("console-route-viewport");
    expect(graph.className).toContain("console-route-canvas");
  });
});
