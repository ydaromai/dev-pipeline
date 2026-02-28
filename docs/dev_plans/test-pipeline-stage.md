# Dev Plan: Add /test Pipeline Stage (Stage 5)

## Epic: Add /test Pipeline Stage (Stage 5) — Test Verification & Validation

**PRD:** `docs/prd/test-pipeline-stage.md`
**Date:** 2026-02-28
**Status:** APPROVED

---

## Dependency Graph

```
Group A (parallel, first):  TASK 1.1 (config template) + TASK 1.2 (commands/test.md)
Group B (after A):          TASK 2.1 (fullpipeline.md edits)
Group C (after B):          TASK 3.1 (WORKFLOW.md edits) + TASK 3.2 (README.md edits)
```

```
  TASK 1.1 ──────────────┐
  (config template)       ├──► TASK 2.1 ──────┬──► TASK 3.1 (WORKFLOW.md)
  TASK 1.2 ──────────────┘    (fullpipeline)  ├──► TASK 3.2 (README.md)
  (commands/test.md)                           │
                                               └──► (Done)
```

---

## STORY 1: Create /test Command File and Config Schema

**User Stories Covered:** US-1, US-2, US-3, US-4, US-5, US-6, US-7, US-8, US-9, US-10, US-12
**Description:** Create the core `commands/test.md` command file (10 steps) and add the `test_stage` configuration section to the pipeline config template. These are the foundational deliverables that all other changes depend on.

---

### TASK 1.1: Add test_stage config section to pipeline-config-template.yaml
**Depends On:** None
**Parallel Group:** A
**Complexity:** Simple
**Estimated Time:** 30 minutes
**Required Tests:** YAML validation (verify `test_stage` section parses correctly, all keys have correct types and defaults; verify `test_commands` includes `e2e`, `component`, `all` entries; verify `validation.stages` includes `test` entry)

**File:** `pipeline/templates/pipeline-config-template.yaml`
**Action:** EDIT

**Implementation Steps:**

1. Read `pipeline/templates/pipeline-config-template.yaml` to understand the existing structure, documentation style (comments explaining each option), and formatting conventions (indentation, comment patterns).

2. Add `e2e`, `component`, and `all` entries to the existing `test_commands` section as commented-out entries with example defaults, following the same pattern as the existing `smoke_test` section (commented-out with `#`). The `all` key should be uncommented since it is an active default. Place them after the existing `ui` entry:
   ```yaml
   test_commands:
     unit: "npm test"
     integration: "npm run test:integration"
     ui: "npm run test:ui"
     all: "npm run test:all"
     # e2e: "npm run test:e2e"               # E2E test command (uncomment to enable)
     # component: "npm run test:component"   # Component test command (uncomment to enable; typically for has_frontend: true projects)
   ```

3. Add a `test_stage` section after the `smoke_test` section (before `paths`), fully commented-out with defaults and explanatory comments matching the existing documentation style:
   ```yaml
   # Test verification stage (Stage 5 of /fullpipeline, or run standalone via /test)
   # Controls the /test command behavior. When omitted, /test uses defaults.
   # Uncomment and customize to override defaults.
   # test_stage:
   #   enabled: true                          # set to false to skip Stage 5 entirely
   #   max_fix_iterations: 3                  # max Ralph Loop iterations for test generation and fix cycles
   #   coverage_thresholds:
   #     lines: 80                            # minimum line coverage % for changed files (Warning, not blocking)
   #   ci_audit:
   #     fix_commented_jobs: false            # set to true to auto-fix commented-out CI jobs
   #     config_paths: []                     # additional CI config file paths to scan (e.g., [".buildkite/pipeline.yml"])
   #   critic_validation:
   #     critics: [product, dev, devops, qa, security, performance, data-integrity]  # critics for cumulative diff review
   #     max_iterations: 3                    # max fix iterations for critic failures
   ```

4. Add a `test` entry to the `validation.stages` section, placing it after the `execute` entry and before `pre_merge`:
   ```yaml
   test:
     critics: [product, dev, devops, qa, security, performance, data-integrity, observability, api-contract, designer]  # conditional: observability (has_backend_service), api-contract (has_api), designer (has_frontend)
     mode: parallel
   ```

5. Verify the complete file parses as valid YAML by reviewing indentation and structure.

**Acceptance Criteria Addressed:** AC 10.1, AC 10.2, AC 10.3, AC 10.4, AC 10.5, AC 10.6

#### Subtasks

**SUBTASK 1.1.1:** Add `e2e`, `component` entries to `test_commands` section (commented-out with example values)
- Read the existing `test_commands` section at line ~63
- Add `# e2e: "npm run test:e2e"` and `# component: "npm run test:component"` after the `ui` line
- Verify `all` entry exists (it does at line 68); no change needed for `all`
- Estimated time: 10 minutes

**SUBTASK 1.1.2:** Add `test_stage` commented-out section after `smoke_test` section
- Insert after line ~103 (end of `smoke_test` section), before `paths` section
- Include all keys: `enabled`, `max_fix_iterations`, `coverage_thresholds.lines`, `ci_audit.fix_commented_jobs`, `ci_audit.config_paths`, `critic_validation.critics`, `critic_validation.max_iterations`
- Follow the exact comment style used by the `smoke_test` section (leading `#`, indentation, explanatory comments)
- Estimated time: 10 minutes

