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

**If all stages are completed** (all gates passed, pipeline is in the Completion section), stop and tell the user:

```
Pipeline is already complete — nothing to checkpoint.
The state file was already marked as completed by the orchestrator. No resume is needed.
```

---

## Step 2: Read Conversation Context

Using the orchestrator's stage map, scan the current conversation to determine:

1. **The slug** — from PRD paths, dev plan paths, branch names, or JIRA keys in conversation
2. **Original requirement** — the `$ARGUMENTS` text from the original pipeline invocation
3. **Completed stages** — which gates were passed? Match against the orchestrator's gate definitions (Gate 1, Gate 2, etc.)
4. **Current stage** — what was the orchestrator doing when `/clear_and_go` was called? Waiting for a gate? Mid-subagent? Between stages?
5. **Task-level progress** (if in execution stage) — tasks marked `DONE`, `IN PROGRESS`, or pending. PR numbers, branch names, JIRA transitions.
6. **Test adjustment counts** (TDD pipeline, Stage 7+) — structural, behavioral, and security adjustment counts from the conversation. If not available from context, read from the existing state file to carry forward.
7. **User preferences** — skip JIRA? Skip stages? Special instructions?
8. **Active issues** — errors, blocked tasks, pending decisions

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
- `tdd/<slug>/tests` branch — verify via `git branch --list tdd/<slug>/tests` (Stage 6 artifact is a branch name, not a file path)
- `.pipeline/tdd/<slug>/baseline-results.json` — local-only (gitignored); skip if not found after clone
- `.pipeline/metrics/<slug>.json` — local-only (gitignored); skip if not found after clone

Also run: `git rev-parse --abbrev-ref HEAD` and `git log --oneline -5`

Flag any discrepancies between conversation state and disk state using structured messages:
- `"WARNING: Stage <N> marked done in conversation but <artifact_path> not found on disk"`
- `"WARNING: Conversation says stage <N> is <status> but disk artifact exists at <path>"`

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
| 1 | <name from orchestrator> | done |
| 2 | <name from orchestrator> | done |
| 3 | <name from orchestrator> | done (or skipped) |
| 4 | <name from orchestrator> | in_progress — 2/6 tasks done |
| 5 | <name from orchestrator> | not_started |

### Task Progress (if in execution stage):
| Task | Status | JIRA | PR | Branch |
|------|--------|------|----|--------|
| TASK 1.1 | done | PIPE-3 | #42 | feat/story-1-task-1-slug |
| TASK 1.2 | in_progress | PIPE-4 | — | — |
| TASK 2.1 | pending | PIPE-5 | — | — |

### Active Context
- Current branch: <branch>
- Last action: <what was happening>
- Pending decisions: <any open gates or user choices>
- Known issues: <any errors or blockers>

