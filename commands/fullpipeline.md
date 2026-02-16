# /fullpipeline — End-to-End Pipeline Orchestration

You are executing the **full pipeline**. This chains all pipeline stages with human gates between each stage.

**Input:** Raw requirement text via `$ARGUMENTS`
**Output:** Fully implemented feature with PRs merged, JIRA updated

---

## Overview

```
Requirement → PRD → Dev Plan → JIRA → Execution (Ralph Loop) → Done
                ↑        ↑         ↑                    ↑
            [GATE 1] [GATE 2] [GATE 3]           [GATE 4: per PR]
```

Each gate requires human approval before proceeding.

---

## Stage 1: Requirement → PRD

Execute the `/req2prd` command with the provided requirement:

1. Read `~/.claude/pipeline/templates/prd-template.md`
2. If input is short (< 200 chars), ask clarifying questions
3. Generate PRD with all sections filled (including inline AC per story, consolidated AC, testing strategy)
4. Run Product Critic validation (max 2 iterations)
5. Write to `docs/prd/<slug>.md`

### GATE 1: PRD Approval

Present the PRD summary and wait for user approval.

```
## Gate 1: PRD Review

PRD generated: docs/prd/<slug>.md
- User Stories: N
- P0 Requirements: N
- Acceptance Criteria: N total (P0: X, P1: Y, P2: Z)
- Product Critic: PASS ✅

Please review and approve to proceed to dev planning.
Options: approve | edit | abort
```

**If approved** → proceed to Stage 2
**If edit requested** → wait for user edits, then re-validate with `/validate`
**If aborted** → stop pipeline, report where files are saved

---

## Stage 2: PRD → Dev Plan

Execute the `/prd2plan` command with the approved PRD:

1. Read PRD + breakdown definition + agent constraints
2. Explore codebase for patterns
3. Generate Epic/Story/Task/Subtask breakdown with:
   - Dependency annotations (Depends On, Parallel Group)
   - Complexity ratings (Simple/Medium/Complex)
   - Test requirements per task
4. Validate with `validate-breakdown.js` (if available)
5. Run Dev Critic + Product Critic (parallel, max 2 iterations)
6. Write to `docs/dev_plans/<slug>.md`

### GATE 2: Dev Plan Approval

Present the plan summary with dependency graph and wait for approval.

```
## Gate 2: Dev Plan Review

Dev plan generated: docs/dev_plans/<slug>.md
- Stories: N
- Tasks: N (Simple: X, Medium: Y, Complex: Z)
- Parallel Groups: A(N tasks), B(N tasks), C(N tasks)
- Estimated Time: X hours
- Dev Critic: PASS ✅
- Product Critic: PASS ✅

Dependency Graph:
  Group A: TASK 1.1, TASK 2.1 (parallel)
  Group B: TASK 1.2 (depends on 1.1), TASK 2.2 (depends on 2.1)
  Group C: TASK 3.1 (depends on 1.2 + 2.2)

Please review and approve to proceed to JIRA creation.
Options: approve | edit | abort
```

---

## Stage 3: Dev Plan → JIRA

Execute the `/plan2jira` command with the approved dev plan:

1. Read pipeline.config.yaml for JIRA config
2. Dry-run to show what will be created
3. Wait for confirmation
4. Create JIRA issues and update dev plan with keys

### GATE 3: JIRA Confirmation

```
## Gate 3: JIRA Issues Created

Created N issues in project <KEY>:
- 1 Epic: <KEY>-100
- N Stories: <KEY>-101, <KEY>-102, ...
- M Tasks: <KEY>-103, <KEY>-104, ...

Dev plan updated with JIRA links.

Proceed to execution? (approve/skip-jira/abort)
```

**If skip-jira** → proceed to execution without JIRA integration (useful when JIRA is unavailable)

---

## Stage 4: Execute with Ralph Loop

Execute the `/execute` command with the dev plan:

1. Build dependency graph
2. Present execution plan
3. For each ready task (respecting dependencies):
   - **BUILD** (fresh context, build model per complexity)
   - **REVIEW** (fresh context, Opus, all 4 critics)
   - **ITERATE** if FAIL (max 3 cycles, then escalate)
   - **PR** creation with critic results
   - **MERGE** after human approval

### GATE 4: Per-PR Approval

Each task's PR requires approval (configurable — can be set to auto-approve for Simple tasks).

---

## Pipeline State Tracking

Throughout the pipeline, maintain state in the dev plan file:

```markdown
## Pipeline Status
- **Stage:** EXECUTING (Stage 4 of 4)
- **Started:** 2026-02-16T10:00:00
- **PRD:** docs/prd/daily-revenue-trends.md ✅
- **Dev Plan:** docs/dev_plans/daily-revenue-trends.md ✅
- **JIRA:** MVP-100 (Epic) ✅
- **Progress:** 3/7 tasks complete
```

This allows resuming the pipeline if interrupted — re-running `/execute` will pick up from where it left off by checking task statuses.

---

## Error Recovery

If the pipeline is interrupted at any stage:
- **Stage 1 interrupted**: Re-run `/req2prd` — PRD file may already exist, ask user whether to regenerate or use existing
- **Stage 2 interrupted**: Re-run `/prd2plan` — check if dev plan already exists
- **Stage 3 interrupted**: Re-run `/plan2jira` — jira-import.js handles idempotency (skips already-created issues)
- **Stage 4 interrupted**: Re-run `/execute @plan` — it reads task statuses from the dev plan and skips DONE tasks

---

## Completion

When all tasks are done:

```
## Pipeline Complete 🎉

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

### Next Steps
- Run full integration test suite: <test_all command>
- Deploy to staging
- Product review against PRD acceptance criteria
```
