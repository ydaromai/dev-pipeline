# /test -- Test Verification & Validation

You are executing the **test** pipeline stage. This is Stage 5 of the full pipeline. It performs comprehensive test verification across the entire feature branch: auditing test existence, generating missing tests, running all test types, verifying coverage, auditing CI/CD pipelines, re-running smoke tests, and performing full cumulative critic validation on the `main..HEAD` diff.

**Input:** Dev plan file via `$ARGUMENTS` (e.g., `@docs/dev_plans/user-auth.md`)
**Output:** Comprehensive test verification report (PASS/FAIL)

---

## Step 1: Read inputs and compute scope

1. Read the dev plan file from `$ARGUMENTS`
   - If the file does not exist, report the error **"Dev plan file not found: <path>"** and **exit immediately** -- do not proceed to any further steps.

2. Read `pipeline.config.yaml` for configuration:
   - `test_stage` section (all keys; use defaults if section is absent)
   - `test_commands` section (unit, integration, ui, e2e, component, all)
   - `test_requirements` section (file pattern to test type mappings)
   - `smoke_test` section (for Step 8)
   - `has_frontend`, `has_backend_service`, `has_api` flags (for conditional critics and test types)

3. Check `test_stage.enabled` (default: `true` if absent):
   - If `false`, print **"Stage 5 (Test Verification) is disabled via test_stage.enabled: false. Exiting."** and **exit immediately**.

4. Read the linked PRD:
   - Derive the PRD slug from the dev plan file path (e.g., `docs/dev_plans/user-auth.md` -> `docs/prd/user-auth.md`)
   - If the PRD file does not exist, report a **Warning**: "PRD not found at <path>, skipping PRD Section 9 cross-reference" and continue with `test_requirements` patterns only.

5. Read `docs/ai_definitions/AGENT_CONSTRAINTS.md`

6. Compute the cumulative diff scope:
   ```bash
   git diff main..HEAD --name-only
   ```
   - Extract all changed source file paths (exclude test files, config files, documentation)
   - If the diff is empty (no changes), report **"No changed files detected. Test audit: N/A. Skipping Steps 2-5. Proceeding to Steps 6-10 (CI/CD audit, smoke test, critic validation, report)."** and **skip Steps 2-5**, proceed directly to Step 6.

7. Store the following for use in subsequent steps:
   - `max_fix_iterations`: from `test_stage.max_fix_iterations` (default: 3)
   - `coverage_threshold`: from `test_stage.coverage_thresholds.lines` (default: 80)
   - `fix_commented_jobs`: from `test_stage.ci_audit.fix_commented_jobs` (default: false)
   - `ci_config_paths`: from `test_stage.ci_audit.config_paths` (default: [])
   - `critic_max_iterations`: from `test_stage.critic_validation.max_iterations` (default: 3)

---

## Step 2: Test Existence Audit

Audit all changed source files to determine which test types are required and whether those tests exist.

1. **Match changed files against `test_requirements` patterns** from `pipeline.config.yaml`:
   - For each changed source file, check which `test_requirements` patterns match
   - Determine the required test types for each file (e.g., `lib/**/*.js` requires `[unit, integration]`)

2. **Cross-reference PRD Section 9 Testing Strategy** (if PRD was found in Step 1):
   - Check for feature-specific test requirements defined in the PRD
   - Add any additional test type requirements not covered by `test_requirements` patterns

3. **Categorize test types** required across all changed files:
   - `unit` -- always applicable
   - `component` -- only if `has_frontend: true`
   - `integration` -- always applicable
   - `ui` -- only if `has_frontend: true`
   - `e2e` -- mandatory if `has_frontend: true` (regardless of configuration); only if `test_commands.e2e` is configured otherwise

4. **Frontend E2E enforcement check:** When `has_frontend: true` and `test_commands.e2e` is not configured (absent or commented out in `pipeline.config.yaml`), add a Critical finding row to the inventory table:
   ```
   | (project-wide) | e2e | -- | e2e (Critical) |
   ```
   Message: "E2E browser tests are mandatory for frontend projects. Configure `test_commands.e2e` in pipeline.config.yaml."

