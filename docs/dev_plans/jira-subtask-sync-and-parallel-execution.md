# Dev Plan: JIRA Subtask Sync & Parallel Subtask Execution

**PRD:** docs/prd/jira-subtask-sync-and-parallel-execution.md
**Date:** 2026-02-20

## Pipeline Status
- **Stage:** EXECUTING (Stage 4 of 4)
- **Started:** 2026-02-20
- **PRD:** docs/prd/jira-subtask-sync-and-parallel-execution.md
- **Dev Plan:** docs/dev_plans/jira-subtask-sync-and-parallel-execution.md
- **JIRA:** PIPE-1 (Epic)
- **Progress:** 0/4 tasks complete

---

## EPIC: JIRA Subtask Sync & Parallel Subtask Execution
**JIRA:** [PIPE-1](https://wiseguys.atlassian.net/browse/PIPE-1)

Fix JIRA subtask (x.x.x) status transitions during `/execute` and add parallel subtask execution guidance to the BUILD prompt.

---

## STORY 1: JIRA Subtask Transitions During Execution
**JIRA:** [PIPE-2](https://wiseguys.atlassian.net/browse/PIPE-2)

Ensure subtask JIRA issues are transitioned to "In Progress" and "Done" alongside their parent task during execution Steps 3a and 3g.

**Time Estimate:** ~1.5 hours

### TASK 1.1: Add subtask JIRA transitions to execute.md Steps 3a, 3g, and 3e
**JIRA:** [PIPE-3](https://wiseguys.atlassian.net/browse/PIPE-3)
**Depends On:** None
**Parallel Group:** A
**Complexity:** Medium
**Estimated Time:** 1 hour

**Description:**
Update `commands/execute.md` to add subtask JIRA transitions in three places:

1. **Step 3a (Setup):** After transitioning the parent task JIRA issue to "In Progress", also transition all its subtask JIRA issues to "In Progress". Look up subtask keys from `jira-issue-mapping.json` by matching the pattern `SUBTASK-{task_number}.*` (e.g., for TASK 1.1, find `SUBTASK-1.1.1`, `SUBTASK-1.1.2`, etc.).

2. **Step 3g (After PR merge):** After transitioning the parent task JIRA issue to "Done", also transition all its subtask JIRA issues to "Done".

3. **Step 3e (Escalation):** Explicitly note that subtask JIRA issues are NOT transitioned when the parent task is blocked/escalated — they remain at their current status.

Key constraints:
- Subtask transitions must be idempotent (rely on existing `transition-issue.js` behavior)
- Subtask transition failures should log warnings but NOT block parent task execution
- If a subtask key is missing from `jira-issue-mapping.json`, silently skip it
- Use `jira-issue-mapping.json` to find subtask keys: iterate the mapping's `issues` object and find all keys starting with `SUBTASK-{N.M}.` where `N.M` is the parent task number

**Files to Modify:**
- `commands/execute.md` — Steps 3a, 3g, 3e

**Implementation:**

1. In Step 3a, after the existing JIRA "In Progress" transition block, add instructions to:
   - Look up all subtask JIRA keys for the current task from `jira-issue-mapping.json`
   - Transition each subtask to "In Progress" (log warnings on failure, don't block)
2. In Step 3g, after the existing JIRA "Done" transition, add instructions to:
   - Transition all subtask JIRA keys for the completed task to "Done"
   - Log warnings on failure, don't block
3. In Step 3e, add a note that subtask JIRA statuses are left unchanged on escalation

**Required Tests:**
- None (specification change — validated via manual pipeline run)

**Acceptance Criteria:**
- [ ] AC 1.1: Step 3a transitions subtask JIRA issues to "In Progress"
- [ ] AC 1.2: Step 3g transitions subtask JIRA issues to "Done"
- [ ] AC 1.3: Step 3e explicitly notes no subtask transitions on escalation
- [ ] AC 1.4: Transitions are idempotent and non-blocking on failure

#### SUBTASK 1.1.1: Update Step 3a with subtask "In Progress" transition logic
**JIRA:** [PIPE-4](https://wiseguys.atlassian.net/browse/PIPE-4)
#### SUBTASK 1.1.2: Update Step 3g with subtask "Done" transition logic
**JIRA:** [PIPE-5](https://wiseguys.atlassian.net/browse/PIPE-5)
#### SUBTASK 1.1.3: Update Step 3e with explicit note about no subtask transitions on escalation
**JIRA:** [PIPE-6](https://wiseguys.atlassian.net/browse/PIPE-6)

---

## STORY 2: JIRA Subtask Reconciliation on Resume
**JIRA:** [PIPE-7](https://wiseguys.atlassian.net/browse/PIPE-7)

Include subtask-level JIRA reconciliation in Step 1.5 so subtask statuses are accurate after session restarts.

**Time Estimate:** ~1 hour

### TASK 2.1: Add subtask reconciliation to execute.md Step 1.5
**JIRA:** [PIPE-8](https://wiseguys.atlassian.net/browse/PIPE-8)
**Depends On:** None
**Parallel Group:** A
**Complexity:** Medium
**Estimated Time:** 1 hour

**Description:**
Update `commands/execute.md` Step 1.5 to include subtask-level JIRA reconciliation. Currently, Step 1.5 only reconciles task-level and story-level JIRA issues. After the existing task-level reconciliation logic, add a pass that also reconciles subtask JIRA issues based on their parent task's status.

Logic:
- For each task that is `✅ DONE`: transition all its subtask JIRA issues to "Done"
- For each task that is `🔄 IN PROGRESS`: transition all its subtask JIRA issues to "In Progress"
- Include subtask transitions in the reconciliation report output

Key constraints:
- Use the same `jira-issue-mapping.json` lookup pattern: find all `SUBTASK-{N.M}.*` keys for each task `N.M`
- Subtask transition failures log warnings but don't block reconciliation
- Missing subtask keys are silently skipped

**Files to Modify:**
- `commands/execute.md` — Step 1.5

**Implementation:**

1. After existing step 3 ("For each task that has a JIRA key"), add step 3b for subtask reconciliation:
   - For each task processed, also look up its subtask keys in `jira-issue-mapping.json`
   - Apply the same transition logic (DONE → "Done", IN PROGRESS → "In Progress")
2. Update the reconciliation report example to include subtask transition lines
3. Update step 1 description to mention subtask-level keys

**Required Tests:**
- None (specification change — validated via manual pipeline run)

**Acceptance Criteria:**
- [ ] AC 2.1: Subtask JIRA issues transitioned to "Done" for completed tasks
- [ ] AC 2.2: Subtask JIRA issues transitioned to "In Progress" for in-progress tasks
- [ ] AC 2.3: Reconciliation report includes subtask transitions

#### SUBTASK 2.1.1: Add subtask reconciliation logic after task-level reconciliation in Step 1.5
**JIRA:** [PIPE-9](https://wiseguys.atlassian.net/browse/PIPE-9)
#### SUBTASK 2.1.2: Update reconciliation report example to include subtask lines
**JIRA:** [PIPE-10](https://wiseguys.atlassian.net/browse/PIPE-10)

---

## STORY 3: Parallel Subtask Execution Guidance
**JIRA:** [PIPE-11](https://wiseguys.atlassian.net/browse/PIPE-11)

Update the BUILD phase prompt to guide agents to parallelize independent subtasks where safe.

**Time Estimate:** ~30 minutes

### TASK 3.1: Update BUILD prompt with parallel subtask guidance
**JIRA:** [PIPE-12](https://wiseguys.atlassian.net/browse/PIPE-12)
**Depends On:** None
**Parallel Group:** A
**Complexity:** Simple
**Estimated Time:** 30 minutes

**Description:**
Update `commands/execute.md` Step 3b BUILD phase prompt to include guidance for the build agent about parallelizing independent subtasks. This is opt-in guidance — the agent decides based on subtask dependencies. The current instruction says "Implement all subtasks in order" which should be updated to acknowledge that independent subtasks can be done in parallel.

**Files to Modify:**
- `commands/execute.md` — Step 3b (BUILD prompt)

**Implementation:**

1. Change instruction #2 from "Implement all subtasks in order" to guidance that:
   - Identifies subtasks that are independent (no output from one is input to another)
   - Implements independent subtasks in whatever order is most efficient
   - Maintains sequential order for dependent subtasks (e.g., "create schema" before "write migration")
   - Default to sequential if dependencies are unclear

**Required Tests:**
- None (specification change — validated via manual pipeline run)

**Acceptance Criteria:**
- [ ] AC 3.1: BUILD prompt includes parallel subtask guidance
- [ ] AC 3.2: Dependent subtasks remain sequential
- [ ] AC 3.3: Default behavior is sequential when dependencies are unclear

#### SUBTASK 3.1.1: Update BUILD phase instruction #2 with parallel subtask guidance
**JIRA:** [PIPE-13](https://wiseguys.atlassian.net/browse/PIPE-13)

---

## STORY 4: Pipeline Config Template Update
**JIRA:** [PIPE-14](https://wiseguys.atlassian.net/browse/PIPE-14)

Add optional `subtask_jira_sync` config flag to the pipeline config template.

**Time Estimate:** ~15 minutes

### TASK 4.1: Add subtask_jira_sync flag to pipeline config template
**JIRA:** [PIPE-15](https://wiseguys.atlassian.net/browse/PIPE-15)
**Depends On:** None
**Parallel Group:** A
**Complexity:** Simple
**Estimated Time:** 15 minutes

**Description:**
Add a `subtask_jira_sync: true` flag under the `execution` section in `pipeline/templates/pipeline-config-template.yaml`. This flag allows projects to opt out of subtask-level JIRA sync if they don't want subtask-level tracking. Default is `true` (enabled). Also update `commands/execute.md` to reference this flag — check it before performing subtask transitions.

**Files to Modify:**
- `pipeline/templates/pipeline-config-template.yaml` — Add `subtask_jira_sync` under `execution`
- `commands/execute.md` — Add conditional check for the flag

**Implementation:**

1. Add `subtask_jira_sync: true` under `pipeline.execution` in the config template, with a comment explaining its purpose
2. Add a note in `commands/execute.md` Steps 1.5, 3a, and 3g that subtask JIRA transitions should only happen if `subtask_jira_sync` is `true` (or not set, defaulting to `true`)

**Required Tests:**
- None (specification/template change)

**Acceptance Criteria:**
- [ ] Config template has `subtask_jira_sync` flag with default `true`
- [ ] execute.md references the flag before subtask transitions

#### SUBTASK 4.1.1: Add config flag to pipeline-config-template.yaml
**JIRA:** [PIPE-16](https://wiseguys.atlassian.net/browse/PIPE-16)
#### SUBTASK 4.1.2: Add conditional check in execute.md
**JIRA:** [PIPE-17](https://wiseguys.atlassian.net/browse/PIPE-17)

---

## Dependency Graph

```
Group A (all parallel, no dependencies):
  TASK 1.1 (Medium) — Subtask JIRA transitions in Steps 3a/3g/3e
  TASK 2.1 (Medium) — Subtask reconciliation in Step 1.5
  TASK 3.1 (Simple) — BUILD prompt parallel subtask guidance
  TASK 4.1 (Simple) — Config flag in pipeline template
```

All 4 tasks are independent — they modify different sections of `execute.md` and/or different files. They can all be executed in parallel.

## Summary

| Metric | Value |
|--------|-------|
| Stories | 4 |
| Tasks | 4 (Simple: 2, Medium: 2) |
| Subtasks | 8 |
| Parallel Groups | 1 (Group A — all tasks) |
| Estimated Time | ~3 hours |
| Files Modified | 2 (`commands/execute.md`, `pipeline/templates/pipeline-config-template.yaml`) |
