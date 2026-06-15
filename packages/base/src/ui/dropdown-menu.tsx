import * as React from "react";
import { Menu as BaseMenu } from "@base-ui/react/menu";
import type {
  MenuArrowProps as BaseMenuArrowProps,
  MenuBackdropProps as BaseMenuBackdropProps,
  MenuCheckboxItemIndicatorProps as BaseMenuCheckboxItemIndicatorProps,
  MenuCheckboxItemProps as BaseMenuCheckboxItemProps,
  MenuGroupLabelProps as BaseMenuGroupLabelProps,
  MenuGroupProps as BaseMenuGroupProps,
  MenuItemProps as BaseMenuItemProps,
  MenuLinkItemProps as BaseMenuLinkItemProps,
  MenuPopupProps as BaseMenuPopupProps,
  MenuPortalProps as BaseMenuPortalProps,
  MenuPositionerProps as BaseMenuPositionerProps,
  MenuRadioGroupProps as BaseMenuRadioGroupProps,
  MenuRadioItemIndicatorProps as BaseMenuRadioItemIndicatorProps,
  MenuRadioItemProps as BaseMenuRadioItemProps,
  MenuRootProps as BaseMenuRootProps,
  MenuSubmenuRootProps as BaseMenuSubmenuRootProps,
  MenuSubmenuTriggerProps as BaseMenuSubmenuTriggerProps,
  MenuTriggerProps as BaseMenuTriggerProps,
} from "@base-ui/react/menu";

import { Glyph } from "../chrome/Glyph";
import { tv, type VariantProps } from "../lib/variants";
import { POPUP_BASE } from "./popover";

