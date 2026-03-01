# Dev Plan: /tdd-fullpipeline -- Test-Driven Development Pipeline

**PRD:** `docs/prd/tdd-fullpipeline.md`
**Status:** APPROVED (all 7 critics PASS, iteration 2)
**Date:** 2026-03-01

---

## EPIC: /tdd-fullpipeline -- Test-Driven Development Pipeline

Add a parallel TDD pipeline option (`/tdd-fullpipeline`) that reorders the existing pipeline to write tests before code. The pipeline has 8 stages: PRD, Design Brief, Mock Analysis, Test Plan, Dev Plan, Develop Tests, Develop App, Validate. It introduces 5 new command files, updates the config template, updates documentation, and adds structural tests. The existing `/fullpipeline` is not modified.

---

## STORY 1: TDD Pipeline Config Foundation (US-11)

**As a** pipeline maintainer, **I want** a `tdd` section in the pipeline config template with all TDD-specific settings, **so that** teams can customize TDD behavior per project.

**Acceptance Criteria:** AC 11.1, AC 11.2, AC 11.3, AC 11.4

### TASK 1.1: Add `tdd` config section to pipeline-config-template.yaml
**Depends On:** None
**Parallel Group:** A
**Complexity:** Simple
**Estimated Time:** 30 min
**Files:** `pipeline/templates/pipeline-config-template.yaml`
**Required Tests:**
- **UT:** Structural test verifies `tdd` section exists with `max_mock_routes`, `self_health_gate`, `max_test_adjustment_pct`, `metrics_dir` keys (AC 14.7). Structural test verifies `tdd` section is placed after `test_stage` section (AC 11.2).

**Subtasks:**

1. **SUBTASK 1.1.1:** Read `pipeline/templates/pipeline-config-template.yaml` to understand the existing commented-out section pattern (used by `smoke_test`, `test_stage`, `browser_testing`). Identify the insertion point after the `test_stage` section and before the `paths` section.

2. **SUBTASK 1.1.2:** Add a new commented-out `tdd:` section after `test_stage` with all fields from AC 11.1: `max_mock_routes: 20`, `self_health_gate: true`, `max_test_adjustment_pct: 20`, `metrics_dir: ".pipeline/metrics"`, `tests_branch_pattern: "tdd/{slug}/tests"`. Follow the existing documentation pattern with `#` comments explaining each option and its default value (AC 11.4).

3. **SUBTASK 1.1.3:** Add a `tdd_stages` subsection within the `tdd` section for stage-specific critic overrides, following the same pattern as `validation.stages` (AC 11.3). Include entries for: `design_brief`, `mock_analysis`, `test_plan`, `dev_plan`, `develop_tests`, `develop_app`, `validate` -- each with a `critics` list and `mode: parallel`.

4. **SUBTASK 1.1.4:** Add TDD-specific stage entries to `validation.stages`: `tdd_design_brief`, `tdd_mock_analysis`, `tdd_test_plan`, `tdd_develop_tests`, `tdd_validate` -- each with the full critic list and `mode: parallel`, following the existing entry pattern.

---

## STORY 2: TDD Full Pipeline Orchestrator (US-1, US-2, US-6, US-8, US-9, US-10, US-12)

**As a** developer with a medium or complex feature requirement, **I want** to run `/tdd-fullpipeline <requirement>` and have it orchestrate all 8 stages with gates between each, **so that** I get a fully implemented feature where tests were written and verified before application code.

**Note:** US-6 (Dev Plan with contract negotiation), US-8 (Develop App with test adjustment taxonomy), and US-9 (Validate with traceability and metrics) are covered by this task because Stages 5, 7, and 8 reuse existing commands (`prd2plan.md`, `execute.md`) with TDD-specific extensions embedded in the orchestrator's subagent prompts (per PRD Section 10: "Why no new command files for Stage 5, 7, 8").

**Acceptance Criteria:** AC 1.1 through AC 1.11, AC 2.1 through AC 2.4, AC 6.1 through AC 6.7, AC 8.1 through AC 8.7, AC 9.1 through AC 9.7, AC 10.1 through AC 10.4, AC 12.1, AC 12.2

