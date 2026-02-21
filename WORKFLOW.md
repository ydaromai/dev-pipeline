# Dev Pipeline — Workflow Reference

## Pipeline Overview

```
 ┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
 │  /pipeline-  │     │  /req2prd   │     │  /prd2plan  │     │  /plan2jira │     │  /execute   │
 │    init      │────▶│             │────▶│             │────▶│             │────▶│             │
 │  (one-time)  │     │ Requirement │     │  PRD → Dev  │     │ Dev Plan →  │     │ Ralph Loop  │
 │             │     │   → PRD     │     │    Plan     │     │   JIRA      │     │ Build/Review│
 └─────────────┘     └──────┬──────┘     └──────┬──────┘     └──────┬──────┘     └──────┬──────┘
                          GATE 1              GATE 2            GATE 3a  GATE 3b     GATE 4 (per PR)
                       PRD Approval        Plan Approval     Critic Val JIRA Conf    PR Merge
```

**Or run everything at once:** `/fullpipeline <requirement>` chains all stages with gates between each.

---

## Stage 0: Project Initialization — `/pipeline-init`

**Purpose:** One-time setup to onboard a project to the pipeline.

| Step | Action | Details |
|------|--------|---------|
| 1 | Detect project context | Scans for `pipeline.config.yaml`, `CLAUDE.md`, `package.json`, `.env.jira`, JIRA scripts, agent constraints |
| 2 | Ask configuration questions | JIRA project key, JIRA host, test commands, branch pattern |
| 3 | Auto-detect test commands | Parses `package.json` / `pyproject.toml` / `go.mod` / `Cargo.toml` for test scripts |
| 4 | Auto-detect test requirements | Maps file patterns to required test types (`lib/**` → unit+integration, etc.) |
| 5 | Create `pipeline.config.yaml` | Writes project-specific config (JIRA, validation, execution, test commands, paths) |
| 6 | Create directories | `docs/prd/`, `docs/dev_plans/`, `docs/ai_definitions/` |
| 7 | Create foundation files | `TASK_BREAKDOWN_DEFINITION.md`, `AGENT_CONSTRAINTS.md` (from templates if missing) |
| 8 | Update `CLAUDE.md` | Appends pipeline integration section (commands, critics, Ralph Loop reference) |

**Output:** Project ready for `/req2prd`, `/prd2plan`, `/plan2jira`, `/execute`

---

## Stage 1: Requirement → PRD — `/req2prd`

**Input:** Raw requirement text or `@file`
**Output:** `docs/prd/<slug>.md`

```
  Requirement          Clarify           Generate PRD       All Critics (parallel)     Scoring Ralph Loop      Write PRD
  ───────────▶  (if < 200 chars)  ──▶  (from template)  ──▶  Score 1-10 each   ──▶  (until per-critic >   ──▶  docs/prd/
                ask 5 questions         14 sections          Product, Dev, DevOps    8.5 AND overall > 9,     <slug>.md
                                                             QA, Security, Designer  max 5 iterations)
                                                                     │                        │
                                                                     └── below threshold ──▶ revise PRD ──▶ re-score all
```

### Workflow Detail

| Step | Action | Details |
|------|--------|---------|
| 1 | Read PRD template | `~/.claude/pipeline/templates/prd-template.md` |
| 2 | Clarify requirements | If input < 200 chars: ask about target users, core problem, success metrics, constraints, scope |
| 3 | Generate PRD | 14-section PRD: problem, users, goals, non-goals, user stories (with inline AC), functional requirements (P0/P1/P2), consolidated AC, non-functional, testing strategy, technical context, success metrics, open questions, risks, timeline |
| 4 | All-critic scoring review | All applicable critics (Product, Dev, DevOps, QA, Security, Designer if `has_frontend`) review PRD in parallel, each producing a score (1–10) |
| 5 | Scoring Ralph Loop | Iterate until per-critic > 8.5 AND overall average > 9.0 (max 5 iterations). Revise PRD based on lowest-scoring critics' findings |
| 6 | Write PRD | Save to `docs/prd/<slug>.md` |
| 7 | **GATE 1** — Human approval | User reviews: approve / request changes / edit directly |

