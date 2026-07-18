---
description: "Rebuild context.md for a project from sources/. Usage: /mb:build [-p <project-id>] [project-id]"
---

Rebuild the curated context.md for a MindBase project.

**Arguments**: `$ARGUMENTS`

Parse in order:
- `--project <id>` or `-p <id>` flag → target project id.
- First positional arg (if not a flag) → target project id (fallback).
- If neither present → uses `config.json` currentProjectId.

**Important**: `-p` / positional projectId does NOT change the current project — only routes this build. Use `/mb:load <id>` to change current project persistently.

**Dispatch the builder sub-agent** via the Task tool with `subagent_type: "builder"` and prompt:
```
Rebuild context.md for project ${resolvedProjectId}.
```
The builder threads projectId through every MCP call (validate_structure, gather_sources, atomic_write_context, rebuild_index, append_log). It reads project files via read-only mindbase_load_project (no side-effect on currentProjectId).

When the sub-agent returns its one-line summary, report:
```
✓ Build complete: <sub-agent summary>
Snapshot: state/builder/snapshots/<timestamp>.md (rollback available)
```

If the sub-agent reports an error (e.g., invalid project structure), surface the error verbatim and suggest `/mb:validate` (not yet built) or `/mb:migrate`.

**Examples**:
- `/mb:build` → current project
- `/mb:build -p ai-agents` → build ai-agents, current unchanged
- `/mb:build ai-agents` → same (positional fallback)