**SUBTASK 1.1.3:** Add `test` stage to `validation.stages` section
- Insert after the `execute` entry (line ~41) and before `pre_merge` (line ~43)
- Include critic list with conditional notes matching the existing pattern
- Estimated time: 10 minutes

---

### TASK 1.2: Create commands/test.md (10-step command file)
**Depends On:** None
**Parallel Group:** A
**Complexity:** Complex
**Estimated Time:** 2-3 hours
**Required Tests:** Structural validation (verify all 10 steps with correct headings; verify Ralph Loop pattern in Steps 3, 4, 9; verify human gate pattern; verify `$ARGUMENTS` reference; verify `test_stage.enabled` check in Step 1; verify empty diff handling; verify missing dev plan error handling; verify all `test_commands` keys referenced; verify coverage flag auto-detection; verify CI config detection patterns; verify CD report-only constraint; verify execute.md Step 5 reference; verify all 10 critics referenced; verify comprehensive report sections)

**File:** `commands/test.md` (NEW)
**Action:** CREATE

**Implementation Steps:**

1. Read `commands/execute.md` thoroughly to understand the established patterns for:
   - Command file header format (title, role description, input/output)
   - Step heading format (`## Step N: <title>`)
   - Subagent prompt format (fenced code blocks with structured prompts)
   - Ralph Loop pattern (BUILD/REVIEW/ITERATE with max iterations and escalation)
   - Human gate pattern (PR creation, approval prompt with options)
   - Fresh context pattern (Task tool, model selection)
   - Config reference pattern (reading from `pipeline.config.yaml`)
   - Critic invocation pattern (reading persona `.md` files, parallel execution)

2. Read `pipeline/templates/pipeline-config-template.yaml` for config key references that `test.md` must use: `test_stage.*`, `test_commands.*`, `test_requirements`, `smoke_test.*`.

3. Read the PRD `docs/prd/test-pipeline-stage.md` Sections 5-6 for the detailed step specifications.