### TASK 2.1: Create `commands/tdd-fullpipeline.md` orchestrator command file
**Depends On:** TASK 1.1
**Parallel Group:** B
**Complexity:** Complex
**Estimated Time:** 3-4 hrs
**Files:** `commands/tdd-fullpipeline.md` (new file)
**Required Tests:**
- **UT:** Structural test verifies file exists, has 8 stage sections, gates between each stage, orchestrator state with TDD-specific fields (`slug`, `prd_path`, `plan_path`, `brief_path`, `contract_path`, `test_plan_path`, `test_result`, `requirement`, `user_prefs`), error recovery for all 8 stages, and completion report (AC 14.2). Structural test verifies Stage 1 references `req2prd.md` (AC 14.2). Structural test verifies cross-file consistency: references to all TDD stage command files (AC 14.8).

**Subtasks:**

1. **SUBTASK 2.1.1:** Create `commands/tdd-fullpipeline.md` with the command header following the same pattern as `fullpipeline.md`: title (`# /tdd-fullpipeline`), description, input/output spec, and `$ARGUMENTS` reference. Add the Architecture section describing fresh-context subagents at max depth 3 (orchestrator, stage, build/review/critic), matching the `fullpipeline.md` pattern (AC 1.1, AC 1.3).

2. **SUBTASK 2.1.2:** Add the Orchestrator State section listing all variables maintained between gates: `slug`, `prd_path`, `plan_path`, `brief_path`, `contract_path`, `test_plan_path`, `test_result`, `requirement`, `user_prefs` (AC 1.4). Include the architecture diagram showing 8 stages with fresh-context subagents and gates.

