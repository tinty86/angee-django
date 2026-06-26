import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  Button,
  ChatAttachmentChip,
  ChatBubble,
  ChatCommandEmpty,
  ChatCommandItem,
  ChatCommandList,
  ChatComposer,
  ChatComposerHint,
  ChatHeader,
  ChatHeaderAction,
  ChatTypingIndicator,
  ContextBlock,
  Glyph,
  MessageReasoningFrame,
  ToolFallback,
  chatComposerInputClassName,
} from "@angee/ui";

const meta = {
  title: "Communication/Chat",
  component: ChatHeader,
  parameters: { layout: "padded" },
} satisfies Meta<typeof ChatHeader>;

export default meta;

type Story = StoryObj;

const Surface = ({ children }: { children: React.ReactNode }) => (
  <div className="max-w-md overflow-hidden rounded-md border border-border-subtle bg-sheet">
    {children}
  </div>
);

export const Header: Story = {
  render: () => (
    <Surface>
      <ChatHeader
        title="Demo Agent"
        subtitle="claude-sonnet-4-6"
        statusLabel="Ready"
        statusTone="success"
        actions={
          <>
            <ChatHeaderAction>⚙</ChatHeaderAction>
            <ChatHeaderAction>Clear</ChatHeaderAction>
            <ChatHeaderAction>Reconnect</ChatHeaderAction>
          </>
        }
      />
    </Surface>
  ),
};

export const Bubbles: Story = {
  render: () => (
    <div className="max-w-md space-y-3 p-3">
      <ChatBubble role="user">Summarize this note for me.</ChatBubble>
      <ChatBubble role="assistant">
        This note captures the Q3 planning decisions and three open follow-ups.
      </ChatBubble>
      <ChatBubble role="system">Context: viewing notes/note nt_8Hd2.</ChatBubble>
    </div>
  ),
};

export const TypingIndicator: Story = {
  render: () => (
    <div className="max-w-md p-3">
      {/* Presentation only: the agents addon gates this on assistant-ui's running state for the
          last started-but-empty assistant turn; here it renders standalone. */}
      <ChatBubble role="assistant">
        <ChatTypingIndicator />
      </ChatBubble>
    </div>
  ),
};

export const Composer: Story = {
  render: () => (
    <div className="max-w-md p-3">
      <ChatComposer
        input={<textarea className={chatComposerInputClassName} rows={3} placeholder="Message the agent…" />}
        hint={<ChatComposerHint />}
        actions={
          <Button size="sm" variant="primary">
            Send
          </Button>
        }
      />
    </div>
  ),
};

export const ComposerWithAttachments: Story = {
  render: () => (
    <div className="max-w-md p-3">
      {/* Presentation only: the agents addon wires the image chip to assistant-ui's attachment
          adapter and the "Current view" chip to runtime presence state; here both are static. */}
      <ChatComposer
        input={<textarea className={chatComposerInputClassName} rows={3} placeholder="Message the agent…" />}
        attachments={
          <>
            <ChatAttachmentChip
              icon={<Glyph name="file" className="h-3 w-3" />}
              onClick={() => undefined}
              remove={
                <button type="button" aria-label="Remove attachment" className="flex items-center text-fg-muted hover:text-fg">
                  <Glyph name="x" className="h-3 w-3" />
                </button>
              }
            >
              Current view
            </ChatAttachmentChip>
            <ChatAttachmentChip
              icon={<Glyph name="attachment" className="h-3 w-3" />}
              remove={
                <button type="button" aria-label="Remove attachment" className="flex items-center text-fg-muted hover:text-fg">
                  <Glyph name="x" className="h-3 w-3" />
                </button>
              }
            >
              screenshot.png
            </ChatAttachmentChip>
          </>
        }
        hint={<ChatComposerHint />}
        actions={
          <>
            <Button size="sm" variant="ghost" aria-label="Attach image">
              <Glyph name="attachment" className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="primary">
              Send
            </Button>
          </>
        }
      />
    </div>
  ),
};

export const CommandPalette: Story = {
  render: () => (
    <div className="max-w-md p-3">
      {/* Presentation only: the agents addon binds these slots to assistant-ui's `/` trigger
          popover, which supplies role/highlight; here the highlighted row is shown statically. */}
      <ChatCommandList role="listbox" aria-label="Slash commands" className="relative">
        <ChatCommandItem label="/summarize" description="Summarize the note" data-highlighted="" />
        <ChatCommandItem label="/translate" description="Translate the note" />
        <ChatCommandItem label="/clear" description="Clear the conversation" />
      </ChatCommandList>
      <ChatCommandList role="listbox" aria-label="Slash commands" className="relative mt-3">
        <ChatCommandEmpty>No matching commands</ChatCommandEmpty>
      </ChatCommandList>
    </div>
  ),
};

export const ToolCalls: Story = {
  render: () => (
    <div className="max-w-md space-y-1 p-3">
      <ToolFallback toolName="read_note" input={{ sqid: "nt_8Hd2" }} />
      <ToolFallback
        toolName="read_note"
        input={{ sqid: "nt_8Hd2" }}
        result={{ title: "Q3 planning", word_count: 312 }}
      />
      <ToolFallback toolName="update_note" result="permission denied" isError />
    </div>
  ),
};

export const Reasoning: Story = {
  render: () => (
    <div className="max-w-md p-3">
      <MessageReasoningFrame>
        The user wants a summary. I should read the note first, then condense the decisions
        into bullets and surface the open follow-ups.
      </MessageReasoningFrame>
    </div>
  ),
};

export const Context: Story = {
  render: () => (
    <div className="max-w-md p-3">
      <ContextBlock label="context block (218 chars)">
        {"<system_context>\nThe user is viewing a record of notes/note.\n…\n</system_context>"}
      </ContextBlock>
    </div>
  ),
};
