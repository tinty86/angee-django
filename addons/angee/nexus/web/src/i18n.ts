import { createNamespaceT } from "@angee/ui";

export const enNexusMessages: Record<string, string> = {
  "menu.root": "Connections",
  "menu.review": "Review",
  "menu.ties": "Ties",
  "review.title": "Review",
  "review.description":
    "Identity claims the system inferred but will not act on alone. Accepting confirms the link at full confidence; dismissing writes a durable anti-link so the same match is never proposed again.",
  "review.party": "Contact",
  "review.handle": "Handle",
  "review.platform": "Platform",
  "review.accept": "Link handle to this contact",
  "review.dismiss": "Dismiss — never suggest this link again",
  "review.empty": "Nothing to review — every identity claim is decided.",
  "ties.party": "Contact",
  "ties.gravity": "Gravity",
  "ties.messages": "Messages",
  "ties.lastContact": "Last contact",
  "ties.fading": "Fading",
  "ties.touchDue": "Touch due",
  "ties.cadence": "Stay in touch (days)",
  "ties.group.cadence": "Stay in touch",
  "timeline.tab": "Timeline",
  "timeline.count": "{count} messages across every channel",
  "timeline.loadOlder": "Load older",
  "timeline.empty": "No messages exchanged with this contact yet.",
  "timeline.inbound": "Inbound",
  "timeline.outbound": "Outbound",
  "timeline.internal": "Internal",
};

export const useNexusT = createNamespaceT("nexus", enNexusMessages);
