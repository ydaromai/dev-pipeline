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

### Step 1.1: Foundation Detection

Check `pipeline.config.yaml` for `assumes_foundation: true`. If set:
- Load the foundation baseline context: auth, multi-tenancy, RBAC, CI/CD, deployment are proven and locked
- Brief all build agents: "Foundation infrastructure is locked — do not modify auth, CI/CD, or deployment config"
- Set `assumes_foundation: true` in the execution context

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
Group A (parallel, first): TASK 1.1 (Simple, Frontend Expert), TASK 2.1 (Medium, Data Expert)
Group B (after A):          TASK 1.2 (Complex, Backend Expert), TASK 2.2 (Simple, Infra Expert)
Group C (after B):          TASK 1.3 (Medium, ML Expert)

### Ralph Loop Config
Build Models: Simple→Sonnet 4.6, Medium→Opus 4.6, Complex→Opus 4.6
Expert Selection: Inferred from task files (override with Domain field in dev plan)
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

#### Domain Expert Selection

Before spawning the build subagent, infer the task's **primary domain** from its `Files to Create/Modify` list to select the appropriate expert builder persona. Use the following rules:

| Domain | File Path Patterns (glob) | Expert Persona |
|--------|--------------------------|----------------|
| **Security** | `**/auth.ts`, `**/auth.tsx`, `**/auth.js`, `**/auth.jsx`, `**/auth/*`, `**/rbac/*`, `**/permissions/*`, `**/middleware/auth*`, `**/login/*`, `**/signup/*`, `**/security/*`, `**/crypto/*` | `${CLAUDE_PLUGIN_ROOT}/pipeline/agents/builders/security-expert.md` |
| **ML** | `**/ai/*`, `**/ml/*`, `**/llm/*`, `**/services/ai*`, `**/services/ml*`, `**/prompts/*`, `**/embeddings/*`, `**/inference/*`, `**/ml/models/*`, `**/ai/models/*`, `**/rag/*`, `**/ai/agents/*`, `**/ml/agents/*`, `**/vectors/*` | `${CLAUDE_PLUGIN_ROOT}/pipeline/agents/builders/ml-expert.md` |
| **Data Analytics** | `**/dashboards/*`, `**/dashboard/widgets/*`, `**/dashboard/charts/*`, `**/analytics/*`, `**/charts/*`, `**/reports/*`, `**/metrics/*`, `**/kpi/*`, `**/visualization/*` | `${CLAUDE_PLUGIN_ROOT}/pipeline/agents/builders/data-analyst-expert.md` |
| **Infra** | `.github/workflows/*`, `.gitlab-ci.yml`, `Dockerfile*`, `docker-compose*`, `vercel.json`, `netlify.toml`, `**/terraform/*`, `*.tf`, `**/cdk/*`, `**/pulumi/*`, `**/k8s/*`, `**/kubernetes/*`, `**/helm/*`, `**/cloudformation/*` | `${CLAUDE_PLUGIN_ROOT}/pipeline/agents/builders/infra-expert.md` |
| **Data** | `migrations/*`, `supabase/migrations/*`, `prisma/*`, `drizzle/*`, `*.sql`, `**/seed*`, `**/repo/*`, `**/repositories/*`, `**/etl/*`, `**/transforms/*`, `**/import/*`, `**/export/*` | `${CLAUDE_PLUGIN_ROOT}/pipeline/agents/builders/data-expert.md` |
| **Frontend** | `src/components/**/*`, `src/app/**/*`, `src/pages/**/*`, `pages/**/*`, `components/**/*`, `src/hooks/**/*`, `src/context/**/*`, `*.css`, `*.scss`, `*.module.css` | `${CLAUDE_PLUGIN_ROOT}/pipeline/agents/builders/frontend-expert.md` |
| **Backend** | `src/api/**/*`, `src/lib/**/*`, `src/services/**/*`, `src/middleware/**/*`, `app/api/**/*` | `${CLAUDE_PLUGIN_ROOT}/pipeline/agents/builders/backend-expert.md` |

**Valid domain values:** `Security`, `ML`, `Data Analytics`, `Infra`, `Data`, `Frontend`, `Backend`.

