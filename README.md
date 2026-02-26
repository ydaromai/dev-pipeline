# dev-pipeline

AI-driven software delivery pipeline for Claude Code. Converts requirements into PRDs, dev plans, JIRA issues, and implemented code — with automated quality gates at every stage.

## How It Works

```
Requirement  -->  PRD  -->  Dev Plan  -->  JIRA  -->  Code (Ralph Loop)
              GATE 1     GATE 2      GATE 3a/3b    GATE 4 (per PR)
```

Each stage is a Claude Code slash command. Human approval gates sit between stages. Ten critic agents validate artifacts at each gate — 7 always-on (Product, Dev, DevOps, QA, Security, Performance, Data Integrity) and 3 conditional (Observability when `has_backend_service: true`, API Contract when `has_api: true`, Designer when `has_frontend: true`).

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

## Quick Start

### 1. Initialize a project

In your target project directory:

```
/pipeline-init
```

This creates `pipeline.config.yaml`, sets up directories, and configures JIRA integration.

### 2. Run the pipeline

Full pipeline (end-to-end, with fresh context per stage):
```
/fullpipeline "Add user authentication with OAuth2"
```

Or run stages individually:
```
/req2prd "Add user authentication with OAuth2"
/prd2plan @docs/prd/user-auth.md
/plan2jira @docs/dev_plans/user-auth.md
/execute @docs/dev_plans/user-auth.md
```

## Commands

| Command | Description |
|---------|-------------|
| `/pipeline-init` | One-time project setup (config, directories, JIRA) |
| `/req2prd <requirement>` | Requirement to PRD with all-critic scoring Ralph Loop |
| `/prd2plan @<prd>` | PRD to dev plan with 10-critic review |
| `/plan2jira @<plan>` | Dev plan to JIRA issues (mandatory critic gate) |
| `/execute @<plan>` | Execute tasks with Ralph Loop (build/review cycles) |
| `/fullpipeline <requirement>` | Run all stages end-to-end with gates |
| `/validate @<file>` | Run critic agents standalone on any artifact |

## Quality Loops

The pipeline uses two distinct quality loops to ensure high-quality artifacts before any code is written:

### PRD Scoring Ralph Loop (`/req2prd`)

All applicable critics (7 always-on + conditional: Observability, API Contract, Designer) score the PRD 1–10. The loop iterates until:
- **Per-critic minimum**: > 8.5
- **Overall average**: > 9.0
- **Max iterations**: 5

N/A critics (e.g., Designer when `has_frontend: false`, Observability when `has_backend_service: false`, API Contract when `has_api: false`) are excluded from both numerator and denominator.

### Dev Plan Zero-Warnings Loop (`/prd2plan`)

All applicable critics review the dev plan. The loop iterates until:
- **Zero Critical findings** AND **zero Warnings** across all critics
- Notes (informational) are acceptable
- **Max iterations**: 5

> **Why the asymmetry?** PRDs are living documents refined during implementation — minor warnings are acceptable if scores are high. Dev plans are the direct blueprint for code execution — unresolved warnings propagate into bugs, tech debt, or security gaps.

### Execution Ralph Loop (`/execute`)

The execution engine uses a build/review cycle with fresh context per iteration:

```
BUILD (Opus 4.6)  -->  REVIEW (Opus 4.6, all critics)  -->  PASS? --> PR
                        |
                       FAIL
                        |
                FIX (fresh context)  -->  RE-REVIEW
                (max 3 iterations, then escalate)
```

- **Simple tasks**: Built with Sonnet 4.6 (docs, config, small edits)
- **Medium/Complex tasks**: Built with Opus 4.6
- **All reviews**: Opus 4.6 with all applicable critics (7 always-on + 3 conditional: Observability, API Contract, Designer)

## Critic Agents

All critics produce: **Verdict** (PASS/FAIL) → **Score** (N.N / 10) → **Findings** (Critical/Warnings/Notes) → **Checklist** → **Summary**

