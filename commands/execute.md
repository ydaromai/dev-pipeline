# /execute — Execute Dev Plan with Ralph Loop

You are executing the **execute** pipeline stage. This is the core orchestration engine. It reads a dev plan, builds a dependency graph, and executes tasks using the Ralph Loop pattern: fresh context per iteration, cross-model review.

**Input:** Dev plan file via `$ARGUMENTS` (e.g., `@docs/dev_plans/daily-revenue-trends.md`)
**Output:** Implemented code, PRs created, JIRA updated

---

## Step 1: Read inputs and build dependency graph

1. Read the dev plan file
2. Read `pipeline.config.yaml` for execution config
3. Read `docs/ai_definitions/AGENT_CONSTRAINTS.md`
4. Read the linked PRD (find by matching slug in `docs/prd/`)
5. Resolve the JIRA transition script path: use `pipeline.config.yaml` → `paths.jira_transition` if available, otherwise default to `scripts/jira/transition-issue.js`. Store this as `jira_transition_path` for use throughout execution.

Parse all tasks and build a dependency graph:
- Extract `Depends On` and `Parallel Group` from each task
- Identify **ready tasks**: tasks with no unmet dependencies (all `Depends On` tasks are marked DONE)
- Group ready tasks by `Parallel Group`

## Step 1.5: Reconcile JIRA statuses

Before continuing execution, reconcile the dev plan's task statuses with JIRA. This ensures that tasks completed in a previous session (or outside the `/execute` flow) have their JIRA status updated.

1. Read `jira-issue-mapping.json` from the project root to get task→JIRA key mappings (includes task-level, subtask-level, and story-level keys)
2. Parse the dev plan for each task's current status:
   - `✅ DONE` — task is complete
   - `🔄 IN PROGRESS` — task is actively being worked on
   - Unmarked/pending — task has not started
3. For each task that has a JIRA key:
   - If dev plan says `✅ DONE` → run `node <jira_transition_path> <JIRA_KEY> "Done"` (idempotent — `transition-issue.js` handles "already in target status" gracefully)
   - If dev plan says `🔄 IN PROGRESS` → run `node <jira_transition_path> <JIRA_KEY> "In Progress"`
4. Reconcile **Subtask-level** JIRA issues (if `subtask_jira_sync` is `true` or not set, defaulting to `true`): for each task processed in step 3, also look up its subtask JIRA keys from `jira-issue-mapping.json` (find all entries where the key starts with `SUBTASK-{N.M}.`, e.g., for TASK 1.1 find `SUBTASK-1.1.1`, `SUBTASK-1.1.2`, etc.):
   - If parent task is `✅ DONE` → transition each subtask JIRA issue to "Done"
   - If parent task is `🔄 IN PROGRESS` → transition each subtask JIRA issue to "In Progress"
   - Transitions are idempotent — already-in-target-status subtasks are handled gracefully
   - If a subtask transition fails, log a warning and continue — do **not** block reconciliation
   - If no subtask keys are found in the mapping for a task, skip silently
5. Reconcile **Story-level** JIRA issues: if **all tasks** under a story are marked `✅ DONE`, transition the story's JIRA issue to "Done"
6. Report what was synced:

```
## JIRA Reconciliation
Synced 8 statuses to JIRA:
- PAR-18 (TASK 1.1) → Done ✅
- PAR-24 (SUBTASK 1.1.1) → Done ✅
- PAR-25 (SUBTASK 1.1.2) → Done ✅
- PAR-19 (TASK 1.2) → Done ✅
- PAR-26 (SUBTASK 1.2.1) → Done ✅
- PAR-22 (TASK 2.1) → Done ✅
- PAR-23 (TASK 2.2) → In Progress 🔄
- PAR-17 (STORY 1) → Done ✅ (all tasks complete)

Already in sync: 3 tasks, 2 subtasks
```

If `jira-issue-mapping.json` is not found (e.g., JIRA was skipped), skip this step silently.

## Step 2: Pre-flight check

Present the execution plan to the user:

```
## Execution Plan

Dev Plan: <slug>
Total Tasks: N (Simple: X, Medium: Y, Complex: Z)

### Execution Order
Group A (parallel, first): TASK 1.1 (Simple), TASK 2.1 (Medium)
Group B (after A):          TASK 1.2 (Complex), TASK 2.2 (Simple)
Group C (after B):          TASK 1.3 (Medium)

### Ralph Loop Config
Build Models: Simple→Sonnet 4.6, Medium→Sonnet 4.6, Complex→Opus 4.6
Review Model: Opus 4.6
Max Iterations: 3
Fresh Context: Yes

### Already Completed
<list any tasks already marked DONE, or "None">

Proceed with execution? (approve/reject)
```

Wait for user approval.

## Step 3: Execute ready tasks

For each ready task (or group of parallel-ready tasks):

### 3a. Setup

For each task:
1. Create a git branch: `feat/story-{S}-task-{T}-{slug}` (from `pipeline.config.yaml` branch_pattern)
2. Transition JIRA issue to "In Progress" (if JIRA key exists):
   ```bash
   node <jira_transition_path> <JIRA_KEY> "In Progress"
   ```
