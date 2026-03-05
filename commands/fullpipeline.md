# /fullpipeline — End-to-End Pipeline Orchestration

You are executing the **full pipeline**. This chains all pipeline stages with human gates between each stage. Each stage runs in a **fresh-context subagent** to keep the orchestrator lightweight — all artifacts are persisted on disk, so no conversational history needs to carry between stages.

**Input:** Raw requirement text via `$ARGUMENTS`
**Output:** Fully implemented feature with PRs merged, JIRA updated

---

## MANDATORY RULE: Commit Artifacts to Git

**Every pipeline artifact (.md file) MUST be committed to git immediately after it is written to disk.** This applies to every stage that produces a document:

- Stage 1: `docs/prd/<slug>.md` → `git add && git commit` right after writing
- Stage 2: `docs/dev_plans/<slug>.md` → `git add && git commit` right after writing
- Stage 3: `docs/dev_plans/<slug>.md` (updated with JIRA keys) → `git add && git commit` right after JIRA import

**Why:** Session context can compress or be lost. Files can be overwritten. Git is the only durable store. If it's not committed, it doesn't exist.

---

## MANDATORY RULE: Read and Paste Command Files — Never Paraphrase

**Every subagent prompt that references a command file (execute.md, req2prd.md, prd2plan.md, plan2jira.md, test.md) MUST include the FULL file content pasted into the prompt.** The orchestrator must:

1. **Read** the command file using the Read tool (path: `~/Projects/dev-pipeline/commands/<command>.md`)
2. **Paste** the entire content into the subagent prompt where indicated
3. **Never** summarize, paraphrase, or write instructions from memory

**Why:** Command files contain precise workflow steps (JIRA transitions, branch naming, PR creation, critic review format, smoke test config, failure handling) that are silently skipped when paraphrased. Stage 4 (execute.md) is 638 lines with 6 mandatory JIRA touchpoints — paraphrasing from memory loses all of them.

---

## Architecture: Fresh Context Per Stage

```
ORCHESTRATOR (this agent — lightweight coordinator)
  │
  ├─ Stage 1 subagent (fresh context) ──► docs/prd/<slug>.md
  │    └─ critic subagents (parallel)
  │
  │  ◄── GATE 1: user approves PRD ──►
  │
  ├─ Stage 2 subagent (fresh context) ──► docs/dev_plans/<slug>.md
  │    └─ critic subagents (parallel)
  │
  │  ◄── GATE 2: user approves plan ──►
  │
  ├─ Stage 3 subagent (fresh context) ──► JIRA issues created
  │    └─ critic subagents (mandatory)
  │
  │  ◄── GATE 3a/3b: critic validation + user confirms JIRA ──►
  │
  ├─ Stage 4 subagent (fresh context) ──► Code implemented, PRs merged
  │    └─ per-task: build subagent → review subagent → critic subagents
  │
  │  ◄── GATE 4: per-PR approval ──►
  │
  └─ Stage 5 subagent (fresh context) ──► Test verification report
       └─ test audit, test generation, test execution, critic validation
```

**Why fresh context?** By Gate 4, the orchestrator would be carrying the full PRD generation conversation, all critic scoring iterations, plan generation, JIRA creation dialogue — none of which the execution engine needs. Each stage's meaningful output lives on disk (PRD file, dev plan file, JIRA mapping). The orchestrator only tracks file paths, the slug, and user decisions.

**Subagent depth:** Max depth is 3 (orchestrator → stage → build/review → critics). Claude Code handles this natively.

---

## Orchestrator State

The orchestrator maintains only these variables between gates:

```
slug:           <derived from PRD title, kebab-case>
prd_path:       docs/prd/<slug>.md
plan_path:      docs/dev_plans/<slug>.md
requirement:    <original requirement text>
user_prefs:     { skip_jira: bool, ... }
test_result:    PASS | FAIL | SKIPPED
```

Everything else is persisted on disk and read fresh by each stage subagent.

---

## Pipeline State File

The orchestrator writes a state file to `docs/pipeline-state/<slug>.json` at every stage transition. This file enables automatic resume after context clears, crashes, or interruptions.