5. **Search for existing tests** matching each changed source file:
   - Look for test files following common naming conventions: `*.test.*`, `*.spec.*`, `__tests__/*`, `test/*`
   - Check if each required test type has corresponding test coverage

6. **Produce an inventory table**:

```
## Test Existence Audit

| Source File | Required Types | Found | Missing |
|-------------|---------------|-------|---------|
| lib/auth.js | unit, integration | unit | integration |
| lib/api.js | unit, integration | unit, integration | -- |
| public/login.tsx | ui | -- | ui |

Summary: X files audited, Y gaps found
```

7. If **no gaps** are found, report **"No gaps found -- all changed files have required test coverage"** and proceed to Step 3 (which will skip).

---

## Step 3: Missing Test Generation (Ralph Loop)

Generate tests for any gaps identified in Step 2 using the Ralph Loop pattern.

**If no gaps were found in Step 2**, skip this step entirely and report:
```
## Step 3: Missing Test Generation
SKIPPED -- no gaps
```

**Playwright E2E scaffolding (when `has_frontend: true` and E2E is missing):** When `has_frontend: true` and E2E tests are missing, the fix subagent should scaffold a minimal Playwright E2E test at `tests/e2e/smoke.spec.ts` that navigates to the entry URL and verifies the page renders (title is non-empty, root element is visible). The subagent should also configure `test_commands.e2e: "npx playwright test"` in `pipeline.config.yaml` if not already set.

**If gaps exist**, for each gap (or group of related gaps):

### 3a. BUILD phase (fresh context)

Spawn a subagent (Task tool, model: opus) to generate the missing tests:

```
You are generating missing tests for a feature branch. Follow all agent constraints.

## Missing Tests to Generate
<paste gaps from Step 2 inventory table>

## Context
- Branch: <current branch>
- Project root: <cwd>
- PRD: <paste relevant PRD sections, especially Section 9 Testing Strategy>
- Dev plan: <paste relevant task specs>
- Existing test patterns: <paste examples of existing tests in the codebase for convention reference>
- Agent constraints: <paste AGENT_CONSTRAINTS.md content>

## Instructions
1. Read existing tests in the codebase to understand patterns, conventions, and test utilities
2. For each gap, write tests that:
   - Follow the project's existing test conventions and patterns
   - Cover happy path, error path, and boundary conditions
   - Use the project's test framework and utilities
   - Include meaningful assertions (not just "does not throw")
3. Run the tests to verify they pass: <test command from pipeline.config.yaml>
4. Commit with conventional commit format: test: add missing <type> tests for <scope>
5. Report what tests were generated and any issues encountered
```

### 3b. REVIEW phase (fresh context)

After the build phase completes, spawn a review subagent (Task tool, model: opus) with QA + Dev critic personas:

```
You are reviewing generated tests. Read the following critic persona files:

1. ${CLAUDE_PLUGIN_ROOT}/pipeline/agents/qa-critic.md
2. ${CLAUDE_PLUGIN_ROOT}/pipeline/agents/dev-critic.md

## What to review
- Branch: <current branch>
- Run: git diff main..HEAD to see the new tests
- Gaps being filled: <paste gap inventory>

## Instructions
1. Read the diff on the branch
2. Run each critic's checklist against the generated tests
3. Verify tests are meaningful (not trivial pass-through tests)
4. Verify tests cover the required types identified in the audit
5. Final verdict: PASS only if both QA and Dev critics pass. FAIL if any has Critical findings.
```

### 3c. ITERATE if needed

If the review verdict is **FAIL**:

1. Collect all Critical findings from failed critics
2. Spawn a **new build subagent** (fresh context, model: opus) with the fix prompt:

```
You are fixing issues found during test review. Follow all agent constraints.

## Generated Tests
<paste what was generated>

## Current State
- Branch: <current branch> (already has generated tests from previous iteration)
- Read the current tests on this branch first

## Review Feedback (must fix all Critical items)
<paste all Critical findings from failed critics>

## Instructions
1. Read the current tests on the branch
2. Address each Critical finding
3. Run tests to verify they still pass
4. Commit fixes with message: fix: address test review feedback (round N)
5. Report what you fixed
```

