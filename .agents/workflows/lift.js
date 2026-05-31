export const meta = {
  name: 'lift',
  description:
    'Reconstruct a lifted capability: decompose & plan → tri-engine plan review (Claude/codex-plugin/gemini, loop) → codex builds it in an angee workspace → tri-engine code review (loop). Fully automatic; leaves the result on a workspace branch to merge.',
  phases: [
    { title: 'Decompose & Plan' },
    { title: 'Plan review' },
    { title: 'Build' },
    { title: 'Code review' },
    { title: 'Report' },
  ],
}

// ---- inputs ---------------------------------------------------------------
// args = { source, slug, baseRef, companion, maxRounds? }
//   source     what to lift (path and/or description), resolved by /lift
//   slug       kebab-case name for the plan, notes dir, and workspace
//   baseRef    git ref the angee workspace branches from
//   companion  absolute path to the codex plugin's codex-companion.mjs
//   maxRounds  per-loop iteration cap (default 3)
const { source, slug, baseRef, companion } = args
const MAX_ROUNDS = args.maxRounds ?? 3
const planPath = `.agents/plans/lift-${slug}.md`
const notesDir = `.agents/notes/lift-${slug}`
const wsName = `lift-${slug}`

const BLOCKING = new Set(['Critical', 'High'])
const blocking = (reviews) =>
  reviews.flatMap((r) => r.findings).filter((f) => BLOCKING.has(f.severity))

// ---- structured-output schemas -------------------------------------------
const FINDING = {
  type: 'object',
  required: ['title', 'severity', 'location', 'problem', 'recommendation'],
  properties: {
    title: { type: 'string' },
    severity: { type: 'string', enum: ['Critical', 'High', 'Medium', 'Low'] },
    location: { type: 'string' },
    problem: { type: 'string' },
    recommendation: { type: 'string' },
  },
}
const FINDINGS_SCHEMA = {
  type: 'object',
  required: ['engine', 'persona', 'summary', 'findings'],
  properties: {
    engine: { type: 'string' },
    persona: { type: 'string' },
    summary: { type: 'string' },
    findings: { type: 'array', items: FINDING },
  },
}
const PLAN_SCHEMA = {
  type: 'object',
  required: ['summary', 'levels'],
  properties: {
    summary: { type: 'string' },
    levels: { type: 'string', description: 'where each part lands and what it reuses' },
    openQuestions: { type: 'array', items: { type: 'string' } },
  },
}
const BUILD_SCHEMA = {
  type: 'object',
  required: ['workspaceDir', 'branch', 'summary', 'touchedFiles', 'backendTouched', 'frontendTouched'],
  properties: {
    workspaceDir: { type: 'string' },
    branch: { type: 'string' },
    summary: { type: 'string' },
    touchedFiles: { type: 'array', items: { type: 'string' } },
    backendTouched: { type: 'boolean' },
    frontendTouched: { type: 'boolean' },
  },
}
const FIX_SCHEMA = {
  type: 'object',
  required: ['summary', 'touchedFiles'],
  properties: {
    summary: { type: 'string' },
    touchedFiles: { type: 'array', items: { type: 'string' } },
  },
}

// ---- the lift contract every agent must obey -----------------------------
// Single source of truth lives in .agents/commands/lift.md; agents read it
// rather than re-stating the rules here (DRY).
const CONTRACT = `Obey the lift contract in .agents/commands/lift.md (Absolute rules) and AGENTS.md:
reconstruct, never copy (no file is byte-identical to a source file); green-field, no
provenance anywhere (never name a source repo, prototype, port, migration, or rebuild in
code, comments, docs, data, filenames, or commit messages); stay DRY and land each change
at the level that owns it; defer to docs/stack.md for library ownership and never add a
dependency without an owner row — flag it instead.`

// ---- review-prompt builders ----------------------------------------------
// claudeReview: a Claude subagent reviews directly.
function claudeReview(persona, scopeInstr, outFile) {
  return `Act as the reviewer defined in .agents/agents/${persona}.md — read that file and
follow its method and Output format exactly. Read the docs it lists first.

${scopeInstr}

Write your full report verbatim to ${outFile}, then return the structured findings
(engine "claude", persona "${persona}"). Severity must be one of Critical/High/Medium/Low.`
}

