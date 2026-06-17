import { Badge, StatusDot, statusTone } from "@angee/base";
import type * as React from "react";

export interface StateTagProps {
  state: string;
}

export function StateTag({ state }: StateTagProps): React.ReactNode {
  const tone = stateTone(state);
  const label = stateLabel(state);

  return (
    <Badge density="compact" shape="pill" tone={tone}>
      <StatusDot size="sm" tone={tone} />
      {label}
    </Badge>
  );
}

// The daemon reports open-set slugs (running/stopped/error/…); the shared `statusTone`
// vocabulary colors them exactly as every other status surface does, so the console and
// the agent pages never drift. A slug the vocabulary doesn't know falls to `brand`
// there; for these raw daemon states we read an unknown as the quiet `neutral` instead.
function stateTone(state: string): React.ComponentProps<typeof Badge>["tone"] {
  const tone = statusTone(state.trim());
  return tone === "brand" ? "neutral" : tone;
}

function stateLabel(state: string): string {
  const label = state.trim();
  if (!label) return "Unknown";

  return label
    .split(/[\s_-]+/)
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
