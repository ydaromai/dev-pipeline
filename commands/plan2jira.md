# /plan2jira — Dev Plan → JIRA

You are executing the **plan2jira** pipeline stage. Create JIRA issues from an approved dev plan and update the plan with JIRA links.

**Input:** Dev plan file via `$ARGUMENTS` (e.g., `@docs/dev_plans/daily-revenue-trends.md`)
**Output:** JIRA issues created, dev plan updated with JIRA issue keys

---

## Step 1: Read inputs

1. Read the dev plan file provided via `$ARGUMENTS`
2. Read `pipeline.config.yaml` for JIRA config:
   - `pipeline.jira.project_key` — JIRA project key (e.g., MVP)
   - `pipeline.jira.host` — JIRA instance URL
   - `pipeline.jira.env_file` — path to credentials file
   - `pipeline.paths.jira_import` — path to jira-import.js script
3. Verify the JIRA env file exists (default: `.env.jira`)

If `pipeline.config.yaml` doesn't exist, ask the user for the JIRA project key and host.

## Step 2: Dry run

Run the JIRA import in dry-run mode to show what will be created:

```bash
node <jira_import_path> --file=<dev_plan_path> --dry-run --tasks-as-subtasks
```

Default path: `scripts/jira/jira-import.js`

Present the dry-run output to the user:

```
## JIRA Import Preview

The following issues will be created in project <PROJECT_KEY>:

### Epic
- <Epic title>

### Stories
- STORY 1: <title>
- STORY 2: <title>

### Tasks (as JIRA subtasks)
- TASK 1.1: <title> (under STORY 1)
- TASK 1.2: <title> (under STORY 1)
- TASK 2.1: <title> (under STORY 2)

Total: 1 Epic, N Stories, M Tasks

Proceed with creation? (approve/reject)
```

## Step 3: Human gate

Wait for user approval before creating issues. If rejected, stop and report.

## Step 4: Create JIRA issues

Run the import with creation enabled:

```bash
node <jira_import_path> --file=<dev_plan_path> --create --update-file --tasks-as-subtasks
```

The `--update-file` flag updates the dev plan markdown with JIRA issue keys inline.

## Step 5: Verify and report

After creation:
1. Check the command exit code for errors
2. If JIRA creation failed (missing credentials, network error), report the error and ask whether to continue without JIRA links
3. If successful, report created issues:

```
## JIRA Issues Created

| Type | Key | Title |
|------|-----|-------|
| Epic | MVP-100 | <title> |
| Story | MVP-101 | <title> |
| Story | MVP-102 | <title> |
| Task | MVP-103 | <title> (under MVP-101) |
| Task | MVP-104 | <title> (under MVP-101) |

Dev plan updated with JIRA links: docs/dev_plans/<slug>.md

You can now run /execute @docs/dev_plans/<slug>.md to start implementation.
```
