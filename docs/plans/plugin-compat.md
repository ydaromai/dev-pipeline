# Plan: Make dev-pipeline a proper Claude Code plugin

## Context

The dev-pipeline repo has 8 command files that reference agents and templates via hardcoded `~/.claude/pipeline/` paths. This works locally because of a symlink (`~/.claude/pipeline → dev-pipeline/pipeline/`) but breaks for anyone installing it as a Claude Code plugin. We need to add a plugin manifest and replace all hardcoded paths with the `${CLAUDE_PLUGIN_ROOT}` variable so the plugin is portable.

All work on branch `feat/plugin-compat`.

---

## Changes

### 1. Create `.claude-plugin/plugin.json` (NEW FILE)

Minimal plugin manifest — the only required file to make the repo a valid Claude Code plugin.

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

---

### 2. Replace `~/.claude/pipeline/` → `${CLAUDE_PLUGIN_ROOT}/pipeline/` across 7 command files

Simple find-and-replace, no logic changes:

| File | Count | What changes |
|------|-------|-------------|
| `commands/req2prd.md` | 2 | template path (L12), critic path (L50) |
| `commands/prd2plan.md` | 6 | all 6 critic persona paths (L88, 104, 121, 137, 154, 171) |
| `commands/plan2jira.md` | 2 | product-critic (L39), dev-critic (L55) |
| `commands/execute.md` | 6 | all 6 critic persona paths (L158-163) |
| `commands/validate.md` | 8 | all critic paths (L41, 46-51, 57, 70) |
| `commands/fullpipeline.md` | 1 | template path (L31) |
| `commands/pipeline-init.md` | 2 | template path (L106), CLAUDE.md template text (L214) |

**Total: 27 path replacements**

---

### 3. Fix `plan2jira.md` script/env resolution (L13-26)

Replace hardcoded sibling-directory fallbacks with plugin-aware paths:

**Before:**
```
- ../dev-pipeline/scripts/jira/jira-import.js (default — sibling dev-pipeline project)
- scripts/jira/jira-import.js (current project fallback)
- ../cursor-pipeline-template/scripts/jira/jira-import.js (legacy template fallback)
```

**After:**
```
- ${CLAUDE_PLUGIN_ROOT}/scripts/jira/jira-import.js (default — from plugin)
- scripts/jira/jira-import.js (current project override)
```

Same pattern for `.env.jira` — project-root `.env.jira` first, then `${CLAUDE_PLUGIN_ROOT}/.env.jira` as fallback. Remove legacy `../cursor-pipeline-template/` references.

---

### 4. Update `README.md` (L25-26)

Add plugin install instructions alongside existing symlink method:

```markdown
## Installation

### As a Claude Code Plugin (recommended)
```
/plugin marketplace add ydaromai/dev-pipeline
/plugin install dev-pipeline@dev-pipeline
```

### Manual (symlink — legacy)
```bash
ln -s <path-to-repo>/commands ~/.claude/commands
ln -s <path-to-repo>/pipeline ~/.claude/pipeline
```
```

---

### 5. Update `WORKFLOW.md` (L57, L428)

Replace 2 `~/.claude/pipeline/` references with `${CLAUDE_PLUGIN_ROOT}/pipeline/`.

---

## Files summary

| File | Action |
|------|--------|
| `.claude-plugin/plugin.json` | **CREATE** |
| `commands/req2prd.md` | Edit 2 paths |
| `commands/prd2plan.md` | Edit 6 paths |
| `commands/plan2jira.md` | Edit 4 paths + rewrite script resolution |
| `commands/execute.md` | Edit 6 paths |
| `commands/validate.md` | Edit 8 paths |
| `commands/fullpipeline.md` | Edit 1 path |
| `commands/pipeline-init.md` | Edit 2 paths |
| `README.md` | Add plugin install section |
| `WORKFLOW.md` | Edit 2 paths |

---

## Verification

After all changes:

1. `grep -r '~/.claude/pipeline/' commands/ WORKFLOW.md` → zero results
2. `grep -r '../dev-pipeline/' commands/` → zero results
3. `grep -r '../cursor-pipeline-template/' commands/` → zero results
4. `.claude-plugin/plugin.json` exists and is valid JSON
5. `git diff` review — all changes are path replacements, no logic changes
