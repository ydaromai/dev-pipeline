# /tdd-develop-tests — Develop Tier 1 E2E Tests (Blind Agent)

You are executing the **tdd-develop-tests** pipeline stage. This is Stage 6 of the `/tdd-fullpipeline`. You develop Tier 1 E2E Playwright tests from the PRD, UI contract, and test plan -- without access to the dev plan or any application code. This is the blind agent constraint: tests are written against requirements and the real UI contract, not against implementation details.

**Input:** PRD path + UI contract path + test plan path + schema files (via orchestrator state)
**Output:** Tier 1 E2E test files committed to `tdd/{slug}/tests` branch

---

## Step 1: Read Inputs

Read the following artifacts:

1. **PRD:** Read the approved PRD from `docs/prd/<slug>.md` (AC 7.2)
2. **UI Contract:** Read the UI contract from `docs/tdd/<slug>/ui-contract.md` -- this contains the data-testid registry, route map, component inventory, interactive elements, form contracts, and accessibility map extracted from the working mock app (AC 7.2)
3. **Schema Files:** Read any schema files referenced in the PRD (e.g., Zod schemas, JSON schemas, TypeScript interfaces) (AC 7.2)
4. **Test Plan:** Read the test plan from `docs/tdd/<slug>/test-plan.md` -- this contains all `TP-{N}` specifications. Focus on **Tier 1 (E2E/Playwright)** specifications which have full test steps, selectors, expected outcomes, and assertions (AC 7.2)
5. **Pipeline Config:** Read `pipeline.config.yaml` for TDD-specific settings (`tdd.self_health_gate`, `tdd.tests_branch_pattern`)

**BLIND AGENT CONSTRAINT (NFR-4):** The dev plan is NOT read. Application code is NOT accessed. Do NOT read `docs/dev_plans/<slug>.md`. Do NOT read any source files under `src/`, `app/`, `lib/`, `components/`, or any application code directories. The subagent prompt must NOT reference the dev plan path or any application code paths. This structural isolation ensures E2E tests validate requirements, not implementation. Tier 2 integration/unit tests are developed later in Stage 7 alongside application code (AC 7.3).

---

## Step 2: Develop Tier 1 E2E Tests

For each **Tier 1** specification in the test plan, generate Playwright E2E test code.

### 2a. Test File Organization

Organize test files by feature area or route, following the project's test conventions:
- Place E2E tests in the project's E2E test directory (e.g., `e2e/`, `tests/e2e/`, or as configured in `pipeline.config.yaml`)
- Use descriptive file names matching the feature being tested (e.g., `login-form.spec.ts`, `supplier-dashboard.spec.ts`)
- Group related test specifications into logical `describe` blocks

### 2b. Test Code Generation

For each Tier 1 test specification (`TP-{N}`):

1. **Traceability comment:** Begin each test with a code comment mapping to its `TP-{N}` traceability ID (AC 7.4):
   ```typescript
   // TP-42: Verify login form submits credentials and redirects to dashboard
   ```

2. **Selectors from UI contract:** Use `data-testid` selectors from the UI contract's Data-Testid Registry. Do NOT invent selectors -- use only those documented in the UI contract (AC 7.2):
   ```typescript
   await page.locator('[data-testid="login-submit-button"]').click();
   ```

3. **Assertions that require app code:** Every test MUST assert behavior that requires application code to pass (AC 7.6). Tests must:
   - Navigate to real routes from the Route Map
   - Interact with elements using selectors from the Data-Testid Registry
   - Assert expected outcomes (visible text, navigation, state changes, form validation messages, ARIA attributes)
   - NOT use guard clauses like `if (count > 0)` that silently pass when elements are missing
   - NOT call schema functions directly without rendering components
   - NOT assert trivially true conditions (e.g., `expect(true).toBe(true)`)

4. **Playwright best practices:**
   - Use `page.goto()` with routes from the UI contract Route Map
   - Use `await expect(locator).toBeVisible()` for element presence assertions
   - Use `await expect(page).toHaveURL()` for navigation assertions
   - Use `page.fill()`, `page.click()`, `page.selectOption()` for interactions from Form Contracts
   - Include proper `beforeEach` / `afterEach` hooks for test setup and teardown
   - Respect accessibility map: include keyboard navigation tests where specified

5. **Contract sections coverage:** Ensure tests cover all four mandatory contract sections from the test plan:
   - **Performance Contracts:** Response time and rendering budget assertions using Playwright's built-in timing
   - **Accessibility Contracts:** WCAG 2.1 AA assertions, keyboard navigation, ARIA role validation
   - **Error Contracts:** Error state rendering, validation message display, fallback behavior
   - **Data Flow Contracts:** Data shape validation through UI rendering, form submission flows

### 2c. Tier 2 Documentation Note

Tier 2 integration/unit tests are NOT developed in this stage. They are specification outlines only in the test plan. Full Tier 2 test code is developed in Stage 7 (Develop App) alongside application code, where the dev plan's component boundaries and internal architecture are available (AC 7.3).

---

