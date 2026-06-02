import * as React from "react";
import { ContextMenu as BaseContextMenu } from "@base-ui/react/context-menu";
import type {
  ContextMenuArrowProps as BaseContextMenuArrowProps,
  ContextMenuBackdropProps as BaseContextMenuBackdropProps,
  ContextMenuCheckboxItemIndicatorProps as BaseContextMenuCheckboxItemIndicatorProps,
  ContextMenuCheckboxItemProps as BaseContextMenuCheckboxItemProps,
  ContextMenuGroupLabelProps as BaseContextMenuGroupLabelProps,
  ContextMenuGroupProps as BaseContextMenuGroupProps,
  ContextMenuItemProps as BaseContextMenuItemProps,
  ContextMenuLinkItemProps as BaseContextMenuLinkItemProps,
  ContextMenuPopupProps as BaseContextMenuPopupProps,
  ContextMenuPortalProps as BaseContextMenuPortalProps,
  ContextMenuPositionerProps as BaseContextMenuPositionerProps,
  ContextMenuRadioGroupProps as BaseContextMenuRadioGroupProps,
  ContextMenuRadioItemIndicatorProps as BaseContextMenuRadioItemIndicatorProps,
  ContextMenuRadioItemProps as BaseContextMenuRadioItemProps,
  ContextMenuRootProps as BaseContextMenuRootProps,
  ContextMenuSubmenuRootProps as BaseContextMenuSubmenuRootProps,
  ContextMenuSubmenuTriggerProps as BaseContextMenuSubmenuTriggerProps,
  ContextMenuTriggerProps as BaseContextMenuTriggerProps,
} from "@base-ui/react/context-menu";

import { Glyph } from "../chrome/Glyph";
import { tv, type VariantProps } from "../lib/variants";

export const contextMenuVariants = tv({
  slots: {
    content:
      "z-popover min-w-44 overflow-hidden rounded-lg border border-border-subtle bg-popover p-1 shadow-popover outline-none data-[ending-style]:opacity-0 data-[starting-style]:opacity-0",
    trigger:
      "outline-none focus-visible:focus-ring data-[popup-open]:focus-ring",
    item:
      "relative flex h-8 cursor-pointer select-none items-center gap-2 rounded px-2 text-13 text-fg outline-none transition-colors data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50 data-[highlighted]:bg-inset [&_.glyph]:size-3.5 [&_.glyph]:shrink-0 [&_.glyph]:text-fg-muted",
    indicator:
      "absolute left-2 flex size-3.5 items-center justify-center text-brand [&_.glyph]:size-3.5",
    radioIndicator:
      "absolute left-2 flex size-3.5 items-center justify-center text-brand before:size-1.5 before:rounded-full before:bg-current before:content-['']",
    label: "px-2 py-1.5 text-2xs font-semibold uppercase text-fg-muted",
    separator: "-mx-1 my-1 h-px bg-border-subtle",
    shortcut: "ml-auto text-2xs text-fg-muted",
    submenuIcon:
      "ml-auto flex size-3.5 items-center justify-center text-fg-muted transition-transform data-[open]:rotate-90 [&_.glyph]:size-3.5",
  },
  variants: {
    inset: {
      true: { item: "pl-8" },
      false: { item: "" },
    },
    variant: {
      default: { item: "" },
      danger: {
        item: "text-danger-text data-[highlighted]:bg-danger-soft data-[highlighted]:text-danger-text",
      },
    },
  },
  defaultVariants: {
    inset: false,
    variant: "default",
  },
});

type ContextMenuRecipeProps = VariantProps<typeof contextMenuVariants>;

export type ContextMenuItemVariant = NonNullable<
  ContextMenuRecipeProps["variant"]
>;
export type ContextMenuRootProps = BaseContextMenuRootProps;
export type ContextMenuPortalProps = BaseContextMenuPortalProps;
export type ContextMenuPositionerProps = BaseContextMenuPositionerProps;
export type ContextMenuArrowProps = BaseContextMenuArrowProps;
export type ContextMenuBackdropProps = BaseContextMenuBackdropProps;
export type ContextMenuGroupProps = BaseContextMenuGroupProps;
export type ContextMenuRadioGroupProps = BaseContextMenuRadioGroupProps;
export type ContextMenuSubmenuRootProps = BaseContextMenuSubmenuRootProps;

export const ContextMenuRoot = BaseContextMenu.Root;
export const ContextMenuPortal = BaseContextMenu.Portal;
export const ContextMenuPositioner = BaseContextMenu.Positioner;
export const ContextMenuArrow = BaseContextMenu.Arrow;
export const ContextMenuBackdrop = BaseContextMenu.Backdrop;
export const ContextMenuGroup = BaseContextMenu.Group;
export const ContextMenuRadioGroup = BaseContextMenu.RadioGroup;
export const ContextMenuSubmenuRoot = BaseContextMenu.SubmenuRoot;

