---
description: "Explicitly load a project's context into session (overrides SessionStart hook). Usage: /mb:load [project-id]"
---

Load a MindBase project's context into the current Claude session.

**Arguments**: `$ARGUMENTS`

Parse: first positional = projectId (optional).

Call `mindbase_load_project({ projectId, persist: true })`. `persist: true` is important — it writes `currentProjectId` to `config.json` so subsequent sessions and `-p`-less commands reuse this project. If projectId omitted, the tool resolves via `config.json` currentProjectId.

If no current project AND no available projects, tell the user:
> No MindBase projects found. Run `/mb:init <name>` to create one.

Otherwise the tool returns `{ projectId, projectRoot, readme, context, indexYaml }`. Output them as a structured summary, NOT verbatim — show:
- Project id + root
- First 5 lines of README (mission section)
- Number of sections in context.md
- File count from index.yaml
- Most recent contributor entry (latest YYYY-MM-DD.md in sources/contributors/)

Also write the chosen projectId into `~/mindbase-data/config.json` as `currentProjectId` so subsequent sessions reuse it.
