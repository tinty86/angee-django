// Radius-unification codemod (plan D8 / design-dry-spec).
//
// Collapses the legacy Tailwind named radius spellings onto the canonical Angee
// `rounded-N` PIXEL token scale (`--radius-N: Npx` in styles/index.css @theme,
// merged into tailwind-merge via lib/tailwind-merge-config.ts RADIUS_TOKENS).
// Every rewrite is PIXEL-EQUIVALENT — verified against the repo's token defs:
//
//   styles/index.css  --radius:    var(--r-6)   => bare `rounded` = 6px
//                     --radius-2/4/6/8/10/12 = Npx   (the canonical scale)
//   (no --radius-sm/md/lg/xl/xs override) => the named utilities resolve to
//   Tailwind v4 defaults, so:
//     rounded-xs = 0.125rem = 2px  -> rounded-2
//     rounded-sm = 0.25rem  = 4px  -> rounded-4
//     rounded-md = 0.375rem = 6px  -> rounded-6
//     rounded-lg = 0.5rem   = 8px  -> rounded-8
//     rounded-xl = 0.75rem  = 12px -> rounded-12
//   bare `rounded`                  -> rounded-6   (--radius = 6px)
//   side variants inherit the same mapping (rounded-t-md -> rounded-t-6, etc.)
//
// NO-TOKEN classes have NO pixel-equal token, so they are FLAGGED and left
// untouched (no pixel change is permitted): rounded-2xl (16px), rounded-3xl
// (24px), rounded-none (0px), and any arbitrary `rounded-[...]` value (handled
// as a separate arbitrary->token edit, out of this codemod's named-utility
// scope). `rounded-full` and already-`rounded-N` tokens are likewise left
// untouched.
//
// Scope: the design-system surface — packages/ui/src (the library) + every
// addons/*/web/src + the DS-consuming workspace surfaces (packages/storybook/src,
// packages/app/src, examples/notes-angee/web/src) — files *.ts / *.tsx. One
// canonical radius spelling holds everywhere the DS is rendered, not just inside
// the library, so every rewrite below is pixel-equivalent everywhere it runs.
//
// Exclusions (never touched):
//   - styles/tokens.css, styles/index.css @theme  -> token DEFINITIONS (also
//     not *.ts/*.tsx, so never scanned; listed for intent).
//   - lib/tailwind-merge-config.ts                -> the `rounded:` classGroup
//     config keys are not CSS classes.
//   - ui/badge.tsx, ui/chip.tsx                   -> these carry a `rounded`
//     VARIANT KEY (`shape: { rounded: "rounded" }`, `shape="rounded"`); a
//     blanket bare-`rounded` rewrite would corrupt the variant key/refs, so the
//     class VALUE there is changed by hand (see spec). Lexically the variant
//     reference `"rounded"` and the class `"rounded"` are indistinguishable, so
//     the whole file is excluded.
//   - rounded-full / rounded-none / already-rounded-N / arbitrary rounded-[...]
//     (protected by the regex lookaheads below, and reported under flagged).
//
// Usage:
//   node .agents/tools/radius-codemod.mjs            # dry-run (default)
//   node .agents/tools/radius-codemod.mjs --write    # apply edits in place
//   node .agents/tools/radius-codemod.mjs --json     # machine-readable report
//
// Output: per-file occurrence counts, the total, and any flagged no-token sites.