**Rules:**
1. If the task has an explicit `Domain` field in the dev plan, use that directly (overrides inference). If the value does not match one of the valid domain values above, halt with an error listing the valid options.
2. Otherwise, infer from the majority of files in `Files to Create/Modify`. Match file paths against the glob patterns in the table above. The domain with the most file matches wins. If tied, use the higher-priority domain (table order = priority, top to bottom).
3. If no pattern matches, use **Backend** as the default and log a note in the execution output: `"Domain: Backend (default — no pattern matched)"`.
4. For cross-domain tasks (files match 2+ domains), select the primary domain (most file matches) and add a `## Secondary Domain Context` section to the build prompt containing **only** the `Anti-Patterns to Avoid` and `Definition of Done` sections from the secondary expert persona. Do not paste the full secondary persona file.
5. When `assumes_foundation: true` and all matched files are in the foundation-locked set (auth, RBAC, CI/CD, deployment config), do NOT route to Security or Infra expert. Instead, fall through to the next matching domain or Backend default — those files should not be modified. **Rule 5 takes precedence over Rule 8** — when all security-pattern files are foundation-locked, Security Expert routing is suppressed because those files must not be modified.
6. Read the selected expert persona file and include its content in the build subagent prompt. If the persona file is not found at the expected path, halt with an error: `"Expert persona file not found: <path>"`.
7. When `assumes_foundation` is `false` or absent in `pipeline.config.yaml`, omit the `## Foundation Guard Rails` section from both the build prompt and fix prompt entirely.
8. If any file in `Files to Create/Modify` matches Security domain patterns (row 1 of the table above), the Security Expert must be selected as primary or included as secondary context (Anti-Patterns + Definition of Done sections only), regardless of any explicit `Domain` field override. **Rule 8 is subject to Rule 5** — it does not apply when all security-pattern files are foundation-locked.

Report the selected expert in the execution plan output with routing rationale:
```
TASK 1.1 (Medium, Frontend Expert + Backend secondary) → Opus 4.6
  Routing: 3/5 files matched Frontend, 2/5 matched Backend (Rule 2: majority)
TASK 1.2 (Simple, Data Expert) → Sonnet 4.6
  Routing: Domain field override (Rule 1)
TASK 2.1 (Complex, ML Expert) → Opus 4.6
  Routing: 4/4 files matched ML (Rule 2: unanimous)
TASK 3.1 (Simple, Backend Expert) → Sonnet 4.6
  Routing: Backend (default — no pattern matched) (Rule 3)
```

**Build subagent prompt:**
```
You are a <Domain> Expert implementing a task from a dev plan. Follow all agent constraints and your domain expertise.

## Domain Expertise
<paste content from the selected expert builder persona file>

## Secondary Domain Context (only if cross-domain task)
<paste key points from secondary expert persona — anti-patterns, definition of done items relevant to the secondary files>

## Your Task
<paste full task spec from dev plan, including subtasks>

## Agent Constraints
<paste AGENT_CONSTRAINTS.md content>

## Foundation Guard Rails (when assumes_foundation: true)

You are building domain logic on top of the Foundation starter project. The following are LOCKED and must NOT be modified:
- Authentication system (src/lib/auth.ts, login page, OTP flow, custom_access_token_hook)
- RBAC framework (src/lib/roles.ts, role-based middleware, authorization components)
- Multi-tenancy infrastructure (RLS base policies, tenant table, tenant context)
- CI/CD pipelines (.github/workflows/*)
- Deployment configuration (vercel.json, Supabase config)
- Base database schema (tenants, profiles, audit_log migrations)
- Navigation/layout components (sidebar, top bar, breadcrumbs — unless extending for domain pages)

You CAN and SHOULD:
- Add new database migrations for domain tables (following existing RLS patterns)
- Create new pages and components for domain features
- Add new API routes for domain logic
- Write new tests for domain functionality
- Extend navigation with new domain menu items
- Add new RLS policies for domain tables

## Context
- Branch: <branch name>
- Project root: <cwd>
- PRD: <paste relevant PRD sections>

## Instructions
1. Read the codebase to understand existing patterns
2. If this task involves CI/CD workflows or Vercel config, read `${CLAUDE_PLUGIN_ROOT}/pipeline/templates/ci-guidelines.md` and follow all rules strictly
3. Implement subtasks: review the subtask list and identify which are independent (no output from one is input to another) vs. dependent (one builds on another's output, e.g., "create schema" before "write migration"). Implement independent subtasks in whatever order is most efficient; maintain sequential order for dependent subtasks. If dependencies between subtasks are unclear, default to sequential execution in the listed order.
4. Write tests as specified in Required Tests
5. Run tests: <test command from pipeline.config.yaml>
6. Commit with conventional commit format, reference JIRA key
7. Report what you implemented and any issues encountered
```

