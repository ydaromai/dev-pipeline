# dev-pipeline

AI-driven software delivery pipeline for Claude Code. Converts requirements into PRDs, dev plans, JIRA issues, and implemented code — with automated quality gates at every stage.

## How It Works

```
Requirement  -->  PRD  -->  Dev Plan  -->  JIRA  -->  Code (Ralph Loop)
              GATE 1     GATE 2      GATE 3a/3b    GATE 4 (per PR)
```

Each stage is a Claude Code slash command. Human approval gates sit between stages. Five critic agents (Product, Dev, DevOps, QA, Security) validate artifacts at each gate.

## Quick Start

### 1. Install

Copy the pipeline commands to your Claude Code config:

```bash
# Clone this repo
git clone <repo-url> ~/Projects/dev-pipeline

# Symlink commands into Claude Code
ln -s ~/Projects/dev-pipeline/commands ~/.claude/commands
ln -s ~/Projects/dev-pipeline/pipeline ~/.claude/pipeline
```

### 2. Initialize a project

In your target project directory:

```
/pipeline-init
```

This creates `pipeline.config.yaml`, sets up directories, and configures JIRA integration.

### 3. Run the pipeline

Full pipeline (end-to-end):
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
| `/req2prd <requirement>` | Requirement to PRD with Product Critic review |
| `/prd2plan @<prd>` | PRD to dev plan with 5-critic review |
| `/plan2jira @<plan>` | Dev plan to JIRA issues (mandatory critic gate) |
| `/execute @<plan>` | Execute tasks with Ralph Loop (build/review cycles) |
| `/fullpipeline <requirement>` | Run all stages end-to-end with gates |
| `/validate @<file>` | Run critic agents standalone on any artifact |

## Ralph Loop

The execution engine uses a build/review cycle with fresh context per iteration:

```
BUILD (Sonnet or Opus)  -->  REVIEW (Opus, 5 critics)  -->  PASS? --> PR
                                      |
                                     FAIL
                                      |
                              FIX (fresh context)  -->  RE-REVIEW
                              (max 3 iterations, then escalate)
```

- **Simple/Medium tasks**: Built with Sonnet
- **Complex tasks**: Built with Opus
- **All reviews**: Opus with all 5 critics

## Critic Agents

| Critic | Focus |
|--------|-------|
| **Product** | PRD alignment, acceptance criteria coverage |
| **Dev** | Code quality, patterns, conventions |
| **DevOps** | Deployment readiness, infrastructure, secrets |
| **QA** | Test coverage, edge cases, regression risk |
| **Security** | OWASP Top 10, auth, injection, secrets, threat modeling |

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
- **Validation**: which critics run at each stage, parallel vs sequential
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
