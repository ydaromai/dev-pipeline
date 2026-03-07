# /req2prd — Requirement → PRD

You are executing the **req2prd** pipeline stage. Convert a raw requirement into a structured PRD document.

**Input:** Raw requirement text via `$ARGUMENTS` or `@file`
**Output:** `docs/prd/<slug>.md`

---

## Step 1: Read the PRD template

Read `${CLAUDE_PLUGIN_ROOT}/pipeline/templates/prd-template.md` for the required PRD structure.

If a `pipeline.config.yaml` exists in the project root, read it for project-specific paths (the `paths.prd_dir` value). Otherwise default to `docs/prd/`.

### Foundation-Aware Mode

If `pipeline.config.yaml` contains `assumes_foundation: true`:

This PRD is for a venture built on the Foundation starter project. The foundation already provides:
- Authentication (phone OTP via Supabase Auth)
- Multi-tenancy (RLS with tenant_id isolation)
- RBAC (admin/manager/viewer roles, JWT claims)
- CI/CD (GitHub Actions CI on PR, Vercel deploy on push)
- Deployment (Vercel frontend, Supabase Cloud backend)
- User management (admin page, invite, role change, deactivate)
- Navigation & layout (sidebar, top bar, breadcrumbs)
- Database foundation (tenants, profiles, audit_log tables)
- E2E test infrastructure (Playwright, auth helpers, fixtures)

**PRD scope:** Domain logic ONLY. Do NOT include requirements for any of the above — they are already implemented and tested. The PRD should focus on:
- Domain entities and their relationships
- Domain-specific business logic and workflows
- Domain-specific UI pages and components
- Domain-specific API endpoints (if any beyond Supabase)
- Domain-specific test scenarios

**PRD metadata:** Add this to the PRD header:
```
assumes_foundation: true
foundation_provides: auth, multi-tenancy, RBAC, CI/CD, deployment, user-management, navigation, database-foundation, e2e-infrastructure
```

**Critic adjustments:** When `assumes_foundation: true`:
- DevOps Critic scores as N/A (deployment/infra already handled by foundation)
- Security Critic scopes to domain-level security only (auth/RLS framework is proven)
- QA Critic does not flag missing auth/RBAC tests (foundation covers those)
- All critics should not flag "missing" infrastructure that the foundation provides

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
4. **Section 11 (Success Metrics)**: Include the "Tracking & Analytics Events" subsection — define events needed to measure success metrics, or state "N/A — metrics measured server-side / via existing dashboards". **PII guard:** verify no analytics event properties contain PII (emails, names, phone numbers, IP addresses). User IDs and session IDs are acceptable. Flag any PII as a Critical issue.
5. **All sections filled**: No empty sections — if genuinely not applicable, state "N/A — <reason>"

Derive the slug from the PRD title (kebab-case, e.g., "Daily Revenue Trends" → `daily-revenue-trends`).

## Step 4: PRD critic review (all applicable critics, parallel)

Spawn all applicable critic subagents in parallel using the Task tool (model: sonnet — Sonnet 4.6, or `execution.ralph_loop.critic_model` from config). Each critic reviews the PRD from their domain perspective using their **PRD Review Focus** checklist, and produces a **score (1–10)** in addition to findings.

Read `pipeline.config.yaml` for the `req2prd.critics` list. Default: `[product, dev, devops, qa, security, performance, data-integrity]` + `observability` if `has_backend_service: true` + `api-contract` if `has_api: true` + `designer` if `has_frontend: true`. **Skip conditional critics entirely** when their flag is `false` or absent — do not spawn their subagent, and mark them as N/A in the score table.

**Parallelization:** All critics spawn simultaneously via the Task tool. If model concurrency limits are reached, the Task tool queues and retries automatically — no user action required.

**Subagent prompt (per critic):**
```
You are the [ROLE] Critic. Read your persona:
<paste ${CLAUDE_PLUGIN_ROOT}/pipeline/agents/[role]-critic.md>

You are reviewing a PRD (not code or a dev plan). Use your PRD Review Focus checklist.

Review the following PRD:
<paste PRD content>

Produce your structured output. Include:
1. Verdict (PASS/FAIL)
2. Score (N.N / 10) — holistic quality rating from your domain perspective
3. Findings (Critical/Warnings/Notes)
4. Checklist (PRD Review Focus items)
5. Summary with specific improvement suggestions to raise your score
```

