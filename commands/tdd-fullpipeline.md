# /tdd-fullpipeline -- Test-Driven Development Pipeline Orchestration

You are executing the **TDD full pipeline**. This chains 8 pipeline stages with human gates between each stage, reordering the development process so that **tests are written before application code**. Each stage runs in a **fresh-context subagent** to keep the orchestrator lightweight -- all artifacts are persisted on disk, so no conversational history needs to carry between stages.

The TDD pipeline solves a structural problem: when the same agent writes both application code and tests, the tests confirm what was built rather than what should have been built. By writing tests first -- from requirements and a real UI contract -- tests define expected behavior independently of implementation.

**Input:** Raw requirement text via `$ARGUMENTS`
**Output:** Fully implemented feature with tests written before code, traceability matrix, pipeline metrics

---

## Architecture: Fresh Context Per Stage

```
ORCHESTRATOR (this agent -- lightweight coordinator)
  |
  |  << PRE-FLIGHT CHECKS: slug validation, Playwright, .gitignore, baseline >>
  |
  |- Stage 1 subagent (fresh context) --> docs/prd/<slug>.md
  |    +- critic subagents (parallel)
  |
  |  <-- GATE 1: user approves PRD + complexity gate -->
  |
  |- Stage 2 subagent (fresh context) --> docs/tdd/<slug>/design-brief.md
  |    +- critic subagents (parallel)
  |
  |  <-- GATE 2: MANUAL -- user builds mock app in Figma AI, provides URL -->
  |
  |- Stage 3 subagent (fresh context) --> docs/tdd/<slug>/ui-contract.md
  |    +- critic subagents (parallel)
  |
  |  <-- GATE 3: user approves UI contract -->
  |
  |- Stage 4 subagent (fresh context) --> docs/tdd/<slug>/test-plan.md
  |    +- critic subagents (parallel)
  |
  |  <-- GATE 4: user approves test plan -->
  |
  |- Stage 5 subagent (fresh context) --> docs/dev_plans/<slug>.md
  |    +- critic subagents (parallel)
  |    +- contract negotiation gate (orchestrator)
  |
  |  <-- GATE 5: user approves dev plan + conflict resolution -->
  |
  |- Stage 6 subagent (fresh context) --> Tier 1 E2E test files on tdd/{slug}/tests branch
  |    +- critic subagents (parallel)
  |    +- self-health gate: red_count = total_test_count
  |
  |  <-- GATE 6: user approves test code + red count -->
  |
  |- Stage 7 subagent (fresh context) --> Code implemented, PRs merged
  |    +- per-task: build subagent -> review subagent -> critic subagents
  |    +- test adjustment taxonomy enforcement
  |
  |  <-- GATE 7: per-PR approval -->
  |
  +- Stage 8 subagent (fresh context) --> Validation report
       +- smoke test, traceability matrix, regression check, metrics
       +- 10-critic cumulative validation

  <-- GATE 8: final validation approval -->
```

**Why fresh context?** By Gate 8, the orchestrator would be carrying the full PRD generation conversation, Design Brief extraction, Mock Analysis crawl data, test plan generation, all critic scoring iterations, dev plan generation, test development dialogue, execution loop -- none of which later stages need. Each stage's meaningful output lives on disk (PRD file, design brief, UI contract, test plan, dev plan, test files). The orchestrator only tracks file paths, the slug, and user decisions.

**Subagent depth:** Max depth is 3 (orchestrator -> stage -> build/review -> critics). Claude Code handles this natively.

---

## Orchestrator State

The orchestrator maintains only these variables between gates:

```
slug:             <derived from PRD title, kebab-case>
prd_path:         docs/prd/<slug>.md
plan_path:        docs/dev_plans/<slug>.md
brief_path:       docs/tdd/<slug>/design-brief.md
contract_path:    docs/tdd/<slug>/ui-contract.md
test_plan_path:   docs/tdd/<slug>/test-plan.md
test_result:      PASS | FAIL | SKIPPED
requirement:      <original requirement text>
user_prefs:       { skip_jira: bool, mock_url: string, ... }
```

Everything else is persisted on disk and read fresh by each stage subagent.

---

## Pre-Flight Checks

Before any stage begins, the orchestrator performs the following checks. All checks must pass before Stage 1 starts.

### Check 1: Slug Validation (AC 1.7)

Validate the slug (derived from the requirement or provided by the user) against the pattern:

```
^[a-z0-9][a-z0-9_-]{0,63}$
```