// engineReview: a Claude subagent runs codex (via the plugin) or gemini, captures
// the raw report, saves it, and structures it. The non-Claude engine does the review.
// The persona is inlined into the engine prompt (read from the main-repo root, your
// starting cwd) so the engine never depends on the persona file existing in the
// workspace it cd's into — untracked personas won't be on a workspace branch.
function engineReview(engine, persona, scopeInstr, cwd, outFile) {
  const runner =
    engine === 'codex'
      ? `node ${JSON.stringify(companion)} task < "$PF"   (read-only — do NOT pass --write)`
      : `gemini --approval-mode plan -p "Follow the reviewer instructions provided on stdin." < "$PF"`

  return `You are driving the **${engine}** engine to produce an independent review. Do not
review yourself and do not edit anything — run ${engine}, capture its report, and structure it.

1. From your starting directory (the repository root), read .agents/agents/${persona}.md in
   full — you will inline its method and Output format into the engine prompt.
2. Compose the engine prompt and write it to a temp file ("$PF" = $(mktemp)):
   it must contain, in order: "Follow this reviewer method and Output format exactly:" then
   the full contents of .agents/agents/${persona}.md, then the scope instruction:
   "${scopeInstr}" and "Read the docs that method lists (from your working directory) first."
3. Run the engine in ${JSON.stringify(cwd)}:
     ( cd ${JSON.stringify(cwd)} && ${runner} )

Capture ${engine}'s full stdout, write it verbatim to ${outFile}, then return the structured
findings parsed from that report (engine "${engine}", persona "${persona}"). Severity must be
one of Critical/High/Medium/Low. If ${engine} produced no usable report, return an empty
findings array with a summary saying so.`
}

// One review round: same persona run by all three engines, in parallel.
function reviewRound(persona, scopeInstr, cwd, roundTag) {
  return parallel([
    () => agent(claudeReview(persona, scopeInstr, `${notesDir}/${roundTag}-claude-${persona}.md`),
      { label: `claude:${persona}`, phase: roundTag.startsWith('plan') ? 'Plan review' : 'Code review', schema: FINDINGS_SCHEMA }),
    () => agent(engineReview('codex', persona, scopeInstr, cwd, `${notesDir}/${roundTag}-codex-${persona}.md`),
      { label: `codex:${persona}`, phase: roundTag.startsWith('plan') ? 'Plan review' : 'Code review', schema: FINDINGS_SCHEMA }),
    () => agent(engineReview('gemini', persona, scopeInstr, cwd, `${notesDir}/${roundTag}-gemini-${persona}.md`),
      { label: `gemini:${persona}`, phase: roundTag.startsWith('plan') ? 'Plan review' : 'Code review', schema: FINDINGS_SCHEMA }),
  ]).then((rs) => rs.filter(Boolean))
}

// =========================================================================
// Phase 1 — Decompose & Plan
// =========================================================================
phase('Decompose & Plan')
const plan = await agent(
  `You are reconstructing a capability ("lift") into this repository. ${CONTRACT}

Source to lift: ${source}

1. Decompose the source: identify the real capability, its sub-parts, inputs/outputs, and
   its genuine dependencies — ignore how it happens to be wired in its repo.
2. Understand here: read AGENTS.md, docs/guidelines.md, docs/stack.md, docs/glossary.md,
   and the relevant docs/backend|frontend/guidelines.md. Scan local code for the patterns,
   naming, and primitives to match and reuse.
3. Write an implementation plan to ${planPath} that a native contributor could build from:
   the capability and its level (framework/base addon vs consumer addon), file-by-file
   placement, which existing local primitives and stack libraries to reuse instead of
   porting, what to deliberately drop or simplify, and the per-area checks to run. Make it
   smaller and clearer than the source.

Create ${planPath} (and its parent dirs). Return the structured summary.`,
  { label: 'decompose+plan', phase: 'Decompose & Plan', schema: PLAN_SCHEMA },
)
log(`plan written to ${planPath}: ${plan.summary}`)

// =========================================================================
// Phase 2 — Plan review (loop until no blocking findings, capped)
// =========================================================================
phase('Plan review')
const planScope = `You are reviewing the PLAN at ${planPath} (a design doc, not code).
Read ${planPath} in full and judge it with the plan-reviewer method.`
let planApproved = false
let planReviews = []
for (let round = 1; round <= MAX_ROUNDS; round++) {
  planReviews = await reviewRound('plan-reviewer', planScope, '.', `plan-round-${round}`)
  const block = blocking(planReviews)
  log(`plan review round ${round}: ${planReviews.length}/3 engines, ${block.length} blocking`)
  if (block.length === 0 && planReviews.length > 0) { planApproved = true; break }
  if (round === MAX_ROUNDS) break
  await agent(
    `Revise the plan at ${planPath} to resolve these blocking review findings (Critical/High).
${CONTRACT}

Blocking findings:
${block.map((f, i) => `${i + 1}. [${f.severity}] ${f.title} — ${f.problem}\n   Fix: ${f.recommendation}`).join('\n')}

Edit ${planPath} in place. Keep it native, DRY, and at the right level. Return a one-line summary.`,
    { label: `revise-plan r${round}`, phase: 'Plan review' },
  )
}
if (!planApproved) {
  log('plan review did not converge — halting before build')
  return {
    converged: false,
    stoppedAt: 'plan review',
    planPath,
    notesDir,
    residual: blocking(planReviews),
    message: `Plan review did not reach zero blocking findings in ${MAX_ROUNDS} rounds. ` +
      `The plan and per-round reports are in ${notesDir}. Resolve the residual findings or ` +
      `re-run /lift with a higher round cap; nothing was built.`,
  }
}
log('plan approved by all engines')