## Step 5: Scoring Ralph Loop — iterate until quality thresholds met

**Thresholds** (from `pipeline.config.yaml`, with defaults):
- Per-critic minimum score: `scoring.per_critic_min` (default: **8.5**)
- Overall minimum score: `scoring.overall_min` (default: **9.0**)
- **Overall score formula:** `overall = sum(scores) / count(scored critics)` — N/A critics (e.g., Designer when `has_frontend: false`, DevOps when `assumes_foundation: true`) are excluded from both numerator and denominator
- Max iterations: `validation.max_iterations` (default: **3**)

**Expected duration:** Each iteration spawns up to 10 parallel critic subagents using Sonnet. A full 3-iteration loop typically takes 5–10 minutes. Most PRDs converge within 2 iterations. If thresholds are not met after 3 iterations, the remaining findings are likely design opinions rather than quality gaps — escalate to the user rather than continuing to iterate. If the session is interrupted mid-loop, re-running `/req2prd` will detect the existing PRD file and ask whether to regenerate or resume validation.

**Loop logic:**
1. Collect scores from all critics
2. If ALL per-critic scores > 8.5 AND overall average > 9.0 → **exit loop, proceed to Step 6**
3. Otherwise:
   a. Identify critics with scores ≤ 8.5 (below threshold)
   b. Read their findings and improvement suggestions
   c. Revise the PRD to address findings from lowest-scoring critics first
   d. Re-run ALL critics (not just low-scoring ones — revisions can affect other scores)
   e. Repeat (max 3 total iterations)
4. If thresholds not met after max iterations:
   - Present current scores to user
   - **If Security Critic scored below threshold:** flag explicitly — "⚠ Security score is below 8.5. Approving as-is accepts identified security risks. Review Security findings before proceeding."
   - **If any critic flagged PII in analytics as Critical:** force escalation regardless of scores — PII findings cannot be approved as-is without explicit user waiver
   - Options: continue iterating | approve as-is | edit manually | abort

**Score tracking per iteration:**
```
## PRD Quality Scores

| Iteration | Product | Dev | DevOps | QA | Security | Performance | Data Integrity | Observability | API Contract | Designer | Overall |
|-----------|---------|-----|--------|-----|----------|-------------|----------------|---------------|--------------|----------|---------|
| 1         | 7.5     | 8.0 | 9.0    | 7.0 | 8.5      | 8.0         | 8.5            | 7.5          | 8.0          | N/A      | 8.1     |
| 2         | 8.5     | 8.5 | 9.0    | 8.0 | 9.0      | 8.5         | 9.0            | 8.5          | 9.0          | N/A      | 8.7     |
| 3         | 9.0     | 9.0 | 9.5    | 9.0 | 9.5      | 9.0         | 9.5            | 9.0          | 9.5          | N/A      | 9.3     | ← thresholds met
```

## Step 6: Write the PRD

Create the output directory if it doesn't exist:
```bash
mkdir -p docs/prd
```

Write the PRD to `docs/prd/<slug>.md`.

**MANDATORY: Commit the artifact to git immediately after writing:**
```bash
git add docs/prd/<slug>.md && git commit -m "docs: add PRD for <slug>"
```
Pipeline artifacts must be committed the moment they are written. Do not defer this to a later step.

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

### Critic Scores (iteration N)
| Critic | Score | Status |
|--------|-------|--------|
| Product | 9.0 | ✅ (> 8.5) |
| Dev | 9.0 | ✅ (> 8.5) |
| DevOps | 9.5 / N/A | ✅ (> 8.5) / — |
| QA | 9.0 | ✅ (> 8.5) |
| Security | 9.5 | ✅ (> 8.5) |
| Performance | 9.0 | ✅ (> 8.5) |
| Data Integrity | 9.5 | ✅ (> 8.5) |
| Observability | 9.0 / N/A | ✅ (> 8.5) / — |
| API Contract | 9.5 / N/A | ✅ (> 8.5) / — |
| Designer | N/A | — |
| **Overall** | **9.3** | **✅ (> 9.0)** |

Ralph Loop iterations: 3

Please review the PRD. You can:
1. Approve it as-is
2. Request changes (tell me what to modify)
3. Edit the file directly and re-run /validate
```

Wait for user approval before proceeding to the next stage.
