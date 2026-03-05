#!/bin/bash
# Pipeline Pre-Compact Hook
# Detects active pipeline state and creates a resume rule for post-compact context.
#
# When context compacts during a pipeline run, this hook:
# 1. Scans docs/pipeline-state/ for active state files
# 2. Creates .claude/rules/pipeline-resume.md with resume instructions
# 3. After compact, Claude loads the rule and resumes the pipeline
#
# The orchestrator deletes the rule file after resuming.

INPUT=$(cat)
CWD=$(echo "$INPUT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('cwd',''))" 2>/dev/null)

# Fallback to pwd if cwd not in input
if [ -z "$CWD" ]; then
    CWD=$(pwd)
fi

STATE_DIR="$CWD/docs/pipeline-state"
RULE_DIR="$CWD/.claude/rules"
RULE_FILE="$RULE_DIR/pipeline-resume.md"

# Exit early if no pipeline state directory
if [ ! -d "$STATE_DIR" ]; then
    exit 0
fi

# Find active pipeline state files and generate resume rule
python3 << 'PYEOF'
import json, glob, os, sys

state_dir = os.environ.get("STATE_DIR", "")
rule_dir = os.environ.get("RULE_DIR", "")
rule_file = os.environ.get("RULE_FILE", "")

if not state_dir or not os.path.isdir(state_dir):
    sys.exit(0)

active = []
for f in sorted(glob.glob(os.path.join(state_dir, "*.json"))):
    try:
        with open(f) as fh:
            data = json.load(fh)
        if data.get("pipeline_status") == "active":
            req = data.get("requirement", "")
            active.append({
                "file": os.path.basename(f),
                "slug": data.get("slug", "unknown"),
                "pipeline": data.get("pipeline", "unknown"),
                "current_stage": data.get("current_stage", 0),
                "stage_name": data.get("stage_name", "unknown"),
                "requirement": (req[:100] + "...") if len(req) > 100 else req,
            })
    except Exception:
        continue

if not active:
    # No active pipelines — remove stale rule file if it exists
    if os.path.exists(rule_file):
        os.remove(rule_file)
    sys.exit(0)

# Create rules directory
os.makedirs(rule_dir, exist_ok=True)

# Generate resume rule
lines = [
    "# Pipeline Resume Required",
    "",
    "Context was compacted while a pipeline was active. **Resume immediately.**",
    "",
]

for p in active:
    lines.extend([
        f"- **Pipeline:** `/{p['pipeline']}`",
        f"- **Slug:** `{p['slug']}`",
        f"- **Stage:** {p['current_stage']} — {p['stage_name']}",
        f"- **State File:** `docs/pipeline-state/{p['slug']}.json`",
        f"- **Requirement:** {p['requirement']}",
        "",
    ])

lines.extend([
    "## Action",
    "",
    "1. Read the state file(s) listed above to restore full pipeline context",
    "2. Continue the pipeline from the current stage — do not start over",
    "3. After resuming, delete this file: `.claude/rules/pipeline-resume.md`",
])

with open(rule_file, "w") as fh:
    fh.write("\n".join(lines) + "\n")

PYEOF