### Critics at this stage (all applicable, parallel, scored 1–10)
| Critic | PRD Review Focus |
|--------|-----------------|
| Product | PRD completeness, testable AC, user stories, scope alignment, analytics tracking |
| Dev | Technical feasibility, ambiguity-free requirements, data model, API contracts |
| DevOps | Infrastructure/deployment requirements, environment needs, scalability, monitoring |
| QA | Testable AC, edge cases identified, testing strategy coverage, measurable NFRs |
| Security | Auth/authz requirements, sensitive data handling, threat model, compliance |
| Designer | UX flow completeness, accessibility requirements, responsive design, interaction patterns (only if `has_frontend: true`) |

> **Quality loop asymmetry — PRD vs Dev Plan:** The PRD loop uses numeric scoring (per-critic > 8.5, overall > 9.0) and can tolerate minor warnings if scores are high — PRDs are living documents refined during implementation. The dev plan loop requires zero Critical AND zero Warnings — dev plans are the direct blueprint for code execution, and unresolved warnings propagate into bugs, tech debt, or security gaps.

---

## Stage 2: PRD → Dev Plan — `/prd2plan`

**Input:** `@docs/prd/<slug>.md`
**Output:** `docs/dev_plans/<slug>.md`

```
  Read PRD +          Explore           Generate Plan         Validate           All 6 Critics (parallel)    Write Plan
  Constraints  ──▶   Codebase   ──▶   Epic/Story/Task  ──▶  Structure   ──▶   Product, Dev, DevOps,  ──▶  docs/dev_plans/
  + Config           (patterns,        /Subtask with         (breakdown         QA, Security, Designer     <slug>.md
                      structure)        dependencies          validator)         0 Critical + 0 Warnings
                                                                                     │
                                                                                     └── Critical or Warnings ──▶ fix all ──▶ re-review (max 5)
```

### Workflow Detail

| Step | Action | Details |
|------|--------|---------|
| 1 | Read inputs | PRD, `TASK_BREAKDOWN_DEFINITION.md`, `pipeline.config.yaml`, `AGENT_CONSTRAINTS.md` |
| 2 | Explore codebase | Directory structure, existing patterns, test conventions, shared utilities |
| 3 | Generate dev plan | **Epic** (= PRD feature) → **Stories** (user-facing units) → **Tasks** (implementable, with file paths) → **Subtasks** (agent-sized, 20min–2hrs) |
| 4 | Validate structure | Run `validate-breakdown.js` if available |
| 5 | Critic review (parallel, all applicable) | Product + Dev + DevOps + QA + Security + Designer (if `has_frontend: true`) as Opus 4.6 subagents |
| 6 | Revise until zero Critical AND zero Warnings | Fix all Critical findings and Warnings from all critics (max 5 iterations). Notes are acceptable. |
| 7 | Write dev plan | Save to `docs/dev_plans/<slug>.md` |
| 8 | **GATE 2** — Human approval | Summary with dependency graph, critic results |

### Task metadata generated per task

```markdown
### TASK N.M: <title>
**Depends On:** None | TASK X.Y, TASK X.Z
**Parallel Group:** A | B | C
**Complexity:** Simple | Medium | Complex
**Required Tests:** UT: ..., IT: ..., UI: ...
```

### Complexity definitions
| Level | Scope | Build Model |
|-------|-------|-------------|
| Simple | Docs, config, small single-file edits | Sonnet 4.6 |
| Medium | Single-file logic, API endpoints, DB queries, UI components | Sonnet 4.6 |
| Complex | Multi-file changes, complex business logic, cross-cutting concerns | Opus 4.6 |

### Critics at this stage (all applicable, parallel)
| Critic | Focus |
|--------|-------|
| Product | Every P0 requirement has tasks, user stories covered, AC traceable |
| Dev | Tasks technically sound, right granularity, dependencies correct, actual file paths |
| DevOps | Deployment/infra tasks present, migration order safe, CI/CD implications captured |
| QA | Test requirements per task align with PRD testing strategy, regression risk identified |
| Security | Security-sensitive tasks present (auth, input validation), no insecure design patterns |
| Designer | Frontend tasks include accessibility, loading/empty/error states, responsive design (only if `has_frontend: true`) |

