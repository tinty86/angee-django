# Knowledge page — decomposition into design-system components

**Source:** `../angee-knowledge-ui/mockups-html/{mockup,mockup-console}.html`
(tokens "mirrored from `packages/base/src/styles/tokens.css`"). Two framings of
one surface: `mockup.html` is the Obsidian-faithful standalone (own rail +
vault-chip + open-doc tabstrip); `mockup-console.html` is the **on-system
target** — the same surface inside `ConsoleAppShell` (rail · top sub-nav ·
breadcrumb · page view-switcher · New note). Decompose against the latter.

**Status legend:** ✅ exists in this repo · ⬆ lift from p1 (built there) · 🆕
net-new (in neither — a `knowledge` consumer addon, or a reusable base Element).

## The archetype

One page: **`DataPage` (Explorer variant)** over `knowledge.Page` —
`navigator` (vault tree) + a **view-switcher over peer Views of one note**
(Edit · Read · Graph · Canvas) + `aside` (context panel). It is the storage
Explorer shape (DataPage navigator + aside) where the "record" view is a rich
markdown editor and there are three more peer Views. `DataPage` routed mode
(D3) already owns `/knowledge` ⇄ `/knowledge/$id`; the page declares its Views.

```
DataPage model="knowledge.Page" basePath="/knowledge"
  navigator → <VaultTree>            (left explorer)
  <Views> Edit · Read · Graph · Canvas
  aside → <ContextPanel>             (Backlinks · Outline · Info)
```

## Region → component map

### Shell (`ConsoleAppShell`)
| Mockup region | Component | Status |
|---|---|---|
| Dark rail + brand + avatar + theme/settings | `AppRail` / `ConsoleAppShell` | ✅ (here) / ⬆ AppShell sub-nav derivation |
| Top sub-nav `Home·Pages 128·Vaults 3·Canvases 7·Graph·Imports` | `TopMenu` menu-group + `ChromeMenuItem.badge` counts | ✅ TopMenu + badge field |
| Global search pill `Search or jump to… ⌘K` | `GlobalSearch` → `Spotlight` + `Command` (cmdk) | ✅ |
| Breadcrumb `Knowledge / Pages / Systems / Graph-RAG retrieval` + `● active` chip | `Breadcrumb` (match-derived, D1b) + `statusBadge` | ✅ |
| Page toolbar right: `Edit·Read·Graph·Canvas` + panel toggle + `New note` | DataPage view-switcher (`DataViewSwitcher`) + aside toggle + create `Action` | ✅ switcher pattern; views are new |
| Status bar: `Saved · 412 words · 7 backlinks · main synced · Ln 24 · Markdown` | `StatusBar` + `DirtyPill` + metric segments | ⬆ p1 `StatusBar`; ✅ `DirtyPill`/`statusbar` widget |
| Vault-chip / open-doc **tabstrip** (standalone only) | `AppChooser` ✅ / multi-tab strip 🆕 | drop for console (routes, not tabs) |

### Navigator — vault explorer (left)
| Region | Component | Status |
|---|---|---|
| `Files · Search · Starred` tab strip | `SectionTabs` | ✅ |
| `Search vault…` input + `+` new | `Input` + create `Action` | ✅ |
| Folder/file tree (Systems/Reading, `Diagrams` w/ count, star, Templates eyebrow) | **`TreeView` / `FolderTree`** | ⬆ **lift from p1** (no TreeView here) |

### Views (peer renderings of one Page)
| View | Built from | Status |
|---|---|---|
| **Edit** — markdown live-preview editor | `markdown` widget (CodeMirror) + live-preview of the body Elements below | ✅ markdown widget; 🆕 the live-preview `MarkdownEditorView` (knowledge) |
| **Read** — frameless reading render | read surface of the markdown widget | 🆕 thin `ReadingView` |
| **Graph** — local/global/tags scope, legend, zoom | `GraphView` (xyflow) + scope toggle + legend + controls | ✅ GraphView; ⬆/extend the Obsidian scope-layout + legend |
| **Canvas** — JSON Canvas (groups, note/media/text cards, labelled edges) | `CanvasPage` + a JSON-Canvas node/edge model on xyflow | ✅ CanvasPage layout; 🆕 `CanvasView` + JSON-Canvas model (knowledge) |

