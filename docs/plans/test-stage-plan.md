# Plan: Add `/test` Pipeline Stage (Stage 5)

## Context

The pipeline currently ends at `/execute` (Stage 4), which includes a smoke test (Step 5) that verifies the app starts and responds. But there's no dedicated stage that:
- Audits test existence against all changed files and test_requirements patterns
- Runs each test type separately (unit, component, integration, UI, E2E) and reports per-type results
- Verifies CI/CD pipeline configuration is complete and active
- Tests local deployment end-to-end
- Iterates until ALL tests pass in a single green cycle
- Gets full 10-critic validation on the cumulative diff (not per-task diffs)

The prior session (BrandedAIEngagementPlatform) designed a 10-step `/test` command. This plan adapts that design to the generic dev-pipeline plugin.

---

## Files to Create/Modify

### 1. CREATE: `commands/test.md`

New command file — 10 steps, follows the same `.md` command pattern as `execute.md`.

**Structure:**

```
# /test — Test Verification & Validation (Stage 5)

Input: Dev plan file via $ARGUMENTS
Output: All tests green, CI/CD verified, critics passed

## Step 1: Read inputs
- Read dev plan, pipeline.config.yaml, PRD, AGENT_CONSTRAINTS.md
- Compute diff scope: `git diff main..HEAD` (cumulative diff across all merged task PRs)
- Extract changed file paths for test_requirements mapping

## Step 2: Test Existence Audit
- Scan changed source files against `test_requirements` patterns from config
- Cross-reference PRD Section 9 Testing Strategy for feature-specific requirements
- Categorize: unit, component (if has_frontend), integration, UI (if has_frontend), E2E
- Produce inventory table: file pattern | required types | found | missing

## Step 3: Missing Test Generation (Ralph Loop)
- For each gap found in Step 2, spawn BUILD subagent (opus) to write missing tests
- REVIEW with QA + Dev critics
- ITERATE until pass (max 3 iterations, same Ralph Loop pattern as execute.md Step 3)
- Create PR for new tests, human gate for approval
- Skip this step if no gaps found

## Step 4: Run All Tests (Fix Loop)
- Run each test type separately using commands from pipeline.config.yaml test_commands:
  - Unit: test_commands.unit
  - Integration: test_commands.integration
  - UI: test_commands.ui (if has_frontend)
  - E2E: test_commands.e2e (if configured)
  - All: test_commands.all (final validation)
- Report per-type: pass count, fail count, skip count, duration
- If ANY test fails:
  - Spawn fix subagent (opus, fresh context) with failure output
  - Fix → re-run ALL tests (not just failed type — fixes can cause regressions)
  - Max 3 iterations, then escalate to user
- Goal: full green cycle where ALL test types pass in a single run

## Step 5: Coverage Verification
- Run tests with coverage flag (auto-detect from framework: --coverage for vitest/jest, etc.)
- Compare against thresholds from config (test_stage.coverage_thresholds.lines, default: 80%)
- Focus on changed files specifically — report per-file coverage for new/modified source files
- If below threshold: treat as Warning (not blocking), report in final table

## Step 6: CI Pipeline Audit
- Detect CI config files (.github/workflows/*.yml, .gitlab-ci.yml, Jenkinsfile, etc.)
- Verify:
  - All required test jobs are active (not commented out)
  - Test commands in CI match pipeline.config.yaml test_commands
  - Dependencies/services configured (DB, Redis, etc. if needed)
  - Build step exists and runs
  - Lint step exists
- If issues found and test_stage.ci_audit.fix_commented_jobs is true:
  - Spawn fix subagent to uncomment/fix CI config
  - Create PR, human gate
- Report CI health table: job | status | notes

## Step 7: CD Pipeline Audit
- Detect CD config files (deploy workflows, Dockerfile, docker-compose, etc.)
- Verify:
  - Deploy steps exist for each environment (staging at minimum)
  - Post-deploy smoke test or health check exists
  - Rollback strategy documented or configured
  - Environment-specific configs exist
- Report-only (no auto-fix) — CD changes are high-risk

## Step 8: Local Deployment Verification
- Leverages same infrastructure as execute.md Step 5 (smoke test) but runs AFTER test suite passes
- Start dev server, health checks, core user flow, teardown
- Key difference from execute.md smoke test: this runs after ALL test PRs are merged,
  verifying nothing broke during test additions
- If smoke_test.enabled is false, skip and report SKIPPED

## Step 9: Full Critic Validation (Cumulative Diff)
- Run ALL 10 critics (parallel, opus) against the FULL cumulative diff (main..HEAD)
- Key difference from execute Stage 4: execute reviews per-task diffs; /test reviews the
  cumulative result — catches cross-cutting issues (e.g., two tasks creating a combined security gap)
- If any critic FAILs:
  - Spawn fix subagent → re-validate failed critics only
  - Max 3 iterations, then escalate
- All critics must PASS before declaring Stage 5 complete

## Step 10: Final Report
- Present comprehensive report with per-section verdicts:
  - Test Inventory: N source files audited, N gaps found, N gaps filled
  - Test Results: per-type pass/fail/skip table
  - Coverage: per-file table for changed files, overall %
  - CI Audit: job health table
  - CD Audit: component health table
  - Local Deployment: smoke test results
  - Critic Validation: 10-critic score table
  - Overall: PASS (all sections green) or FAIL (with blocking items listed)
```

