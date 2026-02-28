# Dev Plan: Mandatory Browser-Based Validation for Frontend Projects

**PRD:** `docs/prd/browser-validation.md`
**Status:** APPROVED (all 7 critics PASS, iteration 2)
**Date:** 2026-02-28

---

## EPIC: Mandatory Browser-Based Validation for Frontend Projects

When `has_frontend: true`, the pipeline must launch a real headless browser during smoke testing, capture multi-viewport screenshots, enforce mandatory E2E tests, and require screenshot evidence in designer critic reviews. All changes are gated behind `has_frontend: true`. Non-frontend projects experience zero behavioral changes.

---

## STORY 1: Pipeline Configuration Foundation (US-6)

**As a** pipeline maintainer, **I want** the config template to include a `browser_testing` section and an uncommented E2E test command, **so that** frontend projects have clear, discoverable configuration for browser validation.

**Acceptance Criteria:** AC 6.1, AC 6.2, AC 6.3, AC 6.4

### TASK 1.1: Add `browser_testing` section and uncomment E2E in pipeline-config-template.yaml
**Depends On:** None
**Parallel Group:** A
**Complexity:** Simple
**Estimated Time:** 20 min
**Files:** `pipeline/templates/pipeline-config-template.yaml`
**Required Tests:**
- **UT:** Structural test verifies `browser_testing` section exists (AC 9.8), is placed after `smoke_test` and before `test_stage`, and contains all documented default fields. Structural test verifies `test_commands.e2e` is uncommented with `"npx playwright test"` value and annotation (AC 9.9).

**Subtasks:**

1. **SUBTASK 1.1.1:** Add a new commented-out `browser_testing:` section after the `smoke_test:` section and before the `test_stage:` section. Include all fields from AC 6.1: `tool: "playwright"`, `headless: true`, `screenshot_dir: ".pipeline/screenshots"`, `viewports` (mobile 375x812, tablet 768x1024, desktop 1280x720), `smoke_test_routes: []`, `max_routes: 10`, `max_console_errors: 0`, `visual_regression: false`, `auto_install: false`. Follow the existing commented-out section pattern used by `smoke_test` and `test_stage`.

2. **SUBTASK 1.1.2:** Uncomment the `e2e:` line under `test_commands`, change its value to `"npx playwright test"`, and add an inline annotation comment: `# Mandatory when has_frontend: true`. Keep the `component:` line commented out.

3. **SUBTASK 1.1.3:** Add inline documentation comments for each field in the `browser_testing` section, documenting the default values as specified in AC 6.4.

---

## STORY 2: Browser-Based Smoke Test in Execute Stage (US-1, US-2, US-3)

**As a** pipeline operator running `execute` on a frontend project, **I want** the smoke test to launch a real headless browser, capture multi-viewport screenshots, and verify DOM correctness, **so that** broken rendering is caught before delivery.

**Acceptance Criteria:** AC 1.1-1.6, AC 2.1-2.6, AC 3.1-3.7

### TASK 2.1: Add browser-based verification to execute.md Step 5d (Core User Flow)
**Depends On:** TASK 1.1
**Parallel Group:** B
**Complexity:** Complex
**Estimated Time:** 2 hrs
**Files:** `commands/execute.md`
**Required Tests:**
- **UT:** Structural test verifies `execute.md` contains "Playwright" and browser verification paths (AC 9.1). Structural test verifies fallback path exists (AC 9.3).

**Subtasks:**

1. **SUBTASK 2.1.1:** In execute.md Step 5d, add a `has_frontend: true` guard at the beginning of the section. When `has_frontend: true`, add a Playwright availability check (`npx playwright --version`) before proceeding. Document the check as deterministic (NFR-4).

2. **SUBTASK 2.1.2:** When `has_frontend: true` AND Playwright is available, replace the HTTP-only entry URL request (step 5d.1) with Playwright-based navigation: launch headless Chromium, navigate to `entry_url`, wait for page load. Register a `console.error` listener before navigation to capture all console errors. Aggregate console error counts across all page loads within the smoke test run and assert the total count is within `max_console_errors` threshold (default: 0) (AC 1.1, AC 1.2, FR-15). Set per-page timeout of 30 seconds (NFR-2).

3. **SUBTASK 2.1.3:** Add DOM element visibility verification: verify root element (`#root`, `#__next`, `#app`, or `main`) is present and visible, along with navigation and content area elements (AC 1.3).

