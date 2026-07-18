---
description: "Dashboard for a project — line counts, last build, contributors, file totals. Usage: /mb:status [-p <project-id>] [project-id]"
---

Print a status dashboard for a MindBase project.

**Arguments**: `$ARGUMENTS`

Parse in order:
- `--project <id>` or `-p <id>` flag → target project id.
- First positional arg (if not a flag) → target project id (fallback).
- If neither present → uses `config.json` currentProjectId.

Call `mindbase_status({ projectId })`. Format the response as a compact text dashboard:

```
MindBase — Project: <id>
Location: <root>

README     <lines> lines
context.md <lines> lines (last built: <date>)
index.yaml <lines> lines

Contributors: <users> users, <entries> total entries
Sources:      <research> research, <raw> raw files
Logs:         <count> days
Artifacts:    <count> outputs
```

Then offer: "Run /mb:lint?" or "Run /mb:build?" based on what's stale.

**Note**: `-p` and positional are read-only — they do NOT change current project. Use `/mb:load <id>` to switch.

**Examples**:
- `/mb:status` → current project
- `/mb:status -p ai-agents` → ai-agents (current unchanged)
- `/mb:status ai-agents` → same (positional fallback)
