// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AppRuntimeProvider } from "@angee/sdk";
import { afterEach, beforeAll, describe, expect, test } from "vitest";
import type { ReactElement } from "react";

import { baseIcons } from "../chrome/icon-registry";
import { ToastProvider, useToast } from "./Toast";

describe("ToastProvider", () => {
  beforeAll(() => {
    Element.prototype.getAnimations ??= () => [];
  });

  afterEach(() => {
    cleanup();
  });

  test("renders a toast fired from a component hook", async () => {
    render(
      <AppRuntimeProvider runtime={{ icons: baseIcons }}>
        <ToastProvider>
          <ToastButton />
        </ToastProvider>
      </AppRuntimeProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Show toast" }));

    expect(await screen.findByText("Import queued")).toBeTruthy();
  });
});

function ToastButton(): ReactElement {
  const toast = useToast();

  return (
    <button
      type="button"
      onClick={() => {
        toast.info({
          title: "Import queued",
          duration: 0,
        });
      }}
    >
      Show toast
    </button>
  );
}