4. **SUBTASK 2.1.4:** When `smoke_test.interaction_endpoint` is set and Playwright is available, add instructions to simulate user flow via Playwright actions (click, type, navigate) instead of HTTP requests (AC 1.4).

5. **SUBTASK 2.1.5:** Add explicit fallback path: when `has_frontend: true` but Playwright is NOT available, fall back to existing HTTP-only behavior with a Warning message that includes installation instructions (`npm install -D @playwright/test && npx playwright install chromium`) (AC 1.6, NFR-9).

6. **SUBTASK 2.1.6:** Ensure the existing HTTP-only behavior in Step 5d remains completely unchanged when `has_frontend: false` (AC 1.5). Add a comment clarifying the gate.

### TASK 2.2: Add multi-viewport screenshot capture and DOM verification to execute.md Step 5e
**Depends On:** TASK 2.1
**Parallel Group:** C
**Complexity:** Complex
**Estimated Time:** 2 hrs
**Files:** `commands/execute.md`
**Required Tests:**
- **UT:** Structural test verifies `execute.md` Step 5e references the 3 viewport widths (375, 768, 1280) (AC 9.2). Structural test verifies fallback path (AC 9.3).

**Subtasks:**

1. **SUBTASK 2.2.1:** In execute.md Step 5e, restructure the section to have two branches: (a) `has_frontend: true` AND Playwright available: run browser-based checks; (b) `has_frontend: true` but Playwright NOT available: run static analysis only with Warning; (c) `has_frontend: false`: skip entirely (existing behavior).

2. **SUBTASK 2.2.2:** For the browser-based branch (a), add route discovery instructions: auto-detect routes from framework conventions. Specify detection patterns for Next.js App Router (`app/**/page.tsx`), Pages Router (`pages/**/*.tsx` excluding `_app/_document/api/`), SvelteKit (`src/routes/**/+page.svelte`), and generic SPA (entry-only). Always include entry URL. Cap auto-detected routes at `max_routes` (default: 10). When `smoke_test_routes` is set in config, it completely overrides auto-detection (the configured routes are used instead of auto-detected ones) (AC 2.4, AC 2.5, FR-17).

3. **SUBTASK 2.2.3:** Add screenshot capture instructions: for each discovered route, capture screenshots at 3 viewports (mobile 375x812, tablet 768x1024, desktop 1280x720). Save to `screenshot_dir` (default `.pipeline/screenshots/`) with naming convention `{route-slug}_{viewport}.png`. Set per-page screenshot timeout of 3 seconds (NFR-2). Document the total budget: `max_routes` routes x 3 viewports x ~3s = ~90s + ~30s overhead, capped at 120 seconds total (NFR-1) (AC 2.1, AC 2.2).

4. **SUBTASK 2.2.4:** Add screenshot directory management: clean directory at start of each run (`rm -rf && mkdir -p`). Validate the directory path as a relative path within the project (not `/`, `~`, or containing `..`). Document that `.pipeline/screenshots/` is always safe (AC 2.3, NFR-5, NFR-10).

5. **SUBTASK 2.2.5:** Add DOM and rendering verification checks for the browser-based branch: verify non-empty `<title>` or `<h1>` (AC 3.1), main content area visible with height > 0 (AC 3.2), detect error overlays and fail if present (AC 3.3), verify images loaded with naturalWidth > 0 (AC 3.4), at mobile viewport assert no horizontal overflow (AC 3.5), at mobile viewport assert no text below 12px (AC 3.6).

6. **SUBTASK 2.2.6:** Ensure existing static analysis checks (CSS vars, asset references, dark theme) continue to run as supplementary validation alongside browser checks (AC 3.7). Document that static analysis is always run regardless of Playwright availability.

7. **SUBTASK 2.2.7:** Add the fallback path for when Playwright is not available: run only the existing static analysis (CSS vars, asset references, dark theme) with a Warning message. Document the Warning level and installation instructions (AC 2.6, NFR-9).

### TASK 2.3: Update execute.md Step 6 smoke test report for browser validation
**Depends On:** TASK 2.2
**Parallel Group:** D
**Complexity:** Simple
**Estimated Time:** 15 min
**Files:** `commands/execute.md`
**Required Tests:**
- **UT:** N/A (visual inspection of report format)

**Subtasks:**

