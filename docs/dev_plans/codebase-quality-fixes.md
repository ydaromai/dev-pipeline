# Dev Plan: Codebase Quality Fixes

**PRD:** docs/prd/codebase-quality-fixes.md
**Date:** 2026-02-18

---

## Pipeline Status
- **Stage:** COMPLETE (Stage 4 of 4)
- **Started:** 2026-02-18
- **PRD:** docs/prd/codebase-quality-fixes.md ✅
- **Dev Plan:** docs/dev_plans/codebase-quality-fixes.md ✅
- **JIRA:** Skipped
- **Progress:** 13/13 tasks complete ✅

---

## EPIC: Dev-Pipeline Codebase Quality Fixes

Fix all 17 critical findings from the 5-critic code review: security hardening, ESM consistency, input robustness, documentation accuracy, and test coverage.

---

## STORY 1: Security & Credential Hardening

Protect credentials from accidental exposure and harden scripts against information leakage.

**Time Estimate:** 2 hours
**Labels:** `security`, `P0`

### TASK 1.1: Update .gitignore and create .env.example
**Depends On:** None
**Parallel Group:** A
**Complexity:** Simple
**Estimated Time:** 20 minutes
**Status:** ⬜ TODO

**Description:**
Add credential files and generated artifacts to `.gitignore`. Create `.env.example` template.

**Implementation:**
1. Edit `.gitignore` to add: `.env.jira`, `jira-issue-mapping.json`, `.jira-import-history.json`, `node_modules/`
2. Create `scripts/jira/.env.example` with placeholder values using `JIRA_API_URL` (not `JIRA_HOST`)

**Files to modify:**
- `.gitignore`
- `scripts/jira/.env.example` (new)

**Required Tests:**
- None (manual verification)

**Acceptance Criteria:** AC 1.1, AC 1.2, AC 3.3

---

### TASK 1.2: Remove hardcoded MVP fallback
**Depends On:** None
**Parallel Group:** A
**Complexity:** Simple
**Estimated Time:** 10 minutes
**Status:** ⬜ TODO

**Description:**
Remove the `|| 'MVP'` fallback from `jira-import.js` line 172. If `JIRA_PROJECT_KEY` is not set, the `validateConfig()` function already catches and reports it.

**Implementation:**
1. Change `process.env.JIRA_PROJECT_KEY || 'MVP'` to `process.env.JIRA_PROJECT_KEY` in `scripts/jira/jira-import.js`

**Files to modify:**
- `scripts/jira/jira-import.js` (line 172)

**Required Tests:**
- None (existing `validateConfig()` handles missing key)

**Acceptance Criteria:** AC 1.3

---

### TASK 1.3: Sanitize API token from error messages
**Depends On:** None
**Parallel Group:** A
**Complexity:** Simple
**Estimated Time:** 20 minutes
**Status:** ⬜ TODO

**Description:**
In `jira-import.js`, the `makeRequest` error handler at line 324 throws the raw JIRA API error text which may contain auth-related information. Redact the Base64 auth string from error messages before logging.

**Implementation:**
1. In `JiraClient.makeRequest()` in `jira-import.js`, redact the auth header value from error text before throwing
2. In `cleanup-import.js`, apply the same pattern to its `makeRequest()` (line 204)

**Files to modify:**
- `scripts/jira/jira-import.js` (JiraClient.makeRequest, ~line 324)
- `scripts/jira/cleanup-import.js` (JiraClient.makeRequest, ~line 204)

**Required Tests:**
- None (defense-in-depth measure)

**Acceptance Criteria:** AC 1.4

---

## STORY 2: Module System Consistency

Ensure all scripts use ES Modules and remove dead code.

**Time Estimate:** 2 hours
**Labels:** `code-quality`, `P0`

### TASK 2.1: Create package.json and convert transition-issue.js to ESM
**Depends On:** None
**Parallel Group:** A
**Complexity:** Medium
**Estimated Time:** 45 minutes
**Status:** ⬜ TODO

**Description:**
Create `scripts/jira/package.json` with `"type": "module"`. Convert `transition-issue.js` from CommonJS (`require`/`module.exports`) to ESM (`import`/`export`).

**Implementation:**
1. Create `scripts/jira/package.json`:
   ```json
   {
     "name": "dev-pipeline-jira-scripts",
     "version": "1.0.0",
     "type": "module",
     "description": "JIRA integration scripts for the dev-pipeline",
     "scripts": {
       "test": "node --test test/"
     }
   }
   ```