### 3c. Ralph Loop — REVIEW phase (fresh context, different model)

After the build phase completes, spawn a **review subagent** (Task tool, model: sonnet — Sonnet 4.6, or `execution.ralph_loop.critic_model` from config) with all applicable critic personas (7 always-on + conditional: Observability if `has_backend_service: true`, API Contract if `has_api: true`, Designer if `has_frontend: true`, ML if `has_ml: true`):

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
11. ${CLAUDE_PLUGIN_ROOT}/pipeline/agents/ml-critic.md (only if pipeline.config.yaml has `has_ml: true`)

## Foundation Context for Critics (when assumes_foundation: true)

- Do NOT flag missing auth/RBAC/tenancy implementation — it exists in the foundation
- Do NOT flag missing CI/CD configuration — it exists in the foundation
- DO flag if build agent modified locked foundation files (this is a violation)
- DO verify domain code correctly extends foundation patterns (RLS, auth hooks, role checks)

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
- ML: PASS/FAIL/N/A (only if has_ml: true)

<Then include each critic's full structured output>
```

### 3d. Ralph Loop — ITERATE if needed

If the review verdict is **FAIL**:

1. Collect all Critical findings from failed critics
2. Spawn a **new build subagent** (fresh context) with the fix prompt:

```
You are a <Domain> Expert fixing issues found during code review. Follow all agent constraints and your domain expertise.

## Domain Expertise
<paste content from the selected expert builder persona file — same persona used for the original build>

## Secondary Domain Context (only if cross-domain task — same as original build)
<paste Anti-Patterns + Definition of Done from secondary expert persona, matching the original build prompt>

## Agent Constraints
<paste AGENT_CONSTRAINTS.md content>

## Foundation Guard Rails (when assumes_foundation: true)
<paste the same Foundation Guard Rails section from the original build prompt — omit this section entirely when assumes_foundation is false or absent, per Rule 7>

## Original Task
<paste full task spec from dev plan, including subtasks>

## Context
- Branch: <branch name> (already has implementation from previous iteration)
- PRD: <paste relevant PRD sections — same as original build prompt>
- Read the current code on this branch first

## Review Feedback (must fix all Critical items)
<paste all Critical findings from failed critics>

## Instructions
1. Read the current implementation on the branch
2. If fix involves CI/CD workflows or Vercel config, read `${CLAUDE_PLUGIN_ROOT}/pipeline/templates/ci-guidelines.md` and follow all rules strictly
3. Address each Critical finding
4. Write or update tests for any new or modified functionality
5. Run tests
6. Commit fixes with message: fix: address review feedback (round N)
7. Report what you fixed
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

**Foundation smoke test note:** When `assumes_foundation: true`, auth/CI/CD smoke checks verify integration with the existing foundation (e.g., that domain code correctly uses the auth context, that new pages render within the foundation layout), not reimplementation of those systems. Do not fail smoke tests because auth or CI/CD infrastructure was not built in this execution — it already exists.

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

### 5c.5. API→UI Wiring Audit

After verifying SDK compatibility, audit that every backend method is reachable from the UI. This catches "built but unwired" features — backend code that works but has no UI trigger.

1. **Scan backend methods:**
   - Find all public `async` methods in `lib/api/*.ts`, `lib/repo/*.ts`, `lib/repositories/*.ts`, or equivalent (per project structure)
   - Exclude test files (`*.test.*`, `*.spec.*`, `__tests__/`)
   - Exclude methods marked `@internal` or `private`/`protected` methods
   - Exclude methods called only by other repo/API methods (internal composition)