4. Create `commands/test.md` with the following structure:

   **Header:**
   ```markdown
   # /test -- Test Verification & Validation

   You are executing the **test** pipeline stage. This is Stage 5...
   ```
   - Input: Dev plan file via `$ARGUMENTS`
   - Output: Comprehensive test verification report

   **Step 1: Read inputs and compute scope**
   - Read dev plan file from `$ARGUMENTS`; if file not found, report error "Dev plan file not found: <path>" and exit (AC 1.8)
   - Read `pipeline.config.yaml` for `test_stage`, `test_commands`, `test_requirements`, `smoke_test` config
   - Check `test_stage.enabled`; if `false`, print message and exit (AC 12.3)
   - Read linked PRD (find by matching slug in `docs/prd/`)
   - Read `docs/ai_definitions/AGENT_CONSTRAINTS.md`
   - Compute cumulative diff: `git diff main..HEAD`; extract changed source file paths
   - If diff is empty, report "No changed files detected" and skip Steps 2-5, proceed to Step 6 (AC 1.7)
   - Addresses: FR-2, US-1 (AC 1.1, 1.7, 1.8), US-12 (AC 12.3)

   **Step 2: Test Existence Audit**
   - Match each changed source file against `test_requirements` patterns from `pipeline.config.yaml` (AC 1.2)
   - Cross-reference PRD Section 9 Testing Strategy for feature-specific test requirements (AC 1.3)
   - Categorize test types: unit, component (if `has_frontend`), integration, UI (if `has_frontend`), E2E (AC 1.4)
   - Produce inventory table: file pattern | required types | found | missing (AC 1.5)
   - If no gaps found, report "No gaps found" and proceed (AC 1.6)
   - Addresses: FR-3, US-1 (AC 1.2-1.6)

   **Step 3: Missing Test Generation (Ralph Loop)**
   - If no gaps from Step 2, skip and report "SKIPPED -- no gaps" (AC 2.5)
   - For each gap, spawn BUILD subagent (Task tool, model: opus) to write missing tests (AC 2.1)
   - Review generated tests with QA + Dev critics (AC 2.2)
   - Ralph Loop: max `test_stage.max_fix_iterations` (default: 3) iterations (AC 2.3)
   - Create PR for new tests with human gate for approval (AC 2.4)
   - Use same Ralph Loop pattern as `execute.md` Step 3b/3c/3d
   - Addresses: FR-4, US-2 (AC 2.1-2.5)

   **Step 4: Run All Tests**
   - Sequencing: only runs AFTER Step 3 PRs (if any) are merged
   - Run each test type using `test_commands` from config: `unit`, `integration`, `ui` (if `has_frontend`), `e2e` (if configured), `component` (if configured) (AC 3.1)
   - If a `test_commands` key is not configured, skip that type and report "SKIPPED (not configured)" (AC 3.1)
   - After individual types, run `test_commands.all` for final validation (AC 3.2)
   - Report per-type: pass count, fail count, skip count, duration (AC 3.3)
   - On ANY failure: spawn fix subagent (Task tool, model: opus, fresh context) with failure output (AC 3.4)
   - After fix, re-run ALL test types (not just failed type) to catch regressions (AC 3.5)
   - Max `test_stage.max_fix_iterations` (default: 3) fix iterations; then escalate to user (AC 3.6)
   - Goal: full green cycle where ALL test types pass in a single run (AC 3.7)
   - Addresses: FR-5, US-3 (AC 3.1-3.7)

   **Step 5: Coverage Verification (P1)**
   - Run tests with coverage flag (auto-detect from framework: `--coverage` for vitest/jest, `--cov` for pytest, etc.) (AC 4.1)
   - Compare against `test_stage.coverage_thresholds.lines` (default: 80%) (AC 4.2)
   - Report per-file coverage for changed source files (AC 4.3)
   - Below-threshold coverage is a Warning (not blocking) (AC 4.4)
   - Addresses: FR-12, US-4 (AC 4.1-4.4)

   **Step 6: CI Pipeline Audit (P1)**
   - Detect CI config files: `.github/workflows/*.yml`, `.gitlab-ci.yml`, `Jenkinsfile`, `.circleci/config.yml`, `azure-pipelines.yml`, `bitbucket-pipelines.yml` (AC 5.1)
   - Also check `test_stage.ci_audit.config_paths` for additional paths
   - If no CI config found, report "No CI config detected -- configure manually or add your CI system to `test_stage.ci_audit.config_paths`" (AC 5.1)
   - Verification checks: all required test jobs active (not commented out), test commands match `pipeline.config.yaml`, dependencies/services configured, build step exists, lint step exists (AC 5.2)
   - If issues found and `test_stage.ci_audit.fix_commented_jobs` is true, spawn fix subagent (AC 5.3)
   - Fixes create PR with human gate (AC 5.4)
   - Report CI health table: job | status | notes (AC 5.5)
   - Addresses: FR-13, US-5 (AC 5.1-5.5)

   **Step 7: CD Pipeline Audit (P1)**
   - Detect CD config files: deploy workflows, Dockerfile, docker-compose, Kubernetes manifests, etc. (AC 6.1)
   - Verification checks: deploy steps exist for staging, post-deploy health check exists, rollback strategy documented, environment-specific configs exist (AC 6.2)
   - Report-only -- NO auto-fix (high-risk) (AC 6.3)
   - Report CD component health table (AC 6.4)
   - Addresses: FR-14, US-6 (AC 6.1-6.4)

   **Step 8: Local Deployment Verification (P1)**
   - If `smoke_test.enabled` is false, skip and report SKIPPED (AC 7.3)
   - Runs AFTER test suite passes and test PRs are merged (AC 7.2)
   - Use same infrastructure as `execute.md` Step 5: start dev server, health checks, core user flow, teardown (AC 7.1)
   - Reference the exact same smoke test steps: 5a (start), 5b (health), 5c (SDK), 5d (user flow), 5e (visual if `has_frontend`), 5f (teardown)
   - Addresses: FR-15, US-7 (AC 7.1-7.3)

   **Step 9: Full Cumulative Critic Validation**
   - Compute cumulative diff: `git diff main..HEAD`
   - Run ALL applicable critics in parallel (7 always-on + conditional: Observability if `has_backend_service`, API Contract if `has_api`, Designer if `has_frontend`) (AC 8.1)
   - Read critic persona files from `${CLAUDE_PLUGIN_ROOT}/pipeline/agents/`:
     1. `product-critic.md`
     2. `dev-critic.md`
     3. `devops-critic.md`
     4. `qa-critic.md`
     5. `security-critic.md`
     6. `performance-critic.md`
     7. `data-integrity-critic.md`
     8. `observability-critic.md` (if `has_backend_service: true`)
     9. `api-contract-critic.md` (if `has_api: true`)
     10. `designer-critic.md` (if `has_frontend: true`)
   - If any critic FAILs, spawn fix subagent (Task tool, model: opus, fresh context), then re-validate only the previously failed critics (AC 8.2)
   - Max `test_stage.critic_validation.max_iterations` (default: 3) fix iterations; then escalate to user (AC 8.3)
   - All critics must PASS before Stage 5 is declared complete (AC 8.4)
   - Use same critic invocation pattern as `execute.md` Step 3c
   - Addresses: FR-6, US-8 (AC 8.1-8.4)

   **Step 10: Final Report**
   - Comprehensive report with per-section verdicts (AC 9.1):
     - Test Inventory: files audited, gaps found/filled
     - Test Results: per-type table (pass/fail/skip/duration)
     - Coverage: per-file table, overall %
     - CI Audit: job health table
     - CD Audit: component health table
     - Local Deployment: smoke test results
     - Critic Validation: critic score table
     - Overall verdict: PASS/FAIL
   - Overall is PASS only if all sections are green; FAIL lists blocking items (AC 9.2)
   - Addresses: FR-7, US-9 (AC 9.1-9.2)

5. Ensure the file follows these patterns from `execute.md`:
   - Uses `$ARGUMENTS` for input
   - References `pipeline.config.yaml` for all config reads
   - Uses Task tool for subagent spawning with model selection
   - Uses `gh pr create` for PR creation
   - Uses structured output tables for reporting
   - Includes escalation paths (max iterations, then escalate to user)

6. Verify idempotency: no persistent state, no side effects beyond git branches and PRs (NFR-1, FR-11).

**Acceptance Criteria Addressed:** AC 1.1-1.8, AC 2.1-2.5, AC 3.1-3.7, AC 4.1-4.4, AC 5.1-5.5, AC 6.1-6.4, AC 7.1-7.3, AC 8.1-8.4, AC 9.1-9.2, AC 10.2, AC 12.3

#### Subtasks

**SUBTASK 1.2.1:** Write command header and Step 1 (Read inputs and compute scope)
- Create the file with command header matching `execute.md` format
- Implement Step 1: read dev plan from `$ARGUMENTS`, handle missing file error, read config, check `test_stage.enabled`, compute `git diff main..HEAD`, handle empty diff
- Estimated time: 20 minutes