3. Re-run the REVIEW phase (fresh context), but only evaluate the previously failed critics
4. Repeat up to `max_fix_iterations` (default: 3) total cycles
5. If still failing after max iterations, escalate to the user:

```
## Test Generation -- Escalation Required

After <N> iterations, generated tests still have Critical findings:
<list failed critics and their Critical findings>

Options:
1. Override -- accept tests despite review failures
2. Fix manually -- I'll wait for you to push fixes, then re-review
3. Skip -- proceed without generating these tests
4. Abort -- stop /test execution
```

### 3d. Create PR with human gate

Once QA + Dev critics PASS (or user overrides):

1. Push the branch:
   ```bash
   git push -u origin <branch>
   ```
2. Create a PR:
   ```bash
   gh pr create --title "test: add missing tests for <scope>" --body "<PR body with critic results>"
   ```
3. Present to user:

```
## Test Generation PR Ready

PR: <PR URL>
Tests generated: <list of test files>
Gaps filled: <X of Y>
QA Critic: PASS
Dev Critic: PASS
Ralph Loop iterations: <N>

Approve and merge? (approve/reject/skip)
```

4. If approved, merge:
   ```bash
   gh pr merge <PR_NUMBER> --squash --delete-branch
   ```

---

## Step 4: Run All Tests

Run each configured test type and verify a full green cycle. This step runs only AFTER Step 3 PRs (if any) are merged, so that generated tests are included.

### 4a. Run individual test types

For each test type, use the corresponding command from `pipeline.config.yaml` `test_commands`:

| Test Type | Command Key | Condition |
|-----------|-------------|-----------|
| Unit | `test_commands.unit` | Always run if configured |
| Integration | `test_commands.integration` | Always run if configured |
| UI | `test_commands.ui` | Only if `has_frontend: true` and configured |
| E2E | `test_commands.e2e` | Mandatory if `has_frontend: true`; only if configured otherwise |
| Component | `test_commands.component` | Only if `has_frontend: true` and configured |

- If a `test_commands` key is **not configured** for a type, skip it and report **"SKIPPED (not configured)"** in the results table.
- **Exception:** When `has_frontend: true` and `test_commands.e2e` is not configured, the E2E row shows **"FAIL — E2E mandatory for frontend projects but not configured"** (not SKIP). This is a blocking failure.
- Run each configured type and capture: pass count, fail count, skip count, duration.

### 4b. Run full suite

After all individual types, run `test_commands.all` for final validation:
```bash
<test_commands.all from pipeline.config.yaml>
```

### 4c. Report results

```
## Test Results

| Type | Command | Status | Pass | Fail | Skip | Duration |
|------|---------|--------|------|------|------|----------|
| Unit | npm test | PASS | 42 | 0 | 2 | 3.2s |
| Integration | npm run test:integration | PASS | 15 | 0 | 0 | 8.1s |
| UI | npm run test:ui | SKIPPED (not configured) | -- | -- | -- | -- |
| E2E | npm run test:e2e | SKIPPED (not configured) | -- | -- | -- | -- |
| Component | npm run test:component | SKIPPED (not configured) | -- | -- | -- | -- |
| **All** | npm run test:all | **PASS** | 57 | 0 | 2 | 11.5s |
```

### 4d. Fix loop (if ANY test fails)

If ANY test type fails:

1. Spawn a fix subagent (Task tool, model: opus, fresh context) with the failure output:

```
You are fixing failing tests. Follow all agent constraints.

## Failure Details
<paste per-type failure output including failing test names, error messages, stack traces>

## Context
- Branch: <current branch>
- Dev plan: <paste relevant sections>
- PRD: <paste relevant sections>

## Instructions
1. Read the failing tests and the source code they test
2. Determine if the failure is in the test or the source code
3. Fix the issue (prefer fixing tests if the source code matches the PRD spec)
4. Run ALL tests (not just the failing type) to verify no regressions
5. Commit fixes: fix: resolve <test-type> test failures (round N)
6. Report what you fixed
```

2. After the fix, **re-run ALL test types** (not just the failed type) to catch regressions
3. Repeat up to `max_fix_iterations` (default: 3) fix cycles
4. If still failing after max iterations, escalate to the user:

```
## Test Execution -- Escalation Required

After <N> fix iterations, tests still fail:
<paste per-type failure summary>

Options:
1. Fix manually -- I'll wait for you to push fixes, then re-run
2. Override -- proceed despite test failures (NOT recommended)
3. Abort -- stop /test execution
```

**Goal:** A full green cycle where ALL test types pass in a single run.

---

## Step 5: Coverage Verification

Verify test coverage for changed source files. This step is informational (Warning, not blocking).

1. **Auto-detect the coverage flag** from the test framework:
   - `vitest` / `jest` / `mocha` / `jasmine` -> `--coverage`
   - `pytest` -> `--cov`
   - `go test` -> `-cover`
   - `cargo test` -> (use `cargo tarpaulin` if available)
   - If the framework cannot be detected, skip coverage and report: **"Coverage: SKIPPED (unable to auto-detect coverage tool)"**

2. **Run tests with coverage**:
   ```bash
   <test_commands.all> <coverage_flag>
   ```

3. **Parse coverage output** and extract per-file line coverage for changed source files only.

4. **Compare against threshold** (`test_stage.coverage_thresholds.lines`, default: 80%):

```
## Coverage Report

| Source File | Lines Covered | Lines Total | Coverage | Threshold | Status |
|-------------|--------------|-------------|----------|-----------|--------|
| lib/auth.js | 45 | 50 | 90% | 80% | PASS |
| lib/api.js | 30 | 50 | 60% | 80% | WARNING |

Overall coverage for changed files: 75%
Threshold: 80%
Status: WARNING -- below threshold (not blocking)
```

5. Below-threshold coverage is a **Warning** (not blocking). Report it in the final table but do not fail the stage.

---

## Step 6: CI Pipeline Audit

Audit CI pipeline configuration for completeness and consistency.

1. **Detect CI config files** -- check for:
   - `.github/workflows/*.yml`
   - `.gitlab-ci.yml`
   - `Jenkinsfile`
   - `.circleci/config.yml`
   - `azure-pipelines.yml`
   - `bitbucket-pipelines.yml`
   - Additional paths from `test_stage.ci_audit.config_paths`

2. **If no CI config is found**, report:
   ```
   ## CI Pipeline Audit
   No CI config detected -- configure manually or add your CI system to `test_stage.ci_audit.config_paths`.
   Status: WARNING
   ```

3. **If CI config is found**, verify:
   - All required test jobs are **active** (not commented out)
   - Test commands in CI match `test_commands` from `pipeline.config.yaml`
   - Dependencies/services are properly configured (e.g., database for integration tests)
   - A build step exists
   - A lint step exists

4. **Report CI health table**:

```
## CI Pipeline Audit

| Job | Status | Notes |
|-----|--------|-------|
| build | ACTIVE | npm run build |
| lint | ACTIVE | npm run lint |
| unit-tests | ACTIVE | npm test |
| integration-tests | COMMENTED OUT | # npm run test:integration -- uncomment to enable |
| e2e-tests | NOT FOUND | No E2E job defined |

Status: WARNING -- 1 commented-out job, 1 missing job
```

5. **Optional auto-fix**: If issues are found AND `test_stage.ci_audit.fix_commented_jobs` is `true`:
   - Spawn a fix subagent to uncomment/fix CI config
   - Create a PR with the fixes
   - Present to user with human gate (approve/reject)

---

## Step 7: CD Pipeline Audit

Audit CD (Continuous Deployment) pipeline configuration. This step is **report-only** -- no auto-fix due to high deployment risk.

1. **Detect CD config files** -- check for:
   - Deploy workflows (`.github/workflows/*deploy*.yml`, `.github/workflows/*release*.yml`)
   - `Dockerfile`, `docker-compose.yml`, `docker-compose.yaml`
   - Kubernetes manifests (`k8s/`, `kubernetes/`, `*.k8s.yml`)
   - Infrastructure as Code (`terraform/`, `pulumi/`, `cdk/`)
   - Platform configs (`Procfile`, `app.yaml`, `fly.toml`, `render.yaml`, `vercel.json`, `netlify.toml`)