3. Transition all **subtask** JIRA issues to "In Progress" (if `subtask_jira_sync` is `true` or not set in config, defaulting to `true`):
   - Look up the task's subtask JIRA keys from `jira-issue-mapping.json`: find all entries where the key starts with `SUBTASK-{N.M}.` (e.g., for TASK 1.1, find `SUBTASK-1.1.1`, `SUBTASK-1.1.2`, etc.)
   - For each subtask JIRA key found:
     ```bash
     node <jira_transition_path> <SUBTASK_JIRA_KEY> "In Progress"
     ```
   - Transitions are idempotent — `transition-issue.js` handles "already in target status" gracefully
   - If a subtask transition fails, log a warning and continue — do **not** block the parent task's execution
   - If no subtask keys are found in the mapping, skip silently
4. Update the dev plan with task status:
   ```markdown
   **Status:** 🔄 IN PROGRESS
   **Branch:** feat/story-1-task-1-db-schema
   **Session:** main
   ```

### 3b. Ralph Loop — BUILD phase (fresh context)

Spawn a subagent (Task tool) with the appropriate model based on task complexity:
- Simple → `model: sonnet` (Sonnet 4.6)
- Medium → `model: sonnet` (Sonnet 4.6)
- Complex → `model: opus` (Opus 4.6)

**Build subagent prompt:**
```
You are implementing a task from a dev plan. Follow all agent constraints.

## Your Task
<paste full task spec from dev plan, including subtasks>

## Agent Constraints
<paste AGENT_CONSTRAINTS.md content>

## Context
- Branch: <branch name>
- Project root: <cwd>
- PRD: <paste relevant PRD sections>

## Instructions
1. Read the codebase to understand existing patterns
2. Implement subtasks: review the subtask list and identify which are independent (no output from one is input to another) vs. dependent (one builds on another's output, e.g., "create schema" before "write migration"). Implement independent subtasks in whatever order is most efficient; maintain sequential order for dependent subtasks. If dependencies between subtasks are unclear, default to sequential execution in the listed order.
3. Write tests as specified in Required Tests
4. Run tests: <test command from pipeline.config.yaml>
5. Commit with conventional commit format, reference JIRA key
6. Report what you implemented and any issues encountered
```

### 3c. Ralph Loop — REVIEW phase (fresh context, different model)

After the build phase completes, spawn a **review subagent** (Task tool, model: opus — Opus 4.6) with all applicable critic personas (7 standard + Designer if `has_frontend: true`):

**Review subagent prompt:**
```
You are the Review Agent for the Ralph Loop. You will review the implementation
using all applicable critic perspectives. Read all critic persona files:

1. ${CLAUDE_PLUGIN_ROOT}/pipeline/agents/product-critic.md
2. ${CLAUDE_PLUGIN_ROOT}/pipeline/agents/dev-critic.md
3. ${CLAUDE_PLUGIN_ROOT}/pipeline/agents/devops-critic.md
4. ${CLAUDE_PLUGIN_ROOT}/pipeline/agents/qa-critic.md
5. ${CLAUDE_PLUGIN_ROOT}/pipeline/agents/security-critic.md
6. ${CLAUDE_PLUGIN_ROOT}/pipeline/agents/performance-critic.md
7. ${CLAUDE_PLUGIN_ROOT}/pipeline/agents/data-integrity-critic.md
8. ${CLAUDE_PLUGIN_ROOT}/pipeline/agents/designer-critic.md (only if pipeline.config.yaml has `has_frontend: true`)

## What to review
- Branch: <branch name>
- Run: git diff main..HEAD to see all changes
- Task spec: <paste task spec>
- PRD: <paste relevant PRD sections>
- Test requirements from pipeline.config.yaml: <paste>

## Instructions
1. Read the diff on the branch
2. Run each critic's checklist against the implementation
3. Produce a structured review with verdicts for each critic
4. Use the output format defined in each critic's persona file
5. Final verdict: PASS only if ALL applicable critics pass. FAIL if any has Critical findings.

## Output Format
Produce each critic's review in sequence, then a final summary:

### Final Verdict: PASS | FAIL
- Product: PASS/FAIL
- Dev: PASS/FAIL
- DevOps: PASS/FAIL
- QA: PASS/FAIL
- Security: PASS/FAIL
- Performance: PASS/FAIL
- Data Integrity: PASS/FAIL
- Designer: PASS/FAIL/N/A (only if has_frontend: true)

<Then include each critic's full structured output>
```

### 3d. Ralph Loop — ITERATE if needed

If the review verdict is **FAIL**:

1. Collect all Critical findings from failed critics
2. Spawn a **new build subagent** (fresh context) with the fix prompt:

```
You are fixing issues found during code review. Follow all agent constraints.

## Original Task
<paste task spec>

## Current State
- Branch: <branch name> (already has implementation from previous iteration)
- Read the current code on this branch first

## Review Feedback (must fix all Critical items)
<paste all Critical findings from failed critics>

## Instructions
1. Read the current implementation on the branch
2. Address each Critical finding
3. Run tests
4. Commit fixes with message: fix: address review feedback (round N)
5. Report what you fixed
```