**SUBTASK 1.2.2:** Write Step 2 (Test Existence Audit)
- Implement the test requirements matching logic
- Implement PRD Section 9 cross-reference
- Implement inventory table output format
- Handle no-gaps case
- Estimated time: 20 minutes

**SUBTASK 1.2.3:** Write Step 3 (Missing Test Generation Ralph Loop)
- Implement BUILD subagent prompt for test generation (model: opus, fresh context)
- Implement QA + Dev critic review
- Implement Ralph Loop iteration with max iterations
- Implement PR creation with human gate
- Implement skip logic when no gaps
- Follow `execute.md` Step 3b/3c/3d patterns exactly
- Estimated time: 25 minutes

**SUBTASK 1.2.4:** Write Step 4 (Run All Tests)
- Implement per-type test execution using `test_commands`
- Implement "SKIPPED (not configured)" for missing keys
- Implement `test_commands.all` final validation
- Implement per-type result reporting
- Implement fix subagent with re-run-all behavior
- Implement max iterations with escalation
- Estimated time: 25 minutes

**SUBTASK 1.2.5:** Write Step 5 (Coverage Verification)
- Implement coverage flag auto-detection
- Implement threshold comparison
- Implement per-file coverage reporting
- Implement Warning (not blocking) behavior
- Estimated time: 15 minutes

**SUBTASK 1.2.6:** Write Step 6 (CI Pipeline Audit)
- Implement CI config file detection patterns
- Implement verification checks
- Implement optional auto-fix via config flag
- Implement CI health table output
- Estimated time: 15 minutes

**SUBTASK 1.2.7:** Write Step 7 (CD Pipeline Audit)
- Implement CD config file detection
- Implement verification checks
- Implement report-only constraint (no auto-fix)
- Implement CD component health table
- Estimated time: 10 minutes

**SUBTASK 1.2.8:** Write Step 8 (Local Deployment Verification)
- Reference `execute.md` Step 5 infrastructure
- Implement `smoke_test.enabled` check
- Implement sequencing (after test suite passes)
- Estimated time: 15 minutes

**SUBTASK 1.2.9:** Write Step 9 (Full Cumulative Critic Validation)
- Implement all-critic parallel invocation with persona file paths
- Implement fix loop for failed critics (re-validate only failed)
- Implement max iterations with escalation
- Follow `execute.md` Step 3c pattern for critic invocation
- Estimated time: 20 minutes

**SUBTASK 1.2.10:** Write Step 10 (Final Report)
- Implement comprehensive report format with all sections
- Implement PASS/FAIL logic (PASS only if all sections green)
- Include all tables: inventory, test results, coverage, CI, CD, smoke test, critic scores
- Estimated time: 15 minutes

---

## STORY 2: Integrate /test into /fullpipeline

**User Stories Covered:** US-11, US-12
**Description:** Edit `commands/fullpipeline.md` to add Stage 5 between Stage 4 and Completion, including the architecture diagram, orchestrator state, Stage 5 subagent section, Gate 5, completion section update, and error recovery entry.

---

### TASK 2.1: Edit fullpipeline.md to add Stage 5 integration
**Depends On:** TASK 1.1, TASK 1.2
**Parallel Group:** B
**Complexity:** Medium
**Estimated Time:** 1-2 hours
**Required Tests:** Structural validation (verify Stage 5 section exists with subagent prompt; verify Gate 5 exists; verify architecture diagram includes Stage 5 node; verify orchestrator state includes `test_result`; verify completion section references Stage 5; verify error recovery includes Stage 5; verify `test_stage.enabled: false` skip logic)

**File:** `commands/fullpipeline.md`
**Action:** EDIT

**Implementation Steps:**

1. Read `commands/fullpipeline.md` to understand the existing structure: architecture diagram, orchestrator state, stage sections (1-4), gate format, pipeline state tracking, error recovery, completion section.

2. Update the Architecture diagram (line ~12-32) to include Stage 5:
   ```
   ORCHESTRATOR (this agent -- lightweight coordinator)
     |
     +- Stage 1 subagent (fresh context) --> docs/prd/<slug>.md
     |    +- critic subagents (parallel)
     |
     |  <-- GATE 1: user approves PRD -->
     |
     +- Stage 2 subagent (fresh context) --> docs/dev_plans/<slug>.md
     |    +- critic subagents (parallel)
     |
     |  <-- GATE 2: user approves plan -->
     |
     +- Stage 3 subagent (fresh context) --> JIRA issues created
     |    +- critic subagents (mandatory)
     |
     |  <-- GATE 3a/3b: critic validation + user confirms JIRA -->
     |
     +- Stage 4 subagent (fresh context) --> Code implemented, PRs merged
     |    +- per-task: build subagent -> review subagent -> critic subagents
     |
     |  <-- GATE 4: per-PR approval -->
     |
     +- Stage 5 subagent (fresh context) --> Test verification report
          +- test audit, test generation, test execution, critic validation
   ```

3. Update the Orchestrator State section (line ~42-52) to add `test_result`:
   ```
   test_result:    PASS | FAIL | SKIPPED
   ```

4. Add a new Stage 5 section after Stage 4 (after line ~249), following the exact same pattern as Stages 1-4:

   **Stage 5: Test Verification (fresh context)**
   - Check `test_stage.enabled` from `pipeline.config.yaml`; if `false`, skip Stage 5, set `test_result: SKIPPED` (AC 12.1, 12.2)
   - Spawn subagent (Task tool, model: opus) to execute `/test`:
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

   **Gate 5: Test Results Approval**
   - Present test results and critic validation to user
   - Format matching Gate 1/2 patterns with a results table
   - Options: approve | fix | abort

