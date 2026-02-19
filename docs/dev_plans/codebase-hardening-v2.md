# Dev Plan: Codebase Hardening v2

**PRD:** docs/prd/codebase-hardening-v2.md
**Date:** 2026-02-19

## Pipeline Status
- **Stage:** COMPLETE (Stage 4 of 4)
- **Started:** 2026-02-19
- **PRD:** docs/prd/codebase-hardening-v2.md
- **Dev Plan:** docs/dev_plans/codebase-hardening-v2.md
- **JIRA:** Skipped (no config)
- **Progress:** 14/14 tasks complete
- **Tests:** 145/145 pass

---

## EPIC: Dev-Pipeline Codebase Hardening v2

Fix all critical findings from 5-critic review: credential safety, code duplication, test coverage, and code quality.

---

## STORY 1: Credential Safety & Error Redaction

Fix broken error redaction and add consistent credential protection across all scripts.

**Time Estimate:** ~3 hours

### TASK 1.1: Fix broken regex redaction and extract shared redaction utility
**Depends On:** None
**Parallel Group:** A
**Complexity:** Medium
**Estimated Time:** 1.5 hours

**Description:**
The error redaction in `jira-import.js:331` uses `new RegExp(this.auth, 'g')` which breaks on Base64 special chars (`+`, `/`, `=`). Fix by using safe string replacement. Extract into a shared utility so all scripts use the same approach.

**Implementation:**
1. Create `scripts/jira/lib/redact.js` with a `redactAuth(text, authString)` function that:
   - Returns text unchanged if `authString` is empty, null, or undefined (early-return guard)
   - Uses `text.split(authString).join('[REDACTED]')` instead of RegExp for the raw auth string
   - Also redacts the URL-encoded form: `text.split(encodeURIComponent(authString)).join('[REDACTED]')` as a second pass (handles credential reflection in redirect URLs / error bodies)
2. Update `jira-import.js` `JiraClient.makeRequest` (line 331) to import and use `redactAuth`
3. Export the function for use by other scripts

**Required Tests:**
- **UT:** Test `redactAuth` with normal Base64, Base64 containing `+`, `/`, `=` chars, empty/null/undefined auth string (must return text unchanged), auth string not present in text, URL-encoded form of auth string in text

#### SUBTASK 1.1.1: Create `scripts/jira/lib/redact.js` with safe string replacement
#### SUBTASK 1.1.2: Update `jira-import.js` to import and use `redactAuth`
#### SUBTASK 1.1.3: Write unit tests for `redactAuth` in `test/redact.test.js`

---

### TASK 1.2: Add error redaction to transition-issue.js
**Depends On:** TASK 1.1
**Parallel Group:** B
**Complexity:** Simple
**Estimated Time:** 45 minutes

**Description:**
`transition-issue.js` makes authenticated JIRA API requests but does not redact credentials from error output. Import the shared `redactAuth` from `lib/redact.js` and apply it to all 4 error paths. Note: the module-level `auth` variable (line 141) means redaction must be wired differently than in the class-based `jira-import.js`.

**Implementation:**
1. Import `redactAuth` from `./lib/redact.js`
2. Apply redaction in `getIssue`, `getTransitions`, `transition`, and `addComment` error paths (all 4 `throw new Error(...)` sites)
3. Also apply redaction in the top-level catch block (line 287 `console.error`) to catch errors that propagate from non-makeRequest sources

**Required Tests:**
- **UT:** For each HTTP-calling function (`getIssue`, `getTransitions`, `transition`, `addComment`), mock a failing HTTP call that returns the auth string in the error body and assert the thrown/logged error does NOT contain the raw auth string

#### SUBTASK 1.2.1: Import `redactAuth` and apply to all HTTP error paths in transition-issue.js
#### SUBTASK 1.2.2: Write integration tests verifying redaction in all 4 error paths in `test/transition-redaction.test.js`

---

### TASK 1.3: Add error redaction to cleanup-import.js
**Depends On:** TASK 1.1
**Parallel Group:** B
**Complexity:** Simple
**Estimated Time:** 45 minutes

**Description:**
`cleanup-import.js` makes authenticated JIRA API requests but does not redact credentials from error output. Both the `JiraClient.makeRequest` error path and the top-level catch blocks (e.g., line 295) must be covered.

**Implementation:**
1. Import `redactAuth` from `./lib/redact.js`
2. Apply redaction in `JiraClient.makeRequest` error path
3. Apply redaction in top-level catch blocks that print `error.message` to console (to catch network-level errors from `fetch` that may include URL-embedded credentials)