export type ContextMenuTriggerProps = Omit<
  BaseContextMenuTriggerProps,
  "className"
> & {
  className?: string;
};

export const ContextMenuTrigger = React.forwardRef<
  HTMLDivElement,
  ContextMenuTriggerProps
>(function ContextMenuTrigger({ className, ...props }, ref) {
  const styles = contextMenuVariants();
  return (
    <BaseContextMenu.Trigger
      ref={ref}
      className={styles.trigger({ className })}
      {...props}
    />
  );
});
ContextMenuTrigger.displayName = "ContextMenuTrigger";

export type ContextMenuContentProps = Omit<
  BaseContextMenuPopupProps,
  "className"
> & {
  className?: string;
};

export const ContextMenuContent = React.forwardRef<
  HTMLDivElement,
  ContextMenuContentProps
>(function ContextMenuContent({ className, ...props }, ref) {
  const styles = contextMenuVariants();
  return (
    <BaseContextMenu.Popup
      ref={ref}
      className={styles.content({ className })}
      {...props}
    />
  );
});
ContextMenuContent.displayName = "ContextMenuContent";

export type ContextMenuItemProps = Omit<
  BaseContextMenuItemProps,
  "className"
> &
  Pick<ContextMenuRecipeProps, "inset" | "variant"> & {
    className?: string;
  };

export const ContextMenuItem = React.forwardRef<
  HTMLElement,
  ContextMenuItemProps
>(function ContextMenuItem(
  { className, inset = false, variant = "default", ...props },
  ref,
) {
  const styles = contextMenuVariants({ inset, variant });
  return (
    <BaseContextMenu.Item
      ref={ref}
      className={styles.item({ className })}
      {...props}
    />
  );
});
ContextMenuItem.displayName = "ContextMenuItem";

export type ContextMenuLinkItemProps = Omit<
  BaseContextMenuLinkItemProps,
  "className"
> &
  Pick<ContextMenuRecipeProps, "inset" | "variant"> & {
    className?: string;
  };

export const ContextMenuLinkItem = React.forwardRef<
  Element,
  ContextMenuLinkItemProps
>(function ContextMenuLinkItem(
  { className, inset = false, variant = "default", ...props },
  ref,
) {
  const styles = contextMenuVariants({ inset, variant });
  return (
    <BaseContextMenu.LinkItem
      ref={ref}
      className={styles.item({ className })}
      {...props}
    />
  );
});
ContextMenuLinkItem.displayName = "ContextMenuLinkItem";

export type ContextMenuCheckboxItemProps = Omit<
  BaseContextMenuCheckboxItemProps,
  "className"
> &
  Pick<ContextMenuRecipeProps, "inset" | "variant"> & {
    className?: string;
  };

export const ContextMenuCheckboxItem = React.forwardRef<
  HTMLElement,
  ContextMenuCheckboxItemProps
>(function ContextMenuCheckboxItem(
  { className, inset = true, variant = "default", ...props },
  ref,
) {
  const styles = contextMenuVariants({ inset, variant });
  return (
    <BaseContextMenu.CheckboxItem
      ref={ref}
      className={styles.item({ className })}
      {...props}
    />
  );
});
ContextMenuCheckboxItem.displayName = "ContextMenuCheckboxItem";

export type ContextMenuCheckboxItemIndicatorProps = Omit<
  BaseContextMenuCheckboxItemIndicatorProps,
  "className"
> & {
  className?: string;
};

export const ContextMenuCheckboxItemIndicator = React.forwardRef<
  HTMLSpanElement,
  ContextMenuCheckboxItemIndicatorProps
>(function ContextMenuCheckboxItemIndicator(
  { className, children = <Glyph name="check" />, ...props },
  ref,
) {
  const styles = contextMenuVariants();
  return (
    <BaseContextMenu.CheckboxItemIndicator
      ref={ref}
      className={styles.indicator({ className })}
      {...props}
    >
      {children}
    </BaseContextMenu.CheckboxItemIndicator>
  );
});
ContextMenuCheckboxItemIndicator.displayName =
  "ContextMenuCheckboxItemIndicator";

export type ContextMenuRadioItemProps = Omit<
  BaseContextMenuRadioItemProps,
  "className"
> &
  Pick<ContextMenuRecipeProps, "inset" | "variant"> & {
    className?: string;
  };

export const ContextMenuRadioItem = React.forwardRef<
  HTMLElement,
  ContextMenuRadioItemProps
>(function ContextMenuRadioItem(
  { className, inset = true, variant = "default", ...props },
  ref,
) {
  const styles = contextMenuVariants({ inset, variant });
  return (
    <BaseContextMenu.RadioItem
      ref={ref}
      className={styles.item({ className })}
      {...props}
    />
  );
});
ContextMenuRadioItem.displayName = "ContextMenuRadioItem";