5. Update the Completion section (line ~283-329) to:
   - Reference Stage 5 subagent return
   - Add Test Verification section to the final report (after Smoke Test, before Next Steps)
   - Include test inventory, test results, coverage, CI/CD audit, critic validation in the report
   - Handle `test_result: SKIPPED` case (show Stage 5 as SKIPPED with reason)

6. Update the Error Recovery section (line ~269-277) to add Stage 5:
   ```
   - **Stage 5 interrupted**: Re-run `/test @plan` -- /test is idempotent, scans everything from scratch
   ```

7. Verify the heading labeled "When the Stage 4 subagent returns" in the Completion section is updated to say "When the Stage 5 subagent returns" (or "When all stages complete").

**Acceptance Criteria Addressed:** AC 11.1, AC 11.2, AC 11.3, AC 11.4, AC 11.5, AC 11.6, AC 12.1, AC 12.2

#### Subtasks

**SUBTASK 2.1.1:** Update architecture diagram to include Stage 5
- Edit the ASCII art diagram to add Stage 5 node and Gate 5
- Maintain alignment and readability
- Estimated time: 15 minutes

**SUBTASK 2.1.2:** Update orchestrator state to include `test_result`
- Add `test_result: PASS | FAIL | SKIPPED` to the state variables
- Estimated time: 5 minutes

**SUBTASK 2.1.3:** Add Stage 5 section with subagent prompt and skip logic
- Add the full Stage 5 section after Stage 4, before Pipeline State Tracking
- Include subagent prompt following the exact pattern of Stages 1-4
- Include `test_stage.enabled` check for skip logic
- Estimated time: 25 minutes

**SUBTASK 2.1.4:** Add Gate 5 section with test results presentation
- Add Gate 5 after the Stage 5 section
- Include test results table, critic results, and user options (approve/fix/abort)
- Follow the pattern of Gates 1-4
- Estimated time: 15 minutes

**SUBTASK 2.1.5:** Update Completion section to reference Stage 5
- Add Test Verification section to the final report
- Handle both PASS and SKIPPED cases
- Update heading to reference Stage 5 completion
- Estimated time: 15 minutes

**SUBTASK 2.1.6:** Update Error Recovery section to include Stage 5
- Add error recovery entry for Stage 5 interruption
- Explain idempotent behavior
- Estimated time: 10 minutes

---

## STORY 3: Update Documentation (WORKFLOW.md and README.md)

**User Stories Covered:** US-11 (documentation aspect)
**Description:** Update `WORKFLOW.md` and `README.md` to reflect the addition of Stage 5, including pipeline flow diagrams, tables, command references, error recovery, and project structure.

---

### TASK 3.1: Edit WORKFLOW.md to add Stage 5 documentation
**Depends On:** TASK 1.2, TASK 2.1
**Parallel Group:** C
**Complexity:** Medium
**Estimated Time:** 1 hour
**Required Tests:** Structural validation (verify Stage 5 section exists; verify pipeline overview diagram updated; verify stage table updated; verify error recovery table updated; verify critic table updated; verify quick reference commands table updated; verify config YAML example includes `test_stage`; verify key files section updated)

**File:** `WORKFLOW.md`
**Action:** EDIT

**Implementation Steps:**

1. Read `WORKFLOW.md` to understand the existing structure: pipeline overview diagram, stage sections (0-4), standalone validation, critic agents reference, configuration section, key files, error recovery, quick reference.

2. Update the Pipeline Overview diagram (line ~5-14) to include Stage 5:
   ```
    +-------------+     +-------------+     +-------------+     +-------------+     +-------------+     +-------------+
    |  /pipeline- |     |  /req2prd   |     |  /prd2plan  |     |  /plan2jira |     |  /execute   |     |  /test      |
    |    init     |---->|             |---->|             |---->|             |---->|             |---->|             |
    |  (one-time) |     | Requirement |     |  PRD -> Dev |     | Dev Plan -> |     | Ralph Loop  |     |   Test      |
    |             |     |   -> PRD    |     |    Plan     |     |   JIRA      |     | Build/Review|     | Verification|
    +-------------+     +------+------+     +------+------+     +------+------+     +------+------+     +------+------+
                              GATE 1              GATE 2            GATE 3a 3b      GATE 4 (per PR)     GATE 5
                           PRD Approval        Plan Approval     Critic Val JIRA   PR Merge           Test Results
   ```

3. Update the intro paragraph (line ~16) to mention Stage 5:
   - "`/fullpipeline <requirement>` chains all stages with gates between each."

