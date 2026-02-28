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
Build Models: Simple→Sonnet 4.6, Medium→Opus 4.6, Complex→Opus 4.6
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
- Medium → `model: opus` (Opus 4.6)
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

After the build phase completes, spawn a **review subagent** (Task tool, model: opus — Opus 4.6) with all applicable critic personas (7 always-on + conditional: Observability if `has_backend_service: true`, API Contract if `has_api: true`, Designer if `has_frontend: true`):

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
8. ${CLAUDE_PLUGIN_ROOT}/pipeline/agents/observability-critic.md (only if pipeline.config.yaml has `has_backend_service: true`)
9. ${CLAUDE_PLUGIN_ROOT}/pipeline/agents/api-contract-critic.md (only if pipeline.config.yaml has `has_api: true`)
10. ${CLAUDE_PLUGIN_ROOT}/pipeline/agents/designer-critic.md (only if pipeline.config.yaml has `has_frontend: true`)

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
- Observability: PASS/FAIL/N/A (only if has_backend_service: true)
- API Contract: PASS/FAIL/N/A (only if has_api: true)
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

## Step 5: Pre-Delivery Smoke Test (MANDATORY)

**This step is mandatory.** Do NOT skip it. Do NOT present results to the user before completing it. This step typically adds 30–90 seconds to pipeline execution depending on server startup time and LLM latency.

After all tasks are DONE (or BLOCKED), but BEFORE declaring the pipeline complete, perform runtime verification. This catches integration seams that critics miss (critics review code; smoke tests verify experience).

### Smoke test configuration

Read `AGENT_CONSTRAINTS.md` → "Pre-Delivery Validation" for the project-specific checklist. If `pipeline.config.yaml` has a `smoke_test` section, use its configuration. Otherwise, apply the defaults below.

**Expected `smoke_test` config schema in `pipeline.config.yaml`** (canonical source; also mirrored in `pipeline/templates/pipeline-config-template.yaml` — keep both in sync):
```yaml
smoke_test:
  enabled: true                    # set to false to skip (e.g., libraries, CLI tools, data pipelines)
  # start_command: "pnpm dev"     # default: auto-detected from lockfile (omit to auto-detect)
  startup_timeout_seconds: 30      # max wait for server readiness
  ready_patterns:                  # case-insensitive substrings to match in server output (replaces defaults if set)
    - "ready"
    - "listening"
    - "started"
    - "compiled successfully"
    - "running"
    - "available"
  endpoints:                       # health check URLs (overrides auto-detect from has_frontend/has_backend_service)
    - { url: "http://localhost:3000", expect_status: 200 }
    - { url: "http://localhost:3001/health", expect_status: 200, expect_body_contains: "ok" }
  endpoint_timeout_seconds: 10     # per-endpoint HTTP timeout
  entry_url: "http://localhost:3000"
  interaction_endpoint: null       # e.g., "POST /api/chat" — auto-inferred from PRD if omitted
  has_llm: true                    # whether to test with LLM_MOCK=false
  llm_api_key_env: null            # e.g., "ANTHROPIC_API_KEY" — auto-detect from .env if omitted
  llm_timeout_seconds: 30          # timeout for LLM API requests during smoke test
  max_fix_attempts: 2              # max smoke test fix iterations before escalating to user
```

**Defaults:** If the `smoke_test` section is absent from config, Step 5 still runs using auto-detection (this step is mandatory). If `smoke_test` is present but `enabled` is omitted, it defaults to `true`. Only `smoke_test.enabled: false` skips the smoke test.

**If `smoke_test.enabled` is explicitly `false`, skip this entire step** and use this report snippet in Step 6:
```
### Smoke Test Results
Smoke tests: SKIPPED (opted out via `smoke_test.enabled: false`)
```

**Edge cases:**
- `max_fix_attempts: 0` → escalate to the user immediately on first failure without attempting fixes.
- `ready_patterns: []` (empty list) → skip readiness pattern matching entirely; wait the full `startup_timeout_seconds` then proceed. This is useful for servers with no stdout output.

### 5a. Start the dev server

1. **Pre-check:** Verify target ports are free (`lsof -i :<port>` or equivalent). If a port is occupied, fail fast with a clear message identifying which port is blocked and which process holds it.
2. **Detect the package manager** from the lockfile (`pnpm-lock.yaml` → `pnpm`, `yarn.lock` → `yarn`, `bun.lockb` or `bun.lock` → `bun`, `package-lock.json` → `npm`). Use `smoke_test.start_command` from config if set, otherwise use `<detected-pm> run dev`. **Non-JS projects** (Python, Go, Rust, etc.) have no lockfile auto-detection — they MUST set `smoke_test.start_command` explicitly, or startup will fail with a clear error.
3. Start the dev server in the background. Record the PID for teardown. **Note:** The dev server inherits the current shell environment. This is acceptable for local development but may expose additional env vars in CI-hosted pipeline runs — consider using `env -i` with explicit vars in CI contexts.
4. Wait for a readiness signal — match any of `smoke_test.ready_patterns` (default: `ready`, `listening`, `started`, `compiled successfully`, `running`, `available` — case-insensitive) in the server output. Projects with non-standard readiness messages should configure `ready_patterns` explicitly.
5. **Timeout:** If no readiness signal appears within `smoke_test.startup_timeout_seconds` (default: 30s), treat as a BLOCKING failure. **On startup failure, capture the last 50 lines of server output** and include them in the failure report for diagnostic context.