**Required Tests:**
- **UT:** Mock a failing HTTP call that returns the auth string in the error body and assert the thrown/logged error does NOT contain the raw auth string

#### SUBTASK 1.3.1: Import `redactAuth` and apply to all HTTP error paths in cleanup-import.js
#### SUBTASK 1.3.2: Write integration test verifying redaction in `test/cleanup-redaction.test.js`

---

## STORY 2: Shared Module Extraction

Consolidate duplicated utilities into shared modules in `scripts/jira/lib/`.

**Time Estimate:** ~4 hours

### TASK 2.1: Extract `loadEnvJira` into shared module
**Depends On:** None
**Parallel Group:** A
**Complexity:** Simple
**Estimated Time:** 45 minutes

**Description:**
`loadEnvJira()` is copy-pasted in 3 files. Extract into `scripts/jira/lib/env.js`. The shared version must resolve `.env.jira` relative to the project root (computed from the script's own `import.meta.url` location), NOT from `process.cwd()`, to avoid breakage when scripts are invoked from a different directory.

**Implementation:**
1. Create `scripts/jira/lib/env.js` exporting `loadEnvJira()` — resolve `.env.jira` path relative to the project root derived from `import.meta.url` (3 levels up from `lib/env.js`)
2. Update `jira-import.js` to import from `./lib/env.js` and remove inline copy
3. Update `transition-issue.js` to import from `./lib/env.js` and remove inline copy
4. Update `cleanup-import.js` to import from `./lib/env.js` and remove inline copy
5. Verify all 3 scripts still work with `node <script> --help`

**Required Tests:**
- **UT:** Test `loadEnvJira` exports correctly, calling it with correct env vars returns expected values, calling it with missing required vars throws a clear error
- **UT:** Existing tests must still pass (regression check)

#### SUBTASK 2.1.1: Create `lib/env.js` with `loadEnvJira` export
#### SUBTASK 2.1.2: Update all 3 scripts to import from shared module
#### SUBTASK 2.1.3: Write unit tests for `loadEnvJira` in `test/env.test.js`

---

### TASK 2.2: Extract `retryWithBackoff` and `sleep` into shared module
**Depends On:** None
**Parallel Group:** A
**Complexity:** Simple
**Estimated Time:** 30 minutes

**Description:**
`retryWithBackoff()` and `sleep()` are duplicated in `jira-import.js` and `transition-issue.js`. Extract into `scripts/jira/lib/retry.js`. Use named constants for retry configuration (MAX_RETRIES, RETRY_BASE_DELAY_MS).

**Implementation:**
1. Create `scripts/jira/lib/retry.js` exporting `retryWithBackoff`, `sleep`, and constants `MAX_RETRIES`, `RETRY_BASE_DELAY_MS`
2. Update `jira-import.js` to import from `./lib/retry.js`
3. Update `transition-issue.js` to import from `./lib/retry.js`
4. Note: `cleanup-import.js` will gain retry logic through the shared `JiraClient` in TASK 2.3 — no standalone retry import needed here

**Required Tests:**
- **UT:** Test `retryWithBackoff` — success on first try, retry on 429, retry on 503, max retries exceeded

#### SUBTASK 2.2.1: Create `lib/retry.js` with named constants and exports
#### SUBTASK 2.2.2: Update all scripts to import from shared retry module
#### SUBTASK 2.2.3: Write unit tests for `retryWithBackoff` in `test/retry.test.js`

---

### TASK 2.3: Extract `JiraClient` into shared module
**Depends On:** TASK 1.1, TASK 2.1, TASK 2.2
**Parallel Group:** B
**Complexity:** Complex
**Estimated Time:** 3 hours

**Description:**
Two different `JiraClient` implementations exist in `jira-import.js` and `cleanup-import.js`. Consolidate into `scripts/jira/lib/jira-client.js` with retry logic and error redaction. The existing `jira-import.js` version is the more complete one (retry + redaction + user cache). Before merging, diff both implementations to document API surface differences (e.g., `cleanup-import.js` has `searchIssuesByLabel`, `deleteIssue` while `jira-import.js` has `makeRequest` with user cache). Store the auth string as a private class field (`#auth`) using ES2022 syntax to prevent accidental leakage through `JSON.stringify(client)` or `console.log(client)`.

**Implementation:**
1. First: diff both JiraClient implementations and document differences in method signatures, error handling, and features
2. Create `scripts/jira/lib/jira-client.js` based on `jira-import.js` JiraClient, importing `retryWithBackoff` from `./retry.js` and `redactAuth` from `./redact.js`. Use `#auth` private class field for credential storage.
3. Export `JiraClient` class
4. Update `jira-import.js` to import `JiraClient` from `./lib/jira-client.js`, remove inline class
5. Update `cleanup-import.js` to import `JiraClient` from `./lib/jira-client.js`, remove inline class
6. Update `transition-issue.js` to use shared `JiraClient` instead of inline fetch calls
7. Verify all 3 scripts still work with `--help` and dry-run modes

**Required Tests:**
- **UT:** Test JiraClient: successful request, HTTP error with redaction, retry on 429, retry on 503, max retries exceeded, getUserByEmail cache hit/miss, auth not visible via JSON.stringify or object enumeration

#### SUBTASK 2.3.1: Diff both JiraClient implementations and document differences
#### SUBTASK 2.3.2: Create `lib/jira-client.js` with consolidated JiraClient class (private #auth field)
#### SUBTASK 2.3.3: Update `jira-import.js` to use shared JiraClient
#### SUBTASK 2.3.4: Update `cleanup-import.js` to use shared JiraClient
#### SUBTASK 2.3.5: Update `transition-issue.js` to use shared JiraClient
#### SUBTASK 2.3.6: Write unit tests for JiraClient in `test/jira-client.test.js`

---

### TASK 2.4: Extract time estimate parsing into shared function
**Depends On:** None
**Parallel Group:** A
**Complexity:** Simple
**Estimated Time:** 30 minutes

**Description:**
Time estimate parsing regex is duplicated 3x in `jira-import.js` (createStory, createTask, createSubtask). Extract into a `parseTimeEstimate(text)` function.

**Implementation:**
1. Create `parseTimeEstimate(text)` function in `scripts/jira/lib/parse-utils.js` (shared module, consistent with lib/ extraction pattern)
2. Replace the 3 inline copies in `createStory`, `createTask`, `createSubtask` with import from `./lib/parse-utils.js`
3. Export the function for testing

**Required Tests:**
- **UT:** Test parseTimeEstimate: "8 hours" → "8h", "2 days" → "2d", "30 minutes" → "30m", "~4 hours" → "4h", "2-3 days" → "2d", null/empty → null

#### SUBTASK 2.4.1: Create `parseTimeEstimate` function and replace 3 inline copies
#### SUBTASK 2.4.2: Write unit tests for `parseTimeEstimate` in `test/parse-utils.test.js`

---

### TASK 2.5: Remove dead `test-parser.js`
**Depends On:** None
**Parallel Group:** A
**Complexity:** Simple
**Estimated Time:** 10 minutes

**Description:**
`test-parser.js` is a manual testing script with its own outdated copy of MarkdownParser. It's not referenced by any command or import. Remove it.

**Implementation:**
1. Verify no file imports `test-parser.js` (grep)
2. Delete `scripts/jira/test-parser.js`

**Required Tests:**
- None

#### SUBTASK 2.5.1: Verify no imports and delete test-parser.js

---

## STORY 3: Script Testability Refactor

Refactor scripts for unit testing by exporting functions and guarding top-level execution.

**Time Estimate:** ~2 hours

### TASK 3.1: Refactor `transition-issue.js` for testability
**Depends On:** TASK 2.3
**Parallel Group:** C
**Complexity:** Medium
**Estimated Time:** 1 hour

**Description:**
`transition-issue.js` executes at the top level, making it impossible to import for testing. Refactor to export core functions and guard execution with `isDirectRun`. Note: module-level variable assignments (`const apiUrl = process.env.JIRA_API_URL`, `const auth = Buffer.from(...)`, etc.) also execute at import time — these must be moved inside functions or guarded, not just `main()`.

**Implementation:**
1. Move module-level config variable assignments (`apiUrl`, `auth`, etc.) inside `main()` or a lazy-init function so they don't execute on import
2. Wrap CLI parsing and `main()` call in an `isDirectRun` guard
3. Export `transition`, `addComment`, `getTransitions`, `getIssue` functions
4. Ensure importing the module causes no side effects

**Required Tests:**
- **UT:** Verify module can be imported without side effects (no env var reads, no API calls)
- **UT:** Verify expected named exports exist and are functions: `transition`, `addComment`, `getTransitions`, `getIssue`

#### SUBTASK 3.1.1: Move module-level config into functions and wrap top-level code in isDirectRun guard
#### SUBTASK 3.1.2: Export core functions
#### SUBTASK 3.1.3: Write import/export verification tests in `test/transition-testability.test.js`

---

### TASK 3.2: Refactor `cleanup-import.js` for testability
**Depends On:** TASK 2.3
**Parallel Group:** C
**Complexity:** Medium
**Estimated Time:** 1 hour

**Description:**
`cleanup-import.js` executes at the top level. Refactor same pattern as TASK 3.1. Move module-level config assignments inside functions.

**Implementation:**
1. Move module-level config variable assignments inside `main()` or a lazy-init function
2. Wrap CLI parsing and `main()` call in an `isDirectRun` guard
3. Export `deleteByBatch`, `deleteByFile`, `listImports` functions
4. Ensure importing the module causes no side effects

**Required Tests:**
- **UT:** Verify module can be imported without side effects (no env var reads, no API calls)
- **UT:** Verify expected named exports exist and are functions: `deleteByBatch`, `deleteByFile`, `listImports`

#### SUBTASK 3.2.1: Move module-level config into functions and wrap top-level code in isDirectRun guard
#### SUBTASK 3.2.2: Export core functions
#### SUBTASK 3.2.3: Write import/export verification tests in `test/cleanup-testability.test.js`

---

### TASK 3.3: Fix fragile `isDirectRun` in jira-import.js
**Depends On:** None
**Parallel Group:** A
**Complexity:** Simple
**Estimated Time:** 15 minutes

**Description:**
The current `isDirectRun` check on line 1075 uses `import.meta.url.endsWith(process.argv[1].replace(/^.*\//, ''))` which only compares filename (could false-positive). Replace with robust path comparison.

**Implementation:**
1. Replace with: `const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);`
2. Import `resolve` from `path` (already imported as `join`)

**Required Tests:**
- **UT:** Verify `jira-import.js` can be imported as a module without side effects (no CLI parsing, no API calls) — this validates AC 3.4 for jira-import.js

#### SUBTASK 3.3.1: Replace fragile isDirectRun with robust path comparison
#### SUBTASK 3.3.2: Write import side-effect verification test in `test/jira-import-testability.test.js`

---

## STORY 4: Comprehensive Test Coverage

Add unit tests for all untested core business logic.

**Time Estimate:** ~3 hours

### TASK 4.1: Write tests for utility functions
**Depends On:** TASK 2.4
**Parallel Group:** B
**Complexity:** Medium
**Estimated Time:** 1.5 hours

**Description:**
Add unit tests for `getHeadingId()`, `planItemIdFromIssueId()`, `summaryWithPlanId()`, and `updateDevPlanWithJiraLinks()`.

**Implementation:**
1. Export these functions from `jira-import.js`
2. Create `test/jira-import-utils.test.js`
3. Test each function with expected inputs and edge cases

**Required Tests:**
- **UT:** `getHeadingId`: all heading formats (EPIC, STORY, TASK, SUBTASK, non-heading)
- **UT:** `planItemIdFromIssueId`: EPIC → "1", STORY-1 → "1", TASK-1.1 → "1.1", SUBTASK-1.1.1 → "1.1.1", null/empty
- **UT:** `summaryWithPlanId`: prepends id, skips if already prefixed
- **UT:** `updateDevPlanWithJiraLinks`: inserts JIRA links after headings, skips existing links

#### SUBTASK 4.1.1: Export utility functions from jira-import.js
#### SUBTASK 4.1.2: Write tests for getHeadingId, planItemIdFromIssueId, summaryWithPlanId
#### SUBTASK 4.1.3: Write tests for updateDevPlanWithJiraLinks

---

### TASK 4.2: Final verification gate
**Depends On:** TASK 1.1, TASK 1.2, TASK 1.3, TASK 2.1, TASK 2.2, TASK 2.3, TASK 2.4, TASK 3.1, TASK 3.2, TASK 3.3, TASK 4.1
**Parallel Group:** D
**Complexity:** Medium
**Estimated Time:** 45 minutes

**Description:**
Comprehensive verification that all changes work together. This is the final quality gate before the hardening is considered complete.

**Constraints:** All tests MUST use `node:test` with zero external dependencies (AC 4.7).

**Implementation:**
1. Verify all expected test files exist: `test/redact.test.js`, `test/retry.test.js`, `test/jira-client.test.js`, `test/parse-utils.test.js`, `test/jira-import-utils.test.js`, `test/env.test.js`, `test/transition-redaction.test.js`, `test/cleanup-redaction.test.js`, `test/transition-testability.test.js`, `test/cleanup-testability.test.js`, `test/jira-import-testability.test.js` (plus existing `test/markdown-parser.test.js`, `test/markdown-to-adf.test.js`)
2. Run `cd scripts/jira && npm test` and verify 100% pass rate
3. Run smoke tests: `node jira-import.js --help`, `node transition-issue.js --help`, `node cleanup-import.js --help` — each must exit 0 with expected output (AC 2.6)
4. Cross-script credential verification (AC 1.6): run each script against a deliberately invalid JIRA URL with a known auth string and grep all output (stdout + stderr) to confirm the auth string does not appear
5. Verify no residual magic numbers for retry config in consuming scripts (grep for hardcoded retry delays)
6. Verify `test-parser.js` has been deleted
7. Verify no test file imports external dependencies (grep for `require(` or non-`node:` imports in test files)

**Required Tests:**
- All existing + new tests must pass
- Smoke tests pass for all 3 scripts
- Cross-script credential leak test passes (AC 1.6)

#### SUBTASK 4.2.1: Run npm test and verify 100% pass rate
#### SUBTASK 4.2.2: Run smoke tests for all 3 scripts with --help
#### SUBTASK 4.2.3: Run cross-script credential leak verification (AC 1.6)
#### SUBTASK 4.2.4: Verify test file inventory and zero external dependencies (AC 4.7)

---

## STORY 5: Code Quality Polish

Minor code quality improvements.

**Time Estimate:** ~1 hour

### TASK 5.1: Replace Math.random with crypto in generateBatchId
**Depends On:** None
**Parallel Group:** A
**Complexity:** Simple
**Estimated Time:** 15 minutes

**Description:**
`generateBatchId` uses `Math.random()`. Replace with `crypto.randomBytes()`.

**Implementation:**
1. Import `randomBytes` from `node:crypto` at top of `jira-import.js`
2. Replace `Math.random().toString(36).substring(2, 7)` with `randomBytes(4).toString('hex')`

**Required Tests:**
- None (format change is backward-compatible — batch IDs are freeform strings)

#### SUBTASK 5.1.1: Replace Math.random with crypto.randomBytes

---

### TASK 5.2: Fix README curl example
**Depends On:** None
**Parallel Group:** A
**Complexity:** Simple
**Estimated Time:** 10 minutes

**Description:**
The JIRA README troubleshooting section shows `curl -u your.email:your_token` which encourages putting credentials on the command line (visible in `ps aux` and shell history).

**Implementation:**
1. Update the curl example to use `-u your.email` (will prompt for password) — do NOT offer "add a note" as an alternative; the command itself must be safe to copy-paste
2. Add a security caveat note below the example as additional context (in addition to the fix, not as a substitute)

**Required Tests:**
- None

#### SUBTASK 5.2.1: Update curl example in scripts/jira/README.md

---

## Dependency Graph

```
Group A (parallel, first — 8 tasks):
  TASK 1.1  (fix redaction + shared utility)
  TASK 2.1  (extract loadEnvJira)
  TASK 2.2  (extract retryWithBackoff/sleep)
  TASK 2.4  (extract time estimate parsing)
  TASK 2.5  (remove test-parser.js)
  TASK 3.3  (fix isDirectRun + import test)
  TASK 5.1  (crypto.randomBytes)
  TASK 5.2  (README curl fix)

Group B (after A — 4 tasks):
  TASK 1.2  (redaction in transition-issue.js + integration tests) ← depends on 1.1
  TASK 1.3  (redaction in cleanup-import.js + integration tests)   ← depends on 1.1
  TASK 2.3  (extract JiraClient with private #auth)                ← depends on 1.1, 2.1, 2.2
  TASK 4.1  (utility function tests)                               ← depends on 2.4

Group C (after B — 2 tasks):
  TASK 3.1  (refactor transition-issue.js + export tests)  ← depends on 2.3
  TASK 3.2  (refactor cleanup-import.js + export tests)    ← depends on 2.3

Group D (after C — 1 task):
  TASK 4.2  (final verification gate)  ← depends on ALL previous tasks
```

## Commit Strategy

Each STORY should be committed atomically (one commit per story minimum) so `git revert` can undo any story independently if needed.

## Summary

| Metric | Value |
|--------|-------|
| Stories | 5 |
| Tasks | 14 (Simple: 7, Medium: 5, Complex: 1, + 1 verification gate) |
| Parallel Groups | 4 (A: 8 tasks, B: 4 tasks, C: 2 tasks, D: 1 task) |
| Estimated Time | ~14 hours |