### 2. EDIT: `commands/fullpipeline.md`

**Changes:**

a. **Architecture diagram** (line 12-32): Add Stage 5 node:
```
  ├─ Stage 4 subagent (fresh context) ──► Code implemented, PRs merged
  │    └─ per-task: build subagent → review subagent → critic subagents
  │
  │  ◄── GATE 4: per-PR approval (handled inside Stage 4) ──►
  │
  ├─ Stage 5 subagent (fresh context) ──► Tests verified, CI/CD audited
  │    └─ fix subagents (if gaps) → critic subagents (parallel)
  │
  │  ◄── GATE 5: user approves test results ──►
  │
  └─ Completion Report
```

b. **Orchestrator State** (line 44-50): Add `test_result: PASS | FAIL | SKIPPED`

c. **New Stage 5 section** (after Stage 4, before Pipeline State Tracking):
- Subagent prompt reading `/test` command instructions
- Gate 5: present test results, user approves/edits/aborts

d. **Completion section** (line 281+):
- Update to reference Stage 5 subagent return
- Add Test Verification section to final report template
- Update heading rules: test failures → "Pipeline Incomplete — Test Verification Failure"

e. **Error Recovery** (line 269-277): Add Stage 5 entry:
- "Stage 5 interrupted: Re-run `/test @plan` — idempotent, scans from scratch"

### 3. EDIT: `pipeline/templates/pipeline-config-template.yaml`

Add new `test_stage` config section (after `smoke_test`, before `paths`) and add `test` to validation stages:

```yaml
  # Test verification stage (Stage 5 of /fullpipeline, also /test standalone)
  # Canonical schema is in commands/test.md — keep both in sync.
  test_stage:
    enabled: true                    # set to false to skip Stage 5 entirely
    coverage_thresholds:
      lines: 80                      # minimum line coverage % for changed files
    fix_max_iterations: 3            # max fix cycles for test failures and critic findings
    ci_audit:
      enabled: true                  # set to false to skip CI audit
      fix_commented_jobs: true       # auto-fix commented-out CI jobs
    cd_audit:
      enabled: true                  # set to false to skip CD audit
    local_deployment:
      enabled: true                  # set to false to skip post-test smoke test
```

Add `test` stage to `scoring.stages`:
```yaml
      test:
        critics: [product, dev, devops, qa, security, performance, data-integrity, observability, api-contract, designer]
        mode: parallel
```

Also add `e2e` and `component` to `test_commands`:
```yaml
  test_commands:
    unit: "npm test"
    component: "npm run test:component"  # component tests (if has_frontend)
    integration: "npm run test:integration"
    ui: "npm run test:ui"
    e2e: "npm run test:e2e"
    all: "npm run test:all"
```

### 4. EDIT: `WORKFLOW.md`

- Update pipeline overview diagram (line 6-13): Add `/test` stage + GATE 5
- Add new **Stage 5: Test Verification — `/test`** section (after Stage 4, before Standalone Validation)
- Update Error Recovery table: add Stage 5 row
- Update Quick Reference table: add `/test` command
- Update Key Files structure: add `test.md` to commands list
- Update Configuration section: mention test_stage config

### 5. EDIT: `README.md`

- Update flow diagram (line 8-9): Add `Test` stage between Code and final
- Update Commands table (line 62-70): Add `/test` row
- Update Quick Start examples: mention `/test`
- Update Project Structure: add `test.md` to commands list

---

## Key Design Decisions

1. **Cumulative diff review** — Execute reviews per-task diffs; `/test` reviews the full cumulative diff (`main..HEAD`). This catches cross-cutting issues missed by per-task reviews.

2. **Fix-and-rerun loop** — Same Ralph Loop pattern as execute.md (max 3 iterations, then escalate). Applies to both test failures and critic findings.

3. **CI audit is actionable** — Doesn't just report commented-out jobs; spawns a subagent to fix them (configurable via `ci_audit.fix_commented_jobs`).

4. **Idempotent** — No persistent state. Re-run scans everything from scratch. Safe to interrupt and resume.

5. **Fresh context** — Runs as its own subagent in fullpipeline, keeping the orchestrator lightweight.

6. **Post-test smoke test** — Re-runs local deployment AFTER test PRs merge to verify test additions didn't break anything. Reuses execute.md's smoke test infrastructure.

7. **Configurable skip** — `test_stage.enabled: false` skips the entire stage (for projects where it's not needed).

---

## Verification

After implementation:
1. Read `commands/test.md` — verify it follows execute.md patterns (steps, subagent prompts, Ralph Loop, human gates, report format)
2. Read `commands/fullpipeline.md` — verify Stage 5 is between Stage 4 and Completion, Gate 5 exists, architecture diagram updated
3. Read `pipeline/templates/pipeline-config-template.yaml` — verify test_stage config, test stage in scoring.stages, e2e/component in test_commands
4. Read `WORKFLOW.md` — verify diagrams, tables, and error recovery include Stage 5
5. Read `README.md` — verify flow diagram, commands table, project structure include `/test`
6. Run `/validate` against all changed files with all 10 critics