4. Add a new "Stage 5: Test Verification -- `/test`" section after Stage 4 (after line ~263) and before "Standalone Validation", following the pattern of existing stage sections with:
   - **Input/Output** header
   - ASCII flow diagram showing the 10 steps
   - Workflow Detail table with all 10 steps
   - Critics at this stage table

   ```
   ## Stage 5: Test Verification -- `/test`

   **Input:** `@docs/dev_plans/<slug>.md`
   **Output:** Comprehensive test verification report (PASS/FAIL)
   ```

   Flow diagram:
   ```
     Read Inputs +    Test Existence   Missing Test    Run All Tests    Coverage     CI Audit     CD Audit     Smoke Test    Critic        Final
     Compute Scope -> Audit         -> Generation   -> (per-type)   -> Verification -> (verify) -> (report)  -> (if enabled) -> Validation -> Report
     (config, diff)   (patterns)      (Ralph Loop)    (fix loop)      (warning)      (fix?)      (no fix)     (execute.md)    (all critics)  (PASS/FAIL)
   ```

   Workflow Detail table:
   | Step | Action | Details |
   |------|--------|---------|
   | 1 | Read inputs + compute scope | Dev plan, config, PRD, constraints, `git diff main..HEAD`, handle empty diff/missing file |
   | 2 | Test Existence Audit | Match changed files against `test_requirements` patterns, cross-ref PRD Section 9, produce inventory table |
   | 3 | Missing Test Generation | Ralph Loop: BUILD tests (opus), REVIEW with QA+Dev critics, max 3 iterations, PR with human gate |
   | 4 | Run All Tests | Each type via `test_commands`, per-type reporting, fix loop (re-run ALL after fix), max 3 iterations |
   | 5 | Coverage Verification | Auto-detect coverage flag, compare against threshold, per-file report, Warning if below |
   | 6 | CI Pipeline Audit | Detect CI configs, verify jobs/commands, optional auto-fix, health table |
   | 7 | CD Pipeline Audit | Detect CD configs, verify deploy/health/rollback, report-only |
   | 8 | Local Deployment | Smoke test using execute.md Step 5 infrastructure, skip if disabled |
   | 9 | Cumulative Critic Validation | All applicable critics on `main..HEAD` diff, fix loop for failures, max 3 iterations |
   | 10 | Final Report | Per-section verdicts, overall PASS/FAIL |

   Critics table (same as execute stage -- all applicable, parallel).

5. Update the Error Recovery table (line ~507-515) to add Stage 5:
   ```
   | Stage 5 (Test) | Re-run `/test @plan` | Idempotent -- scans everything from scratch, no persistent state |
   ```

6. Update the Quick Reference table (line ~519-528) to add `/test`:
   ```
   | `/test @<plan>` | Dev plan file | Test verification report (PASS/FAIL) | Test results approval (Gate 5) |
   ```

7. Update the Configuration section (line ~390-448) to include `test_stage` in the YAML example.

8. Update the Key Files section (line ~452-503) to include `commands/test.md` in the project structure tree under `commands/`.

**Acceptance Criteria Addressed:** FR-16 (AC implied by comprehensive documentation)

#### Subtasks

**SUBTASK 3.1.1:** Update Pipeline Overview diagram and intro
- Edit the ASCII pipeline flow diagram to include Stage 5 and Gate 5
- Update intro paragraph
- Estimated time: 10 minutes

**SUBTASK 3.1.2:** Add Stage 5 section with workflow detail table
- Add full Stage 5 section after Stage 4
- Include flow diagram, workflow detail table, and critic table
- Follow the pattern of existing stage sections exactly
- Estimated time: 25 minutes

**SUBTASK 3.1.3:** Update Error Recovery, Quick Reference, Configuration, and Key Files sections
- Add Stage 5 row to error recovery table
- Add `/test` row to quick reference commands table
- Add `test_stage` to config YAML example
- Add `test.md` to project structure tree
- Estimated time: 25 minutes

---

### TASK 3.2: Edit README.md to add /test references
**Depends On:** TASK 1.2, TASK 2.1
**Parallel Group:** C
**Complexity:** Simple
**Estimated Time:** 30 minutes
**Required Tests:** Structural validation (verify flow diagram includes Stage 5; verify commands table includes `/test`; verify project structure includes `test.md`; verify quick start section mentions `/test` if appropriate)

**File:** `README.md`
**Action:** EDIT

**Implementation Steps:**

1. Read `README.md` to understand the existing structure: How It Works diagram, installation, quick start, commands table, quality loops, critic agents, project structure, JIRA integration, configuration, requirements.

2. Update the "How It Works" flow diagram (line ~7-10):
   ```
   Requirement  -->  PRD  -->  Dev Plan  -->  JIRA  -->  Code (Ralph Loop)  -->  Test Verification
                 GATE 1     GATE 2      GATE 3a/3b    GATE 4 (per PR)        GATE 5
   ```

3. Update the intro paragraph (line ~12) to mention Stage 5 / `/test`:
   - Add mention that Stage 5 performs test verification and cumulative critic validation.

4. Add `/test` to the Commands table (line ~63-70):
   ```
   | `/test @<plan>` | Run test verification: audit, execute, coverage, CI/CD audit, critic validation |
   ```
   Place it after `/execute` and before `/fullpipeline`.

5. Update the Quick Start section (line ~47-58) to mention `/test` in the individual stage commands:
   ```
   /test @docs/dev_plans/user-auth.md
   ```

6. Update the Project Structure tree (line ~130-169) to include `test.md` under `commands/`.

7. Update the Configuration section (line ~196-206) to mention `test_stage` configuration:
   - Add "Test stage: enabled, coverage thresholds, CI audit behavior, critic validation" to the list.

**Acceptance Criteria Addressed:** FR-17 (AC implied by comprehensive documentation)

#### Subtasks

**SUBTASK 3.2.1:** Update flow diagram and intro paragraph
- Edit the How It Works ASCII diagram to include Stage 5 and Gate 5
- Update intro paragraph to mention test verification
- Estimated time: 10 minutes

