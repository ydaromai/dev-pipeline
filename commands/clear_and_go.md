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

- **Standard pipeline:** Read `${CLAUDE_PLUGIN_ROOT}/commands/fullpipeline.md`
- **TDD pipeline:** Read `${CLAUDE_PLUGIN_ROOT}/commands/tdd-fullpipeline.md`

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
7. **Test result** — if Stage 5 (fullpipeline) or Stage 8 (TDD) has completed, extract the test result (`PASS`, `FAIL`, or `SKIPPED`). If not yet reached, leave as `null`.
8. **User preferences** — skip JIRA? Skip stages? Special instructions?
9. **Active issues** — errors, blocked tasks, pending decisions

**Edge case — no slug yet:** If `/clear_and_go` is invoked during Stage 1 before the PRD subagent has returned (and thus before the slug is known), inform the user: `"Stage 1 is still in progress and no slug has been derived yet. Wait for Stage 1 to complete before running /clear_and_go, or abort and re-run the pipeline."` Do not proceed without a valid slug.

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
- `"WARNING: [clear_and_go] Stage <N> marked done in conversation but <artifact_path> not found on disk"`
- `"WARNING: [clear_and_go] Conversation says stage <N> is <status> but disk artifact exists at <path>"`

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

Note: Status uses uppercase display labels. The JSON state file stores lowercase with underscores (e.g., `"in_progress"` → `IN PROGRESS`).

### Task Progress (if in execution stage):
| Task | Status | JIRA | PR | Branch |
|------|--------|------|----|--------|
| TASK 1.1 | DONE | PIPE-3 | #42 | feat/story-1-task-1-slug |
| TASK 1.2 | IN PROGRESS | PIPE-4 | — | — |
| TASK 2.1 | PENDING | PIPE-5 | — | — |

### Active Context
- Current branch: <branch>
- Last action: <what was happening>
- Pending decisions: <any open gates or user choices>
- Known issues: <any errors or blockers>