Is this correct? If anything is wrong, tell me what to fix.
Options: **confirm** | **fix** (tell me what to change) | **cancel** (abort checkpoint)
```

Wait for user response. If they correct anything, update before proceeding. If they cancel, stop without writing the state file.

---

## Step 5: Write State File

Once the user approves, write the state file to `docs/pipeline-state/<slug>.json`.

**Note:** If a state file already exists for this slug, check its `pipeline_status`:
- If `"active"` — overwrite it. This is intentional — `/clear_and_go` captures the most up-to-date state from the conversation, which may include progress beyond the last gate commit. Log: `"Note: overwriting existing state file (previous current_stage: <N>, new current_stage: <M>)"`
- If `"completed"` or `"aborted"` — warn the user before overwriting: `"WARNING: Existing state file is marked '<status>'. Overwriting with active checkpoint."` Proceed only if the user confirms.

Create the `docs/pipeline-state/` directory if it doesn't exist.

### Standard Pipeline (`/fullpipeline`) Schema:

```json
{
  "schema_version": 1,
  "pipeline": "fullpipeline",
  "pipeline_status": "active",
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
    },
    "5": {
      "status": "not_started",
      "summary": ""
    }
  },
  "tasks": {
    "1.1": { "status": "done", "jira": "PIPE-3", "pr": 42, "branch": "feat/story-1-task-1-slug" },
    "1.2": { "status": "in_progress", "jira": "PIPE-4" },
    "2.1": { "status": "pending", "jira": "PIPE-5" }
  },
  "test_result": null,
  "user_prefs": {
    "skip_jira": false
  },
  "known_issues": ["<any active errors or blockers>"],
  "git_branch": "<current branch>",
  "updated_at": "<ISO timestamp>"
}
```

### TDD Pipeline (`/tdd-fullpipeline`) Schema:

```json
{
  "schema_version": 1,
  "pipeline": "tdd-fullpipeline",
  "pipeline_status": "active",
  "slug": "<slug>",
  "requirement": "<full original requirement text>",
  "current_stage": 5,
  "stage_name": "<name from orchestrator>",
  "stages": {
    "1": { "status": "done", "artifact": "docs/prd/<slug>.md", "summary": "..." },
    "2": { "status": "done", "artifact": "docs/tdd/<slug>/design-brief.md", "summary": "..." },
    "3": { "status": "done", "artifact": "docs/tdd/<slug>/ui-contract.md", "summary": "..." },
    "4": { "status": "done", "artifact": "docs/tdd/<slug>/test-plan.md", "summary": "..." },
    "5": { "status": "in_progress", "artifact": "docs/dev_plans/<slug>.md", "jira_epic": "<key>", "summary": "..." },
    "6": { "status": "not_started", "artifact": "tdd/<slug>/tests", "summary": "" },
    "7": { "status": "not_started", "summary": "" },
    "8": { "status": "not_started", "artifact": ".pipeline/metrics/<slug>.json", "summary": "" }
  },
  "tasks": {
    "1.1": { "status": "done", "jira": "PIPE-3", "pr": 42, "branch": "feat/story-1-task-1-slug" },
    "1.2": { "status": "in_progress", "jira": "PIPE-4" },
    "2.1": { "status": "pending", "jira": "PIPE-5" }
  },
  "test_result": null,
  "test_adjustments": {
    "structural": 0,
    "behavioral": 0,
    "security": 0
  },
  "user_prefs": {
    "skip_jira": false,
    "mock_url": "<url>"
  },
  "known_issues": ["<any active errors or blockers>"],
  "git_branch": "<current branch>",
  "updated_at": "<ISO timestamp>"
}
```

**Field definitions:**
- `schema_version` — always `1`. Future schema changes increment this value; readers skip files with unrecognized versions (no forward-compatibility migration)
- `pipeline_status` — always `"active"` when written by `/clear_and_go`. Canonical enum (set by orchestrators): `"active"` | `"completed"` | `"aborted"`
- `current_stage` — always an integer (1–5 for fullpipeline, 1–8 for TDD). Validate range against pipeline type before writing. Note: `stages` object uses string keys (`"1"`, `"2"`, ...) per JSON convention; `current_stage` is an integer for arithmetic comparisons
- `stage_name` — human-readable name of the current stage, taken from the orchestrator's stage map. Informational; not validated on read. Canonical names: fullpipeline: "Requirement → PRD", "PRD → Dev Plan", "Dev Plan → JIRA", "Execute with Ralph Loop", "Test Verification". TDD: "Requirement → PRD", "PRD → Design Brief", "Mock App → UI Contract", "PRD + UI Contract → Test Plan", "PRD + Test Plan → Dev Plan", "Test Plan → Develop Tests", "Execute with Test Adjustment", "Validate"
- Stage `status` — `"done"` | `"in_progress"` | `"not_started"` | `"skipped"` | `"aborted"`
- Stage `summary` — string; brief human-readable outcome of the stage. Empty string `""` for `not_started` stages. Informational; not validated on read
- Stage `artifact` — optional; omitted for execution stages (Stage 4/7) where output is per-task PRs tracked in the `tasks` object. Omit or leave empty for `not_started` stages. Stage 6 (TDD) artifact `"tdd/<slug>/tests"` is a git branch name, not a file path. Stage 8 (TDD) artifact `".pipeline/metrics/<slug>.json"` is gitignored and local-only — do not flag as missing after clone. Readers must check the `pipeline` field before accessing pipeline-specific fields
- Task `status` — `"done"` | `"in_progress"` | `"pending"` (no `"aborted"` value — aborted pipelines stop execution; individual tasks remain at their last status)
- Task `pr` — integer (PR number) when a PR has been created; omit the field entirely (not `null`) when no PR exists yet
- `tasks` — object keyed by task ID (e.g., `"1.1"`); empty `{}` until Stage 4 begins (fullpipeline) or Stage 7 begins (TDD pipeline)
- `test_result` — `null` until Stage 5/8 completes, then `"PASS"` | `"FAIL"` | `"SKIPPED"`. Note: on abort, the orchestrator sets `"FAIL"` — there is no separate `"ABORTED"` enum value; check `pipeline_status` to distinguish test failure from user abort
- `test_adjustments` — TDD only; not present in fullpipeline state files. Cumulative test adjustment counts from Stage 7, persisted across interruptions to enforce the 20% behavioral threshold. Always `{ "structural": 0, "behavioral": 0, "security": 0 }` as initial values before Stage 7. Must be an object with exactly these three integer keys; on resume, if malformed and `current_stage >= 7`, halt and ask the user (see orchestrator resume step 12)
- `user_prefs` — object with known keys: `skip_jira` (boolean, both pipelines), `mock_url` (string, TDD only). Additional keys may be added; readers should ignore unknown keys
- `known_issues` — array of strings; `[]` when no issues
- `updated_at` — ISO 8601 timestamp; set on every write

**Important:** Do not include secrets, API keys, or PII in the requirement text — it is stored verbatim in the state file and committed to git history.

**Design constraints:**
- **Single-session:** The state file assumes one active session per slug. Concurrent runs with the same slug will overwrite each other. This is by design — pipeline execution is inherently sequential.
- **Accumulation:** Completed state files remain in `docs/pipeline-state/` and are intentionally tracked in git as an audit trail. The orchestrator only acts on files with `pipeline_status: "active"`, so completed/aborted files are inert. Delete them manually if cleanup is desired.
- **State file size:** Bounded by design — the file contains metadata only (stage statuses, task IDs, short summaries), not artifact content. Typical size is under 2 KB.
- **`$ARGUMENTS` injection:** The requirement text from `$ARGUMENTS` is stored verbatim in the `requirement` field. This is user-provided input within the CLI session — no sanitization is applied. This is an accepted risk: the user controls their own CLI environment.

After writing, commit immediately:

```bash
mkdir -p docs/pipeline-state
# (write file)
git add docs/pipeline-state/<slug>.json
git commit -m "chore: save pipeline checkpoint for <slug> at stage <N>"
```

If the state file write itself fails (e.g., permission error, disk full), log: `"ERROR: [clear_and_go] Failed to write state file docs/pipeline-state/<slug>.json — <error>"` and present the error to the user — the checkpoint cannot be saved without the state file. Unlike the orchestrator gate writes (which continue on write failure because the pipeline can fall back to disk artifact detection), `/clear_and_go` treats write failure as fatal because the entire purpose of the command is to produce this checkpoint. Inform the user: `"If you clear context anyway, the orchestrator will attempt to reconstruct state from disk artifacts on next run, but task-level progress and user preferences may be lost."`
If the git commit fails (e.g., nothing changed), continue — the state file on disk is the source of truth.

---

## Step 6: Copy Resume Command to Clipboard and Present

Build the exact command the user needs to type after clearing:

```
/<pipeline-command> <original requirement text>
```

For example: `/fullpipeline Build a marketplace plugin system that allows third-party developers to extend the platform`

Copy it to the clipboard. Escape single quotes in the requirement text by replacing `'` with `'\''`:
```bash
# macOS — capture exit code to check success
printf '%s' '/<pipeline-command> <escaped requirement text>' | pbcopy 2>/dev/null
CLIP_OK=$?
# Linux fallback (if pbcopy unavailable)
if [ $CLIP_OK -ne 0 ]; then
  printf '%s' '...' | xclip -selection clipboard 2>/dev/null && CLIP_OK=$? || \
  printf '%s' '...' | xsel --clipboard --input 2>/dev/null && CLIP_OK=$?
fi
```

Then output — adjust the clipboard line based on `$CLIP_OK`:

**If clipboard copy succeeded ($CLIP_OK = 0):**
```
## Checkpoint Saved

State file: docs/pipeline-state/<slug>.json (committed to git)

**Resume command** (copied to clipboard):

/<pipeline-command> <original requirement text>

**Steps:**
1. Clear context: press Escape, type `/clear`, press Enter
2. Paste the command (Cmd+V / Ctrl+V), press Enter
3. The orchestrator will detect the state file and offer to resume from Stage <N>
```

**If clipboard copy failed ($CLIP_OK != 0):**
```
## Checkpoint Saved

State file: docs/pipeline-state/<slug>.json (committed to git)

**Resume command** (copy manually):

/<pipeline-command> <original requirement text>

**Steps:**
1. Clear context: press Escape, type `/clear`, press Enter
2. Copy the command above and paste it, press Enter
3. The orchestrator will detect the state file and offer to resume from Stage <N>
```