**Schema:**
```json
{
  "schema_version": 1,
  "pipeline": "fullpipeline",
  "pipeline_status": "active",
  "slug": "<slug>",
  "requirement": "<original requirement text>",
  "current_stage": 4,
  "stage_name": "<stage name>",
  "stages": {
    "1": { "status": "done", "artifact": "docs/prd/<slug>.md", "summary": "<one-line>" },
    "2": { "status": "done", "artifact": "docs/dev_plans/<slug>.md", "summary": "..." },
    "3": { "status": "done", "jira_epic": "<key>", "summary": "..." },
    "4": { "status": "in_progress", "summary": "..." },
    "5": { "status": "not_started", "summary": "..." }
  },
  "tasks": {
    "1.1": { "status": "done", "jira": "<key>", "pr": 42, "branch": "<name>" },
    "1.2": { "status": "in_progress", "jira": "<key>" },
    "2.1": { "status": "pending", "jira": "<key>" }
  },
  "test_result": "PASS|FAIL|SKIPPED",
  "user_prefs": { "skip_jira": false },
  "known_issues": [],
  "git_branch": "<branch>",
  "updated_at": "<ISO timestamp>"
}
```

**Field definitions:**
- `schema_version` — always `1` (increment on breaking schema changes)
- `pipeline_status` — `"active"` during execution, `"completed"` on success, `"aborted"` on user abort
- `current_stage` — always an integer (1–5). Remains at the last active stage even after completion/abort
- Stage `status` — `"done"` | `"in_progress"` | `"not_started"` | `"skipped"` | `"aborted"`
- Task `status` — `"done"` | `"in_progress"` | `"pending"`

**Write rule:** After every gate approval or abort, update the state file and commit:
```bash
mkdir -p docs/pipeline-state
# (write/update docs/pipeline-state/<slug>.json)
git add docs/pipeline-state/<slug>.json && git commit -m "pipeline: update state for <slug> — stage <N>"
```
If the git commit fails (e.g., nothing changed), continue — the state file on disk is the source of truth.

---

## Slug Validation

Before any stage begins, validate the slug (derived from PRD title or provided by user) against the pattern:

```
^[a-z0-9][a-z0-9_-]{0,63}$
```