2. **If no CD config is found**, report:
   ```
   ## CD Pipeline Audit
   No CD config detected -- deployment configuration should be set up before production release.
   Status: INFO (report-only)
   ```

3. **If CD config is found**, verify:
   - Deploy steps exist for at least staging environment
   - Post-deploy health check exists
   - Rollback strategy is documented or configured
   - Environment-specific configs exist (staging vs production)

4. **Report CD component health table**:

```
## CD Pipeline Audit

| Component | Status | Notes |
|-----------|--------|-------|
| Deploy workflow | FOUND | .github/workflows/deploy.yml |
| Staging deploy | FOUND | deploys to staging on push to main |
| Production deploy | FOUND | manual trigger |
| Post-deploy health check | NOT FOUND | No health check after deploy |
| Rollback strategy | NOT FOUND | No rollback step defined |
| Dockerfile | FOUND | Multi-stage build |

Status: WARNING -- missing health check and rollback strategy (report-only, no auto-fix)
```

5. **No auto-fix** -- CD changes are high-risk. Report findings only.

---

## Step 8: Local Deployment Verification

Re-run the smoke test after all test PRs are merged, verifying that test additions did not break the application.

1. **Check `smoke_test.enabled`** from `pipeline.config.yaml`:
   - If `false`, skip and report:
     ```
     ## Local Deployment Verification
     SKIPPED -- smoke test disabled via smoke_test.enabled: false
     ```
   - If the `smoke_test` section is absent, skip and report:
     ```
     ## Local Deployment Verification
     SKIPPED -- no smoke_test configuration found
     ```

2. **Sequencing**: This step runs ONLY after:
   - Step 3 test generation PRs are merged (if any)
   - Step 4 test suite passes (full green cycle)

3. **Use the same smoke test infrastructure as `execute.md` Step 5**:
   - **5a.** Start the dev server (detect from lockfile or `smoke_test.start_command`)
   - **5b.** Health checks (verify all endpoints respond)
   - **5c.** SDK version compatibility check
   - **5d.** Core user flow verification (HTTP requests, response inspection)
   - **5e.** Visual rendering check (if `has_frontend: true`)
   - **5f.** Teardown (terminate dev server process group, verify ports released)

4. Follow the same failure handling as `execute.md` Step 5:
   - On failure: create a fix branch, apply fix, run critics, create PR with human gate
   - Max `smoke_test.max_fix_attempts` (default: 2) fix cycles
   - Escalate to user if still failing

5. **Report results**:

```
## Local Deployment Verification

| Check | Status | Duration | Details |
|-------|--------|----------|---------|
| Dev server startup | PASS | 4.2s | pnpm dev, ready in 4.2s |
| Health checks | PASS | 0.3s | 2/2 endpoints healthy |
| SDK compatibility | PASS | 1.1s | ai@6.2.1 confirmed |
| Core user flow | PASS | 0.8s | POST /api/chat -> 200 |
| Visual rendering | N/A | -- | has_frontend: false |
| Server teardown | PASS | 0.2s | ports released |
```

---

## Step 9: Full Cumulative Critic Validation

Run ALL applicable critics against the full cumulative diff (`main..HEAD`), catching cross-cutting issues that per-task reviews in `/execute` may have missed.

### 9a. Compute cumulative diff

```bash
git diff main..HEAD
```

### 9b. Spawn critic review (fresh context)

Spawn a review subagent (Task tool, model: opus) with ALL applicable critic personas:

```
You are the Cumulative Review Agent for the /test pipeline stage. You will review the
ENTIRE cumulative diff (main..HEAD) using all applicable critic perspectives. This catches
cross-cutting issues between independently-reviewed tasks.

Read all critic persona files:

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
- Run: git diff main..HEAD to see ALL changes across the feature branch
- Dev plan: <paste dev plan summary>
- PRD: <paste PRD summary>

## Instructions
1. Read the FULL cumulative diff
2. Run each critic's checklist against the combined changes
3. Pay special attention to cross-cutting issues:
   - Two independently-reviewed tasks creating a combined security gap
   - Inconsistent patterns across different tasks
   - Missing integration between components built by different tasks
   - Cumulative performance impact of all changes together
4. Produce a structured review with verdicts for each critic
5. Use the output format defined in each critic's persona file
6. Final verdict: PASS only if ALL applicable critics pass. FAIL if any has Critical findings.

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

### 9c. Fix loop (if any critic FAILs)

If the review verdict is **FAIL**:

1. Collect all Critical findings from failed critics
2. Spawn a **new fix subagent** (Task tool, model: opus, fresh context):

```
You are fixing cross-cutting issues found during cumulative critic review.
Follow all agent constraints.