import { readFileSync, writeFileSync } from "node:fs";
import { readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const REPO_ROOT = "/Users/alexis/Work/angee/angee-django-ds-workbench";

const argv = process.argv.slice(2);
const WRITE = argv.includes("--write");
const JSON_OUT = argv.includes("--json");

// ---------------------------------------------------------------------------
// Scope + exclusions
// ---------------------------------------------------------------------------

const SCOPE_DIRS = [
  "packages/ui/src",
  ...listAddonWebSrc(),
  "packages/storybook/src",
  "packages/app/src",
  "examples/notes-angee/web/src",
];

// Repo-relative POSIX paths that must never be edited (see header).
const EXCLUDED_FILES = new Set(
  [
    "packages/ui/src/styles/tokens.css",
    "packages/ui/src/styles/index.css",
    "packages/ui/src/lib/tailwind-merge-config.ts",
    "packages/ui/src/ui/badge.tsx",
    "packages/ui/src/ui/chip.tsx",
    // The Badge/Chip stories drive the same `shape: { rounded | pill }` variant
    // through `shape="rounded"` props + argType options + label text — all
    // variant references, not classes, so the bare-`rounded` pass would corrupt
    // them exactly as it would the components above. They carry no real radius
    // class, so excluding the whole files loses no migration.
    "packages/storybook/src/stories/Badge.stories.tsx",
    "packages/storybook/src/stories/Chip.stories.tsx",
  ].map((p) => p.split("/").join(sep)),
);

const EXTENSIONS = new Set([".ts", ".tsx"]);

// ---------------------------------------------------------------------------
// Pixel-equivalent mapping (named suffix -> token number)
// ---------------------------------------------------------------------------

const SUFFIX_PX = { xs: 2, sm: 4, md: 6, lg: 8, xl: 12 };
const BARE_PX = 6; // --radius: var(--r-6)

const SIDE = "(?:-(?:t|b|l|r|tl|tr|bl|br))?";

// Pass 1 — named suffixes (xs|sm|md|lg|xl), with optional side. `2xl`/`3xl`
// never match (the char after the suffix hyphen is a digit), so they fall
// through to the flag pass.
const SUFFIX_RE = new RegExp(
  `\\brounded(${SIDE})-(xs|sm|md|lg|xl)\\b`,
  "g",
);

// Pass 2 — bare `rounded` and bare side (`rounded-t`, ...). The negative
// lookahead `(?![-\\w:])` excludes rounded-md/-full/-none/-N/-[...] (next char
// is `-`) and the `rounded:` variant/config key (next char is `:`).
const BARE_RE = new RegExp(
  `\\brounded(${SIDE})(?![-\\w:])`,
  "g",
);

// Flag pass — classes with NO pixel-equal token (left untouched).
const FLAG_RE = new RegExp(
  `\\brounded${SIDE}-(?:2xl|3xl|none|\\[[^\\]]*\\])`,
  "g",
);

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

const changed = []; // { file, count }
const flagged = []; // { file, matches: [..] }
let total = 0;

for (const dir of SCOPE_DIRS) {
  for (const abs of walk(join(REPO_ROOT, dir))) {
    const rel = relative(REPO_ROOT, abs);
    if (EXCLUDED_FILES.has(rel)) continue;
    if (!EXTENSIONS.has(extname(abs))) continue;

    const src = readFileSync(abs, "utf8");

    let count = 0;
    let next = src.replace(SUFFIX_RE, (_m, side, suf) => {
      count += 1;
      return `rounded${side}-${SUFFIX_PX[suf]}`;
    });
    next = next.replace(BARE_RE, (_m, side) => {
      count += 1;
      return `rounded${side}-${BARE_PX}`;
    });

    const flags = src.match(FLAG_RE);
    if (flags) flagged.push({ file: rel, matches: dedupeCount(flags) });

    if (count > 0) {
      changed.push({ file: rel, count });
      total += count;
      if (WRITE) writeFileSync(abs, next);
    }
  }
}

changed.sort((a, b) => a.file.localeCompare(b.file));
flagged.sort((a, b) => a.file.localeCompare(b.file));

if (JSON_OUT) {
  console.log(JSON.stringify({ mode: WRITE ? "write" : "dry", total, changed, flagged }, null, 2));
} else {
  console.log(`radius-codemod — ${WRITE ? "WRITE" : "DRY-RUN"}`);
  console.log(`scope: ${SCOPE_DIRS.join(", ")}`);
  console.log("");
  console.log(`Affected files (${changed.length}), ${total} occurrence(s):`);
  for (const { file, count } of changed) console.log(`  ${String(count).padStart(3)}  ${file}`);
  if (flagged.length) {
    console.log("");
    console.log(`FLAGGED — no pixel-equal token, left untouched (${flagged.length} file(s)):`);
    for (const { file, matches } of flagged) {
      console.log(`  ${file}: ${matches.join(", ")}`);
    }
  } else {
    console.log("");
    console.log("FLAGGED — none.");
  }
  if (!WRITE) console.log("\n(dry-run: no files written; pass --write to apply)");
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function listAddonWebSrc() {
  const addonsRoot = join(REPO_ROOT, "addons", "angee");
  let entries;
  try {
    entries = readdirSync(addonsRoot, { withFileTypes: true });
  } catch {
    return [];
  }
  const dirs = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const candidate = join(addonsRoot, e.name, "web", "src");
    try {
      if (statSync(candidate).isDirectory()) dirs.push(relative(REPO_ROOT, candidate));
    } catch {
      /* no web/src for this addon */
    }
  }
  return dirs.sort();
}

function* walk(root) {
  let entries;
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const abs = join(root, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === "dist") continue;
      yield* walk(abs);
    } else if (e.isFile()) {
      yield abs;
    }
  }
}

function extname(p) {
  const i = p.lastIndexOf(".");
  return i < 0 ? "" : p.slice(i);
}

function dedupeCount(arr) {
  const m = new Map();
  for (const x of arr) m.set(x, (m.get(x) ?? 0) + 1);
  return [...m.entries()].map(([k, n]) => `${k}×${n}`);
}