export const dropdownMenuVariants = tv({
  slots: {
    content: `${POPUP_BASE} min-w-44 p-1`,
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

type DropdownMenuRecipeProps = VariantProps<typeof dropdownMenuVariants>;

export type DropdownMenuItemVariant = NonNullable<
  DropdownMenuRecipeProps["variant"]
>;
export type DropdownMenuRootProps<Payload = unknown> =
  BaseMenuRootProps<Payload>;
export type DropdownMenuTriggerProps<Payload = unknown> =
  BaseMenuTriggerProps<Payload>;
export type DropdownMenuPortalProps = BaseMenuPortalProps;
export type DropdownMenuPositionerProps = BaseMenuPositionerProps;
export type DropdownMenuArrowProps = BaseMenuArrowProps;
export type DropdownMenuBackdropProps = BaseMenuBackdropProps;
export type DropdownMenuGroupProps = BaseMenuGroupProps;
export type DropdownMenuRadioGroupProps = BaseMenuRadioGroupProps;
export type DropdownMenuSubmenuRootProps = BaseMenuSubmenuRootProps;
export type DropdownMenuViewportProps = React.ComponentPropsWithoutRef<
  typeof BaseMenu.Viewport
>;

export const DropdownMenuRoot = BaseMenu.Root;
export const DropdownMenuTrigger = BaseMenu.Trigger;
export const DropdownMenuPortal = BaseMenu.Portal;
export const DropdownMenuPositioner = BaseMenu.Positioner;
export const DropdownMenuArrow = BaseMenu.Arrow;
export const DropdownMenuBackdrop = BaseMenu.Backdrop;
export const DropdownMenuGroup = BaseMenu.Group;
export const DropdownMenuRadioGroup = BaseMenu.RadioGroup;
export const DropdownMenuSubmenuRoot = BaseMenu.SubmenuRoot;
export const DropdownMenuViewport = BaseMenu.Viewport;

export type DropdownMenuContentProps = Omit<
  BaseMenuPopupProps,
  "className"
> & {
  className?: string;
};

export const DropdownMenuContent = React.forwardRef<
  HTMLDivElement,
  DropdownMenuContentProps
>(function DropdownMenuContent({ className, ...props }, ref) {
  const styles = dropdownMenuVariants();
  return (
    <BaseMenu.Popup
      ref={ref}
      className={styles.content({ className })}
      {...props}
    />
  );
});
DropdownMenuContent.displayName = "DropdownMenuContent";

export type DropdownMenuItemProps = Omit<
  BaseMenuItemProps,
  "className"
> &
  Pick<DropdownMenuRecipeProps, "inset" | "variant"> & {
    className?: string;
  };

export const DropdownMenuItem = React.forwardRef<
  HTMLElement,
  DropdownMenuItemProps
>(function DropdownMenuItem(
  { className, inset = false, variant = "default", ...props },
  ref,
) {
  const styles = dropdownMenuVariants({ inset, variant });
  return (
    <BaseMenu.Item
      ref={ref}
      className={styles.item({ className })}
      {...props}
    />
  );
});
DropdownMenuItem.displayName = "DropdownMenuItem";

export type DropdownMenuLinkItemProps = Omit<
  BaseMenuLinkItemProps,
  "className"
> &
  Pick<DropdownMenuRecipeProps, "inset" | "variant"> & {
    className?: string;
  };

export const DropdownMenuLinkItem = React.forwardRef<
  Element,
  DropdownMenuLinkItemProps
>(function DropdownMenuLinkItem(
  { className, inset = false, variant = "default", ...props },
  ref,
) {
  const styles = dropdownMenuVariants({ inset, variant });
  return (
    <BaseMenu.LinkItem
      ref={ref}
      className={styles.item({ className })}
      {...props}
    />
  );
});
DropdownMenuLinkItem.displayName = "DropdownMenuLinkItem";

export type DropdownMenuCheckboxItemProps = Omit<
  BaseMenuCheckboxItemProps,
  "className"
> &
  Pick<DropdownMenuRecipeProps, "inset" | "variant"> & {
    className?: string;
  };

export const DropdownMenuCheckboxItem = React.forwardRef<
  HTMLElement,
  DropdownMenuCheckboxItemProps
>(function DropdownMenuCheckboxItem(
  { className, inset = true, variant = "default", ...props },
  ref,
) {
  const styles = dropdownMenuVariants({ inset, variant });
  return (
    <BaseMenu.CheckboxItem
      ref={ref}
      className={styles.item({ className })}
      {...props}
    />
  );
});
DropdownMenuCheckboxItem.displayName = "DropdownMenuCheckboxItem";

export type DropdownMenuCheckboxItemIndicatorProps = Omit<
  BaseMenuCheckboxItemIndicatorProps,
  "className"
> & {
  className?: string;
};

export const DropdownMenuCheckboxItemIndicator = React.forwardRef<
  HTMLSpanElement,
  DropdownMenuCheckboxItemIndicatorProps
>(function DropdownMenuCheckboxItemIndicator(
  { className, children = <Glyph name="check" />, ...props },
  ref,
) {
  const styles = dropdownMenuVariants();
  return (
    <BaseMenu.CheckboxItemIndicator
      ref={ref}
      className={styles.indicator({ className })}
      {...props}
    >
      {children}
    </BaseMenu.CheckboxItemIndicator>
  );
});
DropdownMenuCheckboxItemIndicator.displayName =
  "DropdownMenuCheckboxItemIndicator";

export type DropdownMenuRadioItemProps = Omit<
  BaseMenuRadioItemProps,
  "className"
> &
  Pick<DropdownMenuRecipeProps, "inset" | "variant"> & {
    className?: string;
  };

export const DropdownMenuRadioItem = React.forwardRef<
  HTMLElement,
  DropdownMenuRadioItemProps
>(function DropdownMenuRadioItem(
  { className, inset = true, variant = "default", ...props },
  ref,
) {
  const styles = dropdownMenuVariants({ inset, variant });
  return (
    <BaseMenu.RadioItem
      ref={ref}
      className={styles.item({ className })}
      {...props}
    />
  );
});
DropdownMenuRadioItem.displayName = "DropdownMenuRadioItem";

export type DropdownMenuRadioItemIndicatorProps = Omit<
  BaseMenuRadioItemIndicatorProps,
  "className"
> & {
  className?: string;
};

export const DropdownMenuRadioItemIndicator = React.forwardRef<
  HTMLSpanElement,
  DropdownMenuRadioItemIndicatorProps
>(function DropdownMenuRadioItemIndicator({ className, children, ...props }, ref) {
  const styles = dropdownMenuVariants();
  return (
    <BaseMenu.RadioItemIndicator
      ref={ref}
      className={styles.radioIndicator({ className })}
      {...props}
    >
      {children}
    </BaseMenu.RadioItemIndicator>
  );
});
DropdownMenuRadioItemIndicator.displayName = "DropdownMenuRadioItemIndicator";

export type DropdownMenuSubmenuTriggerProps = Omit<
  BaseMenuSubmenuTriggerProps,
  "className" | "children"
> &
  Pick<DropdownMenuRecipeProps, "inset" | "variant"> & {
    children?: React.ReactNode;
    className?: string;
    icon?: React.ReactNode;
  };

export const DropdownMenuSubmenuTrigger = React.forwardRef<
  HTMLElement,
  DropdownMenuSubmenuTriggerProps
>(function DropdownMenuSubmenuTrigger(
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
  const styles = dropdownMenuVariants({ inset, variant });
  return (
    <BaseMenu.SubmenuTrigger
      ref={ref}
      className={styles.item({ className })}
      {...props}
    >
      {children}
      <span className={styles.submenuIcon()}>{icon}</span>
    </BaseMenu.SubmenuTrigger>
  );
});
DropdownMenuSubmenuTrigger.displayName = "DropdownMenuSubmenuTrigger";

export type DropdownMenuLabelProps = Omit<
  BaseMenuGroupLabelProps,
  "className"
> & {
  className?: string;
};

export const DropdownMenuLabel = React.forwardRef<
  HTMLDivElement,
  DropdownMenuLabelProps
>(function DropdownMenuLabel({ className, ...props }, ref) {
  const styles = dropdownMenuVariants();
  return (
    <BaseMenu.GroupLabel
      ref={ref}
      className={styles.label({ className })}
      {...props}
    />
  );
});
DropdownMenuLabel.displayName = "DropdownMenuLabel";

export type DropdownMenuSeparatorProps = Omit<
  React.ComponentPropsWithoutRef<typeof BaseMenu.Separator>,
  "className"
> & {
  className?: string;
};

export const DropdownMenuSeparator = React.forwardRef<
  HTMLDivElement,
  DropdownMenuSeparatorProps
>(function DropdownMenuSeparator({ className, ...props }, ref) {
  const styles = dropdownMenuVariants();
  return (
    <BaseMenu.Separator
      ref={ref}
      className={styles.separator({ className })}
      {...props}
    />
  );
});
DropdownMenuSeparator.displayName = "DropdownMenuSeparator";

export type DropdownMenuShortcutProps =
  React.HTMLAttributes<HTMLSpanElement> & {
    className?: string;
  };

export const DropdownMenuShortcut = React.forwardRef<
  HTMLSpanElement,
  DropdownMenuShortcutProps
>(function DropdownMenuShortcut({ className, ...props }, ref) {
  const styles = dropdownMenuVariants();
  return (
    <span ref={ref} className={styles.shortcut({ className })} {...props} />
  );
});
DropdownMenuShortcut.displayName = "DropdownMenuShortcut";

export const DropdownMenu = Object.assign(DropdownMenuRoot, {
  Root: DropdownMenuRoot,
  Trigger: DropdownMenuTrigger,
  Portal: DropdownMenuPortal,
  Positioner: DropdownMenuPositioner,
  Content: DropdownMenuContent,
  Item: DropdownMenuItem,
  LinkItem: DropdownMenuLinkItem,
  CheckboxItem: DropdownMenuCheckboxItem,
  CheckboxItemIndicator: DropdownMenuCheckboxItemIndicator,
  RadioGroup: DropdownMenuRadioGroup,
  RadioItem: DropdownMenuRadioItem,
  RadioItemIndicator: DropdownMenuRadioItemIndicator,
  SubmenuRoot: DropdownMenuSubmenuRoot,
  SubmenuTrigger: DropdownMenuSubmenuTrigger,
  Label: DropdownMenuLabel,
  Separator: DropdownMenuSeparator,
  Shortcut: DropdownMenuShortcut,
  Arrow: DropdownMenuArrow,
  Backdrop: DropdownMenuBackdrop,
  Group: DropdownMenuGroup,
  Viewport: DropdownMenuViewport,
});
