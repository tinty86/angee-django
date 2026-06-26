import { describe, expect, test, vi } from "vitest";
import type { CompleteAttachment } from "@assistant-ui/react";

import {
  attachmentBlocks,
  buildPromptBlocks,
  dataUrlToImageBlock,
  selectSessionModel,
} from "./useAcpRuntime";

// A complete image attachment as `SimpleImageAttachmentAdapter` yields it: an `image` part whose
// `image` is a `data:<mime>;base64,<data>` URL. The reducer only reads `content`, so the rest is
// cast at this boundary.
function imageAttachment(dataUrl: string): CompleteAttachment {
  return { content: [{ type: "image", image: dataUrl }] } as unknown as CompleteAttachment;
}

describe("selectSessionModel", () => {
  test("switches from ACP default to the agent model handle", async () => {
    const setSessionModel = vi.fn(async () => undefined);

    await selectSessionModel(
      { setSessionModel } as never,
      {
        sessionId: "session-1",
        models: {
          currentModelId: "default",
          availableModels: [
            { modelId: "default", name: "Default" },
            { modelId: "claude-opus-4-8", name: "claude-opus-4-8" },
          ],
        },
      },
      "claude-opus-4-8",
    );

    expect(setSessionModel).toHaveBeenCalledWith({
      sessionId: "session-1",
      modelId: "claude-opus-4-8",
    });
  });

  test("does not switch when the selected model is already current", async () => {
    const setSessionModel = vi.fn(async () => undefined);

    await selectSessionModel(
      { setSessionModel } as never,
      {
        sessionId: "session-1",
        models: {
          currentModelId: "claude-opus-4-8",
          availableModels: [{ modelId: "claude-opus-4-8", name: "claude-opus-4-8" }],
        },
      },
      "claude-opus-4-8",
    );

    expect(setSessionModel).not.toHaveBeenCalled();
  });

  test("defers to the agent when it advertises no standard model state", async () => {
    // opencode owns its model via its own config (it advertises models through a
    // non-standard `configOptions` field, not ACP `models`), so the client must not
    // fail the session — it leaves the container-pinned model in place.
    const setSessionModel = vi.fn(async () => undefined);

    await selectSessionModel(
      { setSessionModel } as never,
      { sessionId: "session-1" },
      "anthropic/claude-sonnet-4-6",
    );

    expect(setSessionModel).not.toHaveBeenCalled();
  });

  test("fails loudly when the selected model is not advertised", async () => {
    await expect(
      selectSessionModel(
        { setSessionModel: vi.fn() } as never,
        {
          sessionId: "session-1",
          models: {
            currentModelId: "default",
            availableModels: [{ modelId: "default", name: "Default" }],
          },
        },
        "claude-opus-4-8",
      ),
    ).rejects.toThrow("claude-opus-4-8");
  });
});

describe("buildPromptBlocks", () => {
  // The system-context invariant: the rendered context is ALWAYS its own ContentBlock and is
  // never string-merged into the user's message, so the user's text (e.g. a leading `/command`)
  // stays intact. When the agent advertises `embeddedContext`, context uses ACP's native
  // embedded `resource` block; otherwise it falls back to a plain leading `text` block.
  test("embeds context as a leading resource block, user text as its own trailing block", () => {
    expect(buildPromptBlocks("CTX", "hello", { embeddedContext: true })).toEqual([
      {
        type: "resource",
        resource: { uri: "angee:///agent/system-context", text: "CTX", mimeType: "text/markdown" },
      },
      { type: "text", text: "hello" },
    ]);
  });

  test("falls back to a leading text block when the agent lacks embeddedContext", () => {
    const expected = [
      { type: "text", text: "CTX" },
      { type: "text", text: "hello" },
    ];
    expect(buildPromptBlocks("CTX", "hello", null)).toEqual(expected);
    expect(buildPromptBlocks("CTX", "hello", { embeddedContext: false })).toEqual(expected);
  });

  test("omits the context block entirely when there is no context", () => {
    expect(buildPromptBlocks("", "hello", { embeddedContext: true })).toEqual([
      { type: "text", text: "hello" },
    ]);
  });

  // claude-code-acp runs a slash command only when the message is a clean "/command"; any extra
  // block makes the SDK treat it as prose. So a /command send carries NO context block.
  test("a /command send carries no context block — a clean command for the agent to run", () => {
    expect(buildPromptBlocks("CTX", "/context", { embeddedContext: true })).toEqual([
      { type: "text", text: "/context" },
    ]);
  });

  // Phase 3: attachment blocks ride after [context?, userText?]; the 4th param defaults to []
  // so every 3-arg caller above stays unchanged.
  test("appends attachment blocks after the context and user-text blocks", () => {
    const image = { type: "image" as const, data: "AAA", mimeType: "image/png" };
    expect(buildPromptBlocks("CTX", "hi", { embeddedContext: true }, [image])).toEqual([
      {
        type: "resource",
        resource: { uri: "angee:///agent/system-context", text: "CTX", mimeType: "text/markdown" },
      },
      { type: "text", text: "hi" },
      image,
    ]);
  });

  test("omits the empty user-text block for an image-only send (no context)", () => {
    const image = { type: "image" as const, data: "AAA", mimeType: "image/png" };
    expect(buildPromptBlocks("", "", { image: true }, [image])).toEqual([image]);
  });
});

describe("attachmentBlocks", () => {
  test("maps an image data-URL to an ACP image block when the agent supports image", () => {
    expect(
      attachmentBlocks([imageAttachment("data:image/png;base64,AAA")], { image: true }),
    ).toEqual([{ type: "image", data: "AAA", mimeType: "image/png" }]);
  });

  test("returns [] when the agent does not advertise image (or has no capabilities)", () => {
    const attachments = [imageAttachment("data:image/png;base64,AAA")];
    expect(attachmentBlocks(attachments, null)).toEqual([]);
    expect(attachmentBlocks(attachments, { image: false })).toEqual([]);
    expect(attachmentBlocks(undefined, { image: true })).toEqual([]);
  });

  test("skips non-image (file) parts — the resource_link path is deferred", () => {
    const fileAttachment = {
      content: [{ type: "file", filename: "notes.pdf", data: "ZZZ", mimeType: "application/pdf" }],
    } as unknown as CompleteAttachment;
    expect(attachmentBlocks([fileAttachment], { image: true })).toEqual([]);
  });
});

describe("dataUrlToImageBlock", () => {
  test("splits a base64 data URL into raw base64 data + mime type", () => {
    expect(dataUrlToImageBlock("data:image/jpeg;base64,/9j/4AAQ")).toEqual({
      type: "image",
      data: "/9j/4AAQ",
      mimeType: "image/jpeg",
    });
  });

  test("returns null for a non-base64-data-URL string", () => {
    expect(dataUrlToImageBlock("https://example.com/cat.png")).toBeNull();
  });
});

