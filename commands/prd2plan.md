# /prd2plan — PRD → Dev Plan

You are executing the **prd2plan** pipeline stage. Convert an approved PRD into a dependency-aware dev plan with Epic/Story/Task/Subtask breakdown.

**Input:** PRD file via `$ARGUMENTS` (e.g., `@docs/prd/daily-revenue-trends.md`)
**Output:** `docs/dev_plans/<slug>.md`

---

## Step 1: Read inputs

Read the following files:
1. The PRD file provided via `$ARGUMENTS`
2. `docs/ai_definitions/TASK_BREAKDOWN_DEFINITION.md` — for breakdown format and conventions
3. `pipeline.config.yaml` — for project paths, test commands, test requirements
4. `docs/ai_definitions/AGENT_CONSTRAINTS.md` — for project rules that affect implementation

If any file doesn't exist, note it and continue with defaults.

## Step 2: Explore the codebase

Use the Task tool with `subagent_type: Explore` to understand the project:
- Directory structure and key file locations
- Existing patterns (API structure, DB access, frontend patterns)
- Test structure and conventions
- Available utilities and shared code

This informs realistic task scoping — tasks should reference actual file paths and follow existing patterns.

## Step 3: Generate the dev plan

Create an Epic/Story/Task/Subtask breakdown following `TASK_BREAKDOWN_DEFINITION.md` format.

### Structure:
- **Epic** = the PRD feature (one per plan)
- **Stories** = deliverable user-facing units (derived from PRD user stories in Section 5)
- **Tasks** = implementable units with file paths and implementation steps
- **Subtasks** = agent-sized units (20 min – 2 hrs each)

### For each TASK, include these additional fields:

```markdown
### TASK N.M: <title>
**Depends On:** None | TASK X.Y, TASK X.Z
**Parallel Group:** A | B | C | ...
**Complexity:** Simple | Medium | Complex
**Estimated Time:** <time>
```

**Dependency rules:**
- Tasks with no dependencies → `Depends On: None`, assigned to earliest parallel group
- Tasks in the same parallel group can run simultaneously
- A task cannot start until all its `Depends On` tasks are complete
- Order parallel groups alphabetically: Group A runs first, Group B after A completes, etc.

**Complexity assignment:**
- **Simple**: Documentation, config changes, small single-file edits, schema definitions
- **Medium**: Single-file logic, API endpoints, database queries, UI components
- **Complex**: Multi-file changes, complex business logic, cross-cutting concerns

### Testing requirements per task:

Reference the PRD Testing Strategy (Section 9) and `pipeline.config.yaml` test_requirements to specify required test types per task:

```markdown
**Required Tests:**
- **UT:** <what unit tests cover>
- **IT:** <what integration tests cover>
- **UI:** <if frontend files updated>
```

## Step 4: Validate structure

If `scripts/ai_development/validate-breakdown.js` exists, run it:
```bash
node scripts/ai_development/validate-breakdown.js docs/dev_plans/<slug>.md
```

Fix any validation errors and re-run until it passes.

## Step 5: Critic review (parallel — all applicable critics)

Spawn all applicable critic subagents in parallel using the Task tool:

**Product Critic (model: opus — Opus 4.6):**
```
You are the Product Critic. Read:
1. ${CLAUDE_PLUGIN_ROOT}/pipeline/agents/product-critic.md (your persona)
2. The PRD: <paste PRD content>
3. The dev plan: <paste plan content>

Review whether the dev plan fully covers the PRD:
- Does every P0 requirement have corresponding tasks?
- Does every user story have corresponding tasks?
- Are all acceptance criteria traceable to specific tasks?
- Are there any PRD requirements with no implementation plan?

Produce your structured output.
```

**Dev Critic (model: opus — Opus 4.6):**
```
You are the Dev Critic. Read:
1. ${CLAUDE_PLUGIN_ROOT}/pipeline/agents/dev-critic.md (your persona)
2. The dev plan document below

Review the dev plan for:
- Are tasks technically sound and implementable?
- Is the granularity right (not too big, not too small)?
- Are dependencies correct and complete?
- Are complexity ratings appropriate?
- Do tasks reference actual file paths and follow project patterns?

Dev plan content:
<paste plan content>
```

**DevOps Critic (model: opus — Opus 4.6):**
```
You are the DevOps Critic. Read:
1. ${CLAUDE_PLUGIN_ROOT}/pipeline/agents/devops-critic.md (your persona)
2. The dev plan document below

Review the dev plan for:
- Are there deployment or infrastructure tasks that are missing?
- Are environment variables, config changes, and migrations accounted for?
- Is the execution order safe for deployment (e.g., migrations before code)?
- Are there CI/CD implications not captured in the plan?

Dev plan content:
<paste plan content>
```

