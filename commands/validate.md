# /validate — Run Critic Agents Standalone

You are executing the **validate** command. Run one or more critic agents against an artifact (PRD, dev plan, or code diff) and produce structured feedback.

**Input:** File or diff via `$ARGUMENTS` + optional flags
**Usage:**
- `/validate @docs/prd/daily-revenue-trends.md` — validate a PRD
- `/validate @docs/dev_plans/daily-revenue-trends.md` — validate a dev plan
- `/validate --diff` — validate the current git diff (staged + unstaged)
- `/validate --diff --critics=dev,qa` — validate diff with specific critics only

---

## Step 1: Determine what to validate

Parse `$ARGUMENTS` to identify:
1. **Target type**: PRD file, dev plan file, or code diff
2. **Critics to run**: All applicable or specific ones via `--critics=` flag

### Auto-detect target type:
- File in `docs/prd/` → PRD validation
- File in `docs/dev_plans/` → Dev plan validation
- `--diff` flag → Code diff validation
- Other file → Treat as code, run dev + qa critics

### Default critics per target type:
| Target | Default Critics |
|--------|----------------|
| PRD | product |
| Dev plan | product, dev, devops, qa, security, performance, data-integrity, designer (if has_frontend) |
| Code diff | product, dev, devops, qa, security, performance, data-integrity, designer (if has_frontend) |

Read `pipeline.config.yaml` for stage-specific overrides if available.

## Step 2: Gather context

Depending on target type, read:

**For PRD validation:**
- The PRD file
- `${CLAUDE_PLUGIN_ROOT}/pipeline/agents/product-critic.md`

**For dev plan validation:**
- The dev plan file
- The linked PRD (look for PRD reference in the plan, or find by matching slug in `docs/prd/`)
- `${CLAUDE_PLUGIN_ROOT}/pipeline/agents/product-critic.md`
- `${CLAUDE_PLUGIN_ROOT}/pipeline/agents/dev-critic.md`
- `${CLAUDE_PLUGIN_ROOT}/pipeline/agents/devops-critic.md`
- `${CLAUDE_PLUGIN_ROOT}/pipeline/agents/qa-critic.md`
- `${CLAUDE_PLUGIN_ROOT}/pipeline/agents/security-critic.md`
- `${CLAUDE_PLUGIN_ROOT}/pipeline/agents/performance-critic.md`
- `${CLAUDE_PLUGIN_ROOT}/pipeline/agents/data-integrity-critic.md`
- `${CLAUDE_PLUGIN_ROOT}/pipeline/agents/designer-critic.md` (only if `pipeline.config.yaml` has `has_frontend: true`)

**For code diff validation:**
- Run `git diff` and `git diff --staged` to get the full diff
- Read the related task spec (if identifiable from branch name or `$ARGUMENTS`)
- Read the PRD (if identifiable)
- All relevant critic agent files from `${CLAUDE_PLUGIN_ROOT}/pipeline/agents/` (including `performance-critic.md`, `data-integrity-critic.md`, and `designer-critic.md` if `pipeline.config.yaml` has `has_frontend: true`)
- `docs/ai_definitions/AGENT_CONSTRAINTS.md`
- `pipeline.config.yaml` for test requirements

## Step 3: Run critics

Read `pipeline.config.yaml` for mode (parallel vs sequential). Default: parallel.

For each critic, spawn a subagent (Task tool, model: opus — Opus 4.6) with the appropriate persona:

**Subagent prompt template:**
```
You are the [ROLE] Critic. Read your persona and checklist:
<paste contents of ${CLAUDE_PLUGIN_ROOT}/pipeline/agents/[role]-critic.md>

Review the following [target type]:
<paste target content>

Additional context:
- PRD: <if available>
- Agent Constraints: <if available>
- Test requirements: <from pipeline.config.yaml if available>

Produce your structured output following the format in your persona file.
```

**Mode behavior:**
- **Parallel**: Launch all critic subagents simultaneously using parallel Task tool calls
- **Sequential**: Run critics one at a time. If running `pre_merge` stage, run Dev Critic first; if it passes, run DevOps Critic

## Step 4: Collect and present results

Aggregate all critic results and present:

```
## Validation Results

### Overall: PASS ✅ | FAIL ❌

| Critic | Verdict | Score | Critical | Warnings | Notes |
|--------|---------|-------|----------|----------|-------|
| Product | PASS ✅ | 9.0 | 0 | 2 | 1 |
| Dev | FAIL ❌ | 6.5 | 1 | 3 | 0 |
| DevOps | PASS ✅ | 8.5 | 0 | 1 | 2 |
| QA | FAIL ❌ | 5.0 | 2 | 1 | 0 |
| Security | PASS ✅ | 9.0 | 0 | 1 | 0 |
| Performance | PASS ✅ | 8.5 | 0 | 1 | 0 |
| Data Integrity | PASS ✅ | 9.0 | 0 | 0 | 1 |
| Designer | PASS ✅ / N/A | N/A | 0 | 0 | 1 |

Overall Score: 7.6 (average of scored critics)

### Critical Findings (must fix)
1. [Dev] `lib/api.js:42` — SQL injection via string concatenation → use parameterized query
2. [QA] Missing unit tests for error paths in revenue calculation
3. [QA] No integration test for shift boundary edge case

### Warnings (should fix)
1. [Product] AC 2.3 not fully covered — date range capped at 30 days, PRD says 90
2. [Dev] console.log on line 15 of loader.js
3. [Dev] Magic number 86400000 — use named constant
4. [DevOps] New env var SHIFT_CONFIG_PATH not documented

### Notes
1. [Product] Consider adding loading state for chart render
2. [DevOps] Docker config not affected by these changes
3. [DevOps] No new dependencies added
```

The overall verdict is **FAIL** if any critic has a FAIL verdict.
