# /clear_and_go — Save Pipeline Checkpoint and Prepare for Context Clear

You are executing the **clear_and_go** command. You are being called **mid-conversation** during an active `/fullpipeline` or `/tdd-fullpipeline` run. Your job is to:

1. Read the orchestrator file to map stages correctly
2. Understand the current pipeline state from conversation context
3. Verify against disk artifacts
4. Confirm your understanding with the user
5. Write a state file to disk and commit it
6. Tell the user to clear context and re-run the same pipeline command

**Input:** Optional notes via `$ARGUMENTS`
**Output:** A saved state file on disk + instructions for the user

---

## Step 1: Read the Orchestrator File

Determine which pipeline is active from conversation context (look for `/fullpipeline` or `/tdd-fullpipeline` invocation, stage headers, gate names).

Then read the corresponding orchestrator file to get the authoritative stage map:

- **Standard pipeline:** Read `~/Projects/dev-pipeline/commands/fullpipeline.md`
- **TDD pipeline:** Read `~/Projects/dev-pipeline/commands/tdd-fullpipeline.md`

Use the orchestrator's stage definitions (names, numbers, artifacts, gates) as the reference for all stage mapping below. Do NOT guess stage names or numbers from memory.

**If no pipeline context is found** (no `/fullpipeline` or `/tdd-fullpipeline` invocation, no stage headers, no PRD/plan artifacts in conversation), stop immediately and tell the user:

```
No active pipeline detected in this conversation.
/clear_and_go is designed to be used mid-pipeline during a /fullpipeline or /tdd-fullpipeline run.
```

---

## Step 2: Read Conversation Context

Using the orchestrator's stage map, scan the current conversation to determine:

1. **The slug** — from PRD paths, dev plan paths, branch names, or JIRA keys in conversation
2. **Original requirement** — the `$ARGUMENTS` text from the original pipeline invocation
3. **Completed stages** — which gates were passed? Match against the orchestrator's gate definitions (Gate 1, Gate 2, etc.)
4. **Current stage** — what was the orchestrator doing when `/clear_and_go` was called? Waiting for a gate? Mid-subagent? Between stages?
5. **Task-level progress** (if in execution stage) — tasks marked `DONE`, `IN PROGRESS`, or pending. PR numbers, branch names, JIRA transitions.
6. **User preferences** — skip JIRA? Skip stages? Special instructions?
7. **Active issues** — errors, blocked tasks, pending decisions

---

## Step 3: Verify Against Disk

Cross-check conversation understanding against actual disk state.

### For Standard Pipeline (`/fullpipeline`):
- `docs/prd/<slug>.md` — exists?
- `docs/dev_plans/<slug>.md` — exists? If yes, read it for task statuses.
- `.jira-import-history.json` — has entry for this plan?
- `jira-issue-mapping.json` — read JIRA keys

### For TDD Pipeline (`/tdd-fullpipeline`):
- `docs/prd/<slug>.md`
- `docs/tdd/<slug>/design-brief.md`
- `docs/tdd/<slug>/ui-contract.md`
- `docs/tdd/<slug>/test-plan.md`
- `docs/dev_plans/<slug>.md`
- `.jira-import-history.json`
- `jira-issue-mapping.json`

Also run: `git branch --show-current` and `git log --oneline -5`

Flag any discrepancies between conversation state and disk state.

---

## Step 4: Present Understanding for Approval

Present your understanding to the user using AskUserQuestion:

```
## Pipeline State — Please Confirm

**Pipeline:** /fullpipeline (or /tdd-fullpipeline)
**Slug:** <slug>
**Requirement:** "<first ~100 chars of the original requirement>..."

### Stage Progress
| Stage | Name | Status |
|-------|------|--------|
| 1 | <name from orchestrator> | DONE |
| 2 | <name from orchestrator> | DONE |
| 3 | <name from orchestrator> | DONE (or SKIPPED) |
| 4 | <name from orchestrator> | IN PROGRESS — 2/6 tasks done |
| 5 | <name from orchestrator> | NOT STARTED |

### Task Progress (if in execution stage):
| Task | Status | JIRA | PR | Branch |
|------|--------|------|----|--------|
| TASK 1.1 | DONE | PIPE-3 | #42 | feat/story-1-task-1-slug |
| TASK 1.2 | IN PROGRESS | PIPE-4 | — | — |
| TASK 2.1 | pending | PIPE-5 | — | — |

### Active Context
- Current branch: <branch>
- Last action: <what was happening>
- Pending decisions: <any open gates or user choices>
- Known issues: <any errors or blockers>

Is this correct? If anything is wrong, tell me what to fix.
```

Wait for user response. If they correct anything, update before proceeding.

---

## Step 5: Write State File

Once the user approves, write the state file to `docs/pipeline-state/<slug>.json`.

Create the `docs/pipeline-state/` directory if it doesn't exist.

### State File Schema:

```json
{
  "pipeline": "fullpipeline",
  "slug": "<slug>",
  "requirement": "<full original requirement text>",
  "current_stage": 4,
  "stage_name": "<name from orchestrator>",
  "stages": {
    "1": {
      "status": "done",
      "artifact": "docs/prd/<slug>.md",
      "summary": "<one-line outcome>"
    },
    "2": {
      "status": "done",
      "artifact": "docs/dev_plans/<slug>.md",
      "summary": "<one-line outcome>"
    },
    "3": {
      "status": "done",
      "jira_epic": "PIPE-35",
      "summary": "<one-line outcome>"
    },
    "4": {
      "status": "in_progress",
      "summary": "2/6 tasks done"
    }
  },
  "tasks": {
    "1.1": { "status": "done", "jira": "PIPE-3", "pr": 42, "branch": "feat/story-1-task-1-slug" },
    "1.2": { "status": "in_progress", "jira": "PIPE-4" },
    "2.1": { "status": "pending", "jira": "PIPE-5" }
  },
  "user_prefs": {
    "skip_jira": false
  },
  "known_issues": ["<any active errors or blockers>"],
  "git_branch": "<current branch>",
  "updated_at": "<ISO timestamp>"
}
```

For TDD pipeline, the `stages` object includes all 8 stages, and artifacts include `brief_path`, `contract_path`, `test_plan_path`.

After writing, commit immediately:

```bash
mkdir -p docs/pipeline-state
# (write file)
git add docs/pipeline-state/<slug>.json
git commit -m "chore: save pipeline checkpoint for <slug> at stage <N>"
```

---

## Step 6: Copy Resume Command to Clipboard and Present

Build the exact command the user needs to type after clearing:

```
/<pipeline-command> <original requirement text>
```

For example: `/fullpipeline Build a marketplace plugin system that allows third-party developers to extend the platform`

Copy it to the clipboard using platform-appropriate command:
```bash
# macOS
printf '%s' '/<pipeline-command> <original requirement text>' | pbcopy
# Linux (fallback if pbcopy unavailable)
# printf '%s' '...' | xclip -selection clipboard
# printf '%s' '...' | xsel --clipboard --input
```

If clipboard copy fails (e.g., no clipboard tool available), skip silently — the command is displayed below for manual copy.

Then output:

```
## Checkpoint Saved

State file: docs/pipeline-state/<slug>.json (committed to git)

**Resume command (already copied to your clipboard):**

/<pipeline-command> <original requirement text>

**Steps:**
1. Clear context: press Escape, type `/clear`, press Enter
2. Paste from clipboard (Cmd+V) and press Enter
3. The orchestrator will detect the state file and offer to resume from Stage <N>
```
