import * as React from "react";

import { tv, type VariantProps } from "../lib/variants";

export const codeVariants = tv({
  base: "inline-flex max-w-full items-center rounded font-mono leading-none",
  variants: {
    variant: {
      default: "text-fg",
      muted: "text-fg-muted",
      success: "text-success-text",
      warning: "text-warning-text",
      danger: "text-danger-text",
      info: "text-info-text",
    },
    surface: {
      none: "",
      inset: "bg-inset px-1.5 py-1",
      sheet: "bg-sheet px-1.5 py-1",
    },
    size: {
      sm: "text-2xs",
      md: "text-xs",
    },
    truncate: {
      true: "min-w-0 truncate",
      false: "",
    },
  },
  defaultVariants: {
    variant: "default",
    surface: "none",
    size: "sm",
    truncate: false,
  },
});

export const codeBlockVariants = tv({
  base: "block max-w-full overflow-x-auto rounded-md border border-border-subtle bg-inset p-3 font-mono text-xs leading-5 text-fg",
  variants: {
    wrap: {
      true: "whitespace-pre-wrap break-words",
      false: "whitespace-pre",
    },
    tone: {
      default: "",
      muted: "text-fg-muted",
      danger: "border-danger-soft bg-danger-soft text-danger-text",
      success: "border-success-soft bg-success-soft text-success-text",
      warning: "border-warning-soft bg-warning-soft text-warning-text",
    },
  },
  defaultVariants: {
    wrap: false,
    tone: "default",
  },
});

type CodeRecipeProps = VariantProps<typeof codeVariants>;
type CodeBlockRecipeProps = VariantProps<typeof codeBlockVariants>;

export type CodeVariant = NonNullable<CodeRecipeProps["variant"]>;
export type CodeSurface = NonNullable<CodeRecipeProps["surface"]>;
export type CodeSize = NonNullable<CodeRecipeProps["size"]>;
export type CodeBlockTone = NonNullable<CodeBlockRecipeProps["tone"]>;

export type CodeProps = Omit<
  React.HTMLAttributes<HTMLElement>,
  "className" | "color"
> &
  CodeRecipeProps & {
    className?: string;
  };

export const Code = React.forwardRef<HTMLElement, CodeProps>(function Code(
  {
    className,
    size = "sm",
    surface = "none",
    truncate = false,
    variant = "default",
    ...props
  },
  ref,
) {
  return (
    <code
      ref={ref}
      className={codeVariants({ className, size, surface, truncate, variant })}
      {...props}
    />
  );
});
Code.displayName = "Code";

export type CodeBlockProps = Omit<
  React.HTMLAttributes<HTMLPreElement>,
  "className" | "color"
> &
  CodeBlockRecipeProps & {
    className?: string;
  };

export const CodeBlock = React.forwardRef<HTMLPreElement, CodeBlockProps>(
  function CodeBlock(
    { children, className, tone = "default", wrap = false, ...props },
    ref,
  ) {
    return (
      <pre
        ref={ref}
        className={codeBlockVariants({ className, tone, wrap })}
        {...props}
      >
        <code>{children}</code>
      </pre>
    );
  },
);
CodeBlock.displayName = "CodeBlock";
