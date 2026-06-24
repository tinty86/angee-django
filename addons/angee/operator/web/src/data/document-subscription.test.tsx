// @vitest-environment happy-dom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { parse } from "graphql";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { useDocumentSubscription } from "./document-subscription";

const sub = vi.hoisted(() => ({
  listeners: new Set<(value: unknown) => void>(),
  afterReducer: null as (() => void) | null,
  emit(value: unknown) {
    for (const listener of this.listeners) listener(value);
  },
}));

vi.mock("urql", () => ({
  Provider: ({ children }: { children: ReactNode }) => children,
  useMutation: () => [{ fetching: false, error: null }, vi.fn()],
  useQuery: () => [{ data: undefined, fetching: false, error: null }, vi.fn()],
  useSubscription: (
    _request: unknown,
    handler: (previous: unknown, value: unknown) => unknown,
  ) => {
    const handlerRef = useRef(handler);
    handlerRef.current = handler;
    const resultRef = useRef<unknown>(undefined);
    const [state, setState] = useState<{ data: unknown; fetching: boolean; error: null }>({
      data: undefined,
      fetching: true,
      error: null,
    });
    useEffect(() => {
      const onPush = (value: unknown) => {
        resultRef.current = handlerRef.current(resultRef.current, value);
        sub.afterReducer?.();
        setState({ data: resultRef.current, fetching: false, error: null });
      };
      sub.listeners.add(onPush);
      return () => {
        sub.listeners.delete(onPush);
      };
    }, []);
    return [state];
  },
}));

describe("useDocumentSubscription", () => {
  beforeEach(() => {
    sub.afterReducer = null;
  });

  afterEach(() => {
    cleanup();
    sub.listeners.clear();
  });

  test("fires onData from an effect after the push, never from the reducer", async () => {
    const onData = vi.fn();
    const document = parse("subscription { ping }");
    sub.afterReducer = () => expect(onData).not.toHaveBeenCalled();

    renderHook(() =>
      useDocumentSubscription<{ ping: string }, Record<string, never>>(
        document,
        undefined,
        { onData },
      ),
    );
    expect(onData).not.toHaveBeenCalled();

    act(() => sub.emit({ ping: "pong" }));
    await waitFor(() => expect(onData).toHaveBeenCalledWith({ ping: "pong" }));
  });

  test("fires onData once per push, not on bare rerenders", async () => {
    const onData = vi.fn();
    const document = parse("subscription { ping }");
    const { rerender } = renderHook(() =>
      useDocumentSubscription<{ ping: string }, Record<string, never>>(
        document,
        undefined,
        { onData },
      ),
    );

    act(() => sub.emit({ ping: "one" }));
    await waitFor(() => expect(onData).toHaveBeenCalledTimes(1));
    expect(onData).toHaveBeenLastCalledWith({ ping: "one" });

    rerender();
    expect(onData).toHaveBeenCalledTimes(1);

    act(() => sub.emit({ ping: "two" }));
    await waitFor(() => expect(onData).toHaveBeenCalledTimes(2));
    expect(onData).toHaveBeenLastCalledWith({ ping: "two" });
  });
});