## Current State
- Branch: <current branch>
- Read the current code first

## Review Feedback (must fix all Critical items)
<paste all Critical findings from FAILED critics only>

## Instructions
1. Read the current implementation
2. Address each Critical finding
3. Run tests to verify nothing is broken
4. Commit fixes: fix: address cumulative review feedback (round N)
5. Report what you fixed
```

3. Re-run the REVIEW phase (fresh context), but **only evaluate the previously failed critics**
4. Repeat up to `critic_max_iterations` (default: 3) total cycles
5. If still failing after max iterations, escalate to the user:

```
## Cumulative Critic Validation -- Escalation Required

After <N> iterations, the following critics still FAIL on the cumulative diff:
<list failed critics and their Critical findings>

Options:
1. Override -- accept despite critic failures
2. Fix manually -- I'll wait for you to push fixes, then re-validate
3. Abort -- stop /test execution
```

### 9d. All critics must PASS

Stage 5 is **not declared complete** until all applicable critics PASS on the cumulative diff (or the user explicitly overrides).

---

## Step 10: Final Report

Produce a comprehensive test verification report with per-section verdicts and an overall verdict.

```
## Test Verification Report -- Stage 5

### Test Inventory (Step 2)
| Source File | Required Types | Found | Missing |
|-------------|---------------|-------|---------|
| <per-file rows from Step 2> |

Files audited: X | Gaps found: Y | Gaps filled: Z (Step 3)

### Test Results (Step 4)
| Type | Command | Status | Pass | Fail | Skip | Duration |
|------|---------|--------|------|------|------|----------|
| <per-type rows from Step 4> |

### Coverage (Step 5)
| Source File | Coverage | Threshold | Status |
|-------------|----------|-----------|--------|
| <per-file rows from Step 5> |

Overall coverage: X% | Threshold: Y% | Status: PASS/WARNING

### CI Pipeline Audit (Step 6)
| Job | Status | Notes |
|-----|--------|-------|
| <per-job rows from Step 6> |

CI Status: PASS/WARNING

### CD Pipeline Audit (Step 7)
| Component | Status | Notes |
|-----------|--------|-------|
| <per-component rows from Step 7> |

CD Status: INFO (report-only)

### Local Deployment (Step 8)
| Check | Status | Duration | Details |
|-------|--------|----------|---------|
| <per-check rows from Step 8> |

Smoke Test Status: PASS/FAIL/SKIPPED

### Critic Validation (Step 9)
| Critic | Verdict | Key Findings |
|--------|---------|-------------|
| Product | PASS/FAIL | <summary> |
| Dev | PASS/FAIL | <summary> |
| DevOps | PASS/FAIL | <summary> |
| QA | PASS/FAIL | <summary> |
| Security | PASS/FAIL | <summary> |
| Performance | PASS/FAIL | <summary> |
| Data Integrity | PASS/FAIL | <summary> |
| Observability | PASS/FAIL/N/A | <summary> |
| API Contract | PASS/FAIL/N/A | <summary> |
| Designer | PASS/FAIL/N/A | <summary> |

Critic Validation: PASS (all critics) | Ralph Loop iterations: N

### Overall Verdict: PASS | FAIL

PASS conditions (ALL must be true):
- Test Results: all types PASS (Step 4)
- Critic Validation: all critics PASS (Step 9)
- Smoke Test: PASS or SKIPPED (Step 8)

Non-blocking (Warning only):
- Coverage below threshold (Step 5)
- CI audit findings (Step 6)
- CD audit findings (Step 7)

If FAIL, blocking items:
<list all blocking failures with step references>
```
