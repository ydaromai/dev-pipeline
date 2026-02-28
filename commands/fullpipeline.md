# /fullpipeline — End-to-End Pipeline Orchestration

You are executing the **full pipeline**. This chains all pipeline stages with human gates between each stage. Each stage runs in a **fresh-context subagent** to keep the orchestrator lightweight — all artifacts are persisted on disk, so no conversational history needs to carry between stages.

**Input:** Raw requirement text via `$ARGUMENTS`
**Output:** Fully implemented feature with PRs merged, JIRA updated

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

**If approved** → proceed to Stage 2
**If edit requested** → wait for user edits, then re-validate with `/validate`
**If aborted** → stop pipeline, report where files are saved

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

**If user chose skip-jira** → record `user_prefs.skip_jira = true`, skip this stage entirely, proceed to Stage 4

---

## Stage 4: Execute with Ralph Loop (fresh context)

Spawn a subagent (Task tool, model: opus — Opus 4.6) to execute the `/execute` stage:

**Subagent prompt:**
```
You are executing the /execute pipeline stage. Read the full command instructions:
<read and paste ${CLAUDE_PLUGIN_ROOT}/commands/execute.md>

Execute all steps for this dev plan:

Dev plan file: <plan_path>
JIRA integration: <enabled/disabled based on user_prefs.skip_jira>

Important:
- Reconcile JIRA statuses first (if JIRA enabled)
- Build the dependency graph and present pre-flight check
- Execute tasks using the Ralph Loop (BUILD → REVIEW → ITERATE)
- Each build/review uses fresh context subagents (already defined in execute.md)
- Create PRs and wait for user approval per PR (Gate 4)
- Update dev plan and JIRA statuses as tasks complete
- Return the following in your final message:
  1. Results table: task, status, PR number, iteration count, critic results
  2. Summary: completed/blocked counts, total iterations, PRs merged
  3. Smoke test results table (from Step 5 of /execute)
  4. Any blocked tasks with their failure reasons
  5. Next steps
```

### GATE 4: Per-PR Approval

Gate 4 is handled inside the Stage 4 subagent — each task's PR requires user approval before merge. The subagent interacts with the user directly for these approvals since they are tightly coupled to the execution loop.

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

**If approved** → proceed to Completion
**If fix requested** → wait for user fixes, then re-run `/test`
**If aborted** → stop pipeline, report where artifacts are saved

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

## Error Recovery

If the pipeline is interrupted at any stage:
- **Stage 1 interrupted**: Re-run `/req2prd` — PRD file may already exist, ask user whether to regenerate or use existing
- **Stage 2 interrupted**: Re-run `/prd2plan` — check if dev plan already exists
- **Stage 3 interrupted**: Re-run `/plan2jira` — jira-import.js handles idempotency (skips already-created issues)
- **Stage 4 interrupted**: Re-run `/execute @plan` — it reads task statuses from the dev plan, **reconciles JIRA statuses** (transitions completed tasks to "Done" and in-progress tasks to "In Progress"), and then resumes execution from where it left off. No manual JIRA updates are needed after session restarts.
- **Stage 5 interrupted**: Re-run `/test @plan` — `/test` is idempotent, scans everything from scratch with no persistent state.

**Re-running `/fullpipeline`** after interruption: The orchestrator should check for existing artifacts before spawning each stage subagent. If `docs/prd/<slug>.md` exists, ask the user whether to skip Stage 1. If `docs/dev_plans/<slug>.md` exists, ask whether to skip Stage 2. This avoids re-running completed stages.

---

## Completion

When all stages complete (Stage 5 subagent returns, or Stage 5 is skipped), present the final report:

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
