# Dev Plan: Make dev-pipeline a Portable Claude Code Plugin

**PRD:** docs/prd/plugin-compat.md
**Date:** 2026-02-25

## Pipeline Status
- **Stage:** EXECUTING (Stage 4 of 4)
- **Started:** 2026-02-25
- **PRD:** docs/prd/plugin-compat.md ✅
- **Dev Plan:** docs/dev_plans/plugin-compat.md ✅
- **JIRA:** PIPE-18 (Epic) ✅
- **Progress:** 4/4 tasks complete

---

## EPIC: Make dev-pipeline a Portable Claude Code Plugin
**JIRA:** [PIPE-18](https://wiseguys.atlassian.net/browse/PIPE-18)

Convert dev-pipeline from a symlink-dependent local setup to a portable Claude Code plugin by replacing all hardcoded `~/.claude/pipeline/` paths with `${CLAUDE_PLUGIN_ROOT}/pipeline/`, adding a plugin manifest, and updating documentation.

---

## STORY 1: Plugin Manifest & Command Path Replacements
**JIRA:** [PIPE-19](https://wiseguys.atlassian.net/browse/PIPE-19)
**PRD:** US-1, US-2 (FR-1, FR-2, FR-3)

Create the plugin manifest and perform the bulk find-and-replace across all command files and WORKFLOW.md.

**Time Estimate:** ~30 minutes

### TASK 1.1: Create plugin manifest and replace paths in all simple command files + WORKFLOW.md
**JIRA:** [PIPE-20](https://wiseguys.atlassian.net/browse/PIPE-20)
**Status:** DONE
**Depends On:** None
**Parallel Group:** A
**Complexity:** Simple
**Estimated Time:** 30 minutes

**Description:**
This task covers FR-1 (manifest), FR-2 (27 command path replacements), and FR-3 (1 WORKFLOW.md replacement). All are mechanical find-and-replace operations plus one new file creation.

**Subtasks:**

#### SUBTASK 1.1.1: Create `.claude-plugin/plugin.json`
**JIRA:** [PIPE-21](https://wiseguys.atlassian.net/browse/PIPE-21)

Create the directory and file:

```json
{
  "name": "dev-pipeline",
  "version": "1.0.0",
  "description": "AI-driven software delivery pipeline — PRD, dev plan, JIRA, execution with Ralph Loop and multi-critic review",
  "author": { "name": "Yohai Darom" },
  "repository": "https://github.com/ydaromai/dev-pipeline",
  "license": "MIT",
  "keywords": ["pipeline", "prd", "jira", "ralph-loop", "critics", "dev-plan"]
}
```

#### SUBTASK 1.1.2: Replace paths in `commands/req2prd.md` (2 replacements)
**JIRA:** [PIPE-22](https://wiseguys.atlassian.net/browse/PIPE-22)

| Line | Old | New |
|------|-----|-----|
| 12 | `~/.claude/pipeline/templates/prd-template.md` | `${CLAUDE_PLUGIN_ROOT}/pipeline/templates/prd-template.md` |
| 50 | `~/.claude/pipeline/agents/[role]-critic.md` | `${CLAUDE_PLUGIN_ROOT}/pipeline/agents/[role]-critic.md` |

#### SUBTASK 1.1.3: Replace paths in `commands/prd2plan.md` (6 replacements)
**JIRA:** [PIPE-23](https://wiseguys.atlassian.net/browse/PIPE-23)

| Line | Old | New |
|------|-----|-----|
| 88 | `~/.claude/pipeline/agents/product-critic.md` | `${CLAUDE_PLUGIN_ROOT}/pipeline/agents/product-critic.md` |
| 104 | `~/.claude/pipeline/agents/dev-critic.md` | `${CLAUDE_PLUGIN_ROOT}/pipeline/agents/dev-critic.md` |
| 121 | `~/.claude/pipeline/agents/devops-critic.md` | `${CLAUDE_PLUGIN_ROOT}/pipeline/agents/devops-critic.md` |
| 137 | `~/.claude/pipeline/agents/qa-critic.md` | `${CLAUDE_PLUGIN_ROOT}/pipeline/agents/qa-critic.md` |
| 154 | `~/.claude/pipeline/agents/security-critic.md` | `${CLAUDE_PLUGIN_ROOT}/pipeline/agents/security-critic.md` |
| 171 | `~/.claude/pipeline/agents/designer-critic.md` | `${CLAUDE_PLUGIN_ROOT}/pipeline/agents/designer-critic.md` |

#### SUBTASK 1.1.4: Replace paths in `commands/execute.md` (6 replacements)
**JIRA:** [PIPE-24](https://wiseguys.atlassian.net/browse/PIPE-24)

| Line | Old | New |
|------|-----|-----|
| 158 | `~/.claude/pipeline/agents/product-critic.md` | `${CLAUDE_PLUGIN_ROOT}/pipeline/agents/product-critic.md` |
| 159 | `~/.claude/pipeline/agents/dev-critic.md` | `${CLAUDE_PLUGIN_ROOT}/pipeline/agents/dev-critic.md` |
| 160 | `~/.claude/pipeline/agents/devops-critic.md` | `${CLAUDE_PLUGIN_ROOT}/pipeline/agents/devops-critic.md` |
| 161 | `~/.claude/pipeline/agents/qa-critic.md` | `${CLAUDE_PLUGIN_ROOT}/pipeline/agents/qa-critic.md` |
| 162 | `~/.claude/pipeline/agents/security-critic.md` | `${CLAUDE_PLUGIN_ROOT}/pipeline/agents/security-critic.md` |
| 163 | `~/.claude/pipeline/agents/designer-critic.md` | `${CLAUDE_PLUGIN_ROOT}/pipeline/agents/designer-critic.md` |

#### SUBTASK 1.1.5: Replace paths in `commands/validate.md` (9 replacements)
**JIRA:** [PIPE-25](https://wiseguys.atlassian.net/browse/PIPE-25)

| Line | Old | New |
|------|-----|-----|
| 41 | `~/.claude/pipeline/agents/product-critic.md` | `${CLAUDE_PLUGIN_ROOT}/pipeline/agents/product-critic.md` |
| 46 | `~/.claude/pipeline/agents/product-critic.md` | `${CLAUDE_PLUGIN_ROOT}/pipeline/agents/product-critic.md` |
| 47 | `~/.claude/pipeline/agents/dev-critic.md` | `${CLAUDE_PLUGIN_ROOT}/pipeline/agents/dev-critic.md` |
| 48 | `~/.claude/pipeline/agents/devops-critic.md` | `${CLAUDE_PLUGIN_ROOT}/pipeline/agents/devops-critic.md` |
| 49 | `~/.claude/pipeline/agents/qa-critic.md` | `${CLAUDE_PLUGIN_ROOT}/pipeline/agents/qa-critic.md` |
| 50 | `~/.claude/pipeline/agents/security-critic.md` | `${CLAUDE_PLUGIN_ROOT}/pipeline/agents/security-critic.md` |
| 51 | `~/.claude/pipeline/agents/designer-critic.md` | `${CLAUDE_PLUGIN_ROOT}/pipeline/agents/designer-critic.md` |
| 57 | `~/.claude/pipeline/agents/designer-critic.md` | `${CLAUDE_PLUGIN_ROOT}/pipeline/agents/designer-critic.md` |
| 70 | `~/.claude/pipeline/agents/[role]-critic.md` | `${CLAUDE_PLUGIN_ROOT}/pipeline/agents/[role]-critic.md` |

#### SUBTASK 1.1.6: Replace path in `commands/fullpipeline.md` (1 replacement)
**JIRA:** [PIPE-26](https://wiseguys.atlassian.net/browse/PIPE-26)

| Line | Old | New |
|------|-----|-----|
| 31 | `~/.claude/pipeline/templates/prd-template.md` | `${CLAUDE_PLUGIN_ROOT}/pipeline/templates/prd-template.md` |

#### SUBTASK 1.1.7: Replace paths in `commands/pipeline-init.md` (2 replacements)
**JIRA:** [PIPE-27](https://wiseguys.atlassian.net/browse/PIPE-27)

| Line | Old | New |
|------|-----|-----|
| 106 | `~/.claude/pipeline/templates/pipeline-config-template.yaml` | `${CLAUDE_PLUGIN_ROOT}/pipeline/templates/pipeline-config-template.yaml` |
| 214 | `~/.claude/commands/` | `${CLAUDE_PLUGIN_ROOT}/commands/` |

Note: Line 214 is inside CLAUDE.md template text that references the global pipeline path. Replace `~/.claude/commands/` with plugin-aware path.

#### SUBTASK 1.1.8: Replace path in `WORKFLOW.md` (1 replacement)
**JIRA:** [PIPE-28](https://wiseguys.atlassian.net/browse/PIPE-28)

| Line | Old | New |
|------|-----|-----|
| 57 | `~/.claude/pipeline/templates/prd-template.md` | `${CLAUDE_PLUGIN_ROOT}/pipeline/templates/prd-template.md` |

**Files to Modify:**
- `.claude-plugin/plugin.json` — **CREATE**
- `commands/req2prd.md` — Edit 2 paths
- `commands/prd2plan.md` — Edit 6 paths
- `commands/execute.md` — Edit 6 paths
- `commands/validate.md` — Edit 9 paths
- `commands/fullpipeline.md` — Edit 1 path
- `commands/pipeline-init.md` — Edit 2 paths
- `WORKFLOW.md` — Edit 1 path

**Required Tests:**
- `cat .claude-plugin/plugin.json | python3 -m json.tool` exits 0
- `grep -r '~/.claude/pipeline/' commands/ WORKFLOW.md` returns zero results
- `grep -rc 'CLAUDE_PLUGIN_ROOT' commands/` totals >= 27

**Acceptance Criteria:**
- [ ] AC 1.1: `.claude-plugin/plugin.json` exists with valid JSON and all required fields
- [ ] AC 1.2: Manifest name is `"dev-pipeline"`, version is `"1.0.0"`
- [ ] AC 2.1: `grep -r '~/.claude/pipeline/' commands/ WORKFLOW.md` returns zero results
- [ ] AC 2.2: All 7 command files use `${CLAUDE_PLUGIN_ROOT}/pipeline/`
- [ ] AC 2.3: `WORKFLOW.md` uses `${CLAUDE_PLUGIN_ROOT}/pipeline/`
- [ ] AC 5.3: `grep -rc 'CLAUDE_PLUGIN_ROOT' commands/` totals >= 27

---

## STORY 2: plan2jira.md Script Resolution Rewrite
**JIRA:** [PIPE-29](https://wiseguys.atlassian.net/browse/PIPE-29)
**PRD:** US-3 (FR-4, FR-5, FR-6)

Rewrite the script and env file resolution logic in `plan2jira.md` to use plugin-aware paths, removing all legacy sibling-directory fallbacks.

**Time Estimate:** ~20 minutes

### TASK 2.1: Rewrite plan2jira.md path resolution and replace critic paths
**JIRA:** [PIPE-30](https://wiseguys.atlassian.net/browse/PIPE-30)
**Status:** DONE
**Depends On:** None
**Parallel Group:** A
**Complexity:** Medium
**Estimated Time:** 20 minutes

**Description:**
This task covers FR-4 (script resolution), FR-5 (env file resolution), FR-6 (legacy path removal), plus the 2 critic path replacements at lines 39 and 55.

**Part 1 — Rewrite script resolution (lines 13-16):**

**Before:**
```
2. Locate the JIRA import script by checking these paths in order:
   - `../dev-pipeline/scripts/jira/jira-import.js` (default — sibling dev-pipeline project)
   - `scripts/jira/jira-import.js` (current project fallback)
   - `../cursor-pipeline-template/scripts/jira/jira-import.js` (legacy template fallback)
```

**After:**
```
2. Locate the JIRA import script by checking these paths in order:
   - `scripts/jira/jira-import.js` (current project override — use if present)
   - `${CLAUDE_PLUGIN_ROOT}/scripts/jira/jira-import.js` (default — from plugin)
```

**Part 2 — Rewrite env file resolution (lines 22-25):**

**Before:**
```
4. Locate the `.env.jira` credentials file by checking:
   - `.env.jira` in the current project root
   - `../dev-pipeline/.env.jira` (sibling dev-pipeline project)
   - `../cursor-pipeline-template/.env.jira` (legacy template fallback)
```

**After:**
```
4. Locate the `.env.jira` credentials file by checking:
   - `.env.jira` in the current project root
   - `${CLAUDE_PLUGIN_ROOT}/.env.jira` (plugin fallback — local development only)
```

**Part 3 — Replace critic paths (lines 39, 55):**

| Line | Old | New |
|------|-----|-----|
| 39 | `~/.claude/pipeline/agents/product-critic.md` | `${CLAUDE_PLUGIN_ROOT}/pipeline/agents/product-critic.md` |
| 55 | `~/.claude/pipeline/agents/dev-critic.md` | `${CLAUDE_PLUGIN_ROOT}/pipeline/agents/dev-critic.md` |

**Part 4 — Ensure credential-creation safety (AC 3.5):**

If `plan2jira.md` has any interactive credential-creation flow (creating `.env.jira` when missing), ensure it writes to the project root only, never to `${CLAUDE_PLUGIN_ROOT}/`.

**Files to Modify:**
- `commands/plan2jira.md` — Rewrite lines 13-26 + edit lines 39, 55

**Required Tests:**
- `grep -r '../dev-pipeline/' commands/` returns zero results
- `grep -r '../cursor-pipeline-template/' commands/` returns zero results
- `grep '~/.claude/pipeline/' commands/plan2jira.md` returns zero results
- Visual inspection confirms resolution order: project-local first, plugin-root second

**Acceptance Criteria:**
- [ ] AC 3.1: `plan2jira.md` resolves `jira-import.js` via plugin root with project-local override
- [ ] AC 3.2: `plan2jira.md` resolves `.env.jira` from project root first, plugin root as fallback
- [ ] AC 3.3: `grep -r '../dev-pipeline/' commands/` returns zero results
- [ ] AC 3.4: `grep -r '../cursor-pipeline-template/' commands/` returns zero results
- [ ] AC 3.5: `plan2jira.md` does NOT write `.env.jira` to `${CLAUDE_PLUGIN_ROOT}/`

---

## STORY 3: Documentation Updates
**JIRA:** [PIPE-31](https://wiseguys.atlassian.net/browse/PIPE-31)
**PRD:** US-4 (FR-7, FR-8)

Update README.md with plugin installation instructions.

**Time Estimate:** ~10 minutes

### TASK 3.1: Update README.md with plugin install instructions
**JIRA:** [PIPE-32](https://wiseguys.atlassian.net/browse/PIPE-32)
**Status:** DONE
**Depends On:** None
**Parallel Group:** A
**Complexity:** Simple
**Estimated Time:** 10 minutes

**Description:**
Add a plugin installation section as the recommended method and relabel the existing symlink instructions as legacy.

**Changes to README.md:**

Replace the current installation section (around lines 20-26) with:

```markdown
## Installation

### As a Claude Code Plugin (recommended)

```
/plugin install ydaromai/dev-pipeline
```

### Manual (symlink — legacy)

```bash
# Clone this repo
git clone <repo-url> ~/Projects/dev-pipeline

# Symlink commands into Claude Code
ln -s ~/Projects/dev-pipeline/commands ~/.claude/commands
ln -s ~/Projects/dev-pipeline/pipeline ~/.claude/pipeline
```
```

**Files to Modify:**
- `README.md` — Replace installation section

**Required Tests:**
- Visual review: "As a Claude Code Plugin (recommended)" section exists
- Visual review: symlink method labeled "Manual (symlink — legacy)"

**Acceptance Criteria:**
- [ ] AC 4.1: README contains plugin installation section marked as recommended
- [ ] AC 4.2: README retains symlink method labeled as legacy

---

## STORY 4: Verification
**JIRA:** [PIPE-33](https://wiseguys.atlassian.net/browse/PIPE-33)
**PRD:** US-5

Run all verification checks to confirm the changes are correct.

**Time Estimate:** ~10 minutes

### TASK 4.1: Run verification grep commands and validate manifest
**JIRA:** [PIPE-34](https://wiseguys.atlassian.net/browse/PIPE-34)
**Status:** DONE
**Depends On:** TASK 1.1, TASK 2.1, TASK 3.1
**Parallel Group:** B
**Complexity:** Simple
**Estimated Time:** 10 minutes

**Description:**
Run all verification commands from the PRD acceptance criteria. This is a gate — if any check fails, the preceding tasks must be revisited.

**Verification commands:**

```bash
# AC 2.1 — No hardcoded paths remain
grep -r '~/.claude/pipeline/' commands/ WORKFLOW.md
# Expected: zero results

# AC 3.3 — No legacy dev-pipeline paths
grep -r '../dev-pipeline/' commands/
# Expected: zero results

# AC 3.4 — No legacy cursor-pipeline-template paths
grep -r '../cursor-pipeline-template/' commands/
# Expected: zero results

# AC 5.3 — Positive replacement count
grep -rc 'CLAUDE_PLUGIN_ROOT' commands/
# Expected: total >= 27

# AC 1.1 — Valid JSON manifest
cat .claude-plugin/plugin.json | python3 -m json.tool
# Expected: exits 0, shows formatted JSON
```

**Files to Modify:** None (read-only verification)

**Required Tests:**
All grep commands above must pass.

**Acceptance Criteria:**
- [ ] AC 2.1: Zero `~/.claude/pipeline/` matches
- [ ] AC 3.3: Zero `../dev-pipeline/` matches
- [ ] AC 3.4: Zero `../cursor-pipeline-template/` matches
- [ ] AC 5.3: >= 27 `CLAUDE_PLUGIN_ROOT` matches in commands/
- [ ] AC 1.1: plugin.json is valid JSON with all required fields

---

## Dependency Graph

```
Group A (all parallel — no interdependencies):
  TASK 1.1: Plugin manifest + command path replacements + WORKFLOW.md
  TASK 2.1: plan2jira.md rewrite
  TASK 3.1: README.md update

Group B (depends on all Group A tasks):
  TASK 4.1: Verification grep commands + JSON validation
```

## Summary

| Story | Task | Complexity | Parallel Group | Depends On | Files |
|-------|------|-----------|----------------|------------|-------|
| 1 | TASK 1.1: Manifest + path replacements | Simple | A | None | 8 files (1 new + 7 edits) |
| 2 | TASK 2.1: plan2jira.md rewrite | Medium | A | None | 1 file |
| 3 | TASK 3.1: README.md update | Simple | A | None | 1 file |
| 4 | TASK 4.1: Verification | Simple | B | 1.1, 2.1, 3.1 | 0 files (read-only) |

**Total:** 4 Stories, 4 Tasks (Simple: 3, Medium: 1), 10 files touched (1 new + 9 edits)
**Estimated Time:** ~1 hour