Is this correct? If anything is wrong, tell me what to fix.
Options: **confirm** | **fix** (tell me what to change) | **cancel** (abort checkpoint)
```

*Gate options convention: "edit" for document-stage gates where the user modifies artifacts; "fix" for code/test-stage gates where the user fixes implementation issues. /clear_and_go uses "confirm"/"fix"/"cancel" because it is a checkpoint confirmation, not a stage gate.*

Wait for user response. If they correct anything, update before proceeding. If they cancel, stop without writing the state file.

---

## Step 5: Write State File

Once the user approves, validate before writing:

1. **Validate `current_stage` range** — must be an integer: 1–5 for fullpipeline, 1–8 for tdd-fullpipeline. If out of range, halt and ask the user to correct.
2. **Validate slug** — must match `^[a-z0-9][a-z0-9_-]{0,63}$`. If invalid, halt and ask the user.
3. **Validate `test_adjustments`** (TDD only) — must be an object with exactly keys `"structural"`, `"behavioral"`, `"security"`, each a non-negative integer (>= 0). Reject negative values, non-integer values, or extra keys — halt and ask the user to correct. If `current_stage >= 7` and values cannot be determined from conversation context or an existing state file, halt and ask the user to provide the counts rather than defaulting to zeroes (which would bypass the 20% behavioral threshold). If `current_stage < 7`, default to zeroes is safe. **Carry-forward rule:** if an existing state file contains valid `test_adjustments` values and the conversation context does not provide updated counts, carry forward the existing values into the new state file. Do not silently drop them. For fullpipeline state files, MUST NOT write `test_adjustments` (TDD-only field).
4. **Validate stage consistency** — all stages before `current_stage` should have status `"done"` or `"skipped"`, not `"not_started"`. If inconsistent, warn the user and ask for correction before writing.
5. **Validate `test_result`** (if non-null) — must be one of `"PASS"`, `"FAIL"`, `"SKIPPED"`. If any other value, halt and ask the user to correct.

Write the state file to `docs/pipeline-state/<slug>.json`.

**Note:** If a state file already exists for this slug, first check its `pipeline` field:
- If the existing file's `pipeline` field does not match the current pipeline type (e.g., existing is `"fullpipeline"` but current run is `"tdd-fullpipeline"`), warn the user: `"WARNING: [clear_and_go] Existing state file is for pipeline '<existing_pipeline>' but current run is '<current_pipeline>'. Overwriting will destroy the other pipeline's state."` Proceed only if the user explicitly confirms.

Then check its `pipeline_status`:
- If `"active"` — overwrite it. This is intentional — `/clear_and_go` captures the most up-to-date state from the conversation, which may include progress beyond the last gate commit. Log: `"INFO: [clear_and_go] Overwriting existing state file (previous current_stage: <N>, new current_stage: <M>)"`
- If `"completed"` or `"aborted"` — warn the user before overwriting: `"WARNING: [clear_and_go] Existing state file is marked '<status>'. Overwriting with active checkpoint. This is a manual override — the standard transition rules (active→completed, active→aborted) do not apply to /clear_and_go manual checkpoints."` Proceed only if the user confirms.

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
  "tasks": {},
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
- `schema_version` — always integer `1`. On read, validate type is integer; reject strings like `"1"`. Future schema changes increment this value; readers skip files with unrecognized versions (no forward-compatibility migration)
- `pipeline` — string identifying the pipeline type: `"fullpipeline"` or `"tdd-fullpipeline"`. Used by Resume Detection to filter state files and by the pipeline-type mismatch check (Step 5)
- `slug` — kebab-case identifier derived from the PRD title; must match `^[a-z0-9][a-z0-9_-]{0,63}$`. Used as the key for all artifact paths and the state file name (`<slug>.json`)
- `requirement` — verbatim copy of the original requirement text from `$ARGUMENTS`. Stored for resume matching and reference. Do not include secrets, API keys, or PII
- `pipeline_status` — always `"active"` when written by `/clear_and_go`. Canonical enum (set by orchestrators): `"active"` | `"completed"` | `"aborted"`. Valid transitions: `active → completed`, `active → aborted`. Exception: `/clear_and_go` may overwrite a `"completed"` or `"aborted"` file with `"active"` after explicit user confirmation (see Step 5 mismatch check). This is a manual override, not a standard transition — the orchestrators never perform this transition automatically
- `current_stage` — always an integer (1–5 for fullpipeline, 1–8 for TDD). On completion, set to the final stage (5 or 8). On abort, remains at the stage where abort occurred. Validate range against pipeline type before writing. **Consistency rule:** when `pipeline_status` is `"active"`, `stages[str(current_stage)].status` MUST be `"in_progress"` or `"not_started"` — never `"done"` or `"skipped"` (if the current stage is done, `current_stage` should have already been incremented). On completion (`pipeline_status: "completed"`), `current_stage` is the final stage and its status is `"done"`. Note: `stages` object uses string keys (`"1"`, `"2"`, ...) per JSON convention; `current_stage` is an integer for arithmetic comparisons
- `stage_name` — human-readable name of the current stage, taken from the orchestrator's stage map. On write, MUST match the canonical name for `current_stage`. Informational; not validated on read (future schema versions may add new names). Canonical names — fullpipeline: stage 1 = "Requirement → PRD", stage 2 = "PRD → Dev Plan", stage 3 = "Dev Plan → JIRA", stage 4 = "Execute with Ralph Loop", stage 5 = "Test Verification". TDD: stage 1 = "Requirement → PRD", stage 2 = "PRD → Design Brief", stage 3 = "Mock App → UI Contract", stage 4 = "PRD + UI Contract → Test Plan", stage 5 = "PRD + Test Plan → Dev Plan", stage 6 = "Test Plan → Develop Tests", stage 7 = "Execute with Test Adjustment", stage 8 = "Validate"
- `stages` — object keyed by stage number as string (`"1"` through `"5"` for fullpipeline, `"1"` through `"8"` for TDD). Each entry contains `status` and optional fields (`artifact`, `jira_epic`, `summary`). All keys must be present even for stages not yet reached
- Stage `status` — `"done"` | `"in_progress"` | `"not_started"` | `"skipped"` | `"aborted"`. On read, reject unknown values. `"aborted"` means the user chose to stop the pipeline at this stage — stages after the aborted stage remain `"not_started"`, and the aborted stage itself was not completed
- Stage `jira_epic` — optional string; present on Stage 3 (fullpipeline) or Stage 5 (TDD pipeline) when JIRA import has completed. Contains the JIRA epic key (e.g., `"PIPE-35"`). Omitted when JIRA is skipped or stage not yet reached
- Stage `summary` — string; brief human-readable outcome of the stage (recommended: under 500 characters). Empty string `""` for `not_started` stages. Informational; not validated on read
- Stage `artifact` — optional; omitted for execution stages (Stage 4/7) where output is per-task PRs tracked in the `tasks` object. When present on `not_started` stages, it is the expected output path (informational), not a claim of existence on disk. Stage 6 (TDD) artifact `"tdd/<slug>/tests"` is a git branch name, not a file path. Stage 8 (TDD) artifact `".pipeline/metrics/<slug>.json"` is gitignored and local-only — do not flag as missing after clone. Readers must check the `pipeline` field before accessing pipeline-specific fields
- Task `status` — `"done"` | `"in_progress"` | `"pending"` (no `"aborted"` value — aborted pipelines stop execution; individual tasks remain at their last status). On read, reject unknown values. Note: tasks use `"pending"` while stages use `"not_started"` — this is intentional: `"pending"` indicates a task is queued for execution within an active stage, while `"not_started"` indicates a stage the pipeline has not reached yet
- Task `jira` — string; JIRA issue key (e.g., `"PIPE-42"`) for this task. Present when JIRA is enabled; omitted when JIRA is skipped
- Task `branch` — string; git branch name for this task (e.g., `"feat/<slug>/task-1.1"`). Present when a branch has been created; omitted before task execution begins
- Task `pr` — integer (PR number) when a PR has been created; omit the field entirely (not `null`) when no PR exists yet
- `tasks` — object keyed by task ID (e.g., `"1.1"`); empty `{}` until Stage 4 begins (fullpipeline) or Stage 7 begins (TDD pipeline). Writers MUST NOT populate `tasks` before the execution stage starts. On read, validate that each task entry has a `status` field with a valid enum value
- `test_result` — `null` until Stage 5/8 completes, then `"PASS"` | `"FAIL"` | `"SKIPPED"`. On read, reject unknown non-null values. Note: on abort, the orchestrator sets `"FAIL"` — there is no separate `"ABORTED"` enum value; check `pipeline_status` to distinguish test failure from user abort. `/clear_and_go` preserves whatever `test_result` value exists in conversation context without re-logging the reason — the originating orchestrator is responsible for FAIL reason logging
- `test_adjustments` — TDD only; not present in fullpipeline state files. Cumulative test adjustment counts from Stage 7, persisted across interruptions to enforce the 20% behavioral threshold. Always an object with exactly three keys: `{ "structural": 0, "behavioral": 0, "security": 0 }`, each a non-negative integer (>= 0). Reject negative values, non-integer values, or extra keys beyond these three. Initial values are zeroes before Stage 7. On resume, if malformed and `current_stage >= 7`, halt and ask the user (see orchestrator resume step 12)
- `user_prefs` — object with known keys: `skip_jira` (boolean, both pipelines), `mock_url` (string, TDD only). Additional keys may be added; readers MUST ignore unknown keys (forward-compatible). Writers MUST NOT remove keys they don't recognize when updating the state file
- `known_issues` — array of strings; `[]` when no issues. Writers MUST enforce: individual entries under 200 characters (truncate with `"…"` suffix if needed), array under 10 entries (keep most recent). Do not include secrets, API keys, or PII in entries — they are committed to git history
- `git_branch` — string; the git branch name when the state file was last written. Used by Resume Detection to warn if the current branch differs from the saved branch. Informational; not validated on read
- `updated_at` — ISO 8601 timestamp in UTC (e.g., `"2026-03-05T14:30:00Z"`); set on every write. Always use UTC. On read, accept any valid ISO 8601 string; do not reject if timezone offset differs (normalize to UTC for display)

**Important:** Do not include secrets, API keys, or PII in the requirement text — it is stored verbatim in the state file and committed to git history. Keep requirement text concise (recommended: under 2 KB) — excessively long text bloats the state file and git history without benefit.

**Design constraints:**
- **Single-session:** The state file assumes one active session per slug. Concurrent runs with the same slug will overwrite each other — there is no file-level advisory lock. If you have multiple terminal tabs running pipelines for the same slug, the last write wins and earlier state is silently lost. This is by design — pipeline execution is inherently sequential and single-user.
- **Cross-pipeline collision:** State files use `<slug>.json` naming without a pipeline-type prefix. If the same slug is used for both `/fullpipeline` and `/tdd-fullpipeline`, the second run's state file overwrites the first. Resume Detection filters by the `pipeline` field, so the overwritten pipeline becomes invisible. Step 5 includes a pipeline-type mismatch check to warn before overwriting.
- **Accumulation:** Completed state files remain in `docs/pipeline-state/` and are intentionally tracked in git as an audit trail. The orchestrator only acts on files with `pipeline_status: "active"`, so completed/aborted files are inert. **Cleanup:** Delete completed/aborted files manually when no longer needed (e.g., `git rm docs/pipeline-state/<slug>.json && git commit`). For projects with many pipeline runs, prune periodically to avoid repo bloat.
- **State file size:** Bounded by design — the file contains metadata only (stage statuses, task IDs, short summaries), not artifact content. Typical size is under 2 KB.
- **Atomic writes:** The state file is written and then committed. If the process crashes mid-write, the file may be truncated. This is an accepted trade-off — the orchestrator's Resume Detection handles corrupt JSON gracefully (skips the file and falls back to disk artifact detection). A write-to-temp-then-rename approach would be atomic on POSIX but adds complexity; not implemented in v1.
- **Write failure asymmetry:** `/clear_and_go` treats state file write failure as fatal (the entire purpose is to produce the checkpoint). The orchestrators treat it as non-fatal (checkpoint creation is secondary to pipeline execution). If `/clear_and_go` fails, the orchestrator can still reconstruct state from disk artifacts on next run, but task-level progress and `test_adjustments` may be lost.
- **`$ARGUMENTS` injection:** The requirement text from `$ARGUMENTS` is stored verbatim in the `requirement` field. This is user-provided input within the CLI session — no sanitization is applied. This is an accepted risk: the user controls their own CLI environment. Do not pipe untrusted input into pipeline commands.
- **Schema migration:** When `schema_version` is incremented to 2, a migration path will be defined in the new schema's documentation. Until then, readers skip files with unrecognized versions. This is by-design — forward migration complexity is deferred until a second schema version actually exists.
- **Field duplication across files:** The state file schema and field definitions are intentionally repeated in `clear_and_go.md`, `fullpipeline.md`, and `tdd-fullpipeline.md`. Each file is self-contained so subagents can operate without reading other orchestrator files. This trades maintenance burden for execution reliability.

After writing, commit immediately:

```bash
mkdir -p docs/pipeline-state
# (write file)
git add docs/pipeline-state/<slug>.json
git commit -m "chore: save pipeline checkpoint for <slug> at stage <N>"
```

On successful write, log: `"INFO: [clear_and_go] State file written: docs/pipeline-state/<slug>.json (stage <N>)"`.

If the state file write itself fails (e.g., permission error, disk full), log: `"ERROR: [clear_and_go] Failed to write state file docs/pipeline-state/<slug>.json — <error>"` and present the error to the user — the checkpoint cannot be saved without the state file. Unlike the orchestrator gate writes (which continue on write failure because the pipeline can fall back to disk artifact detection), `/clear_and_go` treats write failure as fatal because the entire purpose of the command is to produce this checkpoint. Inform the user: `"If you clear context anyway, the orchestrator will attempt to reconstruct state from disk artifacts on next run, but task-level progress and user preferences may be lost."`
If the git commit fails (e.g., nothing changed), continue — the state file on disk is the source of truth.

---

## Step 6: Copy Resume Command to Clipboard and Present

Build the exact command the user needs to type after clearing:

```
/<pipeline-command> <original requirement text>
```

For example: `/fullpipeline Build a marketplace plugin system that allows third-party developers to extend the platform`

Copy it to the clipboard. The requirement text MUST be wrapped in single quotes (not double quotes) to prevent shell expansion — single-quoted strings in POSIX shell suppress all interpretation except `'` itself. Do not change the quoting style without a security review. **POSIX-only safety:** The single-quote escaping is safe for POSIX-compliant shells (bash, zsh, sh). If the user pastes the command into a non-POSIX shell (PowerShell, fish, nushell), the quoting may not prevent expansion — the user is responsible for shell-appropriate quoting in those contexts. Escape single quotes in the requirement text by replacing `'` with `'\''`. Requirement text is expected to be printable UTF-8. Reject requirement text containing control characters (bytes 0x00–0x1F except tab 0x09, newline 0x0A, carriage return 0x0D) — these may cause clipboard corruption, shell injection, or terminal escape sequence attacks. If control characters are detected, log: `"ERROR: [clear_and_go] Requirement text contains control characters — cannot safely copy to clipboard"` and skip clipboard copy (present the command for manual copying after the user sanitizes):
```bash
# Step 1: Copy to clipboard
printf '%s' '/<pipeline-command> <escaped requirement text>' | pbcopy 2>/dev/null
CLIP_OK=$?
# Linux fallback — try xclip, then xsel (each with 2s timeout to avoid hangs on missing X11 display)
if [ $CLIP_OK -ne 0 ]; then
  printf '%s' '/<pipeline-command> <escaped requirement text>' | timeout 2 xclip -selection clipboard 2>/dev/null
  CLIP_OK=$?
