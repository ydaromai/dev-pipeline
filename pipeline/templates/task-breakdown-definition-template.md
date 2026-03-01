# Task Breakdown Definition

**Purpose:** This file defines the structure and conventions for writing task breakdowns. Use it when creating new stories and tasks in a breakdown under `docs/dev_plans/`.

---

## Document hierarchy

```
EPIC (one per document or initiative)
+-- STORY 1, STORY 2, ... (deliverable units)
    +-- TASK 1.1, TASK 1.2, ... (implementable units)
        +-- SUBTASK 1.1.1, 1.1.2, ... (granular agent-sized units)
```

- **Epic:** High-level initiative with business value.
- **Story:** User-facing deliverable; has acceptance criteria and test plan.
- **Task:** Concrete work item; has implementation steps, acceptance criteria, and required tests.
- **Subtask:** A single, granular unit of work that an agent can complete in one go (20 min - 2 hours).

---

## Epic section (required once per document)

| Field | Required | Description |
|-------|----------|-------------|
| **Epic Summary** | Yes | 1-3 sentences: what we build and why. |
| **Business Value** | Yes | Bullet list of outcomes or success metrics. |
| **Timeline** | Yes | e.g. "14 weeks", "2 sprints". |

---

## Story section (required per story)

| Field | Required | Description |
|-------|----------|-------------|
| **PRD** | Yes | Which PRD user stories this maps to |
| **Priority** | Yes | P0/P1/P2 |
| **Acceptance Criteria** | Yes | Numbered list with checkmarks |
| **Test Plan** | Yes | Unit / Integration / E2E expectations |
| **Definition of Done** | Yes | Merge, tests, docs checks |

---

## Task section (required per task)

| Field | Required | Description |
|-------|----------|-------------|
| **Complexity** | Yes | Simple / Medium / Complex |
| **Depends On** | If any | Other tasks that must complete first |
| **Parallel Group** | Yes | Which tasks can run in parallel |
| **Files to Create/Modify** | Yes | Explicit list of files |
| **Implementation Steps** | Yes | Numbered list of concrete steps |
| **Acceptance Criteria** | Yes | Numbered list with checkmarks |
| **Required Tests** | Yes | UT, IT, UI, E2E as applicable |

---

## Conventions

### Naming
- **Stories:** Verb or outcome (e.g. "Design System Foundation")
- **Tasks:** Action-oriented (e.g. "Update CSS Theme Tokens")

### Numbering
- Stories: `STORY 1`, `STORY 2`, ...
- Tasks: `TASK 1.1`, `TASK 1.2`, ... (story.task)
- Subtasks: `SUBTASK 1.1.1`, `SUBTASK 1.1.2`, ... (story.task.subtask)

### Acceptance criteria
- Use checkmarks for each item
- Be specific: file paths, class names, values
- One criterion per line; keep testable

### Dependency Annotations
- `Depends On: TASK X.Y` — cannot start until X.Y is DONE
- `Parallel Group: A` — all Group A tasks can run simultaneously