## Step 3: Critic Review (10-Critic Ralph Loop)

Spawn all applicable critic subagents in parallel using the Task tool. Each critic reviews the generated test code from their domain perspective.

Read `pipeline.config.yaml` for the critic list. Default: `[product, dev, devops, qa, security, performance, data-integrity]` + conditional critics based on project flags.

**Subagent prompt (per critic):**
```
You are the [ROLE] Critic. Read your persona:
<paste ${CLAUDE_PLUGIN_ROOT}/pipeline/agents/[role]-critic.md>

You are reviewing Tier 1 E2E Playwright test code generated for the TDD pipeline.
These tests were written by a blind agent with NO access to the dev plan or application code.

Review the following test files:
<paste test file contents>

Against the test plan specifications:
<paste relevant TP-{N} specifications>

And the UI contract:
<paste relevant UI contract sections>

Produce your structured output. Include:
1. Verdict (PASS/FAIL)
2. Findings (Critical/Warnings/Notes)
```

**QA Critic special instruction:** The QA Critic specifically validates that tests assert real behavior, not trivial conditions (AC 7.5). Flag as Critical:
- Tests with no `expect()` calls
- Tests that assert trivially true conditions
- Tests with guard clauses that skip assertions when elements are not found
- Tests that test schema logic without rendering components
- Tests that do not require application code to pass

**Security Critic special instruction:** The Security Critic validates Security-tier test classification coverage (AC 8.6). Verify that all tests matching the Security auto-classification criteria (see Step 4) are correctly identified.

**Pass condition:** 0 Critical findings + 0 Warnings across all critics.
**Max iterations:** 5 Ralph Loop cycles.
**Iteration pattern:** If any critic returns FAIL, collect all Critical findings, spawn a new build subagent (fresh context) to fix the issues, then re-run only the previously failed critics. Repeat until pass condition is met or max iterations reached.

If still failing after 5 iterations, escalate to user with all remaining Critical findings.

---

## Step 4: Self-Health Gate

After critic review passes, run all generated tests to verify the self-health invariant: every test must fail (red) because no application code exists yet.

### 4a. Run All Tests

Execute the test suite:
```bash
npx playwright test <test-files> --reporter=json
```

Parse the JSON reporter output to extract per-test results.

### 4b. Classify Results

For each test, determine its status:

- **RED (expected):** Test exits with non-zero code OR exits with code 0 but has at least one failing assertion. This is the expected state.
- **PASSING (unexpected -- fake test):** Test exits with code 0 AND evaluates at least one assertion successfully. This means the test does not actually require application code -- it is a fake test (AC 7.6, AC 7.7).
- **ZERO-ASSERTION (fake test):** Test exits with code 0 but contains no assertion evaluations. A test with no assertions is a fake test regardless of exit code -- it proves nothing.

### 4c. Self-Health Invariant

Verify: `red_count = total_test_count` (AC 7.6)

- `total_test_count`: Total number of individual test cases (each `it()` / `test()` block)
- `red_count`: Number of tests that are RED (failed as expected)
- `fake_test_count`: Number of tests that are PASSING or ZERO-ASSERTION

If `red_count = total_test_count`, the self-health gate PASSES. Proceed to Step 6.
If `red_count < total_test_count`, the self-health gate FAILS. Proceed to Step 5.

### 4d. Security Test Auto-Classification

Classify tests as Security tier using the following criteria (AC 8.6):

**Keyword match** -- test description or test name contains any of:
`auth`, `login`, `logout`, `permission`, `role`, `csrf`, `xss`, `injection`, `sanitize`, `authorization`, `token`, `session`, `cors`, `encrypt`, `certificate`, `rate-limit`

**Directory path match** -- test file is located under:
`security/` or `__tests__/security/`

Automatic classification overrides any manual classification. Record the Security classification summary:
```
Security Tests: N total
  - By keyword match: X
  - By directory path: Y
  - Keywords matched: [list of matched keywords per test]
```

This classification is used in Stage 7 to enforce the immutable Security tier in the test adjustment taxonomy.

---

## Step 5: Self-Health Fix Loop

If the self-health gate fails (any tests pass without application code), enter the fix loop.

### 5a. Identify Fake Tests

Collect all tests classified as PASSING or ZERO-ASSERTION from Step 4b. For each fake test, document:
- Test file path and test name
- `TP-{N}` traceability ID
- Reason for being fake (passed with assertions, or had zero assertions)

### 5b. Fix Subagent

Spawn a fix subagent (Task tool, fresh context) to correct the fake tests:

**Fix subagent prompt:**
```
You are fixing fake tests in the TDD pipeline self-health gate.

## Problem
The following tests PASSED without any application code existing. In TDD, all tests
must FAIL (red) before app code is written. A passing test means it does not actually
test the feature it claims to test.

## Fake Tests
<list each fake test with file path, test name, TP-{N}, and reason>

## Constraints
- You have access to: PRD, UI contract, test plan, schema files
- You do NOT have access to: dev plan, application code (blind agent constraint)
- Each test must assert behavior that REQUIRES application code to pass
- Do NOT use guard clauses (if/else) that skip assertions
- Do NOT assert trivially true conditions
- Every test must have at least one meaningful expect() call

## UI Contract Reference
<paste Data-Testid Registry and relevant sections>

## Instructions
1. Read each fake test
2. Rewrite assertions to require real application behavior:
   - Navigate to actual routes that do not exist yet
   - Assert elements by data-testid that do not exist yet
   - Assert text content that application code must render
   - Assert navigation that application routing must handle
3. Run the test to confirm it now FAILS (red)
4. Report what you changed for each test
```

### 5c. Re-run Self-Health Gate

After fixes, re-run all tests (Step 4a-4c). If `red_count = total_test_count`, proceed to Step 6.

### 5d. Iteration Limit

Maximum **3 fix iterations**. If the self-health gate still fails after 3 fix iterations, escalate to the user:

```
## Self-Health Gate -- Escalation Required

After 3 fix iterations, the following tests still pass without application code:

| Test File | Test Name | TP-{N} | Reason |
|-----------|-----------|--------|--------|
| <path>    | <name>    | TP-X   | <reason> |

These are fake tests that do not validate real behavior.

Options:
1. Fix manually -- edit the tests and I will re-run the self-health gate
2. Remove -- delete the fake tests (their TP-{N} items become gaps in traceability)
3. Override -- proceed with fake tests flagged as Critical (NOT recommended)
4. Abort -- stop the pipeline
```

---

## Step 6: Commit and Branch

After the self-health gate passes (all tests are red):

### 6a. Create Branch

Create or checkout the test branch using the pattern from `tdd.tests_branch_pattern` in `pipeline.config.yaml` (default: `tdd/{slug}/tests`) (AC 7.9):

```bash
git checkout -b tdd/<slug>/tests
```

### 6b. Stage and Commit

Stage all generated test files and commit:

```bash
git add <test-files>
git commit -m "test(tdd): add Tier 1 E2E tests for <slug>

- <total_test_count> Tier 1 E2E Playwright tests
- All tests verified RED (self-health gate passed)
- TP-{N} traceability IDs in code comments
- Security tests classified: <security_count>
- Tier 2 integration/unit tests deferred to Stage 7

Stage 6 of /tdd-fullpipeline"
```

### 6c. Push and Label

Push the branch and apply the `tdd-red-tests` label (AC 12.3):

```bash
git push -u origin tdd/<slug>/tests
```

If creating a PR for CI visibility:
```bash
gh pr create \
  --title "test(tdd): Tier 1 E2E tests for <slug> [DO NOT MERGE]" \
  --body "Red tests for TDD pipeline. All tests are intentionally failing.
These tests will turn green after Stage 7 (Develop App) completes." \
  --label "tdd-red-tests"
```

The `tdd-red-tests` label signals CI that test failures on this branch are expected and should be skipped (AC 12.3). See the CI Strategy Documentation in `tdd-fullpipeline.md` for GitHub Actions workflow examples (AC 12.1, AC 12.2).

### 6d. Tier 2 Note

Tier 2 integration/unit tests are developed in Stage 7 (Develop App) alongside application code. The dev plan's component boundaries and internal architecture inform Tier 2 test implementation. Each task in Stage 7 includes writing the Tier 2 tests specified in the test plan for that task's scope (AC 7.3).

---

## Step 7: Human Gate

Present the Stage 6 summary to the user for approval (AC 7.8):

```
## Gate 6: Tier 1 E2E Tests -- Review

### Test Development Summary
- **Total test count:** <total_test_count> Tier 1 E2E tests
- **Red count:** <red_count> (expected: equals total)
- **Fake tests identified:** <fake_test_count> (expected: 0)
- **Self-health gate:** PASS | FAIL (with override)
- **Critic review:** PASS in <N> iterations
- **Branch:** tdd/<slug>/tests
- **Label:** tdd-red-tests

### Security Classification Summary
- **Total Security tests:** <security_count>
- **By keyword match:** <keyword_count>
- **By directory path:** <directory_count>
- **Keywords matched:** <list of unique keywords found>
- **Security tests are immutable** -- they cannot be modified during Stage 7 (Develop App)

### TP-{N} Coverage
- **Tier 1 specs in test plan:** <tier1_spec_count>
- **Tier 1 tests developed:** <tier1_test_count>
- **Coverage gaps:** <list any TP-{N} without a corresponding test, or "None">

### Tier 2 Status
- **Tier 2 specs in test plan:** <tier2_spec_count>
- **Status:** Specification outlines only -- full test code developed in Stage 7

### Fake Tests (if any)
| Test File | Test Name | TP-{N} | Status |
|-----------|-----------|--------|--------|
| <path>    | <name>    | TP-X   | Fixed / Removed / Overridden |

Approve and proceed to Stage 7 (Develop App)? (approve/reject/abort)
```

If approved, the orchestrator proceeds to Stage 7 with the test branch path and security classification data in orchestrator state.

If rejected, the user can request changes to specific tests before re-running the critic review and self-health gate.
