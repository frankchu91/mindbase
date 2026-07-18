---
description: "Generate today's brief from sources/contributors/. Usage: /mb:daily-brief [-p <project-id>] [project-id] [--date YYYY-MM-DD]"
---

Generate the daily brief for a project.

**Arguments**: `$ARGUMENTS`

Parse:
- `--project <id>` or `-p <id>` flag → target project id.
- First positional arg (if not a flag) → target project id (fallback).
- If neither present → uses `config.json` currentProjectId.
- `--date <iso>` (default: today).

Call `mindbase_generate_daily_brief({ projectId, date })`. The tool reads all `sources/contributors/<user>/<date>.md` files for the chosen date and synthesizes a brief.

Write the brief to `artifacts/briefs/<date>.md` and return its path. Append a log entry (the MCP tool already does this).

Then present the brief inline to the user.

**Note**: `-p` / positional does NOT change current project — brief targets the specified project only.

**Examples**:
- `/mb:daily-brief` → current, today
- `/mb:daily-brief -p ai-agents` → ai-agents, today
- `/mb:daily-brief -p ai-agents --date 2026-07-05` → ai-agents, specific date
- `/mb:daily-brief ai-agents --date 2026-07-05` → same (positional fallback)