2. **Cross-reference against UI:**
   - **Batching:** If more than 20 public methods are discovered, batch the search — build a single `grep -F` (fixed-string) pattern file of up to 20 method names per invocation (one name per line, passed via `grep -Ff <(printf '%s\n' methods...)` or multiple `-e` flags) rather than one grep per method. Use `grep -F` to avoid shell metacharacter injection from method names. **Method count cap:** If more than 100 public methods are discovered, audit only methods that map to P0/P1 ACs in the PRD and report the remainder as `⚠ SKIPPED (method count cap)`. If P0/P1-mapped methods still exceed 100, audit all P0 methods first, then P1 methods up to the cap. **Time budget:** 60 seconds for the entire wiring audit; if exceeded, report partial results with a Warning: `"Wiring audit timed out after 60s: X/Y methods audited, Z remaining. All P0-mapped methods audited: yes/no."`
   - For each backend method (or batch), grep `app/`, `components/`, `pages/`, `src/` for invocations (function calls, imports, hook usage)
   - For RPC calls (`.rpc('name')`), search for the RPC name string in production UI code
   - For state machine transitions, verify each defined transition has a UI trigger (button, form submission, link, automated UI action)

3. **Output a structured audit table with summary line:**

```markdown
### API→UI Wiring Audit
| Method | Source File | UI References | Status |
|--------|------------|---------------|--------|
| cancelOrder | lib/repo/orders.ts | 0 | ⚠ UNWIRED |
| createOrder | lib/repo/orders.ts | 3 (OrderForm, OrderPage, QuickOrder) | ✅ WIRED |
| deleteCatalogItem | lib/repo/catalog.ts | 0 | ⚠ UNWIRED |
| sendPurchaseOrder | lib/api/po.ts | 0 | ⚠ UNWIRED |

Wiring coverage: 1/4 methods wired (25%), 3 unwired (0 P0)
```

4. **Classify findings:**
   - **UNWIRED** methods are WARNINGs by default
   - If an UNWIRED method maps to a **P0 AC** in the PRD → escalate to **CRITICAL**
   - Methods marked `@internal`, called only by other repo methods, or used in background jobs/cron are excluded from the audit

5. **Failure handling:**
   - CRITICAL findings (P0 AC without UI path) → BLOCKING, must fix before delivery
   - WARNING findings → report in the smoke test results table, do not block delivery
   - If the project has no frontend (`has_frontend: false`), skip this step and report `API→UI Wiring: N/A (no frontend)`

### 5d. Core user flow verification

<!-- Gate: has_frontend determines the verification path -->

#### Path A: Browser-based verification (`has_frontend: true` AND Playwright available)

When `has_frontend: true`, check Playwright availability first:

1. **Playwright availability check (deterministic):** Run `npx playwright --version` and verify it exits with code 0. This check is deterministic — it does not depend on PATH or node_modules state beyond the project root. If the command fails, fall back to Path B below.

2. **Browser-based entry URL verification:** Launch headless Chromium via Playwright. **Before navigation**, register a `console.error` listener on the page to capture all console errors throughout the smoke test run. Navigate to the `entry_url` with a per-page timeout of 30 seconds (NFR-2). Wait for page load (`domcontentloaded` or `networkidle` depending on framework).

3. **Console error assertion:** Aggregate console error counts across all page loads within the smoke test run. After all navigation is complete, assert the total count is within the `browser_testing.max_console_errors` threshold (default: 0). If the count exceeds the threshold, report as a FAIL with the console error messages listed.

4. **DOM element visibility verification:** Verify the root element is present and visible — check for `#root`, `#__next`, `#app`, or `main` (in that order, first match wins). Verify a navigation element exists (`nav`, `[role="navigation"]`). Verify a content area element exists (`main`, `[role="main"]`, `article`, `.content`). Report each check as PASS/FAIL in the results.

5. **Interaction flow via Playwright (if configured):** When `smoke_test.interaction_endpoint` is set and Playwright is available, simulate the user flow via Playwright actions (click, type, navigate) instead of HTTP requests. For example, for a chat app: locate the input field, type a message, click send, wait for response to appear in the DOM. Verify the interaction completes without errors.