**SUBTASK 3.2.2:** Update Commands table, Quick Start, Project Structure, and Configuration
- Add `/test` to commands table
- Add `/test` example to quick start individual stages
- Add `test.md` to project structure tree
- Add `test_stage` to configuration description
- Estimated time: 20 minutes

---

## Requirements Traceability Matrix

| PRD Requirement | Priority | Task(s) | Status |
|----------------|----------|---------|--------|
| FR-1: Create `commands/test.md` | P0 | TASK 1.2 | Planned |
| FR-2: Step 1 (Read inputs) | P0 | TASK 1.2 (SUBTASK 1.2.1) | Planned |
| FR-3: Step 2 (Test Existence Audit) | P0 | TASK 1.2 (SUBTASK 1.2.2) | Planned |
| FR-4: Step 3 (Missing Test Generation) | P0 | TASK 1.2 (SUBTASK 1.2.3) | Planned |
| FR-5: Step 4 (Run All Tests) | P0 | TASK 1.2 (SUBTASK 1.2.4) | Planned |
| FR-6: Step 9 (Critic Validation) | P0 | TASK 1.2 (SUBTASK 1.2.9) | Planned |
| FR-7: Step 10 (Final Report) | P0 | TASK 1.2 (SUBTASK 1.2.10) | Planned |
| FR-8: Edit fullpipeline.md | P0 | TASK 2.1 | Planned |
| FR-9: Edit pipeline-config-template.yaml | P0 | TASK 1.1 | Planned |
| FR-10: `test_stage.enabled` flag | P0 | TASK 1.1 + TASK 1.2 | Planned |
| FR-11: Idempotent execution | P0 | TASK 1.2 | Planned |
| FR-12: Step 5 (Coverage Verification) | P1 | TASK 1.2 (SUBTASK 1.2.5) | Planned |
| FR-13: Step 6 (CI Pipeline Audit) | P1 | TASK 1.2 (SUBTASK 1.2.6) | Planned |
| FR-14: Step 7 (CD Pipeline Audit) | P1 | TASK 1.2 (SUBTASK 1.2.7) | Planned |
| FR-15: Step 8 (Local Deployment Verification) | P1 | TASK 1.2 (SUBTASK 1.2.8) | Planned |
| FR-16: Edit WORKFLOW.md | P1 | TASK 3.1 | Planned |
| FR-17: Edit README.md | P1 | TASK 3.2 | Planned |

## Acceptance Criteria Traceability

| AC | User Story | Task | Subtask |
|----|-----------|------|---------|
| AC 1.1 | US-1 | TASK 1.2 | SUBTASK 1.2.1 |
| AC 1.2 | US-1 | TASK 1.2 | SUBTASK 1.2.2 |
| AC 1.3 | US-1 | TASK 1.2 | SUBTASK 1.2.2 |
| AC 1.4 | US-1 | TASK 1.2 | SUBTASK 1.2.2 |
| AC 1.5 | US-1 | TASK 1.2 | SUBTASK 1.2.2 |
| AC 1.6 | US-1 | TASK 1.2 | SUBTASK 1.2.2 |
| AC 1.7 | US-1 | TASK 1.2 | SUBTASK 1.2.1 |
| AC 1.8 | US-1 | TASK 1.2 | SUBTASK 1.2.1 |
| AC 2.1 | US-2 | TASK 1.2 | SUBTASK 1.2.3 |
| AC 2.2 | US-2 | TASK 1.2 | SUBTASK 1.2.3 |
| AC 2.3 | US-2 | TASK 1.2 | SUBTASK 1.2.3 |
| AC 2.4 | US-2 | TASK 1.2 | SUBTASK 1.2.3 |
| AC 2.5 | US-2 | TASK 1.2 | SUBTASK 1.2.3 |
| AC 3.1 | US-3 | TASK 1.2 | SUBTASK 1.2.4 |
| AC 3.2 | US-3 | TASK 1.2 | SUBTASK 1.2.4 |
| AC 3.3 | US-3 | TASK 1.2 | SUBTASK 1.2.4 |
| AC 3.4 | US-3 | TASK 1.2 | SUBTASK 1.2.4 |
| AC 3.5 | US-3 | TASK 1.2 | SUBTASK 1.2.4 |
| AC 3.6 | US-3 | TASK 1.2 | SUBTASK 1.2.4 |
| AC 3.7 | US-3 | TASK 1.2 | SUBTASK 1.2.4 |
| AC 4.1 | US-4 | TASK 1.2 | SUBTASK 1.2.5 |
| AC 4.2 | US-4 | TASK 1.2 | SUBTASK 1.2.5 |
| AC 4.3 | US-4 | TASK 1.2 | SUBTASK 1.2.5 |
| AC 4.4 | US-4 | TASK 1.2 | SUBTASK 1.2.5 |
| AC 5.1 | US-5 | TASK 1.2 | SUBTASK 1.2.6 |
| AC 5.2 | US-5 | TASK 1.2 | SUBTASK 1.2.6 |
| AC 5.3 | US-5 | TASK 1.2 | SUBTASK 1.2.6 |
| AC 5.4 | US-5 | TASK 1.2 | SUBTASK 1.2.6 |
| AC 5.5 | US-5 | TASK 1.2 | SUBTASK 1.2.6 |
| AC 6.1 | US-6 | TASK 1.2 | SUBTASK 1.2.7 |
| AC 6.2 | US-6 | TASK 1.2 | SUBTASK 1.2.7 |
| AC 6.3 | US-6 | TASK 1.2 | SUBTASK 1.2.7 |
| AC 6.4 | US-6 | TASK 1.2 | SUBTASK 1.2.7 |
| AC 7.1 | US-7 | TASK 1.2 | SUBTASK 1.2.8 |
| AC 7.2 | US-7 | TASK 1.2 | SUBTASK 1.2.8 |
| AC 7.3 | US-7 | TASK 1.2 | SUBTASK 1.2.8 |
| AC 8.1 | US-8 | TASK 1.2 | SUBTASK 1.2.9 |
| AC 8.2 | US-8 | TASK 1.2 | SUBTASK 1.2.9 |
| AC 8.3 | US-8 | TASK 1.2 | SUBTASK 1.2.9 |
| AC 8.4 | US-8 | TASK 1.2 | SUBTASK 1.2.9 |
| AC 9.1 | US-9 | TASK 1.2 | SUBTASK 1.2.10 |
| AC 9.2 | US-9 | TASK 1.2 | SUBTASK 1.2.10 |
| AC 10.1 | US-10 | TASK 1.1 | SUBTASK 1.1.2 |
| AC 10.2 | US-10 | TASK 1.1 | SUBTASK 1.1.2 |
| AC 10.3 | US-10 | TASK 1.1 | SUBTASK 1.1.2 |
| AC 10.4 | US-10 | TASK 1.1 | SUBTASK 1.1.2 |
| AC 10.5 | US-10 | TASK 1.1 | SUBTASK 1.1.2 |
| AC 10.6 | US-10 | TASK 1.1 | SUBTASK 1.1.1 |
| AC 11.1 | US-11 | TASK 2.1 | SUBTASK 2.1.1 |
| AC 11.2 | US-11 | TASK 2.1 | SUBTASK 2.1.2 |
| AC 11.3 | US-11 | TASK 2.1 | SUBTASK 2.1.3 |
| AC 11.4 | US-11 | TASK 2.1 | SUBTASK 2.1.4 |
| AC 11.5 | US-11 | TASK 2.1 | SUBTASK 2.1.5 |
| AC 11.6 | US-11 | TASK 2.1 | SUBTASK 2.1.6 |
| AC 12.1 | US-12 | TASK 2.1 | SUBTASK 2.1.3 |
| AC 12.2 | US-12 | TASK 2.1 | SUBTASK 2.1.5 |
| AC 12.3 | US-12 | TASK 1.2 | SUBTASK 1.2.1 |