fi
if [ $CLIP_OK -ne 0 ]; then
  printf '%s' '/<pipeline-command> <escaped requirement text>' | timeout 2 xsel --clipboard --input 2>/dev/null
  CLIP_OK=$?
fi
# Windows (WSL) fallback: use clip.exe if available (2s timeout to avoid hangs on broken WSL interop)
if [ $CLIP_OK -ne 0 ]; then
  printf '%s' '/<pipeline-command> <escaped requirement text>' | timeout 2 clip.exe 2>/dev/null
  CLIP_OK=$?
fi

# Step 2: Verify clipboard contents by reading back and comparing
if [ $CLIP_OK -eq 0 ]; then
  CLIP_CONTENT=""
  # macOS
  CLIP_CONTENT=$(pbpaste 2>/dev/null) || \
  # Linux — xclip then xsel
  CLIP_CONTENT=$(timeout 2 xclip -selection clipboard -o 2>/dev/null) || \
  CLIP_CONTENT=$(timeout 2 xsel --clipboard --output 2>/dev/null) || \
  # Windows (WSL)
  CLIP_CONTENT=$(timeout 2 powershell.exe -command "Get-Clipboard" 2>/dev/null | tr -d '\r') || \
  CLIP_CONTENT=""

  EXPECTED='/<pipeline-command> <escaped requirement text>'
  if [ "$CLIP_CONTENT" != "$EXPECTED" ]; then
    CLIP_OK=1
  fi
fi
```

**Important:** The clipboard copy MUST use the literal command string directly in the `printf` argument (single-quoted), NOT via a shell variable. Using a variable (`$RESUME_CMD`) can cause the pipe to `pbcopy` to fail silently when the string contains special characters. Always verify by reading back from clipboard (`pbpaste` on macOS) and comparing against the expected string.

If clipboard verification failed (content doesn't match or read-back failed), log: `"WARNING: [clear_and_go] Clipboard verification failed — user must copy the resume command manually"`.
If clipboard copy failed, log: `"WARNING: [clear_and_go] Clipboard copy failed — user must copy the resume command manually"`.


Then output — adjust the clipboard line based on `$CLIP_OK`:

**If clipboard copy succeeded ($CLIP_OK = 0):**
```
## Checkpoint Saved

State file: docs/pipeline-state/<slug>.json (committed to git)

**Resume command** (copied to clipboard):

`/<pipeline-command> <original requirement text>`

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

`/<pipeline-command> <original requirement text>`

**Steps:**
1. Clear context: press Escape, type `/clear`, press Enter
2. Copy the command above and paste it, press Enter
3. The orchestrator will detect the state file and offer to resume from Stage <N>
```