1. **SUBTASK 2.3.1:** In execute.md Step 6 "Smoke Test Results" table, add a "Browser screenshots" row with columns: Status (PASS/N/A/Warning), Duration, Details. Details should include: route count x viewport count = total screenshot count when PASS; "N/A (has_frontend: false)" when not a frontend project; "Warning: Playwright not available -- static analysis only (see installation instructions above)" when fallback was used (AC 8.1).

---

## STORY 3: Designer Critic Browser Evidence Requirement (US-5)

**As a** pipeline reviewer, **I want** the Designer Critic to require screenshot evidence from browser rendering when reviewing frontend code, **so that** a code review cannot pass without proof that the UI actually renders.

**Acceptance Criteria:** AC 5.1-5.5

### TASK 3.1: Add "Browser Verification Evidence" section to designer-critic.md
**Depends On:** TASK 1.1
**Parallel Group:** B
**Complexity:** Medium
**Estimated Time:** 45 min
**Files:** `pipeline/agents/designer-critic.md`
**Required Tests:**
- **UT:** Structural test verifies `designer-critic.md` has a "Browser Verification Evidence" section (AC 9.4). Structural test verifies it references `.pipeline/screenshots/` (AC 9.5).

**Subtasks:**

1. **SUBTASK 3.1.1:** Add a new "### Browser Verification Evidence" checklist section to designer-critic.md, positioned after the "### Runtime Rendering Integrity" section and before the "### Animation & Transitions" section. This section applies to code review only (not PRD review). Add checklist items: screenshots exist in `.pipeline/screenshots/`, coverage of 3 viewports (mobile, tablet, desktop), zero console errors in browser output, no error overlays detected, interaction screenshots present if `interaction_endpoint` was configured (AC 5.1, AC 5.2).

2. **SUBTASK 3.1.2:** Add conditional logic for findings based on Playwright availability. When `has_frontend: true`, no screenshots exist, and Playwright was available during the execute stage, the Designer Critic raises a Critical finding (AC 5.3). When `has_frontend: true` but Playwright was NOT available, missing screenshots are downgraded to a Warning with a note explaining the fallback (AC 5.4).

3. **SUBTASK 3.1.3:** Update the Output Format section to include a "Browser Verification Evidence" checklist block in the structured output (AC 5.5). Add checklist items matching the section above: screenshot existence, viewport coverage, console errors, error overlays, interaction screenshots.

---

## STORY 4: Mandatory E2E Tests for Frontend Projects (US-4)

**As a** pipeline operator running `test` on a frontend project, **I want** E2E browser tests to be mandatory, **so that** I cannot skip browser-level testing on a project that renders in a browser.

**Acceptance Criteria:** AC 4.1-4.5

### TASK 4.1: Enforce mandatory E2E in test.md Steps 2 and 4
**Depends On:** TASK 1.1
**Parallel Group:** B
**Complexity:** Medium
**Estimated Time:** 45 min
**Files:** `commands/test.md`
**Required Tests:**
- **UT:** Structural test verifies `test.md` Step 2 flags missing E2E as Critical for frontend (AC 9.6). Structural test verifies `test.md` Step 4 marks E2E as mandatory for frontend (AC 9.7).

**Subtasks:**

1. **SUBTASK 4.1.1:** In test.md Step 2, item 3 ("Categorize test types"), update the E2E entry from `e2e -- only if test_commands.e2e is configured` to: when `has_frontend: true`, E2E is mandatory regardless of configuration. When `has_frontend: false`, E2E remains optional ("only if configured") (AC 4.5).

2. **SUBTASK 4.1.2:** In test.md Step 2, add a new item after the categorization step: when `has_frontend: true` and `test_commands.e2e` is not configured (absent or commented out), produce a Critical finding in the inventory table: "E2E browser tests are mandatory for frontend projects. Configure `test_commands.e2e` in pipeline.config.yaml." (AC 4.1).

3. **SUBTASK 4.1.3:** In test.md Step 4, update the test type table for the E2E row: change the Condition column from "Only if configured" to "Mandatory if `has_frontend: true`; only if configured otherwise" (AC 4.2).

4. **SUBTASK 4.1.4:** In test.md Step 4, add a note: when `has_frontend: true` and E2E is not configured, the test report shows FAIL (not SKIP) for the E2E row with the message: "FAIL — E2E mandatory for frontend projects but not configured" (AC 4.3).

5. **SUBTASK 4.1.5:** In test.md Step 3 (Missing Test Generation), add a conditional instruction: when `has_frontend: true` and E2E is missing, the fix subagent should scaffold a minimal Playwright E2E test (`tests/e2e/smoke.spec.ts`) that navigates to the entry URL and verifies the page renders, and configure `test_commands.e2e: "npx playwright test"` in `pipeline.config.yaml` (AC 4.4).

