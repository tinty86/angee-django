import { useCallback, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";

import { PublicShell } from "../shell/PublicShell";
import { UsernamePasswordForm } from "./UsernamePasswordForm";

export interface LoginPageProps {
  /** Brand mark or title rendered above the card. */
  brand?: ReactNode;
  /** Where to land after sign-in when `?next=` is missing. Defaults to `/`. */
  redirectTo?: string;
  /** Footer below the card — e.g. a demo-credentials hint. */
  footer?: ReactNode;
}

/**
 * The anonymous sign-in surface: a `PublicShell` wrapping a
 * `UsernamePasswordForm`. On success it navigates to the `?next=` search param
 * (when present) or `redirectTo`.
 */
export function LoginPage({
  brand,
  redirectTo = "/",
  footer,
}: LoginPageProps): ReactNode {
  const navigate = useNavigate();

  const onSuccess = useCallback(() => {
    const next =
      typeof window === "undefined"
        ? null
        : new URLSearchParams(window.location.search).get("next");
    navigate({ to: next ?? redirectTo });
  }, [navigate, redirectTo]);

  return (
    <PublicShell brand={brand} footer={footer}>
      <UsernamePasswordForm onSuccess={onSuccess} />
    </PublicShell>
  );
}
