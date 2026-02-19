# /req2prd — Requirement → PRD

You are executing the **req2prd** pipeline stage. Convert a raw requirement into a structured PRD document.

**Input:** Raw requirement text via `$ARGUMENTS` or `@file`
**Output:** `docs/prd/<slug>.md`

---

## Step 1: Read the PRD template

Read `~/.claude/pipeline/templates/prd-template.md` for the required PRD structure.

If a `pipeline.config.yaml` exists in the project root, read it for project-specific paths (the `paths.prd_dir` value). Otherwise default to `docs/prd/`.

## Step 2: Clarify requirements (if needed)

If `$ARGUMENTS` is short (< 200 characters), ask clarifying questions using AskUserQuestion. Ask about:
- **Target users**: Who are the primary users and what are their roles?
- **Core problem**: What specific problem does this solve? Why now?
- **Success metrics**: How will we measure if this is successful?
- **Constraints**: Are there technical, timeline, or resource constraints?
- **Scope boundaries**: What is explicitly out of scope?

If the input is detailed (>= 200 chars) or provided via `@file`, proceed without asking — but flag any ambiguities as Open Questions in the PRD.

## Step 3: Generate the PRD

Generate a complete PRD following the template structure. Ensure:

1. **Section 5 (User Stories)**: Each user story has inline acceptance criteria that are specific and testable
2. **Section 7 (Consolidated AC)**: All acceptance criteria from Section 5 are collected here, grouped by priority (P0/P1/P2)
3. **Section 9 (Testing Strategy)**: Define required test types per user story, considering the project's `pipeline.config.yaml` test_requirements if available
4. **All sections filled**: No empty sections — if genuinely not applicable, state "N/A — <reason>"

Derive the slug from the PRD title (kebab-case, e.g., "Daily Revenue Trends" → `daily-revenue-trends`).

## Step 4: Product Critic validation

Spawn a subagent (Task tool, model: opus — Opus 4.6) with the Product Critic persona to review the PRD:

**Subagent prompt:**
```
You are the Product Critic. Read the following files:
1. ~/.claude/pipeline/agents/product-critic.md (your persona and checklist)
2. The PRD document I'm about to provide

Review the PRD against your checklist. Produce your structured output (Verdict, Findings, Checklist, Summary).

PRD content:
<paste PRD content here>
```

## Step 5: Revise if needed

If the Product Critic verdict is **FAIL**:
1. Read the Critical findings
2. Revise the PRD to address each Critical finding
3. Re-run the Product Critic (max 2 total iterations)
4. If still failing after 2 iterations, include the remaining findings as Open Questions in the PRD and proceed

## Step 6: Write the PRD

Create the output directory if it doesn't exist:
```bash
mkdir -p docs/prd
```

Write the PRD to `docs/prd/<slug>.md`.

## Step 7: Human gate

Present a summary to the user:

```
PRD generated: docs/prd/<slug>.md

## Summary
- Title: <title>
- User Stories: <count>
- P0 Requirements: <count>
- P1 Requirements: <count>
- Open Questions: <count>
- Product Critic: PASS ✅ (or remaining warnings)

Please review the PRD. You can:
1. Approve it as-is
2. Request changes (tell me what to modify)
3. Edit the file directly and re-run /validate
```

Wait for user approval before proceeding to the next stage.