2. Convert `transition-issue.js`:
   - `const { readFileSync, existsSync } = require('fs')` → `import { readFileSync, existsSync } from 'fs'`
   - `const { join } = require('path')` → `import { join } from 'path'`
   - No `module.exports` used (script is standalone CLI)
3. Verify all scripts run: `node scripts/jira/jira-import.js --help`, `node scripts/jira/transition-issue.js --help`, `node scripts/jira/cleanup-import.js --help`

**Files to modify:**
- `scripts/jira/package.json` (new)
- `scripts/jira/transition-issue.js` (ESM conversion)

**Required Tests:**
- Manual: `node scripts/jira/transition-issue.js --help` runs without error

**Acceptance Criteria:** AC 2.1, AC 2.2, AC 2.4

---

### TASK 2.2: Remove dead lib/jira-client.js
**Depends On:** None
**Parallel Group:** A
**Complexity:** Simple
**Estimated Time:** 10 minutes
**Status:** ⬜ TODO

**Description:**
Remove `scripts/jira/lib/jira-client.js`. It uses CommonJS + `axios` (not installed), uses `JIRA_HOST` (legacy env var), and is never imported by any active script. `jira-import.js` has its own inline `JiraClient` class.

**Implementation:**
1. Delete `scripts/jira/lib/jira-client.js`
2. Verify no remaining imports: `grep -r "jira-client" scripts/`

**Files to modify:**
- `scripts/jira/lib/jira-client.js` (delete)

**Required Tests:**
- None

**Acceptance Criteria:** AC 2.3

---

## STORY 3: Input Robustness

Fix argument parsing, null guard, and idempotency bypass to prevent crashes and data corruption.

**Time Estimate:** 1.5 hours
**Labels:** `bug-fix`, `P0`

### TASK 3.1: Fix --file argument parsing
**Depends On:** None
**Parallel Group:** A
**Complexity:** Simple
**Estimated Time:** 15 minutes
**Status:** ⬜ TODO

**Description:**
`arg.split('=')[1]` truncates file paths containing `=` (e.g., `docs/dev_plans/feature=v2.md`). Use `arg.slice('--file='.length)` instead, matching the pattern already used in `test-parser.js`.

**Implementation:**
1. In `jira-import.js` line 208: change `args.file = arg.split('=')[1]` to `args.file = arg.slice('--file='.length)`
2. In `cleanup-import.js` line 80: change `args.batch = arg.split('=')[1]` to `args.batch = arg.slice('--batch='.length)`
3. In `cleanup-import.js` line 82: change `args.file = arg.split('=')[1]` to `args.file = arg.slice('--file='.length)`

**Files to modify:**
- `scripts/jira/jira-import.js` (line 208)
- `scripts/jira/cleanup-import.js` (lines 80, 82)

**Required Tests:**
- **UT:** Test that `--file=path/with=equals.md` correctly extracts the full path

**Acceptance Criteria:** AC 4.1

---

### TASK 3.2: Guard currentTask null access
**Depends On:** None
**Parallel Group:** A
**Complexity:** Simple
**Estimated Time:** 15 minutes
**Status:** ⬜ TODO

**Description:**
In `jira-import.js` line 469, `currentTask.subtasks.push(currentSubtask)` crashes with `TypeError` if a SUBTASK heading appears before any TASK heading. Add a null guard.

**Implementation:**
1. At line 468-470 in `jira-import.js`, wrap with null check:
   ```javascript
   if (currentSubtask && currentTask) {
     currentTask.subtasks.push(currentSubtask);
   } else if (currentSubtask) {
     console.warn(`Warning: SUBTASK ${currentSubtask.id} found without a parent TASK — skipping`);
   }
   ```
2. Apply the same guard at line 547 (final flush):
   ```javascript
   if (currentSubtask && currentTask) currentTask.subtasks.push(currentSubtask);
   ```

**Files to modify:**
- `scripts/jira/jira-import.js` (lines 468-470, 547)

**Required Tests:**
- **UT:** Test MarkdownParser with SUBTASK before TASK does not crash

**Acceptance Criteria:** AC 4.2

---

