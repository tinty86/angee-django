// @vitest-environment happy-dom

import { render, screen } from "@testing-library/react";
import * as React from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";

const pageMocks = vi.hoisted(() => ({
  resourceProps: null as Record<string, unknown> | null,
  recordAction: vi.fn(),
  requestedSlot: "",
  slotEntries: [{ slot: "messaging.channel.toolbar", id: "demo", content: "Connect bridge" }],
}));

vi.mock("@angee/ui", () => ({
  Action: ({ label, run }: { label: string; run?: () => void }) => (
    <button type="button" onClick={() => run?.()}>
      {label}
    </button>
  ),
  Column: () => null,
  Field: () => null,
  Form: ({ children }: { children?: React.ReactNode }) => <section>{children}</section>,
  Group: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  List: ({ children }: { children?: React.ReactNode }) => <section>{children}</section>,
  SlotOutlet: ({ entries }: { entries: readonly { id: string; content: unknown }[] }) => {
    return <div>{entries.map((entry) => <span key={entry.id}>{String(entry.content)}</span>)}</div>;
  },
  ResourceList: (props: Record<string, unknown>) => {
    pageMocks.resourceProps = props;
    return (
      <div>
        {props.toolbarActions as React.ReactNode}
        {props.children as React.ReactNode}
      </div>
    );
  },
  useRecordActionMutation: () => [pageMocks.recordAction],
  useSlot: (slot: string) => {
    pageMocks.requestedSlot = slot;
    return pageMocks.slotEntries;
  },
}));

vi.mock("./i18n", () => ({
  useMessagingT: () => (key: string) => key,
}));

import { ChannelsPage } from "./ChannelsPage";
import { MESSAGING_CHANNEL_TOOLBAR_SLOT } from "./slots";

describe("ChannelsPage", () => {
  beforeEach(() => {
    pageMocks.resourceProps = null;
    pageMocks.recordAction.mockClear();
    pageMocks.requestedSlot = "";
  });

  test("renders a model-driven channels page with addon toolbar actions", () => {
    render(<ChannelsPage />);

    expect(pageMocks.resourceProps).toMatchObject({
      resource: "messaging.Channel",
      placement: "inline",
      routed: true,
      hideCreate: true,
    });
    expect(pageMocks.requestedSlot).toBe(MESSAGING_CHANNEL_TOOLBAR_SLOT);
    expect(screen.getByText("Connect bridge")).toBeTruthy();
  });
});
