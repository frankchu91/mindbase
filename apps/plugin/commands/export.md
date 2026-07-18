---
description: "Export a project to a portable bundle. Usage: /mb:export [-p <project-id>] [target]"
---

Export a MindBase project.

**Arguments**: `$ARGUMENTS`

Parse:
- `--project <id>` or `-p <id>` flag → target project id. If omitted, uses `config.json` currentProjectId.
- First non-flag positional = target format (`markdown-bundle` default, or `zip-archive`).

Call `mindbase_export({ projectId, target })`. Report the output path.

**Note**: `-p` does NOT change current project — export operates on the specified project only.

Useful for:
- Sharing a project snapshot with a collaborator
- Importing into a different MindBase install
- Archiving completed projects

**Examples**:
- `/mb:export` → current project, markdown-bundle
- `/mb:export zip-archive` → current, zip
- `/mb:export -p ai-agents` → ai-agents, markdown-bundle
- `/mb:export -p ai-agents zip-archive` → ai-agents, zip
