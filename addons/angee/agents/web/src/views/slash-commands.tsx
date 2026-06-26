// The slash-command binding: the ONLY file that touches assistant-ui's `Unstable_TriggerPopover`
// surface, so a version bump (every slash API is `Unstable_`/may-change in 0.12.x) is a one-file
// change. It maps the agent's ACP `availableCommands` onto the composer's `/` trigger popover and
// renders them through the presentation-only `@angee/ui` command slots.
//
// Behavior = the **Directive** (insert text), never the Action: selecting a command only writes
// `/<name> ` into the composer via the runtime's `setText`, after which the normal Send path runs
// (ComposerPrimitive.Send → onNew → buildPromptBlocks). An Action/execute would dispatch a prompt
// immediately, skipping buildPromptBlocks and dropping the view context — a second send path the
// chat invariant forbids. ACP commands carry free-text args (`UnstructuredCommandInput`), which the
// Directive supports (the user completes `/<name> <args>` and sends) and an Action does not.
//
// The `Unstable_TriggerAdapter` / `Unstable_TriggerItem` / `Unstable_DirectiveFormatter` types live
// in `@assistant-ui/core` (not a direct dep, and not re-exported from `@assistant-ui/react`), so they
// are derived structurally from the primitive component props rather than imported.

import * as React from "react";
import { ComposerPrimitive } from "@assistant-ui/react";
import type { AvailableCommand } from "@zed-industries/agent-client-protocol";
import { ChatCommandEmpty, ChatCommandItem, ChatCommandList } from "@angee/ui";

import { useAgentsT } from "../i18n";

// Derived from the primitive props (see the module note) — adds no `@assistant-ui/core` dependency.
type TriggerAdapter = NonNullable<
  React.ComponentProps<typeof ComposerPrimitive.Unstable_TriggerPopover>["adapter"]
>;
type TriggerItem = React.ComponentProps<typeof ComposerPrimitive.Unstable_TriggerPopoverItem>["item"];
type DirectiveFormatter = NonNullable<
  React.ComponentProps<typeof ComposerPrimitive.Unstable_TriggerPopover.Directive>["formatter"]
>;

/** Map the agent's ACP commands to a trigger adapter. There are no categories — a flat search
 *  list — and `search("")` returns everything, so the navigation resource enters search mode the
 *  instant `/` is typed and shows the full command list. */
export function commandAdapter(commands: readonly AvailableCommand[]): TriggerAdapter {
  const items: TriggerItem[] = commands.map((command) => ({
    id: command.name,
    type: "command",
    label: `/${command.name}`,
    ...(command.description ? { description: command.description } : {}),
  }));
  const matches = (item: TriggerItem, query: string): boolean => {
    const q = query.toLowerCase();
    return (
      item.id.toLowerCase().includes(q) ||
      item.label.toLowerCase().includes(q) ||
      (item.description ?? "").toLowerCase().includes(q)
    );
  };
  return {
    categories: () => [],
    categoryItems: () => [],
    search: (query) => (query ? items.filter((item) => matches(item, query)) : items),
  };
}

/** Insert the bare `/<name>` slash command (item.id is the ACP command name). The default
 *  formatter emits `:type[label]{name=id}` — a faked slash the agent would not read — so a custom
 *  formatter is mandatory. `parse` is required by the type but never called in the textarea path. */
export const slashCommandFormatter: DirectiveFormatter = {
  serialize: (item) => `/${item.id}`,
  parse: (text) => [{ kind: "text" as const, text }],
};

/**
 * Wrap a composer subtree so a leading `/` opens a palette of the agent's `availableCommands`.
 * `children` is the composer subtree (it must contain `ComposerPrimitive.Input`, which feeds the
 * trigger's cursor/keydown registry). Selecting a command inserts `/<name> ` and the user sends
 * normally. Fail-safe: with no advertised commands the trigger surface is not mounted at all — the
 * popover's `open` gate needs only an adapter + behavior (not non-empty items), so mounting it would
 * open an empty listbox on `/`; rendering just `children` leaves the composer unchanged.
 */
export function SlashCommandComposer({
  commands,
  children,
}: {
  commands: readonly AvailableCommand[];
  children: React.ReactNode;
}): React.ReactElement {
  const t = useAgentsT();
  const adapter = React.useMemo(() => commandAdapter(commands), [commands]);

  if (commands.length === 0) return <>{children}</>;

  return (
    <ComposerPrimitive.Unstable_TriggerPopoverRoot>
      {/* The root renders no DOM, so this module owns the positioning context; the panel floats
          above the composer with `absolute bottom-full`. */}
      <div className="relative">
        <ComposerPrimitive.Unstable_TriggerPopover
          char="/"
          adapter={adapter}
          aria-label={t("agents.chat.commands")}
          render={<ChatCommandList className="absolute inset-x-2 bottom-full z-10 mb-1" />}
        >
          <ComposerPrimitive.Unstable_TriggerPopover.Directive formatter={slashCommandFormatter} />
          <ComposerPrimitive.Unstable_TriggerPopoverItems>
            {(items) =>
              items.length === 0 ? (
                <ChatCommandEmpty>{t("agents.chat.commandsEmpty")}</ChatCommandEmpty>
              ) : (
                items.map((item) => (
                  <ComposerPrimitive.Unstable_TriggerPopoverItem
                    key={item.id}
                    item={item}
                    render={<ChatCommandItem label={item.label} description={item.description} />}
                  />
                ))
              )
            }
          </ComposerPrimitive.Unstable_TriggerPopoverItems>
        </ComposerPrimitive.Unstable_TriggerPopover>
        {children}
      </div>
    </ComposerPrimitive.Unstable_TriggerPopoverRoot>
  );
}