| Critic | Code/Plan Review Focus | PRD Review Focus |
|--------|----------------------|-----------------|
| **Product** | PRD alignment, AC coverage, analytics tracking | Completeness, testable AC, scope, analytics |
| **Dev** | Code quality, patterns, conventions, instrumentation | Technical feasibility, ambiguity, data model, API contracts |
| **DevOps** | Deployment readiness, infrastructure, secrets | Infrastructure requirements, environment, scalability, monitoring |
| **QA** | Test coverage, edge cases, regression risk | Testable AC, edge cases, testing strategy, measurable NFRs |
| **Security** | OWASP Top 10, auth, injection, secrets, threat modeling | Auth/authz requirements, sensitive data, threat model, compliance |
| **Performance** | Algorithmic complexity, N+1 queries, caching, pagination | Measurable performance requirements, scalability, latency budgets |
| **Data Integrity** | Schema safety, migration reversibility, data validation | Data model clarity, data flows, quality requirements, retention |
| **Observability** | Structured logging, metrics, tracing, health checks, alerting | SLOs/SLIs, alerting expectations, monitoring, dashboarding (only when `has_backend_service: true`) |
| **API Contract** | Backward compatibility, versioning, documentation, contract tests | API clarity, breaking changes, versioning strategy, consumer impact (only when `has_api: true`) |
| **Designer** | Accessibility (WCAG 2.1 AA), responsive design, UX consistency | UX flow, accessibility, responsive, interaction patterns (only when `has_frontend: true`) |

## Project Structure

```
dev-pipeline/
  commands/             # Claude Code slash commands (pipeline stages)
    req2prd.md
    prd2plan.md
    plan2jira.md
    execute.md
    fullpipeline.md
    validate.md
    pipeline-init.md
  pipeline/
    agents/             # Critic agent personas
      product-critic.md
      dev-critic.md
      devops-critic.md
      qa-critic.md
      security-critic.md
      performance-critic.md
      data-integrity-critic.md
      observability-critic.md
      api-contract-critic.md
      designer-critic.md
    templates/           # PRD and config templates
      prd-template.md
      pipeline-config-template.yaml
    examples/
      example-prd.md
  scripts/
    jira/               # JIRA integration scripts
      jira-import.js      # Import dev plans to JIRA
      transition-issue.js # Transition issue status
      cleanup-import.js   # Delete issues from failed imports
      lib/
        markdown-to-adf.js # Markdown to Atlassian Document Format
      test/               # Unit tests (node:test)
  docs/
    prd/                # Generated PRDs
    dev_plans/          # Generated dev plans
  WORKFLOW.md           # Detailed pipeline reference
```

## JIRA Integration

The pipeline creates JIRA issues (Epic > Story > Task) from dev plans and syncs status during execution.

### Setup

```bash
cp scripts/jira/.env.example .env.jira
# Edit .env.jira with your credentials
```

Required environment variables:
```
JIRA_API_URL=https://yourcompany.atlassian.net
JIRA_EMAIL=your.email@company.com
JIRA_API_TOKEN=your_api_token
JIRA_PROJECT_KEY=PROJ
```

### Scripts

See [scripts/jira/README.md](scripts/jira/README.md) for detailed usage.

## Configuration

Each project gets a `pipeline.config.yaml` (created by `/pipeline-init`) that controls:

- **JIRA settings**: project key, host, credentials path
- **Validation**: which critics run at each stage, parallel vs sequential, max iterations (5)
- **Scoring**: PRD quality thresholds (per-critic > 8.5, overall > 9.0)
- **Execution**: build/review models, max iterations, branch pattern
- **Test commands**: unit, integration, UI, all
- **Test requirements**: file patterns mapped to required test types
- **Paths**: PRD dir, dev plans dir, scripts locations

See [pipeline/templates/pipeline-config-template.yaml](pipeline/templates/pipeline-config-template.yaml) for the full template.

## Requirements

- [Claude Code](https://claude.com/claude-code) CLI
- Node.js >= 18 (for JIRA scripts)
- `gh` CLI (for PR creation during execution)
- JIRA Cloud account (optional, can skip with `skip-jira`)
