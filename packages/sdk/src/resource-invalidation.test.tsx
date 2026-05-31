// @vitest-environment happy-dom
import { act, renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { fetchExchange } from "urql";
import { describe, expect, test, vi } from "vitest";

import { createSchemaClients, GraphQLProvider } from "./graphql-provider";
import {
  RelayInvalidationProvider,
  useInvalidateModels,
  useRegisterModelRefetch,
} from "./relay-invalidation";
import {
  useResourceList,
  useResourceMutation,
  type MutationAction,
} from "./resource-hooks";

function mockTransport() {
  const bodies: Array<{ query: string }> = [];
  const fetch = vi.fn(async (url: string, init: RequestInit) => {
    if (String(url).includes("/csrf/"))
      return new Response(JSON.stringify({ token: "t" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    bodies.push(JSON.parse(String(init.body)));
    return new Response(
      JSON.stringify({
        data: {
          sales: {
            totalCount: 1,
            edges: [{ node: { id: "1", title: "A" } }],
            pageInfo: { endCursor: "c1", hasNextPage: false },
          },
          saleCreate: { id: "9", title: "New" },
          saleUpdate: { id: "1", title: "Edited" },
          saleDelete: { ok: true, id: "1" },
        },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  });
  return { fetch: fetch as unknown as typeof globalThis.fetch, bodies };
}

function wrapperWith(fetch: typeof globalThis.fetch) {
  const clients = createSchemaClients({
    public: { url: "/graphql/", fetch, exchanges: [fetchExchange] },
  });
  return ({ children }: { children: ReactNode }) =>
    createElement(GraphQLProvider, {
      clients,
      schema: "public",
      children: createElement(RelayInvalidationProvider, {
        autoSubscribe: false,
        children,
      }),
    });
}

const salesQueries = (bodies: Array<{ query: string }>) =>
  bodies.filter((b) => b.query.includes("sales("));

describe("useResourceList registers for live invalidation", () => {
  test("re-fetches when its model is invalidated", async () => {
    const { fetch, bodies } = mockTransport();
    const { result } = renderHook(
      () => ({
        list: useResourceList("Sale", { fields: ["title"] }),
        invalidate: useInvalidateModels(),
      }),
      { wrapper: wrapperWith(fetch) },
    );
    await waitFor(() => expect(result.current.list.fetching).toBe(false));
    expect(salesQueries(bodies)).toHaveLength(1);

    act(() => result.current.invalidate(["Sale"]));
    await waitFor(() => expect(salesQueries(bodies)).toHaveLength(2));
  });
});

describe("useResourceMutation invalidates membership-changing writes", () => {
  function runMutation(action: MutationAction) {
    const { fetch } = mockTransport();
    const spy = vi.fn();
    const { result } = renderHook(
      () => {
        useRegisterModelRefetch("Sale", spy, true);
        return useResourceMutation("Sale", action, { fields: ["title"] });
      },
      { wrapper: wrapperWith(fetch) },
    );
    return { result, spy };
  }

  test("create invalidates the model", async () => {
    const { result, spy } = runMutation("create");
    await act(async () => {
      await result.current[0]({ input: { title: "New" } });
    });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  test("delete invalidates the model", async () => {
    const { result, spy } = runMutation("delete");
    await act(async () => {
      await result.current[0]({ id: "1" });
    });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  test("update does not invalidate (graphcache updates the entity in place)", async () => {
    const { result, spy } = runMutation("update");
    await act(async () => {
      await result.current[0]({ id: "1", input: { title: "Edited" } });
    });
    expect(spy).not.toHaveBeenCalled();
  });
});