3. Re-run the REVIEW phase (fresh context), but only evaluate the **previously failed critics**
4. Repeat up to `max_iterations` (default: 3) total cycles

### 3e. Escalation

If still failing after max iterations:
- Update dev plan status: `**Status:** ❌ BLOCKED`
- **Do NOT transition subtask JIRA issues** — leave them at their current status when the parent task is blocked/escalated. Subtask transitions only happen on successful task start (Step 3a) and completion (Step 3g).
- Create a WIP PR with all critic feedback in the description
- Present to user:

```
## Task <ID> — Escalation Required

After <N> Ralph Loop iterations, the following critics still FAIL:
<list failed critics and their Critical findings>

The implementation is on branch: <branch>
A WIP PR has been created: <PR URL>

Options:
1. Override — merge despite failures
2. Fix manually — I'll wait for you to push fixes, then re-review
3. Skip — move on to next task (mark this as blocked)
4. Abort — stop execution
```

### 3f. Create PR

Once all critics PASS (or user overrides):

1. Push the branch:
   ```bash
   git push -u origin <branch>
   ```
2. Create a PR with critic results:
   ```bash
   gh pr create --title "[TASK-{S}.{T}] {title}" --body "<PR body>"
   ```
   PR body includes:
   - Summary of changes
   - JIRA task link
   - Critic results (all PASS verdicts)
   - Acceptance criteria checklist
   - Ralph Loop iterations count

3. Post PR link to JIRA:
   ```bash
   node <jira_transition_path> <JIRA_KEY> comment "🔗 Pull Request: <PR_URL>"
   ```

### 3g. Human gate (per PR)

Present the PR to the user:

```
## PR Ready for Review

PR: <PR URL>
Task: <task title>
Branch: <branch>
Ralph Loop: Passed in <N> iterations
All Critics: PASS ✅

Approve and merge? (approve/reject/skip)
```

If approved:
1. Merge the PR:
   ```bash
   gh pr merge <PR_NUMBER> --squash --delete-branch
   ```
2. Transition JIRA to "Done":
   ```bash
   node <jira_transition_path> <JIRA_KEY> "Done"
   ```
3. Transition all **subtask** JIRA issues to "Done" (if `subtask_jira_sync` is `true` or not set):
   - Look up the task's subtask JIRA keys from `jira-issue-mapping.json`: find all entries where the key starts with `SUBTASK-{N.M}.` (same lookup pattern as Step 3a)
   - For each subtask JIRA key found:
     ```bash
     node <jira_transition_path> <SUBTASK_JIRA_KEY> "Done"
     ```
   - Transitions are idempotent — already-Done subtasks are handled gracefully
   - If a subtask transition fails, log a warning and continue — do **not** block the task completion
4. Update dev plan:
   ```markdown
   **Status:** ✅ DONE
   **PR:** #<number>
   ```

## Step 4: Unlock dependent tasks and repeat

After a task completes:
1. Update the dependency graph — mark task as DONE
2. Check if any blocked tasks are now unblocked (all their dependencies are DONE)
3. If unblocked tasks exist, return to Step 3 with the newly ready tasks
4. If running with `parallel_tasks: true`, launch multiple ready tasks simultaneously (using parallel Task tool calls)

Repeat until all tasks are DONE or BLOCKED.

## Step 5: Final report

When all tasks are processed:

```
## Execution Complete

### Results
| Task | Status | PR | Iterations | Critics |
|------|--------|-----|-----------|---------|
| TASK 1.1 | ✅ DONE | #42 | 1 | All PASS |
| TASK 1.2 | ✅ DONE | #43 | 2 | All PASS |
| TASK 2.1 | ❌ BLOCKED | WIP #44 | 3 | Dev FAIL |

### Summary
- Completed: N/M tasks
- Blocked: K tasks (require manual intervention)
- Total Ralph Loop iterations: X
- PRs merged: Y

### Next Steps
<if blocked tasks exist, suggest resolution steps>
<if all done, suggest running integration tests>
```

---

## Multi-Session Scaling (for large plans)

When a plan has many independent stories, you can generate a session launch script instead of running everything in-session:

```bash
#!/bin/bash
# Generated by /execute — parallel story execution
# Each story runs in its own claude CLI session with fresh context

# Story 1 (Tasks 1.1, 1.2, 1.3)
claude --model claude-opus-4-6 -p "Execute tasks from docs/dev_plans/<slug>.md for STORY 1 only. Follow /execute workflow." &

# Story 2 (Tasks 2.1, 2.2) — no dependency on Story 1
claude --model claude-opus-4-6 -p "Execute tasks from docs/dev_plans/<slug>.md for STORY 2 only. Follow /execute workflow." &

wait
echo "All stories complete. Check dev plan for status."
```

Present this option to the user when:
- Plan has 3+ independent stories
- `parallel_stories: true` in config
- User hasn't opted for in-session execution