3. **SUBTASK 2.1.3:** Add the Pre-Flight Checks section (before Stage 1): slug validation against `^[a-z0-9][a-z0-9_-]{0,63}$` rejecting `/`, `\`, `..`, null bytes (AC 1.7); Playwright pre-flight check running `npx playwright --version` and verifying version >= 1.40 (AC 1.9); idempotent `.gitignore` verification for `.pipeline/tdd/` and `.pipeline/metrics/` entries (AC 1.11); baseline test capture running the project's test command and persisting to `.pipeline/tdd/<slug>/baseline-results.json` with the specified schema (AC 1.8).

4. **SUBTASK 2.1.4:** Add Stage 1 (PRD) section: spawn subagent to execute `${CLAUDE_PLUGIN_ROOT}/commands/req2prd.md` with the requirement text (AC 2.1, AC 2.2, AC 2.3). After PRD generation, add the complexity assessment gate: evaluate scope as Simple/Medium/Complex based on documented criteria (single-file changes, config-only, documentation-only, no UI components, no data flow changes = Simple), recommend `/fullpipeline` for Simple tasks with user override option (AC 10.1, AC 10.2, AC 10.3, AC 10.4). Add Gate 1 with critic scores and user approval (AC 2.4).

5. **SUBTASK 2.1.5:** Add Stage 2 (Design Brief) section: spawn subagent to execute `${CLAUDE_PLUGIN_ROOT}/commands/tdd-design-brief.md` (AC 3.1). Gate 2 is MANUAL -- user builds mock app in Figma AI and provides URL (AC 3.7).

6. **SUBTASK 2.1.6:** Add Stage 3 (Mock Analysis) section: spawn subagent to execute `${CLAUDE_PLUGIN_ROOT}/commands/tdd-mock-analysis.md` with the mock app URL from Gate 2 (AC 4.1). Gate 3 presents extracted contract summary and cross-references against Design Brief (AC 4.10, AC 4.11).

7. **SUBTASK 2.1.7:** Add Stage 4 (Test Plan) section: spawn subagent to execute `${CLAUDE_PLUGIN_ROOT}/commands/tdd-test-plan.md` with PRD path and UI contract path (AC 5.1). Gate 4 presents test plan summary with TP count by tier and contract coverage (AC 5.8).

8. **SUBTASK 2.1.8:** Add Stage 5 (Dev Plan) section: spawn subagent to execute `${CLAUDE_PLUGIN_ROOT}/commands/prd2plan.md` with the PRD path, extended with the test plan path as additional input for TP-{N} mapping (AC 6.1, AC 6.2). After dev plan generation, add the Contract Negotiation Gate: compare dev plan architecture against test plan contracts, flag conflicts, resolve with test plan as authority (AC 6.3, AC 6.4). After resolution, complete Tier 2 specifications with component boundaries from the dev plan (AC 6.5). Run 10-critic Ralph Loop on the dev plan (AC 6.6). Gate 5 presents dev plan summary and conflict resolution log (AC 6.7).

9. **SUBTASK 2.1.9:** Add Stage 6 (Develop Tests) section: spawn subagent to execute `${CLAUDE_PLUGIN_ROOT}/commands/tdd-develop-tests.md` (AC 7.1). Gate 6 presents total test count, red count, fake tests identified (AC 7.8).

10. **SUBTASK 2.1.10:** Add Stage 7 (Develop App) section: spawn subagent to execute `${CLAUDE_PLUGIN_ROOT}/commands/execute.md` with the dev plan path, extended with the test adjustment taxonomy instructions in the subagent prompt (AC 8.1, AC 8.2). Include the test adjustment taxonomy definitions (Structural: auto-approved; Behavioral: QA re-review with TP-{N} citation; Security: immutable) (AC 8.2, AC 8.6). Include the >20% behavioral Tier 1 E2E adjustment threshold halt, configurable via `tdd.max_test_adjustment_pct` (AC 8.3). Include QA Critic audit of test adjustment classifications against the diff -- any change to `expect()` calls, assertion values, or test boundary conditions is flagged as Behavioral regardless of agent self-classification (AC 8.7). Include 10-critic Ralph Loop per task with max 3 iterations per task, escalate to user (AC 8.4). Gate 7 is per-PR approval (AC 8.5).

11. **SUBTASK 2.1.11:** Add Stage 8 (Validate) section: smoke test using `/execute` Step 5 infrastructure (AC 9.1); traceability matrix mapping TP-{N} to test file path and test name to pass/fail, bidirectional, using `{file_path}::{describe/it block path}` as traceability key (AC 9.2); gap flagging for TP-{N} without passing test (AC 9.3); regression check against pre-pipeline baseline from `.pipeline/tdd/<slug>/baseline-results.json` (AC 9.4); 10-critic cumulative validation on `main..HEAD` diff with max 3 iterations, escalate to user (AC 9.5); pipeline metrics emission to `.pipeline/metrics/{slug}.json` with 6 metrics (`red_test_count`, `green_pass_rate`, `test_adjustment_count`, `test_plan_accuracy`, `tdd_cycle_time_seconds`, `security_test_integrity`) using the specified JSON schema with `schema_version: 1` (AC 9.6). Metrics are written only after successful Stage 8 completion; partial runs do NOT overwrite existing metrics; the previous run's file is preserved as `{slug}.prev.json` before overwriting. Gate 8 presents full results and overall verdict (AC 9.7).

12. **SUBTASK 2.1.12:** Add the CI Strategy Documentation section: label-based skip convention for `tdd/{slug}/tests` branches with `tdd-red-tests` label (AC 12.1). Include GitHub Actions workflow snippet examples for conditionally skipping test jobs (AC 12.2).

13. **SUBTASK 2.1.13:** Add the Error Recovery section covering all 8 stages with re-run instructions and artifact-aware resumption (AC 1.5). Add the Pipeline Abort section logging residual artifacts for cleanup (AC 1.10).

14. **SUBTASK 2.1.14:** Add the Completion Report section: all 8 stage results, traceability matrix summary, pipeline metrics summary, test adjustment summary (AC 1.6). Follow the same report table format as `fullpipeline.md`.

---

## STORY 3: Design Brief Generation (US-3)

**As a** developer running `/tdd-fullpipeline`, **I want** Stage 2 to generate a Design Brief from the approved PRD, **so that** a working mock app is built from structured functional requirements.

**Acceptance Criteria:** AC 3.1 through AC 3.7

### TASK 3.1: Create `commands/tdd-design-brief.md` command file
**Depends On:** TASK 1.1
**Parallel Group:** B
**Complexity:** Medium
**Estimated Time:** 1.5 hrs
**Files:** `commands/tdd-design-brief.md` (new file)
**Required Tests:**
- **UT:** Structural test verifies file exists, references the PRD, outputs to `docs/tdd/<slug>/design-brief.md`, includes Mock App Requirements section, and runs critic review (AC 14.3).

**Subtasks:**

1. **SUBTASK 3.1.1:** Create `commands/tdd-design-brief.md` with the command header following the existing command pattern: title (`# /tdd-design-brief`), role description, input/output spec (input: PRD path; output: `docs/tdd/<slug>/design-brief.md`). Reference `$ARGUMENTS` for the PRD path.

2. **SUBTASK 3.1.2:** Add Step 1 (Read Inputs): read the approved PRD, read `pipeline.config.yaml` for TDD config settings.

