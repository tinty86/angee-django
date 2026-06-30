# Preview markdown code-split — follow-up & bundle finding

Context: `angee/web/ui/src/preview/builtins.tsx` previously `import`ed
`react-markdown` + `remark-gfm` statically for the markdown preview renderer.
The renderer now defers them through a code-split leaf
(`preview/MarkdownPreviewBody.tsx`, `React.lazy` + the pane's ancestor
`LazyBoundary`), mirroring `chrome/SpotlightCommandList.tsx`.

## Corrected bundle finding (the headline was imprecise)

The task framed this as "evict react-markdown from the BOOT entry chunk." Empirically
(`vite build --sourcemap` on `examples/notes-angee/web`, before vs after), react-markdown
was **never in the boot entry chunk** — the entry's static-import closure is 33 chunks and
never included it. The storage UI is a dynamic `import()` route chunk; react-markdown rode
in via **StoragePage's eager static closure** (and the dynamic markdown-widget chunk).

What the change actually buys, verified:
- StoragePage static closure 42 → 41 chunks; react-markdown no longer in it. So react-markdown
  stops loading just because the Storage page mounts.
- react-markdown is now reachable only behind a dynamic `import()` (`MarkdownPreviewBody` for
  preview, `lazyWidget` for the editor widget) — it loads on first markdown preview instead.

Accurate description for future work: "defer react-markdown out of the eager storage-page load
to on-demand markdown preview," not "remove from boot."

## Open DRY follow-up (carried, not introduced)

`@angee/ui` now has two react-markdown render sites: the `Markdown` read primitive
(`widgets/markdown.tsx`) and `preview/MarkdownPreviewBody.tsx`, both wiring `remarkGfm`.
The duplication pre-existed (old `builtins.tsx` already rendered react-markdown distinctly
from the widget). It is kept separate for two real reasons:
- `widgets/markdown.tsx` statically imports CodeMirror, so composing its primitive would drag
  CodeMirror into the read-only preview chunk.
- its `PROSE_CLASS` differs from the preview's `prose-angee` styling (composing it would not be
  behavior-neutral).

Real DRY fix (out of scope here): split `widgets/markdown.tsx` into a CodeMirror-free read leaf
that owns react-markdown + the prose styling, have both the `Markdown` primitive and the preview
compose it, and delete `MarkdownPreviewBody.tsx`. Until then the duplicate is investment toward
that single owner.