### TASK 3.3: Fix checkIdempotency bypass on empty input
**Depends On:** None
**Parallel Group:** A
**Complexity:** Simple
**Estimated Time:** 15 minutes
**Status:** ⬜ TODO

**Description:**
In `jira-import.js` `checkIdempotency()`, if the user presses Enter without typing a number, the answer is `''` which doesn't match `'1'` or `'2'`, falls through to `return true` (line 161), effectively choosing "Continue anyway". Empty input should default to cancel.

**Implementation:**
1. After line 146, add: if answer is empty or not `'1'`/`'2'`/`'3'`, treat as cancel:
   ```javascript
   if (!answer || !['1', '2', '3'].includes(answer)) {
     console.log('\n❌ Import cancelled.\n');
     process.exit(0);
   }
   ```

**Files to modify:**
- `scripts/jira/jira-import.js` (checkIdempotency function, ~line 146)

**Required Tests:**
- None (interactive function)

**Acceptance Criteria:** AC 4.3

---

## STORY 4: Configuration & Documentation Accuracy

Standardize env var naming and fix documentation to reflect the current 5-critic system.

**Time Estimate:** 1.5 hours
**Labels:** `documentation`, `P1`

### TASK 4.1: Standardize JIRA_API_URL env var
**Depends On:** TASK 2.1
**Parallel Group:** B
**Complexity:** Simple
**Estimated Time:** 15 minutes
**Status:** ⬜ TODO

**Description:**
`transition-issue.js` line 110 falls back to `JIRA_HOST`. After ESM conversion (TASK 2.1), standardize to `JIRA_API_URL` only. Also fix `pipeline-init.md` Step 9 which uses `JIRA_HOST`.

**Implementation:**
1. In `transition-issue.js` line 110: change `process.env.JIRA_API_URL || process.env.JIRA_HOST` to `process.env.JIRA_API_URL`
2. In `transition-issue.js` error message (line 133): change `JIRA_API_URL (or JIRA_HOST)` to `JIRA_API_URL`
3. In `commands/pipeline-init.md` Step 9 (line 273): change `JIRA_HOST=` to `JIRA_API_URL=`

**Files to modify:**
- `scripts/jira/transition-issue.js` (lines 110, 133)
- `commands/pipeline-init.md` (line 273)

**Required Tests:**
- None

**Acceptance Criteria:** AC 3.1

---

### TASK 4.2: Fix pipeline-init.md and prd2plan.md
**Depends On:** None
**Parallel Group:** A
**Complexity:** Simple
**Estimated Time:** 10 minutes
**Status:** ⬜ TODO

**Description:**
1. `pipeline-init.md` Step 9 summary says "Product, Dev, DevOps, QA (parallel mode)" — missing Security
2. `prd2plan.md` Step 6 says "either critic" — should be "any critic" since there are 5

**Implementation:**
1. In `commands/pipeline-init.md` line 267: change `Product, Dev, DevOps, QA (parallel mode)` to `Product, Dev, DevOps, QA, Security (parallel mode)`
2. In `commands/prd2plan.md` Step 6: change "either" to "any"

**Files to modify:**
- `commands/pipeline-init.md` (~line 267)
- `commands/prd2plan.md` (Step 6)

**Required Tests:**
- None

**Acceptance Criteria:** AC 3.2, AC 5.1

---

### TASK 4.3: Update README legacy references
**Depends On:** None
**Parallel Group:** A
**Complexity:** Simple
**Estimated Time:** 20 minutes
**Status:** ⬜ TODO

**Description:**
`scripts/jira/README.md` references `dp2j`, `bdt`, `dwc` commands from a previous version. Update to current pipeline commands.

**Implementation:**
1. Line 9: Remove `dp2j` alias reference, just reference `node scripts/jira/jira-import.js`
2. Lines 83: Remove `dp2j` shorthand mention
3. Lines 399-428 (Workflow Integration section): Replace `bdt`, `dp2j`, `dwc` with pipeline commands (`/prd2plan`, `/plan2jira`, `/execute`)

**Files to modify:**
- `scripts/jira/README.md`

**Required Tests:**
- None

**Acceptance Criteria:** AC 5.2

---

### TASK 4.4: Fix execute.md jira_transition_path placeholder
**Depends On:** None
**Parallel Group:** A
**Complexity:** Simple
**Estimated Time:** 15 minutes
**Status:** ⬜ TODO