3. **SUBTASK 3.1.3:** Add Step 2 (Extract Functional Requirements): extract from the PRD: route manifest listing all expected routes with paths and descriptions, user flows with step-by-step entry/exit points, component inventory (name, purpose, data inputs, interactive elements), data shapes (fields, types, validation rules, example values), responsive requirements (mobile/tablet/desktop behavior), accessibility requirements (WCAG 2.1 AA, keyboard nav, screen reader expectations) (AC 3.2).

4. **SUBTASK 3.1.4:** Add Step 3 (Generate Design Brief): produce the Design Brief document. Include explicit instruction that the brief does NOT prescribe layouts, colors, spacing, typography, or visual hierarchy (AC 3.3). Include the "Mock App Requirements" section specifying the mock must be functional, navigable, with all routes, interactive elements, and form validation implemented (AC 3.5).

5. **SUBTASK 3.1.5:** Add Step 4 (Critic Review): 10-critic Ralph Loop (all applicable critics) reviewing the Design Brief for completeness, accuracy, and no visual prescriptions. Max 5 iterations, 0 Critical + 0 Warnings pass condition (AC 3.6). Follow the same critic invocation pattern as `prd2plan.md` Step 5.

6. **SUBTASK 3.1.6:** Add Step 5 (Write Output): save to `docs/tdd/<slug>/design-brief.md`, creating the `docs/tdd/<slug>/` directory if needed (AC 3.4).

7. **SUBTASK 3.1.7:** Add Step 6 (Human Gate): Gate 2 is MANUAL -- present the Design Brief summary to the user, instruct them to build the mock app in Figma AI, deploy or run locally, and provide the mock app URL (AC 3.7). The orchestrator receives the URL for Stage 3.

---

## STORY 4: Mock Analysis and UI Contract Extraction (US-4)

**As a** developer running `/tdd-fullpipeline`, **I want** Stage 3 to crawl the working mock app with Playwright and extract a structured UI contract, **so that** tests can be written against the real DOM structure.

**Acceptance Criteria:** AC 4.1 through AC 4.12

### TASK 4.1: Create `commands/tdd-mock-analysis.md` command file
**Depends On:** TASK 1.1
**Parallel Group:** B
**Complexity:** Complex
**Estimated Time:** 2.5 hrs
**Files:** `commands/tdd-mock-analysis.md` (new file)
**Required Tests:**
- **UT:** Structural test verifies file exists, references Playwright, 3 viewport widths (375, 768, 1280), outputs to `docs/tdd/<slug>/ui-contract.md`, and extracts DOM structure, ARIA roles, and data-testid candidates (AC 14.4).

**Subtasks:**

1. **SUBTASK 4.1.1:** Create `commands/tdd-mock-analysis.md` with the command header: title (`# /tdd-mock-analysis`), role description, input/output spec (input: mock app URL; output: `docs/tdd/<slug>/ui-contract.md` and screenshots to `.pipeline/tdd/<slug>/mock-screenshots/`). Reference `$ARGUMENTS` for the mock app URL.

2. **SUBTASK 4.1.2:** Add Step 1 (Validate Input): validate the mock app URL uses `http://` or `https://` scheme only. Reject `file://`, `data:`, `javascript:`, and private network ranges (RFC 1918) outside of loopback. Accepted loopback addresses: `localhost`, `127.0.0.0/8`, `::1`, `0.0.0.0`. All other RFC 1918 ranges rejected. No port restriction. Define the 15-second per-route navigation timeout and 300-second total budget (AC 4.2, NFR-7).

3. **SUBTASK 4.1.3:** Add Step 2 (Playwright Version Check): verify Playwright version >= 1.40 at Stage 3 start. If below minimum, halt with error message including required version. Read `tdd.max_mock_routes` from config (default: 20).

4. **SUBTASK 4.1.4:** Add Step 3 (Route Discovery): navigate to entry page, discover routes via link traversal capped at `max_mock_routes`. If entry page fails to load, report Critical error and halt. If individual routes fail, log Warning and continue (AC 4.3, NFR-6).

5. **SUBTASK 4.1.5:** Add Step 4 (Per-Route Extraction): for each route, capture screenshots at 3 viewports (mobile 375x812, tablet 768x1024, desktop 1280x720) saving to `.pipeline/tdd/<slug>/mock-screenshots/` (AC 4.4, AC 4.8). Extract: DOM structure (component tree, nesting depth), interactive elements (buttons, links, inputs, selects, textareas), form fields (name, type, required, validation), ARIA roles and labels, tab order and focus management, data-testid candidates using kebab-case convention with fallback `{element-type}-{sequential-index}` (AC 4.5).