### Elements (record chrome + body, inside Edit/Read)
| Element | Component | Status |
|---|---|---|
| Title (contenteditable H1) | form `Title` Element | ⬆ p1 Title; ✅ heading field |
| Frontmatter props bar: `tags · status · aliases · + Add property` | a property bar of `Field` widgets: `tagInput` (tags), `statusBadge` (status), `tagInput`/`text` (aliases) | ✅ widgets; 🆕 the frontmatter `PropertyBar` Element |
| Callout (info box) | `Callout` Element | 🆕 (reusable base Element) |
| Embed / transclusion (`![[LightRAG#^summary]]`) | `Embed`/`Transclusion` Element | 🆕 (knowledge) |
| Task list (`- [x]`) | GFM tasks via markdown | ✅ |
| Code block | markdown code | ✅ |
| Wikilink (incl. `broken`) + inline `#tag` | `WikiLink` / tag marks | 🆕 (knowledge markdown extension) |
| Wikilink / slash **suggester** popover (`[[Walk…`, "Create new note") | editor-anchored `Combobox`/`Suggester` | ✅ combobox; 🆕 editor-anchored suggester |

### Aside — context panel (`ctx-tabs`)
| Tab | Component | Status |
|---|---|---|
| Backlinks (source + mark-highlighted excerpts; Unlinked mentions) | `BacklinksPanel` | 🆕 (knowledge; uses the aside slot + a backlinks read) |
| Outline (h2/h3 nav, active) | `OutlinePanel` (from headings) | 🆕 (small; reusable) |
| Info (metagrid: status/tags/kind/owner/updated/words/links/access) | `MetaGrid` / `MetadataPanel` | ✅ |

### Overlays
| Region | Component | Status |
|---|---|---|
| Quick switcher (⌘O, `pageSuggest`, Pages/Actions, "Create new note") | `Spotlight` + `Command` (cmdk) | ✅ (needs the `pageSuggest` read) |

## What it tells us

- **The chrome and structure are ~70% existing/liftable.** Shell, breadcrumb,
  view-switcher, search/spotlight, MetaGrid, markdown widget, DataPage routed
  navigator/aside — all present here or in p1. The page is a faithful instance
  of the **storage-Explorer DataPage** archetype with extra peer Views.
- **Two base lifts unblock it:** `TreeView`/`FolderTree` (the navigator) and
  `StatusBar` (the footer) — both built in p1. A couple of small reusable base
  Elements (`Callout`, `OutlinePanel`) belong at framework level too.
- **The genuinely net-new work is a `knowledge` consumer addon**: the
  markdown live-preview editor extensions (wikilink/embed/transclusion/callout/
  inline-tag + the editor-anchored suggester), the JSON-Canvas `CanvasView`,
  the Obsidian-style `GraphView` scope layout, and the Backlinks panel — plus
  the Python `knowledge` addon's GraphQL surface (page tree, backlinks,
  pageSuggest, graph edges, canvas) which exists as models in p1 but has no web
  frontend in either repo.
- **It rides the full-lift sequence cleanly:** P5 TreeView/Explorer + P8
  Canvas/editor wiring in the design-system plan are exactly this page's
  prerequisites; the knowledge addon then composes them.

## Open decisions (architect)

- Q1 — Console framing confirmed as the target (drop the standalone rail +
  open-doc tabs), or keep an Obsidian-style standalone `KnowledgeShell`?
- Q2 — Which Elements are framework-level (reusable: `Callout`, `OutlinePanel`,
  `Embed`/transclusion, `StatusBar`, `TreeView`) vs knowledge-addon-local
  (wikilink/suggester, JSON-Canvas, Backlinks)?
- Q3 — Build order: lift `TreeView`/`StatusBar` + base Elements first (unblocks
  storage too), then the knowledge addon — or scaffold the whole knowledge page
  end-to-end as the next proof, like the iam Hub?
