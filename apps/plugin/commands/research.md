---
description: "Deep research on a topic — web + existing wiki + synthesis → sources/research/. Usage: /mb:research [-p <project-id>] <topic>"
---

Deep research a topic for a MindBase project.

**Arguments**: `$ARGUMENTS`

Parse:
- `--project <id>` or `-p <id>` flag → target project id. If omitted, uses `config.json` currentProjectId.
- Remaining text = the topic. If empty, ask the user.

**Dispatch the researcher sub-agent** via the Task tool with `subagent_type: "researcher"` and prompt:
```
Research topic: ${topic}.
projectId: ${resolvedProjectId}
```
The researcher threads projectId through every MCP call (search_wiki, ask_wiki, research_save, append_log, validate_structure) and saves the output to `${resolvedProjectId}/sources/research/`.

When the sub-agent returns, present its summary verbatim. Then offer:
- "Run /mb:build -p ${resolvedProjectId} to fold these findings into context.md?"
- "Save a follow-up question as a contributor note?" → use `/mb:contribute -p ${resolvedProjectId} ...`

**Note**: `-p` does NOT change current project — research is saved to the specified project only.

**Examples**:
- `/mb:research "AI agent marketplace"` → current project
- `/mb:research -p ai-agents "transformer attention mechanisms"` → ai-agents
- `/mb:research --project insurance "flood risk models 2026"` → insurance
