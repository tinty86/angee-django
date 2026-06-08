import { type ReactElement } from "react";

import { EmptyState, Glyph, LoadingPanel, Markdown } from "@angee/base";

import type { KnowledgePageDetail } from "../data/documents";

export interface PageReaderProps {
  detail: KnowledgePageDetail | null;
  fetching: boolean;
}

/**
 * The open page rendered for reading: its title, a small meta line, and its
 * markdown body as prose. Folder pages carry no body, so they show a hint
 * instead of an empty document.
 */
export function PageReader({ detail, fetching }: PageReaderProps): ReactElement {
  if (!detail) {
    return fetching ? (
      <LoadingPanel message="Loading page" />
    ) : (
      <div className="grid h-full place-content-center p-8">
        <EmptyState
          icon="note"
          title="Page not found"
          description="This page is no longer available."
        />
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-[820px] flex-col gap-5 overflow-auto px-8 py-8">
      <header className="grid gap-1">
        <h1 className="flex items-center gap-2 text-28 font-semibold leading-9 text-fg">
          <Glyph decorative name={detail.kind === "folder" ? "folder" : "note"} className="text-fg-muted" />
          {detail.title || "Untitled"}
        </h1>
        <p className="font-mono text-13 text-fg-muted">{metaLine(detail)}</p>
      </header>

      {detail.markdown ? (
        <Markdown value={detail.markdown.body} />
      ) : (
        <div className="grid flex-1 place-content-center">
          <EmptyState
            icon="folder"
            title="Folder"
            description="A folder groups pages — open a page in the tree to read it."
          />
        </div>
      )}
    </div>
  );
}

function metaLine(detail: KnowledgePageDetail): string {
  const parts = [detail.createdByLabel ?? "—", formatDate(detail.updatedAt)];
  if (detail.markdown) {
    parts.push(`${detail.markdown.wordCount.toLocaleString()} words`);
  }
  return parts.join(" · ");
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