6. **SUBTASK 4.1.6:** Add Step 5 (Keyboard Navigation Testing): tab through all interactive elements, verify focus visibility, test Enter/Space activation. Share the per-route budget; partial results with Warning if budget exceeded (AC 4.6, NFR-7).

7. **SUBTASK 4.1.7:** Add Step 6 (Generate UI Contract): produce structured document with sections: Route Map, Component Inventory, Interactive Elements, Form Contracts, Accessibility Map, Data-Testid Registry, Screenshots (paths). Enforce 50,000 character limit -- truncate lowest-priority routes from the end with Warning noting count of routes dropped (AC 4.7, AC 4.12).

8. **SUBTASK 4.1.8:** Add Step 7 (Critic Review): 10-critic Ralph Loop on the UI contract (max 5 iterations, 0 Critical + 0 Warnings) (AC 4.9).

9. **SUBTASK 4.1.9:** Add Step 8 (Human Gate): Gate 3 presents extracted contract summary. Cross-reference against Design Brief route manifest and component inventory -- flag missing routes and missing interactive elements as Warnings (AC 4.10, AC 4.11). User can correct misidentified elements or missing routes before proceeding.

---

## STORY 5: Test Plan Generation (US-5)

**As a** developer running `/tdd-fullpipeline`, **I want** Stage 4 to generate a comprehensive test plan from the PRD and UI contract, **so that** every testable requirement has a traceable test specification before any code is written.

**Acceptance Criteria:** AC 5.1 through AC 5.9

### TASK 5.1: Create `commands/tdd-test-plan.md` command file
**Depends On:** TASK 1.1
**Parallel Group:** B
**Complexity:** Medium
**Estimated Time:** 2 hrs
**Files:** `commands/tdd-test-plan.md` (new file)
**Required Tests:**
- **UT:** Structural test verifies file exists, references TP-{N} traceability IDs, includes Performance Contracts / Accessibility Contracts / Error Contracts / Data Flow Contracts sections, and outputs tiered specifications (AC 14.5).

**Subtasks:**

1. **SUBTASK 5.1.1:** Create `commands/tdd-test-plan.md` with the command header: title (`# /tdd-test-plan`), role description, input/output spec (input: PRD path + UI contract path + schema files; output: `docs/tdd/<slug>/test-plan.md`). Reference `$ARGUMENTS` for the PRD path.

2. **SUBTASK 5.1.2:** Add Step 1 (Read Inputs): read the PRD, the UI contract from `docs/tdd/<slug>/ui-contract.md`, and any schema files referenced in the PRD (AC 5.2).

3. **SUBTASK 5.1.3:** Add Step 2 (Generate Tiered Test Specifications): produce two tiers. Tier 1 (E2E/Playwright): full specifications from PRD + UI contract with complete test steps, selectors from data-testid registry, expected outcomes, assertions. Tier 2 (integration/unit): specification outlines only with TP-{N} ID, tier label (`Tier 2`), linked PRD requirement (AC reference), test intent description, and expected test type (integration or unit) (AC 5.3, AC 5.9). Every test item gets a unique `TP-{N}` traceability ID (AC 5.4).

4. **SUBTASK 5.1.4:** Add Step 3 (Mandatory Contract Sections): include four mandatory sections -- Performance Contracts (response times, rendering budgets), Accessibility Contracts (WCAG 2.1 AA, keyboard nav, screen reader), Error Contracts (error states, validation messages, fallbacks), Data Flow Contracts (data shapes, transformations, validation) (AC 5.5).

5. **SUBTASK 5.1.5:** Add Step 4 (Critic Review): 10-critic Ralph Loop on the test plan (max 5 iterations, 0 Critical + 0 Warnings) (AC 5.7).

6. **SUBTASK 5.1.6:** Add Step 5 (Write Output): save to `docs/tdd/<slug>/test-plan.md` (AC 5.6).

7. **SUBTASK 5.1.7:** Add Step 6 (Human Gate): Gate 4 presents test plan summary -- TP count by tier, contract coverage summary, traceability overview (AC 5.8).

---

## STORY 6: Tiered Test Development and Self-Health Gate (US-7)

**As a** developer running `/tdd-fullpipeline`, **I want** Stage 6 to develop Tier 1 E2E tests with a self-health gate verifying all tests fail before any app code exists, **so that** every test is proven to detect the absence of the feature it validates.