export type ContextMenuRadioItemIndicatorProps = Omit<
  BaseContextMenuRadioItemIndicatorProps,
  "className"
> & {
  className?: string;
};

export const ContextMenuRadioItemIndicator = React.forwardRef<
  HTMLSpanElement,
  ContextMenuRadioItemIndicatorProps
>(function ContextMenuRadioItemIndicator({ className, children, ...props }, ref) {
  const styles = contextMenuVariants();
  return (
    <BaseContextMenu.RadioItemIndicator
      ref={ref}
      className={styles.radioIndicator({ className })}
      {...props}
    >
      {children}
    </BaseContextMenu.RadioItemIndicator>
  );
});
ContextMenuRadioItemIndicator.displayName = "ContextMenuRadioItemIndicator";

export type ContextMenuSubmenuTriggerProps = Omit<
  BaseContextMenuSubmenuTriggerProps,
  "className" | "children"
> &
  Pick<ContextMenuRecipeProps, "inset" | "variant"> & {
    children?: React.ReactNode;
    className?: string;
    icon?: React.ReactNode;
  };

export const ContextMenuSubmenuTrigger = React.forwardRef<
  HTMLElement,
  ContextMenuSubmenuTriggerProps
>(function ContextMenuSubmenuTrigger(
  {
    children,
    className,
    icon = <Glyph name="chevron-right" />,
    inset = false,
    variant = "default",
    ...props
  },
  ref,
) {
  const styles = contextMenuVariants({ inset, variant });
  return (
    <BaseContextMenu.SubmenuTrigger
      ref={ref}
      className={styles.item({ className })}
      {...props}
    >
      {children}
      <span className={styles.submenuIcon()}>{icon}</span>
    </BaseContextMenu.SubmenuTrigger>
  );
});
ContextMenuSubmenuTrigger.displayName = "ContextMenuSubmenuTrigger";

export type ContextMenuLabelProps = Omit<
  BaseContextMenuGroupLabelProps,
  "className"
> & {
  className?: string;
};

export const ContextMenuLabel = React.forwardRef<
  HTMLDivElement,
  ContextMenuLabelProps
>(function ContextMenuLabel({ className, ...props }, ref) {
  const styles = contextMenuVariants();
  return (
    <BaseContextMenu.GroupLabel
      ref={ref}
      className={styles.label({ className })}
      {...props}
    />
  );
});
ContextMenuLabel.displayName = "ContextMenuLabel";

export type ContextMenuSeparatorProps = Omit<
  React.ComponentPropsWithoutRef<typeof BaseContextMenu.Separator>,
  "className"
> & {
  className?: string;
};

export const ContextMenuSeparator = React.forwardRef<
  HTMLDivElement,
  ContextMenuSeparatorProps
>(function ContextMenuSeparator({ className, ...props }, ref) {
  const styles = contextMenuVariants();
  return (
    <BaseContextMenu.Separator
      ref={ref}
      className={styles.separator({ className })}
      {...props}
    />
  );
});
ContextMenuSeparator.displayName = "ContextMenuSeparator";

export type ContextMenuShortcutProps =
  React.HTMLAttributes<HTMLSpanElement> & {
    className?: string;
  };

export const ContextMenuShortcut = React.forwardRef<
  HTMLSpanElement,
  ContextMenuShortcutProps
>(function ContextMenuShortcut({ className, ...props }, ref) {
  const styles = contextMenuVariants();
  return (
    <span ref={ref} className={styles.shortcut({ className })} {...props} />
  );
});
ContextMenuShortcut.displayName = "ContextMenuShortcut";

export const ContextMenu = Object.assign(ContextMenuRoot, {
  Root: ContextMenuRoot,
  Trigger: ContextMenuTrigger,
  Portal: ContextMenuPortal,
  Positioner: ContextMenuPositioner,
  Content: ContextMenuContent,
  Item: ContextMenuItem,
  LinkItem: ContextMenuLinkItem,
  CheckboxItem: ContextMenuCheckboxItem,
  CheckboxItemIndicator: ContextMenuCheckboxItemIndicator,
  RadioGroup: ContextMenuRadioGroup,
  RadioItem: ContextMenuRadioItem,
  RadioItemIndicator: ContextMenuRadioItemIndicator,
  SubmenuRoot: ContextMenuSubmenuRoot,
  SubmenuTrigger: ContextMenuSubmenuTrigger,
  Label: ContextMenuLabel,
  Separator: ContextMenuSeparator,
  Shortcut: ContextMenuShortcut,
  Arrow: ContextMenuArrow,
  Backdrop: ContextMenuBackdrop,
  Group: ContextMenuGroup,
});
