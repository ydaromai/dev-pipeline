# Dev Plan: Add /ask as a Standalone Marketplace Plugin

**PRD:** docs/prd/marketplace-ask-plugin.md
**Date:** 2026-02-25

## Pipeline Status
- **Stage:** EXECUTING (Stage 4 of 4)
- **Started:** 2026-02-25
- **PRD:** docs/prd/marketplace-ask-plugin.md ✅
- **Dev Plan:** docs/dev_plans/marketplace-ask-plugin.md ✅
- **JIRA:** PIPE-35 (Epic) ✅
- **Progress:** 1/1 tasks complete

---

## EPIC: Add /ask as a Standalone Marketplace Plugin
**JIRA:** [PIPE-35](https://wiseguys.atlassian.net/browse/PIPE-35)

Add the `/ask` command as an independently installable plugin in the ydaromai-tools marketplace, using a symlink to maintain a single source of truth.

---

## STORY 1: Standalone Ask Plugin
**JIRA:** [PIPE-36](https://wiseguys.atlassian.net/browse/PIPE-36)
**PRD:** US-1, US-2, US-3 (FR-1, FR-2, FR-3)

Create the plugin directory structure, symlink, manifest, and marketplace entry.

**Time Estimate:** ~10 minutes

### TASK 1.1: Create ask plugin and add to marketplace
**JIRA:** [PIPE-37](https://wiseguys.atlassian.net/browse/PIPE-37)
**Status:** DONE
**Depends On:** None
**Parallel Group:** A
**Complexity:** Simple
**Estimated Time:** 10 minutes

**Description:**
Create the standalone ask plugin with three artifacts: plugin manifest, symlinked command file, and marketplace entry.

**Subtasks:**

#### SUBTASK 1.1.1: Create `plugins/ask/.claude-plugin/plugin.json`
**JIRA:** [PIPE-38](https://wiseguys.atlassian.net/browse/PIPE-38)

Create directories and file:

```json
{
  "name": "ask",
  "version": "1.0.0",
  "description": "Read-only Q&A skill — ask anything about your codebase without modifying files"
}
```

#### SUBTASK 1.1.2: Create symlink `plugins/ask/commands/ask.md`
**JIRA:** [PIPE-39](https://wiseguys.atlassian.net/browse/PIPE-39)

```bash
mkdir -p plugins/ask/commands
cd plugins/ask/commands
ln -s ../../../commands/ask.md ask.md
```

The symlink target is `../../../commands/ask.md` (3 levels up from `plugins/ask/commands/` to repo root, then into `commands/`).

#### SUBTASK 1.1.3: Add `ask` entry to `.claude-plugin/marketplace.json`
**JIRA:** [PIPE-40](https://wiseguys.atlassian.net/browse/PIPE-40)

Add to the `plugins` array:

```json
{
  "name": "ask",
  "source": "./plugins/ask",
  "description": "Read-only Q&A skill — ask anything about your codebase without modifying files",
  "version": "1.0.0"
}
```

**Files to Modify:**
- `plugins/ask/.claude-plugin/plugin.json` — **CREATE**
- `plugins/ask/commands/ask.md` — **CREATE** (symlink)
- `.claude-plugin/marketplace.json` — Edit (add plugin entry)

**Required Tests:**
- `readlink plugins/ask/commands/ask.md` returns relative symlink path
- `cat plugins/ask/commands/ask.md` succeeds (symlink resolves)
- `claude plugin validate .` passes with no errors
- `python3 -m json.tool plugins/ask/.claude-plugin/plugin.json` exits 0

**Acceptance Criteria:**
- [ ] AC 1.1: `/plugin install ask@ydaromai-tools` succeeds (manual E2E — pre-merge)
- [ ] AC 1.2: After install, `/ask` is available as a slash command (manual E2E — pre-merge)
- [x] AC 1.3: The standalone `ask` plugin does not include pipeline commands
- [x] AC 2.1: `plugins/ask/commands/ask.md` is a symlink to `../../../commands/ask.md`
- [x] AC 2.2: The symlink resolves correctly
- [x] AC 3.1: `claude plugin validate .` passes with no errors
- [x] AC 3.2: `marketplace.json` contains an entry for `ask`

---

## Dependency Graph

```
Group A (single task):
  TASK 1.1: Create ask plugin + marketplace entry
```

## Summary

| Story | Task | Complexity | Parallel Group | Depends On | Files |
|-------|------|-----------|----------------|------------|-------|
| 1 | TASK 1.1: Ask plugin + marketplace entry | Simple | A | None | 3 files (2 new + 1 edit) |

**Total:** 1 Story, 1 Task (Simple), 3 files touched (2 new + 1 edit)
**Estimated Time:** ~10 minutes