**Acceptance Criteria:** AC 7.1 through AC 7.10, AC 12.3

### TASK 6.1: Create `commands/tdd-develop-tests.md` command file
**Depends On:** TASK 1.1
**Parallel Group:** B
**Complexity:** Complex
**Estimated Time:** 2.5 hrs
**Files:** `commands/tdd-develop-tests.md` (new file)
**Required Tests:**
- **UT:** Structural test verifies file exists, references self-health gate (`red_count = total_test_count`), tiered development (Tier 1 / Tier 2), and blind agent context restrictions (AC 14.6).

**Subtasks:**

1. **SUBTASK 6.1.1:** Create `commands/tdd-develop-tests.md` with the command header: title (`# /tdd-develop-tests`), role description, input/output spec (input: PRD path + UI contract path + test plan path + schema files; output: Tier 1 E2E test files committed to `tdd/{slug}/tests` branch).

2. **SUBTASK 6.1.2:** Add Step 1 (Read Inputs): read the PRD, UI contract, schema files, and test plan. Explicitly state that the dev plan is NOT read and application code is NOT accessed -- this is the blind agent constraint (AC 7.2, NFR-4).

3. **SUBTASK 6.1.3:** Add Step 2 (Develop Tier 1 E2E Tests): for each Tier 1 specification in the test plan, generate Playwright E2E test code. Each test maps to a `TP-{N}` traceability ID via a code comment (e.g., `// TP-42: Verify login form submits correctly`) (AC 7.4). Use selectors from the UI contract data-testid registry. Tests must assert behavior that requires application code to pass.

4. **SUBTASK 6.1.4:** Add Step 3 (Critic Review): 10-critic Ralph Loop on the test code (max 5 iterations, 0 Critical + 0 Warnings) (AC 7.5). QA Critic specifically validates that tests assert real behavior, not trivial conditions.

5. **SUBTASK 6.1.5:** Add Step 4 (Self-Health Gate): run all tests and verify `red_count = total_test_count`. A test is "passing" if it exits with code 0 and evaluates at least one assertion. Tests with code 0 but no assertions are flagged as fake tests (AC 7.6, AC 7.7). Define the Security test auto-classification: tests matching keywords (`auth`, `login`, `logout`, `permission`, `role`, `csrf`, `xss`, `injection`, `sanitize`, `authorization`, `token`, `session`, `cors`, `encrypt`, `certificate`, `rate-limit`) or in `security/` / `__tests__/security/` directories are classified as Security tier (AC 8.6).

6. **SUBTASK 6.1.6:** Add Step 5 (Self-Health Fix Loop): if any tests pass without app code, send failing (green) tests to a fix subagent. Re-run self-health gate after fixes. Maximum 3 fix iterations, then escalate to user with a list of fake tests (AC 7.10).

7. **SUBTASK 6.1.7:** Add Step 6 (Commit and Branch): commit tests to the branch pattern defined in `tdd.tests_branch_pattern` from config (default: `tdd/{slug}/tests`) (AC 7.9). Apply `tdd-red-tests` label when creating the branch/PR (AC 12.3). Document that Tier 2 integration/unit tests are developed in Stage 7 alongside application code (AC 7.3).

8. **SUBTASK 6.1.8:** Add Step 7 (Human Gate): Gate 6 presents total test count, red count, any fake tests identified, Security test classification summary (AC 7.8).

---

## STORY 7: Documentation Updates (US-13)

**As a** pipeline user or maintainer, **I want** WORKFLOW.md and README.md updated to describe the TDD pipeline option, **so that** I can discover and understand the TDD pipeline alongside the existing pipeline.

**Acceptance Criteria:** AC 13.1 through AC 13.4

### TASK 7.1: Update WORKFLOW.md with TDD pipeline section
**Depends On:** TASK 2.1, TASK 3.1, TASK 4.1, TASK 5.1, TASK 6.1
**Parallel Group:** C
**Complexity:** Medium
**Estimated Time:** 1.5 hrs
**Files:** `WORKFLOW.md`
**Required Tests:**
- **UT:** Structural test verifies WORKFLOW.md includes a TDD pipeline section (AC 14.2 cross-reference).

**Subtasks:**

1. **SUBTASK 7.1.1:** Add a new major section to WORKFLOW.md positioned after the existing `/fullpipeline` stages section (after Stage 5 / `/test`): `## TDD Pipeline — /tdd-fullpipeline`. Include the 8-stage flow diagram matching the existing ASCII art style (AC 13.1).