6. **LLM component verification:** If the app has an LLM component and `smoke_test.has_llm` is not `false`:
   - Check for an API key: look at `smoke_test.llm_api_key_env` from config, or auto-detect from common env vars (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`) or the project's `.env` file. **When reading `.env`, check only whether the specific key exists** (e.g., `grep '^ANTHROPIC_API_KEY=' .env`) — do not parse or retain the full file contents and do not capture or log the key's value, as it may contain unrelated secrets.
   - If an API key is available, test once with `LLM_MOCK=false` and verify the response **status and format only** — do NOT log or persist the full response body (it may contain sensitive content)
   - Use `smoke_test.llm_timeout_seconds` (default: 30s) for the LLM request (`curl --max-time <timeout>` or equivalent). **On timeout, report:** endpoint called, request payload shape (e.g., `POST /api/chat {messages: [...]}` — not content), timeout value, and whether the dev server process was still running at timeout time.
   - If no API key is available, **skip this sub-step** and report as `⚠️ skipped (no API key)` — this is not a BLOCKING failure

#### Path B: Fallback — HTTP-only with Warning (`has_frontend: true` BUT Playwright NOT available)

When `has_frontend: true` but the Playwright availability check in Path A step 1 fails:

1. **Emit a Warning message:**
   ```
   ⚠️ Warning: Playwright is not available. Falling back to HTTP-only smoke test.
   Browser-based verification (screenshots, DOM checks, console error capture) is skipped.
   Install Playwright: npm install -D @playwright/test && npx playwright install chromium
   ```

2. **Fall back to existing HTTP-only behavior** (same as Path C below): request the entry URL via HTTP, verify status 200, check response HTML for expected elements, trigger interaction endpoint, LLM test.

#### Path C: HTTP-only verification (`has_frontend: false`)

<!-- This is the existing behavior — unchanged for non-frontend projects -->

Verify the primary user flow via HTTP requests and response inspection (not visual browser interaction):
1. Request the entry URL — verify HTTP 200 and the response HTML contains expected elements (root div, script tags, meta tags)
2. Trigger the main interaction endpoint — use `smoke_test.interaction_endpoint` from config if set; otherwise infer from the PRD's primary user flow and the codebase route definitions (scan `app/api/`, `pages/api/`, `routes/`, or framework-equivalent directories for the primary endpoint). Examples: `POST /api/chat` for chat apps, `GET /api/items` for CRUD apps, `POST /api/generate` for generation apps. Verify the response status and format.
3. If the app has an LLM component and `smoke_test.has_llm` is not `false`:
   - Check for an API key: look at `smoke_test.llm_api_key_env` from config, or auto-detect from common env vars (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`) or the project's `.env` file. **When reading `.env`, check only whether the specific key exists** (e.g., `grep '^ANTHROPIC_API_KEY=' .env`) — do not parse or retain the full file contents and do not capture or log the key's value, as it may contain unrelated secrets.
   - If an API key is available, test once with `LLM_MOCK=false` and verify the response **status and format only** — do NOT log or persist the full response body (it may contain sensitive content)
   - Use `smoke_test.llm_timeout_seconds` (default: 30s) for the LLM request (`curl --max-time <timeout>` or equivalent). **On timeout, report:** endpoint called, request payload shape (e.g., `POST /api/chat {messages: [...]}` — not content), timeout value, and whether the dev server process was still running at timeout time.
   - If no API key is available, **skip this sub-step** and report as `⚠️ skipped (no API key)` — this is not a BLOCKING failure

### 5e. Visual rendering and screenshot capture

This step has three branches based on project type and Playwright availability:

#### Branch (a): Browser-based checks (`has_frontend: true` AND Playwright available)

When `has_frontend: true` and Playwright was confirmed available in Step 5d, run browser-based checks AND static analysis.

**1. Screenshot directory management:**
- Clean the screenshot directory at the start of each run: `rm -rf <screenshot_dir> && mkdir -p <screenshot_dir>` (default: `.pipeline/screenshots/`).
- **Path validation:** The `screenshot_dir` must be a relative path within the project. Reject paths that are `/`, `~`, or contain `..`. The default `.pipeline/screenshots/` is always safe (NFR-5, NFR-10).

**2. Route discovery:**
Auto-detect routes from framework conventions. Always include the entry URL. Detection patterns:
- **Next.js App Router:** `app/**/page.tsx` (or `.jsx`, `.js`, `.ts`) — derive URL from directory structure
- **Next.js Pages Router:** `pages/**/*.tsx` (excluding `_app`, `_document`, `api/` directories)
- **SvelteKit:** `src/routes/**/+page.svelte` — derive URL from directory structure
- **Generic SPA:** Entry URL only (single-page apps have one route)