---

## STORY 5: Playwright Onboarding During Pipeline Init (US-7)

**As a** developer initializing the pipeline for a frontend project, **I want** `pipeline-init` to detect Playwright and offer installation, **so that** I can set up browser testing with minimal friction.

**Acceptance Criteria:** AC 7.1-7.5

### TASK 5.1: Add Playwright detection and onboarding to pipeline-init.md Step 3
**Depends On:** TASK 1.1
**Parallel Group:** B
**Complexity:** Medium
**Estimated Time:** 30 min
**Files:** `commands/pipeline-init.md`
**Required Tests:**
- **UT:** N/A (manual verification during pipeline-init run per PRD Section 9)

**Subtasks:**

1. **SUBTASK 5.1.1:** In pipeline-init.md Step 3, add a new conditional block: when `has_frontend: true` (auto-detected or user-confirmed), check if `@playwright/test` is in `devDependencies` of `package.json` (AC 7.1).

2. **SUBTASK 5.1.2:** If Playwright is found, auto-set `test_commands.e2e` to the detected command or default `"npx playwright test"` (AC 7.2). Log a confirmation message.

3. **SUBTASK 5.1.3:** If Playwright is not found, present the user with options: (a) Install now: `npm install -D @playwright/test && npx playwright install chromium`; (b) Skip for now (AC 7.3).

4. **SUBTASK 5.1.4:** If the user chooses to install, uncomment the `browser_testing` section in the generated config and set `test_commands.e2e: "npx playwright test"` (AC 7.4).

5. **SUBTASK 5.1.5:** If the user chooses to skip, add a note in the generated config above the commented `browser_testing` section: `# Note: Playwright not installed. Static fallback will be used with Warning-level findings. Run: npm install -D @playwright/test && npx playwright install chromium` (AC 7.5).

---

## STORY 6: Pipeline Reports and Documentation Updates (US-8)

**As a** pipeline operator, **I want** the completion report and workflow documentation to reflect browser validation, **so that** I know what was validated and where to find evidence.

**Acceptance Criteria:** AC 8.1, AC 8.2

### TASK 6.1: Update fullpipeline.md completion report and WORKFLOW.md
**Depends On:** TASK 2.3
**Parallel Group:** E
**Complexity:** Simple
**Estimated Time:** 20 min
**Files:** `commands/fullpipeline.md`, `WORKFLOW.md`
**Required Tests:**
- **UT:** N/A (visual inspection of report format and documentation)

**Subtasks:**

1. **SUBTASK 6.1.1:** In fullpipeline.md Completion section, within the "Smoke Test (Pre-Delivery, Stage 4)" table, add a "Browser screenshots" row with columns: Status (PASS/N/A), Duration, Details (route x viewport count, or "has_frontend: false", or "Playwright not available — static only") (AC 8.1).

2. **SUBTASK 6.1.2:** In WORKFLOW.md, Stage 4 section (Execute with Ralph Loop), Step 5 row (currently describing smoke test steps 5a-5e), update the description to mention browser validation when `has_frontend: true`. Specifically, add to the description: "5d includes Playwright-based browser verification when `has_frontend: true`; 5e captures multi-viewport screenshots and DOM checks" (AC 8.2).

---

## STORY 7: Structural Validation Tests (US-9)

**As a** pipeline maintainer, **I want** structural validation tests to verify browser validation content exists in all modified files, **so that** accidental regressions are caught by CI.

**Acceptance Criteria:** AC 9.1-9.9

### TASK 7.1: Add browser validation structural tests to test-stage-structure.test.js
**Depends On:** TASK 2.2, TASK 3.1, TASK 4.1, TASK 1.1
**Parallel Group:** F
**Complexity:** Medium
**Estimated Time:** 45 min
**Files:** `test/test-stage-structure.test.js`
**Required Tests:**
- **UT:** The tests themselves validate the assertions pass when run with `node --test test/test-stage-structure.test.js`.

**Subtasks:**

1. **SUBTASK 7.1.1:** Add file loading for `execute.md` and `designer-critic.md` at the top of the test file, alongside the existing file loads for `test.md`, `fullpipeline.md`, and `configTemplate`.

