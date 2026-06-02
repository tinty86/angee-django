import * as React from "react";

import { Glyph } from "../chrome/Glyph";
import { Alert, alertVariants, type BannerProps } from "../ui/alert";

export type ErrorBannerProps = Omit<
  BannerProps,
  "children" | "intent" | "surface" | "title"
> & {
  message: React.ReactNode | null;
  title?: React.ReactNode;
};

export const ErrorBanner = React.forwardRef<HTMLDivElement, ErrorBannerProps>(
  function ErrorBanner(
    {
      actions,
      className,
      dismissLabel = "Dismiss",
      message,
      onDismiss,
      title,
      ...props
    },
    ref,
  ) {
    if (!message) return null;
    const styles = alertVariants({ intent: "danger", surface: "banner" });
    const dismissAction = onDismiss ? (
      <button
        type="button"
        aria-label={dismissLabel}
        className={styles.dismiss()}
        onClick={onDismiss}
      >
        <Glyph decorative name="x" />
      </button>
    ) : null;

    return (
      <Alert
        ref={ref}
        actions={
          actions || dismissAction ? (
            <>
              {actions}
              {dismissAction}
            </>
          ) : undefined
        }
        className={className}
        intent="danger"
        surface="banner"
        title={title}
        {...props}
      >
        <span className="block truncate">{message}</span>
      </Alert>
    );
  },
);
ErrorBanner.displayName = "ErrorBanner";