Cap auto-detected routes at `browser_testing.max_routes` (default: 10). When `browser_testing.smoke_test_routes` is set in config (non-empty array), it **completely overrides** auto-detection — the configured routes are used instead of auto-detected ones.

**3. Multi-viewport screenshot capture:**
For each discovered route, capture screenshots at 3 viewports:
- **Mobile:** 375x812
- **Tablet:** 768x1024
- **Desktop:** 1280x720

Save to `browser_testing.screenshot_dir` (default `.pipeline/screenshots/`) with naming convention: `{route-slug}_{viewport}.png` (e.g., `home_mobile.png`, `dashboard_tablet.png`, `settings_desktop.png`).

Set per-page screenshot timeout of 3 seconds (NFR-2). **Total budget:** `max_routes` routes x 3 viewports x ~3s = ~90s + ~30s overhead (browser launch, route discovery, console aggregation), capped at 120 seconds total (NFR-1).

**4. DOM and rendering verification (browser-based):**
For each route at each viewport, verify:
- **Title/heading:** Non-empty `<title>` or `<h1>` exists
- **Content area:** Main content area is visible with `height > 0` (check `main`, `[role="main"]`, `article`, `.content`)
- **Error overlays:** Detect error overlays (`[data-nextjs-dialog]`, `.error-boundary`, `[data-error-overlay]`) — **FAIL if any are present**
- **Image loading:** All `<img>` elements have `naturalWidth > 0` (images actually loaded)
- **Mobile overflow (mobile viewport only):** Assert `document.documentElement.scrollWidth <= document.documentElement.clientWidth` — no horizontal overflow
- **Mobile font size (mobile viewport only):** Assert no text element has `font-size` below 12px

**5. Static analysis (supplementary — always runs alongside browser checks):**
These checks run regardless of Playwright availability, as supplementary validation:
1. Verify CSS custom properties are defined before use — no orphan `var(--*)` references without a corresponding definition in scope (fonts, colors, spacing, radii, etc.)
2. Verify dynamic content rendering code parses markdown/responses (not raw display)
3. Verify images/icons/assets referenced in code exist as files (no missing references)
4. If the project defines a dark theme (`data-theme`, `prefers-color-scheme`), verify all CSS custom properties have definitions in both themes

**6. Visual Contract token validation (when UI contract Visual Contract section exists):**

If a Visual Contract exists at `docs/tdd/<slug>/ui-contract.md` (Section 8), validate contracted tokens against the running app via Playwright's `page.evaluate()`. **Time budget:** 30 seconds for the full validation; if exceeded, report partial results with a Warning: `"Visual Contract validation timed out after 30s: X/Y tokens validated, Z remaining."` Token count is bounded by the upstream 200-property cap from extraction.

1. **Extract actual CSS custom properties** from the running app:
   ```js
   const styles = getComputedStyle(document.documentElement);
   // For each contracted token, read: styles.getPropertyValue('--token-name')
   ```

2. **Compare each contracted token against actual value.** Extract all contracted tokens in a single `page.evaluate()` call (batch all `getPropertyValue` reads into one evaluation — do not call `page.evaluate()` per token). Validate token names against `/^--[a-zA-Z0-9_-]+$/` before interpolation into `page.evaluate()`. Always pass validated token names as arguments to `page.evaluate((tokens) => { ... }, tokenArray)` rather than string interpolation. Comparison rules:
   - **Colors:** Exact match after normalizing to lowercase hex. Convert `rgb()` and `rgba()` to hex (for `rgba`, compare the alpha channel with ±0.02 tolerance). For `hsl()`/`hsla()`, convert to hex first. For other color functions (`oklch()`, `color-mix()`), compare as normalized strings.
   - **Spacing/dimensions:** ±2px tolerance — difference ≤ 2px is a MATCH, difference > 2px is a MISMATCH (parse to numeric `px` values; if contracted value uses `rem`, resolve to `px` using the actual root `font-size` from `getComputedStyle(document.documentElement).fontSize`)
   - **Fonts:** Substring match — contracted value is a substring of actual value (e.g., contracted `"Inter"` matches actual `"Inter, sans-serif"`)
   - **Radius:** ±2px tolerance (same as spacing/dimensions)
   - **Shadows:** Exact string match after whitespace normalization. Normalize the `inset` keyword position (always move to front if present). Normalize each shadow component to `[inset] <offset-x> <offset-y> <blur> <spread> <color>` order, applying color normalization (rgb→hex) within shadow values. For multi-layer shadows (comma-separated), split on comma, normalize each layer individually, then rejoin before comparison.
   - **Z-index/overlay tokens:** Exact numeric match for `z-index` values. For `opacity`, ±0.05 tolerance. For `backdrop-filter`, exact string match after whitespace normalization. These are validated only when Section 8.6 data exists in the contract.
   - **Status colors:** For each contracted status (Section 8.5, when Section 8.5 data exists in the contract), select an element matching the status class or `[data-status="<status>"]` attribute, then read `getComputedStyle` for `background-color`, `color`, and `border-color`. Apply the same color normalization rules as design token colors (rgb→hex). Report per-status match/mismatch. If no element with a given status is found in the DOM, report as `SKIPPED (no element with status '<status>' found in DOM)` rather than MISMATCH.