// =========================================================================
// Phase 3 — Build (codex, via the plugin, inside an angee workspace)
// =========================================================================
phase('Build')
const build = await agent(
  `Build the approved plan by delegating to the **codex** engine through the codex plugin.
Do NOT write the code yourself; codex is the builder.

1. Create (or reuse) an angee workspace for this lift, from the repo root:
     angee ws create ${wsName} --template dev --input base_ref=${baseRef} --json
   If it already exists, use the existing one (angee ws get ${wsName} --json). Parse the
   workspace directory from the JSON; if absent, fall back to .angee/workspaces/${wsName}.
2. Read the approved plan at ${planPath} and the lift contract at .agents/commands/lift.md.
3. Drive codex write-capably inside the workspace, plan + contract piped on stdin as $PROMPT:
     ( cd <workspaceDir> && printf '%s' "$PROMPT" | node ${JSON.stringify(companion)} task --write )
   $PROMPT must contain: the full plan text, the lift contract below, and the instruction to
   reconstruct the capability natively in this workspace and stop (do not commit).

${CONTRACT}

After codex finishes, determine which files it touched in the workspace
(git -C <workspaceDir> status --short and git -C <workspaceDir> diff --name-only ${baseRef}...).
Return the structured build result: workspaceDir, branch (workspace/${wsName}), a summary of
what codex built, touchedFiles, and whether backend (.py) and/or frontend (.ts/.tsx/.css)
files were touched.`,
  { label: 'codex build', phase: 'Build', schema: BUILD_SCHEMA },
)
log(`codex built in ${build.workspaceDir} (${build.touchedFiles.length} files)`)

// Personas for the code review: architecture always; django if backend; react if frontend.
const codePersonas = ['architecture-reviewer']
if (build.backendTouched) codePersonas.push('django-reviewer')
if (build.frontendTouched) codePersonas.push('react-reviewer')

// =========================================================================
// Phase 4 — Code review (tri-engine × personas, loop until no blocking, capped)
// =========================================================================
phase('Code review')
const codeScope =
  `You are reviewing the reconstructed code in the angee workspace at ${build.workspaceDir}, ` +
  `on branch ${build.branch}. Scope the review to the changes relative to ${baseRef} ` +
  `(git -C ${build.workspaceDir} diff ${baseRef}... --stat to find them; cite path:line). ` +
  `Also check the lift hygiene the contract requires: no copied files, no provenance.`
let codeApproved = false
let codeReviews = []
for (let round = 1; round <= MAX_ROUNDS; round++) {
  const rounds = await parallel(
    codePersonas.map((p) => () => reviewRound(p, codeScope, build.workspaceDir, `code-round-${round}`)),
  )
  codeReviews = rounds.flat()
  const block = blocking(codeReviews)
  log(`code review round ${round}: ${codePersonas.length} personas × engines, ${block.length} blocking`)
  if (block.length === 0 && codeReviews.length > 0) { codeApproved = true; break }
  if (round === MAX_ROUNDS) break
  await agent(
    `Fix these blocking code-review findings (Critical/High) by delegating to codex through
the codex plugin, write-capably, inside the workspace at ${build.workspaceDir}.
Do NOT fix them yourself; codex is the builder. ${CONTRACT}

Blocking findings:
${block.map((f, i) => `${i + 1}. [${f.severity}] ${f.title} (${f.location}) — ${f.problem}\n   Fix: ${f.recommendation}`).join('\n')}

Pipe the findings + contract as $PROMPT into:
  ( cd ${build.workspaceDir} && printf '%s' "$PROMPT" | node ${JSON.stringify(companion)} task --write )
Return a one-line summary and the files touched.`,
    { label: `codex fix r${round}`, phase: 'Code review', schema: FIX_SCHEMA },
  )
}

// =========================================================================
// Phase 5 — Report
// =========================================================================
phase('Report')
return {
  converged: codeApproved,
  slug,
  source,
  planPath,
  notesDir,
  workspaceDir: build.workspaceDir,
  branch: build.branch,
  buildSummary: build.summary,
  touchedFiles: build.touchedFiles,
  personasReviewed: codePersonas,
  residual: codeApproved ? [] : blocking(codeReviews),
  message: codeApproved
    ? `Lift complete. The reconstruction is on branch ${build.branch} in ${build.workspaceDir}, ` +
      `reviewed clean by Claude, codex, and gemini. Review the diff and merge when ready; ` +
      `per-round reports are in ${notesDir}.`
    : `Code review did not reach zero blocking findings in ${MAX_ROUNDS} rounds. The build is on ` +
      `branch ${build.branch} in ${build.workspaceDir} with residual blocking findings (see ${notesDir}). ` +
      `Resolve them or re-run with a higher round cap before merging.`,
}