---

## Stage 3: Dev Plan → JIRA — `/plan2jira`

**Input:** `@docs/dev_plans/<slug>.md`
**Output:** JIRA issues created, dev plan updated with JIRA keys

```
  Read Plan +     Critic Validation     Set Up           Dry Run          Human Gate        Create Issues      Update Plan
  Find Script ──▶ Dev + Product    ──▶ JIRA Env  ──▶   (preview)   ──▶  GATE 3b     ──▶  (with linking) ──▶ JIRA keys
  + Config        (mandatory,           .env.jira       what will be     approve/          Epic, Stories,      inline in
                   GATE 3a)                              created          reject            Subtasks            markdown
                       │
                  FAIL ──▶ fix/override/abort
```

### Workflow Detail

| Step | Action | Details |
|------|--------|---------|
| 1 | Read inputs | Dev plan, locate `jira-import.js`, read `pipeline.config.yaml`, find `.env.jira` |
| 2 | **GATE 3a** — Mandatory critic validation | Product + Dev critics must PASS before JIRA creation. If FAIL: auto-fix (max 2 iterations), manual fix, override, or abort |
| 3 | Set up environment | Source `.env.jira`, set `JIRA_PROJECT_KEY` |
| 4 | Dry run | `node jira-import.js --file=<plan> --dry-run --tasks-as-subtasks` — preview issues |
| 5 | **GATE 3b** — Human approval | Confirm issue creation |
| 6 | Create JIRA issues | `node jira-import.js --file=<plan> --create --update-file --tasks-as-subtasks` |
| 7 | Verify and report | Check exit code, read `jira-issue-mapping.json`, report created issues + batch ID |

### Critics at this stage (mandatory)
| Critic | Focus |
|--------|-------|
| Product | PRD requirements fully covered by tasks, AC traceable, no gaps |
| Dev | Tasks technically sound, dependencies correct, implementable |

### JIRA hierarchy mapping
| Plan Level | JIRA Type | Notes |
|-----------|-----------|-------|
| Epic | Epic | One per plan |
| Story | Story | Under the Epic |
| Task | Sub-task | Under parent Story (`--tasks-as-subtasks` for next-gen projects) |

### Script capabilities
- Markdown parsing (Epic/Story/Task/Subtask headings)
- Idempotency via `.jira-import-history.json`
- Batch tracking for cleanup (`cleanup-import.js --batch=<id>`)
- ADF conversion (Markdown → Atlassian Document Format)
- Assignee lookup, retry logic, file updates with JIRA links

---

## Stage 4: Execute with Ralph Loop — `/execute`

**Input:** `@docs/dev_plans/<slug>.md`
**Output:** Implemented code, PRs created, JIRA updated

This is the core execution engine. It reads the dev plan, builds a dependency graph, and executes tasks using the **Ralph Loop** pattern.

### Ralph Loop Architecture

```
                    ┌─────────────────────────────────────────────────┐
                    │                  RALPH LOOP                      │
                    │                                                  │
  Ready Task ──▶   │   BUILD (fresh ctx)  ──▶  REVIEW (fresh ctx)    │
                    │   Model per complexity     Opus 4.6, all critics  │
                    │         │                        │               │
                    │         │                   PASS ──▶ Create PR   │
                    │         │                        │               │
                    │         │                   FAIL ──▶ fix prompt  │
                    │         │                        │    (round N)  │
                    │         ◀────────────────────────┘               │
                    │              (max 3 iterations)                  │
                    │                                                  │
                    │   Still FAIL after 3? ──▶ ESCALATE to human     │
                    └─────────────────────────────────────────────────┘
```

### Full Execution Flow

