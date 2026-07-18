---
description: "Run health check on a project — orphans, contradictions, stale claims, gaps, suggested cross-links. Usage: /mb:lint [-p <project-id>] [project-id]"
---

Health-check a MindBase project.

**Arguments**: `$ARGUMENTS`

Parse in order:
- `--project <id>` or `-p <id>` flag → target project id.
- First positional arg (if not a flag) → target project id (fallback).
- If neither present → uses `config.json` currentProjectId.

**Dispatch the curator sub-agent** via the Task tool with `subagent_type: "curator"` and prompt:
```
Run wiki health check for project ${resolvedProjectId}.
```
The curator threads projectId through every MCP call (validate_structure, run_wiki_health, find_orphans, find_contradictions, find_gaps, suggest_links, append_log).

When the sub-agent returns, present its findings verbatim to the user (the formatting is already done).

Offer one of:
1. "Want me to file a follow-up note for any of these?" → if yes, call `/mb:contribute -p ${resolvedProjectId}` for the chosen finding (preserve the same project).
2. "Rebuild context to refresh stale data?" → if yes, dispatch builder with the same `projectId`.

**Note**: `-p` / positional does NOT change current project.

**Examples**:
- `/mb:lint` → current project
- `/mb:lint -p ai-agents` → lint ai-agents (current unchanged)
