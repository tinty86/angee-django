// @vitest-environment happy-dom
import { renderHook } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { useStableArray } from "./stable-deps";

describe("useStableArray", () => {
  test("keeps the same reference across renders with equal contents", () => {
    const { result, rerender } = renderHook(
      ({ items }) => useStableArray(items),
      { initialProps: { items: ["a", "b"] as readonly string[] } },
    );
    const first = result.current;
    rerender({ items: ["a", "b"] });
    expect(result.current).toBe(first);
  });

  test("returns a new reference when contents change", () => {
    const { result, rerender } = renderHook(
      ({ items }) => useStableArray(items),
      { initialProps: { items: ["a"] as readonly string[] } },
    );
    const first = result.current;
    rerender({ items: ["a", "b"] });
    expect(result.current).not.toBe(first);
  });
});
