// @vitest-environment happy-dom
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, test, vi } from "vitest";

import { useAuthoredSubscription } from "./authored-hooks";

const subscriptionMocks = vi.hoisted(() => ({
  afterReducer: null as (() => void) | null,
  payload: { ping: "pong" },
}));

vi.mock("urql", () => ({
  Provider: ({ children }: { children: ReactNode }) => children,
  useMutation: () => [{ fetching: false, error: null }, vi.fn()],
  useQuery: () => [{ data: undefined, fetching: false, error: null }, vi.fn()],
  useSubscription: (
    _request: unknown,
    handler: (previous: unknown, value: { ping: string }) => unknown,
  ) => {
    const data = handler(undefined, subscriptionMocks.payload);
    subscriptionMocks.afterReducer?.();
    return [{ data, fetching: false, error: null }];
  },
}));

describe("useAuthoredSubscription", () => {
  test("fires onData after render, not from the subscription reducer", async () => {
    const onData = vi.fn();
    subscriptionMocks.afterReducer = () => {
      expect(onData).not.toHaveBeenCalled();
    };

    renderHook(() =>
      useAuthoredSubscription<{ ping: string }>("subscription { ping }", undefined, {
        onData,
      }),
    );

    await waitFor(() => expect(onData).toHaveBeenCalledWith(subscriptionMocks.payload));
  });
});