| Step | Action | Details |
|------|--------|---------|
| 1 | Read inputs + build dependency graph | Parse tasks, extract `Depends On` / `Parallel Group`, identify ready tasks |
| 1.5 | Reconcile JIRA statuses | Sync dev plan statuses to JIRA (Done/In Progress), reconcile story-level status |
| 2 | Pre-flight check | Present execution plan, model config, completed tasks — **wait for approval** |
| 3a | Setup per task | Create git branch, transition JIRA to "In Progress", update dev plan status |
| 3b | **BUILD** phase | Fresh-context subagent (Sonnet 4.6 or Opus 4.6 per complexity), implements subtasks, writes tests, commits |
| 3c | **REVIEW** phase | Fresh-context Opus 4.6 subagent, runs all applicable critic checklists against the diff (5 standard + Designer if `has_frontend: true`) |
| 3d | **ITERATE** if FAIL | New build subagent with fix prompt (critical findings only), re-review failed critics |
| 3e | Escalation | After max iterations: mark BLOCKED, create WIP PR, ask user (override/fix/skip/abort) |
| 3f | Create PR | Push branch, `gh pr create` with critic results + AC checklist + JIRA link |
| 3g | **GATE 4** — Per-PR approval | User approves → squash merge → JIRA "Done" → update dev plan status |
| 4 | Unlock dependents | Mark task DONE, check for newly unblocked tasks, loop back to Step 3 |
| 5 | Final report | Results table (task/status/PR/iterations/critics), summary, next steps |

### Critics at this stage (all applicable, parallel)

| Critic | Focus |
|--------|-------|
| Product | PRD alignment, AC coverage, scope creep, user experience, analytics tracking |
| Dev | Code quality, patterns, conventions, test existence, analytics instrumentation |
| DevOps | Env vars, deployment readiness, resource usage, rollback risk |
| QA | Test coverage (happy/error/boundary), test quality, AC coverage, regression risk |
| Security | Injection, auth/authz, secrets, OWASP top 10, vulnerable dependencies, threat analysis |
| Designer | Accessibility (WCAG 2.1 AA), responsive design, UX consistency, design system adherence (only if `has_frontend: true`) |

### Build model selection
| Complexity | Model | Use Cases |
|-----------|-------|-----------|
| Simple | Sonnet 4.6 | Docs, config, small edits, schema definitions |
| Medium | Sonnet 4.6 | Single-file logic, API endpoints, DB queries, UI components |
| Complex | Opus 4.6 | Multi-file changes, complex business logic, cross-cutting |

**Review model:** Always Opus 4.6

### Parallel execution
- **Within a group:** Tasks in the same `Parallel Group` run simultaneously
- **Across groups:** Groups execute in order (A → B → C), each waits for previous group
- **Cross-story:** Independent stories can run in separate CLI sessions (multi-session scaling)

---

## Standalone Validation — `/validate`

Run critics independently against any artifact.

**Usage:**
```
/validate @docs/prd/<slug>.md                     # Validate a PRD
/validate @docs/dev_plans/<slug>.md               # Validate a dev plan
/validate --diff                                   # Validate current git diff
/validate --diff --critics=dev,qa                  # Validate diff with specific critics
```

### Default critics per target

| Target | Default Critics |
|--------|----------------|
| PRD | Product |
| Dev Plan | Product, Dev, DevOps, QA, Security, Designer (if `has_frontend`) |
| Code Diff | Product, Dev, DevOps, QA, Security, Designer (if `has_frontend`) |

---

## Critic Agents Reference

All critics follow the same output pattern: **Verdict** (PASS/FAIL) → **Score** (N.N / 10) → **Findings** (Critical/Warnings/Notes) → **Checklist** → **Summary**

**FAIL rule:** Any Critical finding = FAIL. Only Warnings/Notes = PASS.

**Scoring (1–10 scale):** Each critic rates the artifact holistically. For PRD reviews, scoring drives the Ralph Loop (per-critic > 8.5, overall > 9.0). For code/plan reviews, scoring is supplementary to PASS/FAIL.