2. **SUBTASK 7.1.2:** Add workflow detail tables for each TDD-specific stage: Stage 2 (Design Brief), Stage 3 (Mock Analysis), Stage 4 (Test Plan), Stage 6 (Develop Tests). Each table matches the format of existing stages (Step | Action | Details) (AC 13.2). For reused stages (1, 5, 7, 8), reference the existing stage descriptions with TDD-specific modifications noted.

3. **SUBTASK 7.1.3:** Update the Quick Reference table at the top of WORKFLOW.md to include `/tdd-fullpipeline` with: Input (`<requirement>`), Output (fully implemented feature with TDD), Human Gates (Gate 1-8, with Gate 2 as MANUAL) (AC 13.3).

### TASK 7.2: Update README.md commands table
**Depends On:** TASK 2.1
**Parallel Group:** C
**Complexity:** Simple
**Estimated Time:** 20 min
**Files:** `README.md`
**Required Tests:**
- **UT:** Structural test verifies README.md includes `/tdd-fullpipeline` (AC 14.8 cross-reference).

**Subtasks:**

1. **SUBTASK 7.2.1:** Add `/tdd-fullpipeline <requirement>` to the Commands table in README.md with description: "Run TDD pipeline: PRD, Design Brief, Mock Analysis, Test Plan, Dev Plan, Develop Tests, Develop App, Validate" (AC 13.4).

2. **SUBTASK 7.2.2:** Add a brief TDD pipeline section under the "How It Works" section showing the 8-stage flow diagram.

---

## STORY 8: Structural Validation Tests (US-14)

**As a** pipeline maintainer, **I want** structural validation tests that verify TDD pipeline command files contain required content, **so that** accidental regressions are caught by CI.

**Acceptance Criteria:** AC 14.1 through AC 14.8

### TASK 8.1: Create `test/tdd-pipeline-structure.test.js`
**Depends On:** TASK 2.1, TASK 3.1, TASK 4.1, TASK 5.1, TASK 6.1, TASK 1.1
**Parallel Group:** D
**Complexity:** Medium
**Estimated Time:** 1.5 hrs
**Files:** `test/tdd-pipeline-structure.test.js` (new file)
**Required Tests:**
- **UT:** The tests themselves validate the assertions pass when run with `node --test test/tdd-pipeline-structure.test.js`.

**Subtasks:**

1. **SUBTASK 8.1.1:** Create `test/tdd-pipeline-structure.test.js` following the same pattern as `test/test-stage-structure.test.js`: ESM imports (`node:test`, `node:assert/strict`, `fs`, `path`, `url`), `ROOT` resolution, file loading for all TDD command files and config template (AC 14.1).

2. **SUBTASK 8.1.2:** Add `describe('commands/tdd-fullpipeline.md structure')` block with tests: file starts with `# /tdd-fullpipeline`, has all 8 stage sections (`## Stage 1:` through `## Stage 8:`), has gates (`### GATE 1` through `### GATE 8`), has orchestrator state with TDD-specific fields (`brief_path`, `contract_path`, `test_plan_path`), has error recovery section covering all 8 stages, has completion report section (AC 14.2).

3. **SUBTASK 8.1.3:** Add `describe('commands/tdd-design-brief.md structure')` block with tests: file exists, references the PRD, outputs to `docs/tdd/<slug>/design-brief.md`, has "Mock App Requirements" section, has critic review step (AC 14.3).

4. **SUBTASK 8.1.4:** Add `describe('commands/tdd-mock-analysis.md structure')` block with tests: file exists, references Playwright, references 3 viewport widths (375, 768, 1280), outputs to `docs/tdd/<slug>/ui-contract.md`, extracts DOM structure, references ARIA roles, references data-testid (AC 14.4).

5. **SUBTASK 8.1.5:** Add `describe('commands/tdd-test-plan.md structure')` block with tests: file exists, references `TP-{N}` or `TP-` traceability IDs, has "Performance Contracts" section, has "Accessibility Contracts" section, has "Error Contracts" section, has "Data Flow Contracts" section, references tiered specifications (Tier 1 / Tier 2) (AC 14.5).

6. **SUBTASK 8.1.6:** Add `describe('commands/tdd-develop-tests.md structure')` block with tests: file exists, references self-health gate (`red_count = total_test_count` or `red_count`), references "Tier 1" and "Tier 2", references blind agent or context restriction (no dev plan access) (AC 14.6).