## Testing Strategy (from PRD Section 9)

| Test Type | Scope | Task |
|-----------|-------|------|
| Structural validation | Verify `commands/test.md` has all 10 steps, correct headings, required patterns | TASK 1.2 |
| Structural validation | Verify `fullpipeline.md` has Stage 5, Gate 5, updated diagram/state/completion/error recovery | TASK 2.1 |
| YAML validation | Verify `pipeline-config-template.yaml` has valid `test_stage` section with correct defaults | TASK 1.1 |
| YAML validation | Verify `test_commands` has `e2e`, `component` entries | TASK 1.1 |
| YAML validation | Verify `validation.stages` has `test` entry | TASK 1.1 |
| Integration | Verify cross-references between `test.md`, `fullpipeline.md`, config template, `WORKFLOW.md` are consistent | ALL |
| Negative test | Verify `test.md` handles missing `test_stage` section (uses defaults) | TASK 1.2 |
| Negative test | Verify `test.md` handles missing `test_commands.e2e` (skips, reports SKIPPED) | TASK 1.2 |
| Negative test | Verify `fullpipeline.md` handles `test_stage.enabled: false` (skips Stage 5) | TASK 2.1 |
| Edge case | Verify `test.md` handles empty diff (skip Steps 2-5) | TASK 1.2 |
| Edge case | Verify `test.md` handles missing dev plan file (clear error, exit) | TASK 1.2 |
| Edge case | Verify `test.md` handles missing PRD (Warning, continue with patterns only) | TASK 1.2 |

## Non-Functional Requirements Compliance

| NFR | How Addressed |
|-----|--------------|
| NFR-1: Idempotency | TASK 1.2: No persistent state; re-run scans everything from scratch |
| NFR-2: Fresh context | TASK 2.1: `/test` runs as its own subagent in `/fullpipeline` |
| NFR-3: Escalation safety | TASK 1.2: All loops have max iterations and escalate to user |
| NFR-4: Configurability | TASK 1.1 + 1.2: All behavior configurable via `pipeline.config.yaml` with defaults |
| NFR-5: Consistency | TASK 1.2: Follows same patterns as `execute.md` |
| NFR-6: Backward compatibility | TASK 1.1: All config additions are commented-out; existing configs unaffected |
| NFR-7: Error isolation | TASK 1.2: Steps are independent where possible; blocking failures identified |
| NFR-8: Large diff resilience | TASK 1.2: Critics run in parallel with timeout handling |

## Summary

| Metric | Value |
|--------|-------|
| Stories | 3 |
| Tasks | 5 |
| Subtasks | 22 |
| Simple tasks | 2 (TASK 1.1, TASK 3.2) |
| Medium tasks | 2 (TASK 2.1, TASK 3.1) |
| Complex tasks | 1 (TASK 1.2) |
| Parallel Groups | 3 (A, B, C) |
| Estimated Total Time | 5-7 hours |
| Files created | 1 (commands/test.md) |
| Files edited | 4 (fullpipeline.md, pipeline-config-template.yaml, WORKFLOW.md, README.md) |