**Reject** slugs containing forward slash (`/`), backslash (`\`), double dot (`..`), null bytes (`\0`), or spaces. These prevent path traversal via `docs/prd/<slug>.md` and `docs/pipeline-state/<slug>.json`.

---

## Startup: Resume Detection

Before starting Stage 1, check if any state file exists for this pipeline type.

1. List all files in `docs/pipeline-state/*.json`
2. For each file, read and validate:
   - Well-formed JSON (skip files that fail parsing — log: `"Warning: <filename> is not valid JSON — skipping"`)
   - Required fields present: `pipeline`, `slug`, `requirement`, `current_stage`, `stages`, `pipeline_status` (skip if missing — log: `"Warning: <filename> missing required field '<field>' — skipping"`)
   - `current_stage` is an integer between 1 and 5 (skip if out of range — log: `"Warning: <filename> has invalid current_stage <value> — skipping"`)
3. Filter to files where `pipeline` equals `"fullpipeline"` and `pipeline_status` equals `"active"`. If exactly one match is found, use it. If multiple matches, present all and ask the user which to resume.
4. **Match by slug** — derive slug from `$ARGUMENTS` (same kebab-case logic as Stage 1) and match against the `slug` field. If slug matching fails, fall back to case-insensitive substring match of `$ARGUMENTS` against the `requirement` field.
5. **Verify disk artifacts** — for the matched state file, confirm that artifacts referenced in `stages` actually exist on disk (e.g., if Stage 1 is "done", check `docs/prd/<slug>.md` exists). If any claimed artifact is missing, include it in the resume offer.
6. **Check git branch** — if `git_branch` in the state file differs from the current branch, note it in the resume offer.
7. If all stages in the state file are `"not_started"`, treat as equivalent to "no state file" — skip the resume prompt and proceed fresh.
8. If this was the only state file and it was corrupt (step 2 rejected it), warn: `"Found corrupt state file <filename>. Falling back to disk artifact detection."` Then check disk artifacts as described in the Error Recovery section.
9. If a valid matching state file is found, present the resume offer:

```
## Existing Pipeline Detected

Found saved state for slug "<slug>" at Stage <N> — <stage_name>.

| Stage | Name | Status |
|-------|------|--------|
| 1 | Requirement → PRD | DONE |
| 2 | PRD → Dev Plan | DONE |
| 3 | Dev Plan → JIRA | DONE |
| 4 | Execute with Ralph Loop | IN PROGRESS — 2/6 tasks done |
| 5 | Test Verification | NOT STARTED |

Known issues: <from known_issues field, or "none">
Branch: <git_branch from state> (current: <actual branch>)
Artifact warnings: <list any missing artifacts, or "all verified">

Options:
- **resume** → Skip to Stage <N> and continue from where it left off
- **restart** → Discard saved state and start fresh from Stage 1
```

10. If the user chooses **resume**: set orchestrator state from the state file (slug, prd_path, plan_path, requirement, user_prefs, test_result) and jump directly to the current stage. If git branch differs, warn but proceed. For execution stage, the subagent will run JIRA reconciliation (Step 1.5) automatically. Output: `"Checkpoint loaded: resuming from Stage <N>"`
11. If the user chooses **restart**: delete the state file, proceed with Stage 1 as normal.
12. If no state file exists: proceed with Stage 1 as normal.

---

## Stage 1: Requirement → PRD (fresh context)

Spawn a subagent (Task tool, model: opus — Opus 4.6) to execute the `/req2prd` stage:

**Subagent prompt:**
```
You are executing the /req2prd pipeline stage. Read the full command instructions:
<read and paste ${CLAUDE_PLUGIN_ROOT}/commands/req2prd.md>

Execute all steps (1 through 6) for this requirement:

<paste requirement text from $ARGUMENTS>

Important:
- Read pipeline.config.yaml for project-specific config
- Run the full scoring Ralph Loop (all critics, iterate until thresholds met)
- Write the PRD to docs/prd/<slug>.md
- Return the following in your final message:
  1. The slug
  2. The PRD file path
  3. A summary: user story count, P0/P1/P2 AC counts, open questions count
  4. The final critic score table (all critics, scores, iteration count)
  5. Any unresolved warnings or issues
```

When the subagent completes, extract the slug and PRD path. Store them as orchestrator state.

### GATE 1: PRD Approval

Present the subagent's summary to the user:

```
## Gate 1: PRD Review

PRD generated: docs/prd/<slug>.md
- User Stories: N
- P0 Requirements: N
- Acceptance Criteria: N total (P0: X, P1: Y, P2: Z)

### Critic Scores (iteration N)
| Critic | Score | Status |
|--------|-------|--------|
| Product | 9.0 | ✅ (> 8.5) |
| Dev | 9.0 | ✅ (> 8.5) |
| DevOps | 9.5 | ✅ (> 8.5) |
| QA | 9.0 | ✅ (> 8.5) |
| Security | 9.5 | ✅ (> 8.5) |
| Performance | 9.0 | ✅ (> 8.5) |
| Data Integrity | 9.5 | ✅ (> 8.5) |
| Observability | 9.0 / N/A | ✅ (> 8.5) / — |
| API Contract | 9.5 / N/A | ✅ (> 8.5) / — |
| Designer | N/A | — |
| **Overall** | **9.3** | **✅ (> 9.0)** |

Ralph Loop iterations: N

Please review and approve to proceed to dev planning.
Options: approve | edit | abort
```

**If approved** → update state file (stage 1 status: `"done"`, current_stage: 2) and commit. Output: `"Checkpoint saved: Stage 1 done"` → proceed to Stage 2
**If edit requested** → wait for user edits, then re-validate with `/validate`
**If aborted** → update state file (stage 1 status: `"aborted"`, pipeline_status: `"aborted"`) and commit → stop pipeline, present abort report (see "Pipeline Abort" section)

---

## Stage 2: PRD → Dev Plan (fresh context)

Spawn a subagent (Task tool, model: opus — Opus 4.6) to execute the `/prd2plan` stage:

**Subagent prompt:**
```
You are executing the /prd2plan pipeline stage. Read the full command instructions:
<read and paste ${CLAUDE_PLUGIN_ROOT}/commands/prd2plan.md>

Execute all steps (1 through 7) for this PRD:

PRD file: <prd_path>

Important:
- Read the PRD file, pipeline.config.yaml, AGENT_CONSTRAINTS.md, TASK_BREAKDOWN_DEFINITION.md
- Explore the codebase for existing patterns
- Generate the full Epic/Story/Task/Subtask breakdown
- Run the full critic review loop (0 Critical + 0 Warnings, max 5 iterations)
- Write the dev plan to docs/dev_plans/<slug>.md
- Return the following in your final message:
  1. The dev plan file path
  2. A summary: story count, task count (by complexity), parallel groups
  3. The final critic results (all critics, verdicts, iteration count)
  4. The dependency graph
  5. Any unresolved issues
```

When the subagent completes, extract the plan path. Store as orchestrator state.

### GATE 2: Dev Plan Approval

Present the subagent's summary to the user:

```
## Gate 2: Dev Plan Review

Dev plan generated: docs/dev_plans/<slug>.md
- Stories: N
- Tasks: N (Simple: X, Medium: Y, Complex: Z)
- Parallel Groups: A(N tasks), B(N tasks), C(N tasks)
- Product Critic: PASS ✅ (0 Critical, 0 Warnings)
- Dev Critic: PASS ✅ (0 Critical, 0 Warnings)
- DevOps Critic: PASS ✅ (0 Critical, 0 Warnings)
- QA Critic: PASS ✅ (0 Critical, 0 Warnings)
- Security Critic: PASS ✅ (0 Critical, 0 Warnings)
- Performance Critic: PASS ✅ (0 Critical, 0 Warnings)
- Data Integrity Critic: PASS ✅ (0 Critical, 0 Warnings)
- Observability Critic: PASS ✅ / N/A (0 Critical, 0 Warnings)
- API Contract Critic: PASS ✅ / N/A (0 Critical, 0 Warnings)
- Designer Critic: PASS ✅ / N/A (0 Critical, 0 Warnings)
Ralph Loop iterations: N

Dependency Graph:
  Group A: TASK 1.1, TASK 2.1 (parallel)
  Group B: TASK 1.2 (depends on 1.1), TASK 2.2 (depends on 2.1)
  Group C: TASK 3.1 (depends on 1.2 + 2.2)

Please review and approve to proceed to JIRA creation.
Options: approve | edit | abort
```

**If approved** → update state file (stage 2 status: `"done"`, current_stage: 3) and commit. Output: `"Checkpoint saved: Stage 2 done"` → proceed to Stage 3
**If aborted** → update state file (stage 2 status: `"aborted"`, pipeline_status: `"aborted"`) and commit → stop pipeline, present abort report

---

## Stage 3: Dev Plan → JIRA (fresh context)

Spawn a subagent (Task tool, model: opus — Opus 4.6) to execute the `/plan2jira` stage:

**Subagent prompt:**
```
You are executing the /plan2jira pipeline stage. Read the full command instructions:
<read and paste ${CLAUDE_PLUGIN_ROOT}/commands/plan2jira.md>

Execute all steps for this dev plan:

Dev plan file: <plan_path>

Important:
- Run mandatory critic validation (Product + Dev must pass)
- Read pipeline.config.yaml for JIRA config
- Run dry-run first and present preview
- Ask user for confirmation before creating issues
- Create JIRA issues and update the dev plan with keys
- Return the following in your final message:
  1. Critic validation results (Product, Dev — PASS/FAIL)
  2. Number of issues created (Epic, Stories, Tasks)
  3. JIRA keys for Epic and Stories
  4. Whether the dev plan was updated with JIRA links
  5. Any issues encountered
```

**Note:** This stage includes its own user interaction (Gate 3a critic validation and Gate 3b JIRA confirmation) — the subagent handles both gates directly since they are tightly coupled to the JIRA creation flow.

**If user chose skip-jira** → record `user_prefs.skip_jira = true`, update state file (stage 3 status: `"skipped"`, current_stage: 4, user_prefs.skip_jira: true) and commit. Output: `"Checkpoint saved: Stage 3 skipped"` → proceed to Stage 4

When Stage 3 subagent completes successfully → update state file (stage 3 status: `"done"`, current_stage: 4, jira_epic from mapping) and commit. Output: `"Checkpoint saved: Stage 3 done"`

---

## Stage 4: Execute with Ralph Loop (fresh context)

**CRITICAL: The orchestrator MUST read the full execute.md file and paste its ENTIRE content into the subagent prompt.** Do NOT paraphrase, summarize, or write from memory. The execute.md file contains 6 mandatory JIRA touchpoints, branch/PR workflow, critic review format, smoke test configuration, and failure handling that will be silently skipped if not included verbatim. This is the #1 cause of pipeline compliance failures.

**Before spawning the subagent**, the orchestrator must:
1. Read `${CLAUDE_PLUGIN_ROOT}/commands/execute.md` (or `~/Projects/dev-pipeline/commands/execute.md`)
2. Paste the FULL file content into the subagent prompt below where indicated
3. Verify the paste succeeded (the prompt should be 600+ lines)

Spawn a subagent (Task tool, model: opus — Opus 4.6) to execute the `/execute` stage:

**Subagent prompt:**
```
You are executing the /execute pipeline stage.

## FULL EXECUTE.MD INSTRUCTIONS — YOU MUST FOLLOW ALL STEPS

<PASTE THE ENTIRE CONTENT OF execute.md HERE — DO NOT SUMMARIZE>

## Execution Context

Dev plan file: <plan_path>
JIRA integration: <enabled/disabled based on user_prefs.skip_jira>

## Compliance Checklist (orchestrator verifies these in the subagent's response)

The subagent MUST:
- [ ] Step 1.5: Reconcile JIRA statuses on resume
- [ ] Step 3a: Create branch per task, transition JIRA to "In Progress"
- [ ] Step 3b-3d: Ralph Loop with fresh-context BUILD and REVIEW subagents
- [ ] Step 3f: Push branch, create PR with critic results, post PR link to JIRA
- [ ] Step 3g: Wait for user approval, merge PR, transition JIRA to "Done"
- [ ] Step 4: Unlock dependent tasks, repeat
- [ ] Step 5: Pre-delivery smoke test (MANDATORY)
- [ ] Step 6: Final report with smoke test results table

Return the following in your final message:
  1. Results table: task, status, PR number, iteration count, critic results
  2. Summary: completed/blocked counts, total iterations, PRs merged
  3. Smoke test results table (from Step 5 of /execute)
  4. JIRA transition summary (how many transitioned to In Progress / Done)
  5. Any blocked tasks with their failure reasons
  6. Next steps
```

**Post-subagent verification:** When the Stage 4 subagent returns, the orchestrator MUST check:
1. Does the response include a "Smoke Test Results" table? If not, the subagent skipped Step 5 — re-run.
2. Does the response include PR numbers? If tasks were committed directly to main without PRs, flag as non-compliant.
3. Does the response include JIRA transition counts? If zero, JIRA was skipped — run bulk transition as remediation.

### GATE 4: Per-PR Approval

Gate 4 is handled inside the Stage 4 subagent — each task's PR requires user approval before merge. The subagent interacts with the user directly for these approvals since they are tightly coupled to the execution loop.

When Stage 4 subagent completes → update state file (stage 4 status: `"done"`, current_stage: 5, update tasks object with final statuses/PRs from subagent response) and commit. Output: `"Checkpoint saved: Stage 4 done"`

---

## Stage 5: Test Verification (fresh context)

Check `test_stage.enabled` from `pipeline.config.yaml` (default: `true`):
- If `false`, skip Stage 5 entirely. Set `test_result: SKIPPED` in orchestrator state. Proceed to Completion.

Spawn a subagent (Task tool, model: opus — Opus 4.6) to execute the `/test` stage:

**Subagent prompt:**
```
You are executing the /test pipeline stage. Read the full command instructions:
<read and paste ${CLAUDE_PLUGIN_ROOT}/commands/test.md>

Execute all steps (1 through 10) for this dev plan:

Dev plan file: <plan_path>

Important:
- Read pipeline.config.yaml for test_stage config
- Run test existence audit, test generation, test execution
- Run full cumulative critic validation on main..HEAD diff
- Produce comprehensive final report
- Return the following in your final message:
  1. Test inventory summary (files audited, gaps found/filled)
  2. Test results table (per-type pass/fail/skip/duration)
  3. Coverage summary
  4. CI/CD audit results
  5. Critic validation results (all critics, verdicts)
  6. Overall verdict (PASS/FAIL)
  7. Any unresolved issues
```

When the subagent completes, extract the test result. Store `test_result` as orchestrator state (`PASS` or `FAIL`).

### GATE 5: Test Results Approval

Present the subagent's summary to the user:

```
## Gate 5: Test Verification Results

### Test Results
| Type | Status | Pass | Fail | Skip | Duration |
|------|--------|------|------|------|----------|
| Unit | PASS | 42 | 0 | 2 | 3.2s |
| Integration | PASS | 15 | 0 | 0 | 8.1s |
| All | PASS | 57 | 0 | 2 | 11.5s |

### Critic Validation (cumulative diff)
| Critic | Verdict |
|--------|---------|
| Product | PASS ✅ |
| Dev | PASS ✅ |
| DevOps | PASS ✅ |
| QA | PASS ✅ |
| Security | PASS ✅ |
| Performance | PASS ✅ |
| Data Integrity | PASS ✅ |
| Observability | N/A |
| API Contract | N/A |
| Designer | N/A |

Overall: PASS / FAIL
Ralph Loop iterations: N

Options: approve | fix | abort
```

**If approved** → update state file (stage 5 status: `"done"`, test_result: `"PASS"`) and commit. Output: `"Checkpoint saved: Stage 5 done"` → proceed to Completion
**If fix requested** → wait for user fixes, then re-run `/test`
**If aborted** → update state file (stage 5 status: `"aborted"`, pipeline_status: `"aborted"`, test_result: `"FAIL"`) and commit → stop pipeline, present abort report

---

## Pipeline State Tracking

Throughout the pipeline, state is persisted in two places:

**1. On disk (source of truth):**
- PRD file: `docs/prd/<slug>.md`
- Dev plan file: `docs/dev_plans/<slug>.md` (updated with JIRA keys, task statuses, PR links)
- JIRA mapping: `jira-issue-mapping.json`

**2. In the orchestrator (lightweight):**
- `slug`, `prd_path`, `plan_path`, `requirement`, `user_prefs`, `test_result`

This separation means the pipeline can be resumed at any stage by reading file state — no conversational context is needed.

---

## Pipeline Abort

When a pipeline is aborted at any gate, present a structured abort report:

```
## Pipeline Aborted at Stage <N> — <stage_name>

### Residual Artifacts
| Artifact | Path | Status |
|----------|------|--------|
| PRD | docs/prd/<slug>.md | Complete |
| Dev Plan | docs/dev_plans/<slug>.md | Complete / Not created |
| JIRA Issues | jira-issue-mapping.json | Created / Not created |
| State File | docs/pipeline-state/<slug>.json | Saved (aborted) |

To resume: Run /fullpipeline with the same requirement.
The orchestrator will detect existing artifacts and offer to skip completed stages.
```

---

## Error Recovery

If the pipeline is interrupted at any stage:
- **Stage 1 interrupted**: Re-run `/req2prd` — PRD file may already exist, ask user whether to regenerate or use existing
- **Stage 2 interrupted**: Re-run `/prd2plan` — check if dev plan already exists
- **Stage 3 interrupted**: Re-run `/plan2jira` — jira-import.js handles idempotency (skips already-created issues)
- **Stage 4 interrupted**: Re-run `/execute @plan` — it reads task statuses from the dev plan, **reconciles JIRA statuses** (transitions completed tasks to "Done" and in-progress tasks to "In Progress"), and then resumes execution from where it left off. No manual JIRA updates are needed after session restarts.
- **Stage 5 interrupted**: Re-run `/test @plan` — `/test` is idempotent, scans everything from scratch with no persistent state.

**Re-running `/fullpipeline`** after interruption: The orchestrator checks `docs/pipeline-state/<slug>.json` at startup (see "Startup: Resume Detection" section). If a state file exists, it offers to resume from the last completed stage. If no state file exists, it falls back to checking disk artifacts — if `docs/prd/<slug>.md` exists, ask the user whether to skip Stage 1, etc.

**Using `/clear_and_go`:** The recommended way to handle context clearing mid-pipeline. Run `/clear_and_go` before clearing — it saves a state file, confirms with the user, and tells them to re-run the same command after clearing. The orchestrator will detect the state file and resume automatically.

---

## Completion

When all stages complete (Stage 5 subagent returns, or Stage 5 is skipped):

1. **Mark the state file as completed** — update `docs/pipeline-state/<slug>.json`: set `pipeline_status` to `"completed"`, all stages to `"done"` (or `"skipped"`), and commit:
```bash
git add docs/pipeline-state/<slug>.json && git commit -m "pipeline: mark <slug> as completed"
```

2. Present the final report:

```
## Pipeline Complete

### Requirement
<original requirement text>

### Deliverables
- PRD: docs/prd/<slug>.md
- Dev Plan: docs/dev_plans/<slug>.md
- JIRA Epic: <KEY>-100

### Implementation
| Task | PR | JIRA | Status |
|------|-----|------|--------|
| TASK 1.1 | #42 | MVP-103 | ✅ Merged |
| TASK 1.2 | #43 | MVP-104 | ✅ Merged |
| TASK 2.1 | #44 | MVP-105 | ✅ Merged |

### Quality
- Total Ralph Loop iterations: X
- All critics passed for all tasks
- Test coverage: N%

### Smoke Test (Pre-Delivery, Stage 4)
| Check | Status | Duration | Details |
|-------|--------|----------|---------|
| Dev server startup | ✅ | 4.2s | pnpm dev, ready in 4.2s |
| Health checks | ✅ | 0.3s | 2/2 endpoints healthy |
| SDK version compatibility | ✅ | 1.1s | ai@6.2.1 — confirmed |
| Core user flow | ✅ | 0.8s | POST /api/chat → 200 |
| Visual rendering | ✅ / N/A (no frontend) | 0.5s | 0 orphan CSS vars |
| Browser screenshots | ✅ / N/A / ⚠️ | 12.3s | 5 routes x 3 viewports = 15 screenshots / N/A (has_frontend: false) / Playwright not available — static only |
| Real API test | ✅ / ⚠️ skipped (no API key) | 2.1s | — |
| Server teardown | ✅ | 0.2s | ports released |

### Test Verification (Stage 5)
| Section | Status | Details |
|---------|--------|---------|
| Test Inventory | PASS | X files audited, Y gaps found, Z filled |
| Test Results | PASS | All types green (unit: 42/0, integration: 15/0) |
| Coverage | WARNING | 75% overall (threshold: 80%) |
| CI Audit | PASS | All jobs active |
| CD Audit | INFO | Report-only — 2 findings |
| Smoke Test | PASS / SKIPPED | Post-test deployment verified / smoke_test.enabled: false |
| Critic Validation | PASS | All 7 critics passed on cumulative diff |
| **Overall** | **PASS** | |

### Next Steps
- Deploy to staging
- Product review against PRD acceptance criteria
```

**IMPORTANT:** The Stage 4 subagent's `/execute` includes a mandatory smoke test step (Step 5) that verifies the dev server actually works before declaring complete. If the smoke test fails, the pipeline is NOT complete — the subagent must fix the issues or report them as blocking. Never present a "Pipeline Complete" report to the user without smoke tests passing. **Verify the Stage 4 subagent's response includes a "Smoke Test Results" section before declaring pipeline complete.** If absent, query the subagent for smoke test status. **Heading rules:**
- All smoke tests PASS and test verification PASS → "Pipeline Complete"
- Any smoke test row shows FAIL → "Pipeline Incomplete — Smoke Test Failure" (include Error Details column in the table)
- Test verification FAIL → "Pipeline Incomplete — Test Verification Failure" (include blocking items)
- Smoke tests SKIPPED (opted out via `smoke_test.enabled: false`) → "Pipeline Complete" (treat opt-out as acceptable; include the "SKIPPED" line in the report)
- Test verification SKIPPED (opted out via `test_stage.enabled: false`) → "Pipeline Complete" (treat opt-out as acceptable; include the "SKIPPED" line in the report)
- Any smoke test row is a skip/warning (e.g., "⚠️ skipped (no API key)") → "Pipeline Complete" but list skipped checks so the user knows coverage level
