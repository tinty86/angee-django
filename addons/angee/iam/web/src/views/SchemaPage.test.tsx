// @vitest-environment happy-dom

import { cleanup, render, screen, within } from "@testing-library/react";
import { type ReactElement, type ReactNode } from "react";
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import {
  AppRuntimeProvider,
  ChatterProvider,
  PrimaryPaneProvider,
  baseIcons,
  useChatter,
  usePrimaryPaneContent,
} from "@angee/ui";

import { SchemaPage } from "./SchemaPage";
import { documentName } from "./test-documents";

// One mocked `rebac_schema` payload routed through `useAuthoredQuery`. Sorted by
// the page to `iam/user` first, so that resource is the default selection.
const SCHEMA = {
  rebac_schema: [
    {
      resource_type: "notes/note",
      relations: [
        { name: "owner", allowed_subject_types: ["auth/user"] },
      ],
      permissions: [{ name: "edit", conditions: [{ name: "owner" }] }],
    },
    {
      resource_type: "iam/user",
      relations: [{ name: "self", allowed_subject_types: ["auth/user"] }],
      permissions: [{ name: "view", conditions: [{ name: "self" }] }],
    },
  ],
};

const sdkMocks = vi.hoisted(() => ({
  schema: {
    data: undefined as unknown,
    fetching: false,
    error: null as Error | null,
    refetch: vi.fn(),
  },
}));

vi.mock("@angee/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@angee/ui")>();
  return {
    ...actual,
    useAuthoredQuery: (document: unknown) =>
      documentName(document) === "IamRebacSchema"
        ? sdkMocks.schema
        : { data: undefined, fetching: false, error: null, refetch: vi.fn() },
  };
});

describe("IAM schema page", () => {
  beforeAll(() => {
    Object.defineProperty(Element.prototype, "getAnimations", {
      configurable: true,
      value: () => [],
    });
    Object.defineProperty(globalThis, "ResizeObserver", {
      configurable: true,
      value: class ResizeObserver {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
      },
    });
  });

  afterEach(() => {
    cleanup();
    sdkMocks.schema.data = undefined;
    sdkMocks.schema.fetching = false;
    sdkMocks.schema.error = null;
    sdkMocks.schema.refetch.mockReset();
  });

  test("publishes the resource-type navigator into the shell primary pane", () => {
    sdkMocks.schema.data = SCHEMA;
    renderPage();

    // The navigator is published into the shell primary pane, not the page's
    // own DOM. The graph canvas (the page's content) stays on the page.
    const primary = screen.getByTestId("shell-primary");
    const listbox = within(primary).getByRole("listbox", {
      name: "Resource types",
    });
    expect(within(listbox).getByRole("option", { name: /Note/ })).toBeTruthy();
    expect(within(listbox).getByRole("option", { name: /User/ })).toBeTruthy();
    // The graph canvas (content) renders on the page itself.
    expect(screen.getByText("Permission Graph")).toBeTruthy();
  });

  test("publishes an additive inspector chatter tab for the selected resource", () => {
    sdkMocks.schema.data = SCHEMA;
    renderPage();

    // The inspector is an additive secondary tab; the page publishes only it,
    // leaving the shell's default agent/comments/activity tabs in place.
    const inspector = screen.getByTestId("tab-inspector");
    expect(within(inspector).getByText("Inspector")).toBeTruthy();
    // The default selection (`iam/user`, first after the alpha sort) drives the
    // inspector body.
    expect(within(inspector).getByText("User")).toBeTruthy();
    expect(within(inspector).getByText("Relations")).toBeTruthy();
    expect(within(inspector).getByText("Permissions")).toBeTruthy();
  });

  test("publishes nothing while the first load is in flight", () => {
    sdkMocks.schema.fetching = true;
    renderPage();

    expect(screen.getByText("Loading schema...")).toBeTruthy();
    // No explorer/inspector is published, so the shell falls back to its own
    // primary/secondary content.
    expect(screen.getByTestId("shell-primary").childNodes).toHaveLength(0);
    expect(screen.queryByTestId("tab-inspector")).toBeNull();
  });
});

function renderPage(): ReturnType<typeof render> {
  return render(
    <AppRuntimeProvider runtime={{ icons: baseIcons }}>
      <PrimaryPaneProvider>
        <ChatterProvider>
          <SchemaPage />
          <PrimaryHost />
          <ChatterHost />
        </ChatterProvider>
      </PrimaryPaneProvider>
    </AppRuntimeProvider>,
  );
}

/** Renders whatever the page published into the shell primary pane. */
function PrimaryHost(): ReactElement {
  const { node } = usePrimaryPaneContent();
  return <div data-testid="shell-primary">{node}</div>;
}

/** Renders the page's published chatter tabs the way the shell secondary would. */
function ChatterHost(): ReactNode {
  const { content } = useChatter();
  return (
    <>
      {content?.tabs?.map((tab) => (
        <div key={tab.id} data-testid={`tab-${tab.id}`}>
          {tab.label}
          {tab.children}
        </div>
      ))}
    </>
  );
}