2. **SUBTASK 7.1.2:** Add a `describe('execute.md -- browser validation')` block with tests:
   - Verify `execute.md` contains "Playwright" and browser verification paths (AC 9.1).
   - Verify `execute.md` Step 5e references the 3 viewport widths: 375, 768, 1280 (AC 9.2).
   - Verify `execute.md` Step 5e has a static analysis fallback path (AC 9.3).

3. **SUBTASK 7.1.3:** Add a `describe('designer-critic.md -- browser verification evidence')` block with tests:
   - Verify `designer-critic.md` has a "Browser Verification Evidence" section (AC 9.4).
   - Verify `designer-critic.md` references `.pipeline/screenshots/` (AC 9.5).

4. **SUBTASK 7.1.4:** Add a `describe('test.md -- mandatory E2E for frontend')` block with tests:
   - Verify `test.md` Step 2 flags missing E2E as Critical for frontend (AC 9.6).
   - Verify `test.md` Step 4 marks E2E as mandatory for frontend (AC 9.7).

5. **SUBTASK 7.1.5:** Add a `describe('pipeline-config-template.yaml -- browser_testing')` block with tests:
   - Verify the config template has a `browser_testing` section (AC 9.8).
   - Verify the config template has an uncommented `e2e` in `test_commands` (AC 9.9).

---

## Dependency Graph

```
Group A (no dependencies — start here):
  TASK 1.1: Config template changes (foundation)

Group B (depends on TASK 1.1):
  TASK 2.1: execute.md Step 5d browser verification
  TASK 3.1: designer-critic.md browser evidence section
  TASK 4.1: test.md mandatory E2E enforcement
  TASK 5.1: pipeline-init.md Playwright onboarding

Group C (depends on TASK 2.1):
  TASK 2.2: execute.md Step 5e screenshots + DOM checks

Group D (depends on TASK 2.2):
  TASK 2.3: execute.md Step 6 report update

Group E (depends on TASK 2.3):
  TASK 6.1: fullpipeline.md + WORKFLOW.md updates

Group F (depends on TASK 2.2, TASK 3.1, TASK 4.1, TASK 1.1):
  TASK 7.1: Structural validation tests
```

```
TASK 1.1 ──┬──> TASK 2.1 ──> TASK 2.2 ──┬──> TASK 2.3 ──> TASK 6.1
            │                             │
            ├──> TASK 3.1 ────────────────┤
            │                             │
            ├──> TASK 4.1 ────────────────┤
            │                             │
            └──> TASK 5.1                 └──> TASK 7.1
```

---

## Cross-Cutting Concerns

### `has_frontend: true` Guard Consistency (NFR-8)
Every browser-specific code path added by this plan must be gated behind `has_frontend: true`. After all tasks are complete, verify by searching for "Playwright", "browser", "screenshot", and "viewport" in all modified files and confirming each occurrence is inside a `has_frontend: true` conditional block. This is a validation step for the implementer, not a separate task.

### `Playwright not available` Fallback Consistency (NFR-9)
Every Playwright-dependent section must have a corresponding "Playwright not available" fallback path with Warning-level messaging. Verify consistency across execute.md (Steps 5d, 5e), designer-critic.md (Browser Verification Evidence), and the report sections.

### Manual Verification Checklist (PRD Section 9)
After all implementation is complete, the following manual verification steps should be performed (not automated -- per PRD testing strategy):
1. Run full pipeline on a frontend project with Playwright installed -- verify screenshots generated, browser checks pass.
2. Run full pipeline on a frontend project without Playwright -- verify fallback to static analysis with Warnings.
3. Run full pipeline on a non-frontend project -- verify zero behavioral changes.
4. Run `pipeline-init` on a frontend project -- verify Playwright detection and onboarding prompt.

---

## Summary

| Metric | Value |
|--------|-------|
| Stories | 7 |
| Tasks | 8 |
| Simple | 3 (TASK 1.1, TASK 2.3, TASK 6.1) |
| Medium | 3 (TASK 3.1, TASK 4.1, TASK 5.1) |
| Complex | 2 (TASK 2.1, TASK 2.2) |
| Parallel Groups | 6 (A, B, C, D, E, F) |
| Estimated Total Time | ~6.5 hrs |

---

## Priority Mapping

| Priority | Tasks |
|----------|-------|
| P0 (Must Have) | TASK 1.1, TASK 2.1, TASK 2.2, TASK 2.3, TASK 3.1, TASK 4.1 |
| P1 (Should Have) | TASK 5.1, TASK 6.1 |
| P2 (Nice to Have) | TASK 7.1 |