**QA Critic (model: opus — Opus 4.6):**
```
You are the QA Critic. Read:
1. ${CLAUDE_PLUGIN_ROOT}/pipeline/agents/qa-critic.md (your persona)
2. The PRD (Section 9 — Testing Strategy): <paste PRD content>
3. The dev plan document below

Review the dev plan for:
- Do test requirements per task align with PRD Testing Strategy?
- Are all acceptance criteria covered by planned tests?
- Are there missing test types for affected file patterns (per pipeline.config.yaml)?
- Is regression risk identified and addressed?

Dev plan content:
<paste plan content>
```

**Security Critic (model: opus — Opus 4.6):**
```
You are the Security Critic. Read:
1. ${CLAUDE_PLUGIN_ROOT}/pipeline/agents/security-critic.md (your persona)
2. The PRD: <paste PRD content>
3. The dev plan document below

Review the dev plan for:
- Are there security-sensitive tasks missing (auth, input validation, secrets management)?
- Does the plan introduce insecure design patterns?
- Are there tasks handling user input, auth, or external data without security considerations?
- Is threat modeling reflected in the task breakdown?

Dev plan content:
<paste plan content>
```

**Designer Critic (model: opus — Opus 4.6) — Only spawn if pipeline.config.yaml has `has_frontend: true`:**
```
You are the Designer Critic. Read:
1. ${CLAUDE_PLUGIN_ROOT}/pipeline/agents/designer-critic.md (your persona)
2. The PRD: <paste PRD content>
3. The dev plan document below

Review the dev plan for:
- Do frontend tasks include accessibility considerations?
- Are loading states, empty states, and error states accounted for?
- Do UI tasks reference the project's design system or component library?
- Are responsive design requirements included for frontend tasks?
- Are there missing UX-related tasks (a11y testing, responsive testing)?

Dev plan content:
<paste plan content>
```

## Step 6: Revise until zero Critical AND zero Warnings

**Pass condition:** ALL critics must have zero Critical findings AND zero Warnings. Notes (informational) are acceptable.

**Expected duration:** Each iteration re-runs up to 6 parallel critic subagents. A full 5-iteration loop may take 10–20 minutes. Most plans converge within 2–3 iterations. If the session is interrupted mid-loop, re-running `/prd2plan` will detect the existing plan file and ask whether to regenerate or resume validation. If model concurrency limits are reached during parallel critic spawning, the Task tool queues and retries automatically.

If any critic has Critical findings OR Warnings:
1. Read all Critical findings and Warnings from all critics
2. Revise the plan to address ALL findings (Critical first, then Warnings)
3. Re-run ALL critics (max 5 total iterations)
4. If still not clean after max iterations:
   - Present remaining findings to user
   - **If Security Critic has remaining warnings:** require explicit Security sign-off — "⚠ Security warnings remain. Approving bypasses these security concerns. Confirm you accept the identified security risks."
   - Options: continue iterating | approve with remaining warnings | edit manually | abort

**Why zero-warnings for dev plans?** The PRD scoring loop (req2prd) tolerates minor warnings if numeric scores are high — a PRD is a living document refined during implementation. Dev plans, however, are the direct blueprint for code execution. Ambiguity or unresolved warnings in a dev plan propagate directly into implementation as bugs, tech debt, or security gaps. Zero warnings ensures the plan is unambiguous before any code is written.

## Step 7: Write the dev plan

Create the output directory if needed:
```bash
mkdir -p docs/dev_plans
```

Write to `docs/dev_plans/<slug>.md` (slug from PRD title).

## Step 8: Human gate

Present a summary to the user:

```
Dev plan generated: docs/dev_plans/<slug>.md

## Summary
- Epic: <title>
- Stories: <count>
- Tasks: <count> (Simple: N, Medium: N, Complex: N)
- Parallel Groups: <list groups with task counts>
- Estimated Total Time: <sum>

## Dependency Graph
Group A (parallel): TASK 1.1, TASK 2.1
Group B (after A):  TASK 1.2, TASK 2.2
Group C (after B):  TASK 1.3

## Critic Results
- Product Critic: PASS ✅ (0 Critical, 0 Warnings)
- Dev Critic: PASS ✅ (0 Critical, 0 Warnings)
- DevOps Critic: PASS ✅ (0 Critical, 0 Warnings)
- QA Critic: PASS ✅ (0 Critical, 0 Warnings)
- Security Critic: PASS ✅ (0 Critical, 0 Warnings)
- Designer Critic: PASS ✅ / N/A (0 Critical, 0 Warnings)
Ralph Loop iterations: N

Please review the dev plan. You can:
1. Approve it as-is
2. Request changes
3. Edit the file directly and re-run /validate
```

Wait for user approval before proceeding.