### Product Critic
- PRD requirements addressed (P0 + P1)
- User stories satisfied with traceability
- Acceptance criteria testable and met
- No scope creep, no missing edge cases
- Error states provide meaningful feedback
- Testing strategy followed
- Analytics events defined for key interactions (if PRD Section 11 has tracking requirements)
- Tracking requirements traceable to success metrics

### Dev Critic
- Project conventions followed (from `AGENT_CONSTRAINTS.md`)
- No duplication, appropriate error handling
- No security vulnerabilities (OWASP top 10)
- Tests exist and meaningful (>= 80% coverage for new code)
- No breaking changes, clean commits
- No console.log/debugger, no magic numbers, no commented-out code
- Parameterized queries, consistent async/await
- Analytics events instrumented per PRD specs
- No PII in analytics payloads (Critical)
- Analytics calls non-blocking (async/fire-and-forget)

### DevOps Critic
- No hardcoded env values or secrets in code/logs
- Reversible DB migrations, CI pipeline will pass
- No vulnerable dependencies, reasonable resource usage
- Adequate logging, no PII in logs
- Env var documentation updated
- Deployment risk assessment (rollback, data migration, external deps)

### QA Critic
- Happy path, error path, boundary conditions tested
- Deterministic tests, realistic data, independent tests
- Specific assertions, appropriate mocking
- AC coverage from task spec and PRD
- Test type compliance per `pipeline.config.yaml` and PRD Section 9
- Regression risk assessed

### Security Critic
- Input validation and sanitization (SQL, command, XSS, template, path traversal injection)
- Authentication and authorization checks (IDOR, privilege escalation, session management)
- No hardcoded secrets, no secrets in logs/errors, no PII exposure
- Dependency vulnerability scanning (known CVEs, trusted sources)
- Strong cryptography (no MD5/SHA1, no `Math.random` for security)
- Error handling doesn't leak internals (stack traces, DB schema)
- API security (rate limiting, CORS, security headers, input size limits)
- OWASP Top 10 assessment per review

### Designer Critic (only when `has_frontend: true`)
- Accessibility compliance (WCAG 2.1 AA): alt text, color contrast, keyboard access, ARIA, form labels, screen reader announcements
- Design system adherence: uses existing components, design tokens, naming conventions
- Responsive design: mobile/tablet/desktop breakpoints, touch targets, relative font sizes
- UX consistency: loading/empty/error states, success feedback, navigation patterns
- Visual hierarchy: spacing, typography, scannability
- Animation: purposeful, respects prefers-reduced-motion, non-blocking
- CSP compatibility

---

## Configuration — `pipeline.config.yaml`

```yaml
pipeline:
  has_frontend: false               # Set true to enable Designer Critic

  jira:
    project_key: PROJ
    host: https://yourteam.atlassian.net
    env_file: .env.jira

  validation:
    default_mode: parallel          # parallel | sequential
    max_iterations: 5               # Max iterations for PRD and dev plan Ralph Loops
    escalation: user                # user | skip | fail
    stages:                         # Per-stage critic overrides
      req2prd:   { critics: [product, dev, devops, qa, security, designer], mode: parallel }  # designer requires has_frontend: true
      prd2plan:  { critics: [product, dev, devops, qa, security, designer], mode: parallel }
      plan2jira: { critics: [product, dev], mode: parallel, mandatory: true }
      execute:   { critics: [product, dev, devops, qa, security, designer], mode: parallel }
      pre_merge: { critics: [dev, devops, security, designer], mode: sequential }

  scoring:                            # PRD quality scoring thresholds
    per_critic_min: 8.5               # Minimum score per critic (1-10 scale)
    overall_min: 9.0                  # Minimum average across all critics
    # Uses validation.max_iterations for iteration limit

  execution:
    ralph_loop:
      build_models: { simple: sonnet, medium: sonnet, complex: opus }  # Sonnet 4.6 / Opus 4.6
      review_model: opus   # Opus 4.6
      fresh_context: true
      max_iterations: 3
      escalation: user
    parallel_stories: true
    parallel_tasks: true
    branch_pattern: "feat/story-{S}-task-{T}-{slug}"

  test_commands:
    unit: "npm test"
    integration: "npm run test:integration"
    ui: "npm run test:ui"
    all: "npm run test:all"

  test_requirements:                # File pattern → required test types
    "lib/**/*.js": [unit, integration]
    "public/**": [ui]
    "scripts/**/*.js": [unit]

  paths:
    prd_dir: "docs/prd"
    dev_plans_dir: "docs/dev_plans"
    agent_constraints: "docs/ai_definitions/AGENT_CONSTRAINTS.md"
    breakdown_definition: "docs/ai_definitions/TASK_BREAKDOWN_DEFINITION.md"
    jira_import: "scripts/jira/jira-import.js"
    jira_transition: "scripts/jira/transition-issue.js"
```

