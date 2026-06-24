// @vitest-environment happy-dom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import {
  createContext,
  useContext,
  useMemo,
  type ReactElement,
  type ReactNode,
} from "react";
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import { AppRuntimeProvider } from "@angee/sdk";
import { ModalsHost, ToastProvider, baseIcons, defaultWidgets } from "@angee/base";

import { GrantsPage } from "./GrantsPage";
import { documentName } from "./test-documents";

// The model-driven pages (Users / OIDC Providers) are exercised end-to-end (they
// carry no bespoke logic to unit-test, like the notes/storage resource lists).
// GrantsPage is a custom REBAC view, so it is tested.
const sdkMocks = vi.hoisted(() => ({
  grants: {
    data: undefined as unknown,
    fetching: false,
    error: null as Error | null,
    refetch: vi.fn(),
  },
  grantQueryOptions: null as unknown,
  revokeOptions: null as unknown,
  revoke_role: vi.fn(),
  revokeState: {
    fetching: false,
    error: null as Error | null,
  },
}));

vi.mock("@angee/data", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@angee/data")>();
  return {
    ...actual,
    useAuthoredQuery: (document: unknown, _variables: unknown, options: unknown) => {
      if (documentName(document) === "IamGrants") {
        sdkMocks.grantQueryOptions = options;
        return sdkMocks.grants;
      }
      return { data: undefined, fetching: false, error: null, refetch: vi.fn() };
    },
    useAuthoredRows: (document: unknown, options: unknown) => {
      if (documentName(document) === "IamGrants") {
        sdkMocks.grantQueryOptions = options;
        const rowOptions = options as {
          selectRows: (data: unknown) => readonly unknown[];
        };
        return {
          ...sdkMocks.grants,
          rows: rowOptions.selectRows(sdkMocks.grants.data),
        };
      }
      return {
        data: undefined,
        rows: [],
        fetching: false,
        error: null,
        refetch: vi.fn(),
      };
    },
    useAuthoredMutation: (_document: unknown, options: unknown) => {
      sdkMocks.revokeOptions = options;
      return [sdkMocks.revoke_role, sdkMocks.revokeState];
    },
  };
});

describe("IAM identity views", () => {
  beforeAll(() => {
    Object.defineProperty(Element.prototype, "getAnimations", {
      configurable: true,
      value: () => [],
    });
  });

  afterEach(() => {
    cleanup();
    sdkMocks.grants.data = undefined;
    sdkMocks.grants.fetching = false;
    sdkMocks.grants.error = null;
    sdkMocks.grants.refetch.mockReset();
    sdkMocks.grantQueryOptions = null;
    sdkMocks.revokeOptions = null;
    sdkMocks.revoke_role.mockReset();
    sdkMocks.revokeState.fetching = false;
    sdkMocks.revokeState.error = null;
  });

  test("revokes a grant through the confirm dialog and declares invalidation", async () => {
    sdkMocks.grants.data = grantsData();
    sdkMocks.revoke_role.mockResolvedValue({ revoke_role: true });

    renderInRouter(<GrantsPage />);

    await openDefaultGrantGroup();
    fireEvent.click(screen.getByRole("button", { name: "Revoke" }));
    await screen.findByText("Revoke role?");
    fireEvent.click(screen.getAllByRole("button", { name: "Revoke" }).at(-1)!);

    await waitFor(() =>
      expect(sdkMocks.revoke_role).toHaveBeenCalledWith({
        principal_id: "user-1",
        role: "iam/admin",
      }),
    );
    const grantQueryOptions = sdkMocks.grantQueryOptions as {
      models?: readonly string[];
    };
    expect(grantQueryOptions.models).toEqual(["rebac.RelationshipRegistry"]);
    expect(sdkMocks.revokeOptions).toEqual({
      invalidateModels: ["rebac.RelationshipRegistry"],
      shouldInvalidate: expect.any(Function),
    });
    const revokeOptions = sdkMocks.revokeOptions as {
      shouldInvalidate: (result: { revoke_role: boolean }) => boolean;
    };
    expect(revokeOptions.shouldInvalidate({ revoke_role: true })).toBe(true);
    expect(revokeOptions.shouldInvalidate({ revoke_role: false })).toBe(false);
  });

  test("surfaces revoke errors", async () => {
    sdkMocks.grants.data = grantsData();
    sdkMocks.revoke_role.mockRejectedValue(new Error("Permission denied"));

    renderInRouter(<GrantsPage />);

    await openDefaultGrantGroup();
    fireEvent.click(screen.getByRole("button", { name: "Revoke" }));
    await screen.findByText("Revoke role?");
    fireEvent.click(screen.getAllByRole("button", { name: "Revoke" }).at(-1)!);

    expect(await screen.findByText("Role was not revoked")).toBeTruthy();
    expect(screen.getByText("Permission denied")).toBeTruthy();
    expect(sdkMocks.grants.refetch).not.toHaveBeenCalled();
  });
});

function grantsData(): unknown {
  return {
    grants: {
      total_count: 1,
      results: [
        {
          principal_id: "user-1",
          principal_type: "user",
          role: "iam/admin",
        },
      ],
    },
  };
}

function renderInRouter(children: ReactNode): ReturnType<typeof render> {
  return render(<TestUrlState>{children}</TestUrlState>);
}

async function openDefaultGrantGroup(): Promise<void> {
  fireEvent.click(await screen.findByRole("button", { name: "Iam 1" }));
  await screen.findByRole("button", { name: "Revoke" });
}

const TestUrlStateContext = createContext<{ children: ReactNode } | null>(null);

function TestUrlState({ children }: { children: ReactNode }): ReactElement {
  const router = useMemo(() => {
    const rootRoute = createRootRoute({ component: TestRootRoute });
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: "/",
      component: TestScreen,
    });
    return createRouter({
      routeTree: rootRoute.addChildren([indexRoute]),
      history: createMemoryHistory({ initialEntries: ["/"] }),
      defaultPreload: false,
    });
  }, []);

  return (
    <TestUrlStateContext.Provider value={{ children }}>
      <RouterProvider router={router} />
    </TestUrlStateContext.Provider>
  );
}

function TestRootRoute(): ReactElement {
  return (
    <AppRuntimeProvider runtime={{ icons: baseIcons, widgets: defaultWidgets }}>
      <ToastProvider>
        <ModalsHost>
          <Outlet />
        </ModalsHost>
      </ToastProvider>
    </AppRuntimeProvider>
  );
}

function TestScreen(): ReactElement | null {
  const context = useContext(TestUrlStateContext);
  return context ? <>{context.children}</> : null;
}