3. **Check font loading:** For each contracted font family, validate family names against `/^[a-zA-Z0-9 -]+$/` (literal space, not `\s`) before interpolation. Run `document.fonts.check('16px <family>')` and report loaded/not-loaded status. If the type scale defines specific sizes, also check at those sizes.

4. **Check animation infrastructure:** Verify `@media (prefers-reduced-motion)` media query exists in at least one stylesheet if contracted.

5. **Report mismatches as a table:**
   ```
   ### Visual Contract Validation
   | Token | Contracted | Actual | Match |
   |-------|-----------|--------|-------|
   | --color-primary | #1a2b4a | #1a2b4a | MATCH |
   | --spacing-md | 16px | 13px | MISMATCH (>2px) |
   | --radius-lg | 12px | 8px | MISMATCH (>2px) |
   | Font: Inter | loaded | loaded | MATCH |
   | reduced-motion | present | missing | MISMATCH |

   Token match rate: 85% (17/20)
   ```

6. **Failure classification** (thresholds tightened from the initial 30%/70% split to catch more fidelity violations early — the previous 30-70% WARNING band was too permissive for design-system-driven projects):
   - **≥70% match rate** → PASS with Warnings for individual mismatches
   - **≥50% and <70% match rate** → WARNING (report in smoke test results, do not block)
   - **<50% match rate** → CRITICAL (visual contract severely violated, blocks delivery)

If no Visual Contract section exists in the UI contract, skip this sub-step and report `Visual Contract: N/A (no Visual Contract in UI contract)`.

#### Branch (b): Static analysis only with Warning (`has_frontend: true` BUT Playwright NOT available)

When `has_frontend: true` but Playwright was NOT available (Step 5d fell back to Path B):

1. **Emit a Warning message:**
   ```
   ⚠️ Warning: Playwright is not available. Skipping browser-based screenshot capture and DOM verification.
   Only static analysis checks will be run.
   Install Playwright: npm install -D @playwright/test && npx playwright install chromium
   ```

2. **Run static analysis only** (same as Branch (a) step 5 above):
   - CSS custom properties, dynamic content rendering, asset references, dark theme
   - **Visual Contract token validation: SKIPPED** (requires Playwright `page.evaluate()`). Report as Warning: `Visual Contract: ⚠ skipped (Playwright not available)`
   - Report results with a Warning-level note that browser checks were skipped

#### Branch (c): Skip entirely (`has_frontend: false`)

If `has_frontend` is not `true`, skip all sub-steps (visual rendering, API→UI Wiring, Visual Contract) and report `Visual rendering: N/A (no frontend)`, `API→UI Wiring: N/A (no frontend)`, `Visual Contract: N/A (no frontend)` in the results table. No static analysis or browser checks are performed.

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
| Browser screenshots | ✅ / N/A / ⚠️ | 12.3s | 5 routes x 3 viewports = 15 screenshots / N/A (has_frontend: false) / Warning: Playwright not available — static analysis only (see installation instructions above) |
| API→UI Wiring | ✅ / N/A (no frontend) | 1.5s | 12/15 methods wired, 3 unwired (0 P0) |
| Visual Contract | ✅ / N/A / ⚠️ | 2.0s | Token match rate: 95% (19/20) / N/A (no Visual Contract) / Warning: Playwright not available |
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
