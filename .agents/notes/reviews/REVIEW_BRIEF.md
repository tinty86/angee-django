# Code Review Brief — Angee framework core (`src/angee/base/`)

You are one of three independent senior reviewers (Claude subagent, Codex, Gemini),
each producing an INDEPENDENT analysis. Do not assume what the others will find.

## STEP 1 — Read the canonical docs first (do not skip, do not skim)

These files ARE the standard you review against — the project's own constitution
and rules. Open and read each one fully before looking at any code. Paths are
relative to the repo root (your working directory):

1. `AGENTS.md` — the Constitution ("Find the owner", DRY, compose at build time).
2. `docs/guidelines.md` — development process + coding principles.
3. `docs/backend/guidelines.md` — the Django-Native Rule, ownership, naming, checks.
4. `docs/stack.md` — which library owns which concern.
5. `docs/glossary.md` — the vocabulary (framework / base addon / composer / host /
   runtime / source model / resource / REBAC).

Do not restate these docs in your report. Judge the code against them and cite the
specific rule a finding violates (e.g. "violates the Django-Native Rule in
`docs/backend/guidelines.md`").

## STEP 2 — Scope to review

Primary: every `.py` file under `src/angee/base/`.
Reference (read for intent, do not deeply audit): `tests/`, `examples/notes-angee/`.

## Lens — review through these dimensions, judging against IDIOMATIC DJANGO

The gold standard is: how would a senior Django core developer write this using
Django's own owners (AppConfig, managers/querysets, fields, signals, system checks,
settings, management commands, the apps registry)? The backend guidelines'
Django-Native Rule is the concrete test.

1. **Architecture** — module boundaries, layering, separation of concerns,
   build-time vs runtime correctness.
2. **Consistency** — same concept expressed the same way; consistent error
   handling, logging, settings access, imports.
3. **Code decomposition** — function/class size & cohesion; the "find the owner"
   smell (a function that inspects an object to decide something → wants a method
   on the owner / polymorphism). Over- and under-abstraction.
4. **Naming conventions** — modules, classes, functions, variables; alignment with
   the backend guidelines' Naming section and the glossary.
5. **DRY** — duplicated facts/rules/shapes; knowledge that should live once at its
   owning level; parallel inventories in prose.
6. **Readability for humans** — control-flow clarity, comment/docstring quality on
   public API, naming-as-documentation.

## Output format — STRICT

A single markdown report:

### Summary
3-6 sentences: overall health, the single biggest structural problem, and whether
the code lives up to its own constitution.

### Findings
Numbered, ordered by severity (Critical first). Each finding:
- **Title** (one line)
- **Dimension(s)**: which of the 6 lenses
- **Location**: `path:line` (cite real files/lines)
- **Severity**: Critical / High / Medium / Low
- **Problem**: what's wrong and which doc rule / Django idiom it violates
- **Recommendation**: the concrete, smaller, more native Django fix

Prefer fewer high-confidence specific findings over many vague ones. Cite real
line numbers.

### Patterns & inconsistencies
Cross-cutting themes that recur across files (these matter most for the refactor).

### Top 5 recommendations
Ranked, actionable, one sentence each.

Be concrete and skeptical. Do not praise. The code will be refactored from your
report, so precision beats diplomacy.