7. **SUBTASK 8.1.7:** Add `describe('pipeline-config-template.yaml -- tdd section')` block with tests: config template contains `tdd` section references (`max_mock_routes`, `self_health_gate`, `max_test_adjustment_pct`, `metrics_dir`) (AC 14.7).

8. **SUBTASK 8.1.8:** Add `describe('cross-file consistency')` block with tests: `tdd-fullpipeline.md` references `tdd-design-brief.md`, `tdd-mock-analysis.md`, `tdd-test-plan.md`, `tdd-develop-tests.md`; config keys referenced in command files match config template entries (AC 14.8).

---

## Dependency Graph

```
Group A (no dependencies -- start here):
  TASK 1.1: Config template changes (foundation)

Group B (depends on TASK 1.1):
  TASK 2.1: tdd-fullpipeline.md orchestrator
  TASK 3.1: tdd-design-brief.md command file
  TASK 4.1: tdd-mock-analysis.md command file
  TASK 5.1: tdd-test-plan.md command file
  TASK 6.1: tdd-develop-tests.md command file

Group C (depends on TASK 2.1, TASK 3.1, TASK 4.1, TASK 5.1, TASK 6.1):
  TASK 7.1: WORKFLOW.md updates
  TASK 7.2: README.md updates

Group D (depends on TASK 2.1, TASK 3.1, TASK 4.1, TASK 5.1, TASK 6.1, TASK 1.1):
  TASK 8.1: Structural validation tests
```

```
TASK 1.1 ──┬──> TASK 2.1 ──────────────────┬──> TASK 7.1 (WORKFLOW.md)
            │                                │
            ├──> TASK 3.1 ──────────────────┤──> TASK 7.2 (README.md)
            │                                │
            ├──> TASK 4.1 ──────────────────┤
            │                                │
            ├──> TASK 5.1 ──────────────────┤
            │                                │
            └──> TASK 6.1 ──────────────────┴──> TASK 8.1 (Tests)
```

---

## Cross-Cutting Concerns

### NFR-3 Isolation: Existing Pipeline Unchanged
Every change in this plan is additive. No existing command file (`fullpipeline.md`, `execute.md`, `test.md`, `req2prd.md`, `prd2plan.md`, `plan2jira.md`, `validate.md`, `pipeline-init.md`, `ask.md`) is modified. No existing critic persona file is modified. The config template receives only an additive `tdd` section. WORKFLOW.md and README.md receive only additive sections. After implementation, verify `/fullpipeline` works identically.

### NFR-1 & NFR-2: Command Pattern Consistency
All new TDD command files (`tdd-fullpipeline.md`, `tdd-design-brief.md`, `tdd-mock-analysis.md`, `tdd-test-plan.md`, `tdd-develop-tests.md`) must follow the same `.md` command pattern as existing files: heading structure, subagent prompts with `Task tool` references, critic invocation via Ralph Loop, human gates, and fresh-context subagent architecture.

### NFR-9: Artifact Namespacing
All TDD-specific artifacts are namespaced: `docs/tdd/<slug>/` for documents (design-brief.md, ui-contract.md, test-plan.md), `.pipeline/tdd/<slug>/` for screenshots and baseline results, `.pipeline/metrics/{slug}.json` for pipeline metrics. These paths must not collide with standard pipeline artifact paths.

### NFR-14: Gitignore Hygiene
The orchestrator's pre-flight check (TASK 2.1, SUBTASK 2.1.3) ensures `.pipeline/tdd/` and `.pipeline/metrics/` are in `.gitignore`. This is verified before any artifacts are created.

---

## Summary

| Metric | Value |
|--------|-------|
| Stories | 8 |
| Tasks | 9 |
| Simple | 2 (TASK 1.1, TASK 7.2) |
| Medium | 4 (TASK 3.1, TASK 5.1, TASK 7.1, TASK 8.1) |
| Complex | 3 (TASK 2.1, TASK 4.1, TASK 6.1) |
| Parallel Groups | 4 (A, B, C, D) |
| Estimated Total Time | ~15.5 hrs |

---

## Priority Mapping

| Priority | Tasks |
|----------|-------|
| P0 (Must Have) | TASK 1.1, TASK 2.1, TASK 3.1, TASK 4.1, TASK 5.1, TASK 6.1 |
| P1 (Should Have) | TASK 7.1, TASK 7.2, TASK 8.1 |