**Reject** slugs containing:
- Forward slash (`/`)
- Backslash (`\`)
- Double dot (`..`)
- Null bytes (`\0`)

If the slug fails validation, halt with a clear error message showing the pattern and the invalid characters found.

### Check 2: Playwright Pre-Flight (AC 1.9)

Run the following command to verify Playwright is installed:

```bash
npx playwright --version
```

- If Playwright is not available, halt with error:
  ```
  ERROR: Playwright is required for the TDD pipeline (Stage 3: Mock Analysis).
  Install with: npm install -D @playwright/test && npx playwright install
  The TDD pipeline cannot proceed without Playwright. Use /fullpipeline for non-frontend work.
  ```
- If Playwright version is below 1.40, halt with error:
  ```
  ERROR: Playwright version >= 1.40 is required. Installed: <version>.
  Upgrade with: npm install -D @playwright/test@latest && npx playwright install
  ```

### Check 3: Gitignore Verification (AC 1.11)

Verify that `.gitignore` contains entries for TDD artifacts:

1. If `.gitignore` does not exist, create it.
2. Check for `.pipeline/tdd/` entry -- add if missing.
3. Check for `.pipeline/metrics/` entry -- add if missing.
4. Do NOT add duplicate entries (idempotent).

### Check 4: Baseline Test Capture (AC 1.8)

Capture the current test suite results as a baseline before any pipeline work begins:

1. Read `pipeline.config.yaml` for the project's test command.
2. Run the test command and capture results.
3. Persist to `.pipeline/tdd/<slug>/baseline-results.json` with schema:

```json
{
  "tests": [
    {
      "name": "string",
      "file": "string",
      "status": "pass | fail | skip"
    }
  ],
  "captured_at": "ISO8601",
  "total": 0,
  "passed": 0,
  "failed": 0,
  "skipped": 0
}
```

4. If no tests exist yet, record an empty baseline:

```json
{
  "tests": [],
  "captured_at": "ISO8601",
  "total": 0,
  "passed": 0,
  "failed": 0,
  "skipped": 0
}
```

Present the pre-flight results to the user:

```
## Pre-Flight Checks

| Check | Status | Details |
|-------|--------|---------|
| Slug validation | PASS | `<slug>` matches ^[a-z0-9][a-z0-9_-]{0,63}$ |
| Playwright | PASS | v1.48.0 (>= 1.40) |
| .gitignore | PASS | .pipeline/tdd/ and .pipeline/metrics/ entries present |
| Baseline capture | PASS | N existing tests captured to .pipeline/tdd/<slug>/baseline-results.json |

All pre-flight checks passed. Starting Stage 1.
```

---

## Stage 1: Requirement -> PRD (fresh context)

Spawn a subagent (Task tool, model: opus -- Opus 4.6) to execute the `/req2prd` stage:

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

### Complexity Gate (AC 10.1, AC 10.2, AC 10.3, AC 10.4)

After PRD generation, assess the requirement scope for TDD appropriateness.

**Complexity Assessment Criteria:**

A requirement is assessed as **Simple** if ALL of the following are true:
- Single-file changes only (no cross-file dependencies)
- Config-only changes (YAML, JSON, environment variables)
- Documentation-only changes (Markdown, comments, README)
- No UI components (no React, no HTML templates, no CSS)
- No data flow changes (no new API endpoints, no schema changes, no state management)
- No user-facing behavior changes (no new routes, no form logic, no validation)

A requirement is assessed as **Medium** if ANY of the following are true:
- Multiple files changed with cross-file dependencies
- New UI components or modifications to existing UI
- New API endpoints or data flow changes
- User-facing behavior changes

A requirement is assessed as **Complex** if ANY of the following are true:
- New feature spanning multiple stories
- Data model changes with migration requirements
- Cross-cutting concerns (auth, permissions, multi-tenant)
- Integration with external services

**If assessed as Simple:**

```
## Complexity Assessment

This requirement has been assessed as **Simple** based on:
- [list matching Simple criteria]

RECOMMENDATION: Use `/fullpipeline` instead of `/tdd-fullpipeline`.
The TDD pipeline adds 3 extra stages (Design Brief, Mock Analysis, Test Development)
that provide maximum value for medium/complex features with UI components.
For simple changes, the standard pipeline provides the same quality with less overhead.

Options: switch to /fullpipeline | override and continue with /tdd-fullpipeline
```

If the user overrides, continue with `/tdd-fullpipeline`. Record the override in `user_prefs`.

**If assessed as Medium or Complex:** proceed to Gate 1 without interruption.

### GATE 1: PRD Approval (AC 2.4)

Present the subagent's summary to the user:

```
## Gate 1: PRD Review

PRD generated: docs/prd/<slug>.md
Complexity: Medium / Complex
- User Stories: N
- P0 Requirements: N
- Acceptance Criteria: N total (P0: X, P1: Y, P2: Z)

### Critic Scores (iteration N)
| Critic | Score | Status |
|--------|-------|--------|
| Product | 9.0 | PASS (> 8.5) |
| Dev | 9.0 | PASS (> 8.5) |
| DevOps | 9.5 | PASS (> 8.5) |
| QA | 9.0 | PASS (> 8.5) |
| Security | 9.5 | PASS (> 8.5) |
| Performance | 9.0 | PASS (> 8.5) |
| Data Integrity | 9.5 | PASS (> 8.5) |
| Observability | 9.0 / N/A | PASS (> 8.5) / -- |
| API Contract | 9.5 / N/A | PASS (> 8.5) / -- |
| Designer | N/A | -- |
| **Overall** | **9.3** | **PASS (> 9.0)** |

Ralph Loop iterations: N

Please review and approve to proceed to Design Brief generation.
Options: approve | edit | abort
```

**If approved** -> proceed to Stage 2
**If edit requested** -> wait for user edits, then re-validate with `/validate`
**If aborted** -> stop pipeline, log residual artifacts (AC 1.10)

---

## Stage 2: PRD -> Design Brief (fresh context)

Spawn a subagent (Task tool, model: opus -- Opus 4.6) to execute the `/tdd-design-brief` stage:

**Subagent prompt:**
```
You are executing the /tdd-design-brief pipeline stage. Read the full command instructions:
<read and paste ${CLAUDE_PLUGIN_ROOT}/commands/tdd-design-brief.md>

Execute all steps for this PRD:

PRD file: <prd_path>

Important:
- Read the PRD file and pipeline.config.yaml for TDD config settings
- Extract functional requirements: route manifest, user flows, component inventory,
  data shapes, responsive requirements, accessibility requirements
- Generate the Design Brief with NO visual prescriptions (no layouts, colors, spacing)
- Include the "Mock App Requirements" section
- Run 10-critic Ralph Loop (max 5 iterations, 0 Critical + 0 Warnings)
- Write the Design Brief to docs/tdd/<slug>/design-brief.md
- Return the following in your final message:
  1. The Design Brief file path
  2. A summary: route count, user flow count, component count, data shape count
  3. The final critic results (all critics, verdicts, iteration count)
  4. Mock App Requirements summary
  5. Any unresolved issues
```

When the subagent completes, extract the brief path. Store as orchestrator state.

### GATE 2: Design Brief Review -- MANUAL (AC 3.7)

Present the subagent's summary to the user:

```
## Gate 2: Design Brief Review (MANUAL GATE)

Design Brief generated: docs/tdd/<slug>/design-brief.md
- Routes: N
- User Flows: N
- Components: N
- Data Shapes: N

### Critic Results (iteration N)
| Critic | Verdict | Details |
|--------|---------|---------|
| Product | PASS | 0 Critical, 0 Warnings |
| Dev | PASS | 0 Critical, 0 Warnings |
| QA | PASS | 0 Critical, 0 Warnings |
| Security | PASS | 0 Critical, 0 Warnings |
| ... | ... | ... |

### Next Step: Build Mock App

1. Read the Design Brief: docs/tdd/<slug>/design-brief.md
2. Use Figma AI (or similar tool) to build a functional mock app
3. The mock must implement:
   - All routes from the route manifest
   - All interactive elements (buttons, forms, links)
   - Form validation behavior
   - Navigation between routes
4. Deploy the mock app or run it locally
5. Provide the mock app URL to continue

Options: provide mock URL | edit brief | abort
```

**When user provides mock URL** -> store in `user_prefs.mock_url`, proceed to Stage 3
**If edit requested** -> wait for user edits, then re-validate
**If aborted** -> stop pipeline, log residual artifacts (AC 1.10)

---

## Stage 3: Mock App -> UI Contract (fresh context)

Spawn a subagent (Task tool, model: opus -- Opus 4.6) to execute the `/tdd-mock-analysis` stage:

**Subagent prompt:**
```
You are executing the /tdd-mock-analysis pipeline stage. Read the full command instructions:
<read and paste ${CLAUDE_PLUGIN_ROOT}/commands/tdd-mock-analysis.md>

Execute all steps for this mock app:

Mock app URL: <user_prefs.mock_url>
Design Brief path: <brief_path>

Important:
- Validate the mock app URL (http/https only, reject file:/data:/javascript:/ and non-loopback RFC 1918)
- Verify Playwright version >= 1.40 at Stage 3 start
- Read tdd.max_mock_routes from pipeline.config.yaml (default: 20)
- Navigate all discoverable routes (capped at max_mock_routes)
- Capture screenshots at 3 viewports per route (375x812, 768x1024, 1280x720)
- Extract DOM structure, interactive elements, ARIA roles, data-testid candidates
- Test keyboard navigation paths
- Enforce 50,000 character limit on UI contract (truncate lowest-priority routes)
- Run 10-critic Ralph Loop (max 5 iterations, 0 Critical + 0 Warnings)
- Write UI contract to docs/tdd/<slug>/ui-contract.md
- Save screenshots to .pipeline/tdd/<slug>/mock-screenshots/
- Cross-reference extracted contract against Design Brief route manifest and component inventory
- Return the following in your final message:
  1. The UI contract file path
  2. Route count (discovered vs expected from Design Brief)
  3. Component count, interactive element count, data-testid count
  4. Accessibility findings: ARIA roles, keyboard nav results
  5. Design Brief cross-reference: missing routes, missing elements (Warnings)
  6. Screenshot count and paths
  7. Critic results (all critics, verdicts, iteration count)
  8. Any truncation warnings
```

When the subagent completes, extract the contract path. Store as orchestrator state.

### GATE 3: UI Contract Approval (AC 4.10, AC 4.11)

Present the subagent's summary to the user:

```
## Gate 3: UI Contract Review

UI contract generated: docs/tdd/<slug>/ui-contract.md
Screenshots: .pipeline/tdd/<slug>/mock-screenshots/ (N screenshots)

### Extraction Summary
| Metric | Count |
|--------|-------|
| Routes discovered | N / N expected |
| Components | N |
| Interactive elements | N |
| Form fields | N |
| ARIA roles mapped | N |
| Data-testid candidates | N |
| Keyboard nav paths tested | N |

### Design Brief Cross-Reference
| Item | Status |
|------|--------|
| Route: /dashboard | FOUND |
| Route: /settings | FOUND |
| Route: /profile | WARNING -- not found in mock |
| Component: LoginForm | FOUND |
| Component: DataTable | WARNING -- not found in DOM |

### Critic Results (iteration N)
| Critic | Verdict |
|--------|---------|
| Product | PASS |
| Dev | PASS |
| QA | PASS |
| ... | ... |

Please review the UI contract and cross-reference warnings.
You can correct any misidentified elements or missing routes before proceeding.
Options: approve | edit | abort
```

**If approved** -> proceed to Stage 4
**If edit requested** -> user corrects the UI contract, then re-validate
**If aborted** -> stop pipeline, log residual artifacts (AC 1.10)

---

## Stage 4: PRD + UI Contract -> Test Plan (fresh context)

Spawn a subagent (Task tool, model: opus -- Opus 4.6) to execute the `/tdd-test-plan` stage:

**Subagent prompt:**
```
You are executing the /tdd-test-plan pipeline stage. Read the full command instructions:
<read and paste ${CLAUDE_PLUGIN_ROOT}/commands/tdd-test-plan.md>

Execute all steps for these inputs:

PRD file: <prd_path>
UI contract file: <contract_path>

Important:
- Read the PRD, UI contract from docs/tdd/<slug>/ui-contract.md, and any schema files referenced in the PRD
- Generate tiered test specifications:
  * Tier 1 (E2E/Playwright): Full specs from PRD + UI contract with complete test steps,
    selectors from data-testid registry, expected outcomes, assertions
  * Tier 2 (integration/unit): Specification outlines with TP-{N} ID, tier label ("Tier 2"),
    linked PRD requirement (AC reference), test intent description, expected test type
- Every test item gets a unique TP-{N} traceability ID
- Include mandatory contract sections: Performance Contracts, Accessibility Contracts,
  Error Contracts, Data Flow Contracts
- Run 10-critic Ralph Loop (max 5 iterations, 0 Critical + 0 Warnings)
- Write test plan to docs/tdd/<slug>/test-plan.md
- Return the following in your final message:
  1. The test plan file path
  2. TP count by tier (Tier 1 count, Tier 2 count, total)
  3. Contract coverage summary (Performance, Accessibility, Error, Data Flow)
  4. Traceability overview: TP-{N} range, PRD AC coverage percentage
  5. Critic results (all critics, verdicts, iteration count)
  6. Any unresolved issues
```

When the subagent completes, extract the test plan path. Store as orchestrator state.

### GATE 4: Test Plan Approval (AC 5.8)

Present the subagent's summary to the user:

```
## Gate 4: Test Plan Review

Test plan generated: docs/tdd/<slug>/test-plan.md

### Test Plan Summary
| Tier | Count | Description |
|------|-------|-------------|
| Tier 1 (E2E) | N | Full Playwright test specifications |
| Tier 2 (integration/unit) | N | Specification outlines for Stage 7 |
| **Total** | **N** | |

### Contract Coverage
| Contract Type | Items | Status |
|---------------|-------|--------|
| Performance Contracts | N | Covered |
| Accessibility Contracts | N | Covered |
| Error Contracts | N | Covered |
| Data Flow Contracts | N | Covered |

### Traceability
- TP range: TP-1 through TP-N
- PRD AC coverage: X% of acceptance criteria have corresponding TP items

### Critic Results (iteration N)
| Critic | Verdict |
|--------|---------|
| Product | PASS |
| Dev | PASS |
| QA | PASS |
| ... | ... |

Please review and approve to proceed to dev plan generation.
Options: approve | edit | abort
```

**If approved** -> proceed to Stage 5
**If edit requested** -> wait for user edits, then re-validate
**If aborted** -> stop pipeline, log residual artifacts (AC 1.10)

---

## Stage 5: PRD + Test Plan -> Dev Plan (fresh context)

Spawn a subagent (Task tool, model: opus -- Opus 4.6) to execute the `/prd2plan` stage, extended with test plan integration:

**Subagent prompt:**
```
You are executing the /prd2plan pipeline stage for the TDD pipeline. Read the full command instructions:
<read and paste ${CLAUDE_PLUGIN_ROOT}/commands/prd2plan.md>

Execute all steps (1 through 7) for this PRD:

PRD file: <prd_path>

IMPORTANT TDD EXTENSION -- Test Plan Integration:
In addition to the standard /prd2plan process, you must also:

1. Read the test plan: <test_plan_path>
2. Map every dev plan task to one or more TP-{N} contracts from the test plan.
   In each task description, include a "Test Contracts" line listing the TP-{N} IDs
   that the task must satisfy (e.g., "Test Contracts: TP-3, TP-7, TP-12").
3. Ensure the dev plan's component boundaries, route structure, and data flow
   align with the test plan's specifications.

Important:
- Read the PRD file, pipeline.config.yaml, AGENT_CONSTRAINTS.md, TASK_BREAKDOWN_DEFINITION.md
- Read the test plan for TP-{N} mapping
- Explore the codebase for existing patterns
- Generate the full Epic/Story/Task/Subtask breakdown
- Run the full critic review loop (0 Critical + 0 Warnings, max 5 iterations)
- Write the dev plan to docs/dev_plans/<slug>.md
- Return the following in your final message:
  1. The dev plan file path
  2. A summary: story count, task count (by complexity), parallel groups
  3. The final critic results (all critics, verdicts, iteration count)
  4. The dependency graph
  5. TP-{N} mapping summary: how many tasks map to TP contracts, any unmapped TPs
  6. Any architecture decisions that may conflict with test plan contracts
  7. Any unresolved issues
```

When the subagent completes, extract the plan path. Store as orchestrator state.

### Contract Negotiation Gate (AC 6.3, AC 6.4)

After dev plan generation, the orchestrator compares the dev plan architecture against the test plan contracts:

1. **Read the dev plan** at `plan_path` and the test plan at `test_plan_path`.
2. **Identify conflicts** where the dev plan proposes an approach that would invalidate a test contract:
   - Different component boundaries than expected by Tier 1 E2E selectors
   - Different route structure than the UI contract's route map
   - Different data flow than the test plan's Data Flow Contracts
   - Different API shapes than the test plan's assertions
3. **For each conflict**, present:
   - The conflicting TP-{N} contract
   - The dev plan proposal
   - A recommended resolution
   - **The test plan is the authority document** -- the dev plan adjusts unless the user explicitly overrides

```
## Contract Negotiation

### Conflicts Found: N

#### Conflict 1
- **TP-{N}:** <test plan contract description>
- **Dev Plan:** <proposed architecture>
- **Recommendation:** Adjust dev plan to match TP-{N} contract
- **Resolution:** [test plan wins | user override]

...

No conflicts found. / All conflicts resolved.
```

4. **After conflict resolution** (AC 6.5): Complete Tier 2 test specifications in the test plan with component boundaries and internal architecture from the dev plan. Update `docs/tdd/<slug>/test-plan.md` with Tier 2 completions.

5. **Run 10-critic Ralph Loop** on the final dev plan (AC 6.6) with max 5 iterations, 0 Critical + 0 Warnings.

### GATE 5: Dev Plan Approval (AC 6.7)

Present the dev plan summary and conflict resolution log:

```
## Gate 5: Dev Plan Review

Dev plan generated: docs/dev_plans/<slug>.md
- Stories: N
- Tasks: N (Simple: X, Medium: Y, Complex: Z)
- Parallel Groups: A(N tasks), B(N tasks), C(N tasks)
- TP-{N} Coverage: X tasks mapped to Y TP contracts

### Contract Negotiation
- Conflicts found: N
- Resolved (test plan wins): N
- Resolved (user override): N
- Tier 2 specifications completed: N items

### Critic Results (iteration N)
| Critic | Verdict | Details |
|--------|---------|---------|
| Product | PASS | 0 Critical, 0 Warnings |
| Dev | PASS | 0 Critical, 0 Warnings |
| DevOps | PASS | 0 Critical, 0 Warnings |
| QA | PASS | 0 Critical, 0 Warnings |
| Security | PASS | 0 Critical, 0 Warnings |
| Performance | PASS | 0 Critical, 0 Warnings |
| Data Integrity | PASS | 0 Critical, 0 Warnings |
| Observability | PASS / N/A | 0 Critical, 0 Warnings |
| API Contract | PASS / N/A | 0 Critical, 0 Warnings |
| Designer | PASS / N/A | 0 Critical, 0 Warnings |

Ralph Loop iterations: N

Dependency Graph:
  Group A: TASK 1.1, TASK 2.1 (parallel)
  Group B: TASK 1.2 (depends on 1.1), TASK 2.2 (depends on 2.1)
  Group C: TASK 3.1 (depends on 1.2 + 2.2)

Please review and approve to proceed to test development.
Options: approve | edit | abort
```

**If approved** -> proceed to Stage 6
**If edit requested** -> wait for user edits, then re-validate
**If aborted** -> stop pipeline, log residual artifacts (AC 1.10)

---

## Stage 6: Test Plan -> Develop Tests (fresh context)

Spawn a subagent (Task tool, model: opus -- Opus 4.6) to execute the `/tdd-develop-tests` stage:

**Subagent prompt:**
```
You are executing the /tdd-develop-tests pipeline stage. Read the full command instructions:
<read and paste ${CLAUDE_PLUGIN_ROOT}/commands/tdd-develop-tests.md>

Execute all steps for these inputs:

PRD file: <prd_path>
UI contract file: <contract_path>
Test plan file: <test_plan_path>

CRITICAL CONSTRAINT -- BLIND AGENT:
You must NOT read the dev plan at docs/dev_plans/<slug>.md.
You must NOT access any application code.
You develop Tier 1 E2E tests from PRD + UI contract + test plan ONLY.
This ensures tests validate requirements, not implementation.

Important:
- Read the PRD, UI contract, schema files, and test plan
- DO NOT read the dev plan -- DO NOT access application code
- Develop Tier 1 E2E Playwright tests from the test plan specifications
- Each test maps to a TP-{N} traceability ID via code comment
- Use selectors from the UI contract data-testid registry
- Run 10-critic Ralph Loop (max 5 iterations, 0 Critical + 0 Warnings)
- Run the self-health gate: execute all tests, verify red_count = total_test_count
- Classify Security tests: tests matching keywords (auth, login, logout, permission,
  role, csrf, xss, injection, sanitize, authorization, token, session, cors, encrypt,
  certificate, rate-limit) or in security/ or __tests__/security/ directories
- If any tests pass (green), enter fix loop (max 3 iterations), then escalate
- Commit tests to branch: tdd/<slug>/tests (from tdd.tests_branch_pattern in config)
- Apply tdd-red-tests label to the branch/PR
- Return the following in your final message:
  1. Total test count
  2. Red count (must equal total test count)
  3. Any fake tests identified (tests that passed without app code)
  4. Security test classification summary (count, keywords matched)
  5. Self-health gate fix iterations (if any)
  6. Critic results (all critics, verdicts, iteration count)
  7. Branch name and commit SHA
  8. Any unresolved issues
```

When the subagent completes, verify the self-health gate result.

### GATE 6: Test Code Approval (AC 7.8)

Present the subagent's summary to the user:

```
## Gate 6: Test Code Review

### Self-Health Gate
| Metric | Value | Status |
|--------|-------|--------|
| Total test count | N | -- |
| Red count (failing) | N | PASS (= total) |
| Green count (passing) | 0 | PASS (= 0) |
| Fake tests detected | 0 | PASS |
| Fix loop iterations | 0 | -- |

### Test Classification
| Classification | Count |
|----------------|-------|
| Tier 1 E2E | N |
| Security (auto-classified) | N |
| Standard | N |

### Critic Results (iteration N)
| Critic | Verdict |
|--------|---------|
| Product | PASS |
| Dev | PASS |
| QA | PASS |
| Security | PASS |
| ... | ... |

Tests committed to branch: tdd/<slug>/tests
Label: tdd-red-tests

NOTE: Tier 2 integration/unit tests will be developed in Stage 7
alongside application code, guided by the test plan Tier 2 specifications.

Please review and approve to proceed to application development.
Options: approve | edit | abort
```

**If approved** -> proceed to Stage 7
**If edit requested** -> wait for user edits, re-run self-health gate
**If aborted** -> stop pipeline, log residual artifacts (AC 1.10)

---

## Stage 7: Dev Plan -> Develop App with Test Adjustment Taxonomy (fresh context)

Spawn a subagent (Task tool, model: opus -- Opus 4.6) to execute the `/execute` stage, extended with TDD test adjustment taxonomy:

**Subagent prompt:**
```
You are executing the /execute pipeline stage for the TDD pipeline. Read the full command instructions:
<read and paste ${CLAUDE_PLUGIN_ROOT}/commands/execute.md>

Execute all steps for this dev plan:

Dev plan file: <plan_path>
JIRA integration: <enabled/disabled based on user_prefs.skip_jira>

IMPORTANT TDD EXTENSIONS -- Test Adjustment Taxonomy:

This is a TDD pipeline run. Tests were written BEFORE application code (Stage 6).
When implementing tasks, existing tests may need adjustments. Every test change
must be classified using the test adjustment taxonomy:

### Test Adjustment Taxonomy (AC 8.2)

**Structural** (auto-approved, no review required):
- Import path changes (file moved/renamed)
- File location changes (test restructured)
- Test setup/teardown changes (beforeEach, afterEach, fixtures)
- Fixture data updates (test data files, mock data)
- These do NOT count toward the behavioral adjustment threshold.

**Behavioral** (requires QA critic re-review with TP-{N} citation):
- Assertion logic changes (expect() calls modified)
- Expected value changes (assertion values updated)
- Test flow changes (test steps reordered or added/removed)
- Selector changes (data-testid or query changes)
- Each behavioral change must cite the affected TP-{N} contract
  and provide justification for why the change is necessary.

**Security** (IMMUTABLE -- cannot be changed):
- Authentication tests
- Authorization tests
- Input validation tests
- CSRF/XSS protection tests
- If a security test fails, the APPLICATION CODE must change, not the test.
- Tests auto-classified as Security if description/path contains:
  auth, login, logout, permission, role, csrf, xss, injection, sanitize,
  authorization, token, session, cors, encrypt, certificate, rate-limit
- Tests in security/ or __tests__/security/ directories are Security regardless of name.

### Behavioral Adjustment Threshold (AC 8.3)

If more than 20% of Tier 1 E2E test assertions are behaviorally adjusted,
HALT the pipeline and escalate to the user with a full report of all adjustments.

- The threshold is configurable via tdd.max_test_adjustment_pct (default: 20).
- The denominator is the total number of Tier 1 E2E assertions at Stage 6 self-health gate.
- Structural adjustments are EXCLUDED from the threshold count.

### QA Critic Audit (AC 8.7)

The QA Critic in the Ralph Loop must explicitly audit test adjustment classifications
against the diff. Any change to an expect() call, assertion value, or test boundary
condition is flagged as Behavioral regardless of the agent's self-classification.

### Tier 2 Test Development (AC 7.3)

For each task, develop Tier 2 integration/unit tests alongside application code:
- Read the Tier 2 specifications from the test plan at <test_plan_path>
- Each Tier 2 test maps to its TP-{N} traceability ID
- Tier 2 tests use component boundaries from the dev plan

### Ralph Loop Per Task (AC 8.4)

Run 10-critic Ralph Loop per task with max 3 iterations per task.
If a task does not pass after 3 iterations, escalate to the user.

Important:
- Reconcile JIRA statuses first (if JIRA enabled)
- Build the dependency graph and present pre-flight check
- Execute tasks using the Ralph Loop (BUILD -> REVIEW -> ITERATE)
- Each build/review uses fresh context subagents (already defined in execute.md)
- Create PRs and wait for user approval per PR (Gate 7)
- Track ALL test adjustments with classification (Structural/Behavioral/Security)
- HALT if behavioral adjustment threshold exceeded
- Update dev plan and JIRA statuses as tasks complete
- Return the following in your final message:
  1. Results table: task, status, PR number, iteration count, critic results
  2. Summary: completed/blocked counts, total iterations, PRs merged
  3. Smoke test results table (from Step 5 of /execute)
  4. Test adjustment log: classification, TP-{N}, justification for each change
  5. Behavioral adjustment count vs threshold (X / Y = Z%, threshold: 20%)
  6. Tier 2 tests developed: count, TP-{N} IDs covered
  7. Any blocked tasks with their failure reasons
  8. Next steps
```

### GATE 7: Per-PR Approval (AC 8.5)

Gate 7 is handled inside the Stage 7 subagent -- each task's PR requires user approval before merge. The subagent interacts with the user directly for these approvals since they are tightly coupled to the execution loop.

---

## Stage 8: Validate (fresh context)

Stage 8 is the final validation stage. It combines smoke tests, traceability matrix, regression checks, cumulative critic validation, and metrics emission.

Spawn a subagent (Task tool, model: opus -- Opus 4.6) to execute the validation:

**Subagent prompt:**
```
You are executing Stage 8 (Validate) of the TDD pipeline.

Execute the following validation steps:

Dev plan file: <plan_path>
PRD file: <prd_path>
Test plan file: <test_plan_path>
Baseline results: .pipeline/tdd/<slug>/baseline-results.json

### Step 1: Smoke Test (AC 9.1)

Run the same smoke test infrastructure as /execute Step 5:
<read and paste the Step 5 section from ${CLAUDE_PLUGIN_ROOT}/commands/execute.md>

Execute: dev server startup, health checks, core user flow,
browser screenshots if has_frontend: true.

### Step 2: Traceability Matrix (AC 9.2, AC 9.3)

Generate a bidirectional traceability matrix:

For every TP-{N} from the test plan:
1. Find the corresponding test file path and test name (describe/it block path)
2. Run the test and record pass/fail status
3. Use {file_path}::{describe/it block path} as the traceability key
   for cross-file uniqueness

The matrix must be bidirectional:
- Forward: TP-{N} -> test file :: test name -> pass/fail
- Reverse: test file :: test name -> TP-{N}

Flag any TP-{N} without a corresponding PASSING test as a gap (AC 9.3).
Test names (not line numbers) are the primary identifier to survive file restructuring.

### Step 3: Regression Check (AC 9.4)

Run the full test suite and diff results against the pre-pipeline baseline:

1. Read .pipeline/tdd/<slug>/baseline-results.json
2. Run the full test suite
3. Compare: any test that PASSED in baseline but FAILS now is a regression
4. Report regressions with test name, file, and baseline status

### Step 4: 10-Critic Cumulative Validation (AC 9.5)

Run a 10-critic cumulative validation on the main..HEAD diff:
- Max 3 iterations
- If all critics do not pass after 3 iterations, escalate to the user
- Use the same critic invocation pattern as /validate

### Step 5: Pipeline Metrics Emission (AC 9.6)

Collect and emit metrics to .pipeline/metrics/<slug>.json:

If a previous metrics file exists for this slug, preserve it as <slug>.prev.json
before overwriting. Metrics are written ONLY after successful Stage 8 completion.
Partial runs do NOT overwrite existing metrics.

Metrics schema (schema_version: 1):

{
  "schema_version": 1,
  "slug": "<slug>",
  "timestamp": "ISO 8601",
  "red_test_count": <tests that were red at Stage 6 self-health gate>,
  "total_test_count": <total tests at Stage 6>,
  "green_pass_rate": <percentage of tests passing after Stage 7>,
  "test_adjustment_count": {
    "structural": <count>,
    "behavioral": <count>,
    "security_attempted": <count>,
    "total": <count>
  },
  "test_plan_accuracy": <percentage of TP items that passed without behavioral adjustment>,
  "tdd_cycle_time_seconds": <wall-clock seconds from Stage 4 start to Stage 8 completion>,
  "security_test_integrity": <percentage of security tests never modified in Stage 7>,
  "stages_completed": <count>,
  "stages_total": 8
}

Return the following in your final message:
  1. Smoke test results table
  2. Traceability matrix summary: total TP items, mapped, gaps
  3. Traceability matrix (full or top-level summary if large)
  4. Regression check: regressions found, details
  5. Critic validation results (all critics, verdicts, iteration count)
  6. Metrics summary (all 6 metrics)
  7. Overall verdict: PASS / FAIL
  8. Any unresolved issues
```

When the subagent completes, extract the validation results.

### GATE 8: Final Validation Approval (AC 9.7)

Present the full validation results:

```
## Gate 8: Final Validation

### Smoke Test Results
| Check | Status | Duration | Details |
|-------|--------|----------|---------|
| Dev server startup | PASS | 4.2s | pnpm dev, ready in 4.2s |
| Health checks | PASS | 0.3s | 2/2 endpoints healthy |
| SDK version compatibility | PASS | 1.1s | confirmed |
| Core user flow | PASS | 0.8s | POST /api/chat -> 200 |
| Visual rendering | PASS / N/A | 0.5s | 0 orphan CSS vars |
| Browser screenshots | PASS / N/A / WARNING | 12.3s | N routes x 3 viewports |
| Server teardown | PASS | 0.2s | ports released |

### Traceability Matrix Summary
| Metric | Value |
|--------|-------|
| Total TP items | N |
| Mapped to tests | N |
| Passing | N |
| Failing | N |
| Gaps (no passing test) | N |

### Regression Check
| Metric | Value |
|--------|-------|
| Baseline tests | N |
| Current tests | N |
| Regressions | 0 |

### Critic Validation (cumulative main..HEAD diff)
| Critic | Verdict |
|--------|---------|
| Product | PASS |
| Dev | PASS |
| DevOps | PASS |
| QA | PASS |
| Security | PASS |
| Performance | PASS |
| Data Integrity | PASS |
| Observability | PASS / N/A |
| API Contract | PASS / N/A |
| Designer | PASS / N/A |

### Pipeline Metrics
| Metric | Value |
|--------|-------|
| Red test count (Stage 6) | N |
| Green pass rate (Stage 7) | N% |
| Test adjustments | N total (structural: X, behavioral: Y, security: Z) |
| Test plan accuracy | N% |
| TDD cycle time | Xm Ys |
| Security test integrity | N% |

Overall Verdict: PASS / FAIL

Options: approve | fix | abort
```

**If approved** -> proceed to Completion
**If fix requested** -> wait for user fixes, then re-run Stage 8 validation
**If aborted** -> stop pipeline, log residual artifacts (AC 1.10)

---

## CI Strategy Documentation (AC 12.1, AC 12.2)

### Label-Based CI Skip Convention

When the TDD pipeline creates the `tdd/{slug}/tests` branch in Stage 6, it applies the `tdd-red-tests` label to signal CI systems that test failures on this branch are intentional -- the tests are written before application code exists.

**Convention:**
- Branch pattern: `tdd/{slug}/tests`
- Label: `tdd-red-tests`
- CI behavior: Skip test execution jobs on branches/PRs with this label
- The label is removed when Stage 7 begins (app code is being written against the tests)

### GitHub Actions Workflow Examples

**Example 1: Skip test jobs by branch name pattern**

```yaml
name: CI
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    if: |
      !startsWith(github.head_ref, 'tdd/') ||
      !endsWith(github.head_ref, '/tests')
    steps:
      - uses: actions/checkout@v4
      - run: npm test
```

**Example 2: Skip test jobs by PR label**

```yaml
name: CI
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    if: |
      !contains(github.event.pull_request.labels.*.name, 'tdd-red-tests')
    steps:
      - uses: actions/checkout@v4
      - run: npm test
```

**Example 3: Run tests but allow failure on TDD branches**

```yaml
name: CI
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    continue-on-error: ${{ startsWith(github.head_ref, 'tdd/') }}
    steps:
      - uses: actions/checkout@v4
      - run: npm test
```

---

## Pipeline State Tracking

Throughout the pipeline, state is persisted in two places:

**1. On disk (source of truth):**
- PRD file: `docs/prd/<slug>.md`
- Design Brief: `docs/tdd/<slug>/design-brief.md`
- UI contract: `docs/tdd/<slug>/ui-contract.md`
- Test plan: `docs/tdd/<slug>/test-plan.md`
- Dev plan: `docs/dev_plans/<slug>.md` (updated with JIRA keys, task statuses, PR links)
- Test files: on `tdd/{slug}/tests` branch
- Baseline results: `.pipeline/tdd/<slug>/baseline-results.json`
- Mock screenshots: `.pipeline/tdd/<slug>/mock-screenshots/`
- Pipeline metrics: `.pipeline/metrics/{slug}.json`
- JIRA mapping: `jira-issue-mapping.json`

**2. In the orchestrator (lightweight):**
- `slug`, `prd_path`, `plan_path`, `brief_path`, `contract_path`, `test_plan_path`, `test_result`, `requirement`, `user_prefs`

This separation means the pipeline can be resumed at any stage by reading file state -- no conversational context is needed.

---

## Error Recovery

If the pipeline is interrupted at any stage:

- **Stage 1 interrupted**: Re-run `/req2prd` -- PRD file may already exist, ask user whether to regenerate or use existing.
- **Stage 2 interrupted**: Re-run `/tdd-design-brief` -- check if Design Brief already exists at `docs/tdd/<slug>/design-brief.md`.
- **Stage 3 interrupted**: Re-run `/tdd-mock-analysis` -- check if UI contract already exists at `docs/tdd/<slug>/ui-contract.md`. Screenshots in `.pipeline/tdd/<slug>/mock-screenshots/` may be partial.
- **Stage 4 interrupted**: Re-run `/tdd-test-plan` -- check if test plan already exists at `docs/tdd/<slug>/test-plan.md`.
- **Stage 5 interrupted**: Re-run `/prd2plan` with test plan integration -- check if dev plan already exists at `docs/dev_plans/<slug>.md`. Contract negotiation may need to re-run.
- **Stage 6 interrupted**: Re-run `/tdd-develop-tests` -- check if `tdd/{slug}/tests` branch exists with committed test files. If tests are partially written, the self-health gate will catch inconsistencies.
- **Stage 7 interrupted**: Re-run `/execute @plan` -- it reads task statuses from the dev plan, reconciles JIRA statuses, and resumes from where it left off. Test adjustment tracking resets -- cumulative adjustments from the previous partial run are not preserved.
- **Stage 8 interrupted**: Re-run Stage 8 validation -- `/test` and traceability are idempotent, scan everything from scratch. Metrics are only written on successful completion, so partial runs leave no stale metrics.

**Re-running `/tdd-fullpipeline`** after interruption: The orchestrator should check for existing artifacts before spawning each stage subagent:
- If `docs/prd/<slug>.md` exists, ask whether to skip Stage 1.
- If `docs/tdd/<slug>/design-brief.md` exists, ask whether to skip Stage 2.
- If `docs/tdd/<slug>/ui-contract.md` exists, ask whether to skip Stage 3.
- If `docs/tdd/<slug>/test-plan.md` exists, ask whether to skip Stage 4.
- If `docs/dev_plans/<slug>.md` exists, ask whether to skip Stage 5.
- If `tdd/{slug}/tests` branch exists with tests, ask whether to skip Stage 6.
- Check dev plan task statuses for Stage 7 resumption.

This avoids re-running completed stages.

### Pipeline Abort (AC 1.10)

When a pipeline run is aborted (user chooses abort at any gate, or pipeline fails unrecoverably), log the list of residual artifacts:

```
## Pipeline Aborted at Stage N

### Residual Artifacts
The following artifacts were created during this pipeline run.
You may clean them up manually or re-run /tdd-fullpipeline to resume.

| Type | Path | Status |
|------|------|--------|
| PRD | docs/prd/<slug>.md | Complete |
| Design Brief | docs/tdd/<slug>/design-brief.md | Complete |
| UI Contract | docs/tdd/<slug>/ui-contract.md | Partial |
| Mock Screenshots | .pipeline/tdd/<slug>/mock-screenshots/ | N files |
| Test Plan | docs/tdd/<slug>/test-plan.md | Not created |
| Dev Plan | docs/dev_plans/<slug>.md | Not created |
| Test Branch | tdd/<slug>/tests | Not created |
| Baseline | .pipeline/tdd/<slug>/baseline-results.json | Complete |
| Metrics | .pipeline/metrics/<slug>.json | Not created |

To resume: Run /tdd-fullpipeline with the same requirement.
The orchestrator will detect existing artifacts and offer to skip completed stages.
```

---

## Completion

When all stages complete (Stage 8 subagent returns with PASS verdict), present the final report:

**Heading rules:**
- All smoke tests PASS and Stage 8 validation PASS -> "TDD Pipeline Complete"
- Any smoke test row shows FAIL -> "TDD Pipeline Incomplete -- Smoke Test Failure" (include Error Details column)
- Stage 8 validation FAIL -> "TDD Pipeline Incomplete -- Validation Failure" (include blocking items)
- Smoke tests SKIPPED (opted out via `smoke_test.enabled: false`) -> "TDD Pipeline Complete" (treat opt-out as acceptable; include "SKIPPED" line)
- Any smoke test row is a skip/warning -> "TDD Pipeline Complete" but list skipped checks

```
## TDD Pipeline Complete

### Requirement
<original requirement text>

### Deliverables
- PRD: docs/prd/<slug>.md
- Design Brief: docs/tdd/<slug>/design-brief.md
- UI Contract: docs/tdd/<slug>/ui-contract.md
- Test Plan: docs/tdd/<slug>/test-plan.md
- Dev Plan: docs/dev_plans/<slug>.md
- JIRA Epic: <KEY>-100 (if JIRA enabled)

### Implementation
| Task | PR | JIRA | Status |
|------|-----|------|--------|
| TASK 1.1 | #42 | MVP-103 | Merged |
| TASK 1.2 | #43 | MVP-104 | Merged |
| TASK 2.1 | #44 | MVP-105 | Merged |

### Quality
- Total Ralph Loop iterations: X (across all stages)
- All critics passed for all tasks
- Test coverage: N%

### TDD Metrics
| Metric | Value | Target | Status |
|--------|-------|--------|--------|
| Red test count (Stage 6) | N | = total | PASS |
| Green pass rate (Stage 7) | N% | > 95% | PASS |
| Test adjustments | N (S: X, B: Y, Sec: Z) | B < 20% | PASS |
| Test plan accuracy | N% | > 85% | PASS |
| TDD cycle time | Xm Ys | -- | -- |
| Security test integrity | N% | 100% | PASS |

### Test Adjustment Summary
| Classification | Count | Details |
|----------------|-------|---------|
| Structural (auto-approved) | N | Import paths, setup changes |
| Behavioral (QA reviewed) | N | Assertion changes with TP-{N} citations |
| Security (immutable) | 0 | No security tests modified |
| **Total** | **N** | Threshold: Y% of Z = W (actual: X%) |

### Traceability Matrix Summary
| Metric | Value |
|--------|-------|
| Total TP items | N |
| Mapped to tests | N |
| All passing | N |
| Gaps | 0 |

### Smoke Test (Pre-Delivery)
| Check | Status | Duration | Details |
|-------|--------|----------|---------|
| Dev server startup | PASS | 4.2s | pnpm dev, ready in 4.2s |
| Health checks | PASS | 0.3s | 2/2 endpoints healthy |
| SDK version compatibility | PASS | 1.1s | confirmed |
| Core user flow | PASS | 0.8s | POST /api/chat -> 200 |
| Visual rendering | PASS / N/A | 0.5s | 0 orphan CSS vars |
| Browser screenshots | PASS / N/A / WARNING | 12.3s | N routes x 3 viewports |
| Server teardown | PASS | 0.2s | ports released |

### Stage 8 Validation
| Section | Status | Details |
|---------|--------|---------|
| Smoke Test | PASS | All checks green |
| Traceability | PASS | N TP items mapped, 0 gaps |
| Regression Check | PASS | 0 regressions against baseline |
| Critic Validation | PASS | All 10 critics passed on main..HEAD |
| Metrics Emission | PASS | .pipeline/metrics/<slug>.json written |
| **Overall** | **PASS** | |

### Next Steps
- Deploy to staging
- Product review against PRD acceptance criteria
- Review pipeline metrics at .pipeline/metrics/<slug>.json
- Compare metrics against targets (test plan accuracy > 85%, security integrity = 100%)
```

**IMPORTANT:** The Stage 7 subagent's `/execute` includes a mandatory smoke test step (Step 5) that verifies the dev server actually works before declaring complete. If the smoke test fails, the pipeline is NOT complete -- the subagent must fix the issues or report them as blocking. Never present a "TDD Pipeline Complete" report to the user without smoke tests passing. **Verify the Stage 7 subagent's response includes a "Smoke Test Results" section before declaring pipeline complete.** If absent, query the subagent for smoke test status.