### 5b. Health checks

Verify all services respond. Read endpoints from `smoke_test.endpoints` in config — if present, this **overrides** auto-detection entirely. If `endpoints` is not configured, auto-detect from **top-level** pipeline config flags:
- If `has_frontend: true` → check `http://localhost:3000` (expect 200)
- If `has_backend_service: true` → check `http://localhost:3001/health` (expect 200)
- If neither flag is set, check `http://localhost:3000` only

Use `smoke_test.endpoint_timeout_seconds` (default: 10s) as the per-endpoint HTTP timeout. If `expect_body_contains` is set for an endpoint, verify the response body includes that string (catches degraded health endpoints that return 200 with unhealthy status).

Use any available HTTP method (curl with `--connect-timeout 5 --max-time 10`, fetch, wget) — the tool does not matter, the result does. **On failure, record and report:** endpoint URL, HTTP status code received (or connection error), response body (first 500 chars), and request duration.

### 5c. SDK version compatibility

> **Note:** This complements the Dev Critic's static checklist (SDK API surface + cross-boundary format). The critic catches mismatches during code review; this step verifies at integration time after all tasks are merged, catching seams between independently-reviewed tasks.

For any SDK used in the project:
1. Read the project manifest for installed versions — for Node.js, read both `dependencies` and `devDependencies` in `package.json`; for other ecosystems, read the equivalent (`requirements.txt`, `go.mod`, `Cargo.toml`, etc.)
2. Verify server-side API methods match the installed version (check SDK changelog or type definitions, or equivalent for non-JS SDKs)
3. Verify client-side transport expects the same format the server sends
4. **Cross-SDK seams** (e.g., AI SDK client ↔ server) are the highest-risk area
5. **Emit a structured audit line per SDK checked** in the results, e.g., `ai@6.2.1 — toUIMessageStreamResponse: confirmed`. This provides an audit trail if a version-related issue surfaces later.

### 5d. Core user flow verification

