# Focused Review Brief — Django file placement & module naming (`src/angee/base/`)

You are one of three independent reviewers. This is a NARROW review. Ignore
correctness, performance, DRY-of-logic, architecture-in-the-large, and anything
not about WHERE code lives and WHAT files are called. Answer ONE question:

> Which code, and which code decomposition, does **not feel like Django framework
> code** — because code is mixed into the wrong file, or because any *name* (file /
> module, class, or method / function) is inconsistent with Django convention?

## STEP 1 — Read the conventions you judge against (do not skip)

These OWN the rules; cite them, do not restate them:
1. `docs/backend/guidelines.md` — especially the **Naming** section, which owns all
   the rules you judge against:
   - **modules**: role-named lowercase (`models.py`, `managers.py`, `apps.py`,
     `signals.py`, `mixins.py`, `validators.py`, `fields.py`, `backends.py`,
     `admin.py`, `forms.py`, `urls.py`; structural dirs `migrations/`,
     `management/commands/`).
   - **classes**: PascalCase with a role suffix mirroring the module — `*Field`,
     `*Mixin`, `*Manager`, `*QuerySet`, `*Form`, `*Admin`, `*Config` (the AppConfig).
   - **methods / functions**: snake_case, verb-first from a stable vocabulary —
     `get_*` (accessors), `is_*` / `has_*` (booleans), `as_*` / `to_*` / `from_*`
     (conversions), `create_*` / `save_*` / `delete_*` (mutations);
     `_leading_underscore` for internal; `UPPER_SNAKE` for settings/constants.
     camelCase only when extending an external API that already uses it.
   - plus the Django-Native / "Find the owner" rules about which object owns a fact.
2. `docs/glossary.md` — the vocabulary (so names match concepts).
3. `AGENTS.md` — naming is a structural contract, not a style nit.

The gold standard: *a senior Django developer opening this package should find each
kind of code in the file Django convention says it lives in, with the filename that
Django would use.*

## STEP 2 — Scope

Only `.py` files under `src/angee/base/`. Judge these things, nothing else:

**A. Code in the wrong file** — code whose Django owner-module differs from where it
sits. Examples of the kind of thing to look for (not an exhaustive checklist —
think like a Django dev):
- managers / querysets defined in `models.py` instead of `managers.py` (or vice versa)
- signal handlers / signal wiring not in `signals.py`
- mixins not in `mixins.py`; widgets, fields, validators, backends in the wrong module
- view/URL code, management-command logic, or app-config logic placed off its
  conventional home
- a single module doing several Django roles that Django would split by file
- helpers that belong as methods on a model/manager/AppConfig living as loose
  module functions in a misleading file

**B. Inconsistent or non-Django filenames / module names** — files whose name does
not match Django's role-based convention, names that coin a synonym for an existing
concept, packages/modules named differently from the thing they hold, or two files
that should follow one naming pattern but don't.

**C. Class names that aren't Django** — a class whose name lacks the role suffix its
kind demands (a manager not named `*Manager`, a queryset not `*QuerySet`, a mixin
not `*Mixin`, an AppConfig not `*Config`, a field/widget/form/admin without its
suffix), a suffix that misrepresents the kind, or a synonym for a concept that
already has a name in the glossary.

**D. Method / function names that aren't Django** — names that break the verb-first
vocabulary above: an accessor not `get_*`, a boolean not `is_*`/`has_*`, a
conversion not `as_*`/`to_*`/`from_*`, a mutation not `create_*`/`save_*`/`delete_*`;
stray camelCase; a public name that should be `_internal` or vice versa; a name that
describes the wrong action; inconsistent verbs for the same operation across files.

## Output format — STRICT

### Summary
2-4 sentences: does the package's file layout read as idiomatic Django? Single
biggest placement/naming problem.

### Findings
Numbered, ordered by severity (High/Medium/Low). Each:
- **Title** (one line)
- **Type**: `wrong-file` | `module-name` | `class-name` | `method-name`
- **Location**: `path:line` (the symbol, and where/what it should be instead)
- **Severity**: High / Medium / Low
- **Why it isn't Django**: the convention it breaks (cite the doc/Django idiom)
- **Move/Rename to**: the concrete Django-conventional file / class / method name

### Naming/placement patterns
Cross-cutting themes (e.g. "X role is consistently split across the wrong files").

Be specific and cite real paths/lines. Do NOT report logic bugs, DRY-of-behavior,
or architecture unless it manifests as a file-placement or filename problem. If the
layout is already idiomatic in places, say so briefly — don't invent findings.