---

## Key Files & Directory Structure

```
project-root/
├── pipeline.config.yaml              # Project-specific pipeline config
├── CLAUDE.md                         # Project instructions + pipeline section
├── .env.jira                         # JIRA credentials (gitignored)
├── jira-issue-mapping.json           # Task → JIRA key mappings (auto-generated)
├── docs/
│   ├── prd/
│   │   └── <slug>.md                 # Generated PRDs
│   ├── dev_plans/
│   │   └── <slug>.md                 # Generated dev plans (updated with JIRA keys + status)
│   └── ai_definitions/
│       ├── AGENT_CONSTRAINTS.md      # Project-specific agent rules
│       └── TASK_BREAKDOWN_DEFINITION.md  # Epic/Story/Task/Subtask format
└── scripts/
    └── jira/
        ├── jira-import.js            # JIRA issue creator (dry-run, create, update-file)
        ├── transition-issue.js       # JIRA status transitions
        ├── cleanup-import.js         # Batch cleanup for failed imports
        └── lib/
            ├── jira-client.js        # JIRA API client
            └── markdown-to-adf.js    # Markdown → Atlassian Document Format

~/.claude/
├── commands/                         # Global pipeline commands (slash commands)
│   ├── pipeline-init.md
│   ├── req2prd.md
│   ├── prd2plan.md
│   ├── plan2jira.md
│   ├── execute.md
│   ├── validate.md
│   └── fullpipeline.md
└── pipeline/
    ├── templates/
    │   ├── prd-template.md           # 14-section PRD template
    │   └── pipeline-config-template.yaml
    ├── agents/
    │   ├── product-critic.md
    │   ├── dev-critic.md
    │   ├── devops-critic.md
    │   ├── qa-critic.md
    │   ├── security-critic.md
    │   └── designer-critic.md
    └── examples/
        └── example-prd.md
```

---

## Error Recovery

| Interrupted At | Recovery Action | Behavior |
|---------------|-----------------|----------|
| Stage 1 (PRD) | Re-run `/req2prd` | Asks whether to regenerate or use existing PRD |
| Stage 2 (Plan) | Re-run `/prd2plan` | Checks if dev plan already exists |
| Stage 3 (JIRA) | Re-run `/plan2jira` | Idempotent — skips already-created issues |
| Stage 4 (Execute) | Re-run `/execute @plan` | Reads task statuses, reconciles JIRA, resumes from where it left off |

---

## Quick Reference — All Commands

| Command | Input | Output | Human Gates |
|---------|-------|--------|-------------|
| `/pipeline-init` | Project directory | `pipeline.config.yaml`, directories, `CLAUDE.md` update | Config questions |
| `/req2prd <requirement>` | Requirement text or `@file` | `docs/prd/<slug>.md` | PRD approval |
| `/prd2plan @<prd>` | PRD file | `docs/dev_plans/<slug>.md` | Plan approval |
| `/plan2jira @<plan>` | Dev plan file | JIRA issues + updated plan | Mandatory critic validation (Dev+Product) + JIRA creation confirm |
| `/execute @<plan>` | Dev plan file | Code, PRs, JIRA updates | Per-PR approval |
| `/validate @<file>` | Any artifact or `--diff` | Critic feedback | None (informational) |
| `/fullpipeline <requirement>` | Requirement text | Everything above | All gates (including plan2jira validation) |