Verify the primary user flow via HTTP requests and response inspection (not visual browser interaction):
1. Request the entry URL — verify HTTP 200 and the response HTML contains expected elements (root div, script tags, meta tags)
2. Trigger the main interaction endpoint — use `smoke_test.interaction_endpoint` from config if set; otherwise infer from the PRD's primary user flow and the codebase route definitions (scan `app/api/`, `pages/api/`, `routes/`, or framework-equivalent directories for the primary endpoint). Examples: `POST /api/chat` for chat apps, `GET /api/items` for CRUD apps, `POST /api/generate` for generation apps. Verify the response status and format.
3. If the app has an LLM component and `smoke_test.has_llm` is not `false`:
   - Check for an API key: look at `smoke_test.llm_api_key_env` from config, or auto-detect from common env vars (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`) or the project's `.env` file. **When reading `.env`, check only whether the specific key exists** (e.g., `grep '^ANTHROPIC_API_KEY=' .env`) — do not parse or retain the full file contents and do not capture or log the key's value, as it may contain unrelated secrets.
   - If an API key is available, test once with `LLM_MOCK=false` and verify the response **status and format only** — do NOT log or persist the full response body (it may contain sensitive content)
   - Use `smoke_test.llm_timeout_seconds` (default: 30s) for the LLM request (`curl --max-time <timeout>` or equivalent). **On timeout, report:** endpoint called, request payload shape (e.g., `POST /api/chat {messages: [...]}` — not content), timeout value, and whether the dev server process was still running at timeout time.
   - If no API key is available, **skip this sub-step** and report as `⚠️ skipped (no API key)` — this is not a BLOCKING failure

### 5e. Visual rendering check (if `has_frontend: true`)

If `has_frontend` is not `true`, skip this step and report `Visual rendering: N/A (no frontend)` in the results table.

Since the agent operates via CLI (no browser), verify rendering integrity through static analysis (also checked by the Designer Critic during code review — this step catches integration-level issues after all tasks are merged):
1. Verify CSS custom properties are defined before use — no orphan `var(--*)` references without a corresponding definition in scope (fonts, colors, spacing, radii, etc.)
2. Verify dynamic content rendering code parses markdown/responses (not raw display)
3. Verify images/icons/assets referenced in code exist as files (no missing references)
4. If the project defines a dark theme (`data-theme`, `prefers-color-scheme`), verify all CSS custom properties have definitions in both themes

> **Note:** For full visual verification, recommend the user perform a manual browser check or configure a headless browser tool in `smoke_test`.

### 5f. Teardown

**After smoke tests complete (pass or fail), terminate the dev server process started in 5a:**
1. Send SIGTERM to the **process group** (`kill -- -$PID` on Linux/macOS). If that fails (e.g., process is not a group leader), fall back to `pkill -P $PID` to kill child processes. Dev servers (Next.js, Vite, etc.) often spawn child workers; killing only the parent leaves orphan processes holding ports.
2. Wait up to 5 seconds for the process group to exit
3. If still running, send SIGKILL to the process group (`kill -9 -- -$PID`)
4. Verify the ports are released (`lsof -i :<port>` returns empty) before proceeding

### Failure handling

If ANY smoke test step fails:
1. **Create a `fix/smoke-test-<short-sha>-<attempt>` branch** from the current HEAD (use the first 7 chars of HEAD SHA + attempt number for uniqueness, e.g., `fix/smoke-test-a1b2c3d-1`).
2. Apply the fix and run the relevant critics (Dev + QA + Security minimum) against the change.
3. **Log each fix attempt** with structured output: what was changed (files modified), which smoke test step was re-run, and the pass/fail result with the same structured diagnostics as the original failure.
4. Create a PR and present it to the user for approval (same gate as Step 3g).
5. After merge, re-run the failed smoke test step to confirm the fix.
6. **Max attempts:** After `smoke_test.max_fix_attempts` (default: 2) failed fix cycles, escalate to the user as a BLOCKING issue — do not loop indefinitely.
7. If you cannot fix it, report it explicitly in the final report as a BLOCKING issue.
8. The pipeline is NOT complete until smoke tests pass.

---

## Step 6: Final report

When all tasks are processed AND smoke tests pass:

```
## Execution Complete

### Results
| Task | Status | PR | Iterations | Critics |
|------|--------|-----|-----------|---------|
| TASK 1.1 | ✅ DONE | #42 | 1 | All PASS |
| TASK 1.2 | ✅ DONE | #43 | 2 | All PASS |
| TASK 2.1 | ❌ BLOCKED | WIP #44 | 3 | Dev FAIL |

### Smoke Test Results
| Check | Status | Duration | Details |
|-------|--------|----------|---------|
| Dev server startup | ✅ | 4.2s | pnpm dev, ready in 4.2s |
| Health checks | ✅ | 0.3s | 2/2 endpoints healthy |
| SDK version compatibility | ✅ | 1.1s | ai@6.2.1 — toUIMessageStreamResponse: confirmed |
| Core user flow | ✅ | 0.8s | POST /api/chat → 200 |
| Visual rendering | ✅ / N/A (no frontend) | 0.5s | 0 orphan CSS vars, 0 missing assets |
| Real API test | ✅ / ⚠️ skipped (no API key) | 2.1s | LLM response format valid / no ANTHROPIC_API_KEY |
| Server teardown | ✅ | 0.2s | PID group terminated, ports released |

### Summary
- Completed: N/M tasks
- Blocked: K tasks (require manual intervention)
- Total Ralph Loop iterations: X
- PRs merged: Y
- Smoke tests: PASS ✅

### Next Steps
<if blocked tasks exist, suggest resolution steps>
- Run full test suite: <test command from pipeline.config.yaml>
- Deploy to staging
```

**If smoke tests fail after `max_fix_attempts`**, use this variant instead:

```
## Execution Incomplete — Smoke Test Failure

### Results
| Task | Status | PR | Iterations | Critics |
|------|--------|-----|-----------|---------|
| TASK 1.1 | ✅ DONE | #42 | 1 | All PASS |
| TASK 1.2 | ✅ DONE | #43 | 2 | All PASS |

### Smoke Test Results
| Check | Status | Duration | Error Details |
|-------|--------|----------|---------------|
| Dev server startup | ✅ | 4.2s | — |
| Health checks | ❌ FAIL | 0.3s | GET http://localhost:3001/health → 503, body: {"status":"unhealthy","db":"disconnected"} |
| SDK version compatibility | ⏭️ skipped | — | Blocked by prior failure |
| Server teardown | ✅ | 0.2s | PID group terminated, ports released |

### Summary
- Completed: N/M tasks
- Smoke tests: FAIL ❌ (after N fix attempts)
- Blocking issue: <description of the failing step and root cause>

### Next Steps
- Fix the issue manually on branch: <branch>
- Re-run smoke tests: `/validate --smoke-test`
- Or override: proceed to deploy with known issue
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