**Description:**
`execute.md` uses `<jira_transition_path>` as an unresolved placeholder. It should instruct the agent to read the path from `pipeline.config.yaml` `paths.jira_transition`, falling back to `scripts/jira/transition-issue.js`.

**Implementation:**
1. Add a note in Step 1 of `execute.md` to resolve `jira_transition_path` from `pipeline.config.yaml`
2. Update the placeholder references to explain the resolution

**Files to modify:**
- `commands/execute.md`

**Required Tests:**
- None

**Acceptance Criteria:** AC 5.3

---

## STORY 5: Unit Test Coverage

Add automated tests for core parsing and conversion logic using Node.js built-in test runner.

**Time Estimate:** 3 hours
**Labels:** `testing`, `P2`

### TASK 5.1: Unit tests for MarkdownParser
**Depends On:** TASK 2.1, TASK 3.2
**Parallel Group:** C
**Complexity:** Medium
**Estimated Time:** 1.5 hours
**Status:** ⬜ TODO

**Description:**
Write unit tests for the `MarkdownParser` class in `jira-import.js`. Export the class for testing.

**Implementation:**
1. Add `export { MarkdownParser }` at the bottom of `jira-import.js` (conditional, only when imported as module)
2. Create `scripts/jira/test/markdown-parser.test.js`
3. Test cases:
   - Happy path: Epic + 2 Stories + Tasks + Subtasks
   - Dual format: `## STORY 1:` vs `# STORY-1:`
   - Metadata extraction: Assignee, Priority, Time Estimate, Labels
   - Null currentTask edge case: SUBTASK before TASK (should not crash after TASK 3.2 fix)
   - Empty file input
   - File with Epic only (no stories)

**Files to modify:**
- `scripts/jira/jira-import.js` (add export)
- `scripts/jira/test/markdown-parser.test.js` (new)

**Required Tests:**
- **UT:** This IS the test task

**Acceptance Criteria:** AC 6.1, AC 6.3

---

### TASK 5.2: Unit tests for markdownToADF
**Depends On:** TASK 2.1
**Parallel Group:** C
**Complexity:** Medium
**Estimated Time:** 1.5 hours
**Status:** ⬜ TODO

**Description:**
Write unit tests for `markdownToADF` and helper functions in `lib/markdown-to-adf.js`.

**Implementation:**
1. Create `scripts/jira/test/markdown-to-adf.test.js`
2. Test cases:
   - Empty/null input → empty doc
   - Headings (h1-h6)
   - Bold, italic, inline code
   - Links
   - Ordered lists
   - Bullet lists
   - Checkboxes (task lists)
   - Code blocks with language
   - Mixed inline formatting
   - `prependAuditTrail` adds audit section

**Files to modify:**
- `scripts/jira/test/markdown-to-adf.test.js` (new)

**Required Tests:**
- **UT:** This IS the test task

**Acceptance Criteria:** AC 6.2, AC 6.3, AC 6.4

---

## Dependency Graph

```
Group A (parallel, no dependencies):
  TASK 1.1 — .gitignore + .env.example (Simple)
  TASK 1.2 — Remove MVP fallback (Simple)
  TASK 1.3 — Sanitize error messages (Simple)
  TASK 2.1 — package.json + ESM conversion (Medium)
  TASK 2.2 — Remove dead jira-client.js (Simple)
  TASK 3.1 — Fix --file parsing (Simple)
  TASK 3.2 — Guard currentTask null (Simple)
  TASK 3.3 — Fix idempotency bypass (Simple)
  TASK 4.2 — Fix pipeline-init + prd2plan docs (Simple)
  TASK 4.3 — Update README (Simple)
  TASK 4.4 — Fix execute.md placeholder (Simple)

Group B (after TASK 2.1):
  TASK 4.1 — Standardize JIRA_API_URL (Simple)

Group C (after TASK 2.1 + TASK 3.2):
  TASK 5.1 — MarkdownParser unit tests (Medium)
  TASK 5.2 — markdownToADF unit tests (Medium)
```

## Summary

| Metric | Value |
|--------|-------|
| Stories | 5 |
| Tasks | 13 (Simple: 10, Medium: 3, Complex: 0) |
| Parallel Groups | 3 (A: 11 tasks, B: 1 task, C: 2 tasks) |
| Estimated Total | ~10 hours |
