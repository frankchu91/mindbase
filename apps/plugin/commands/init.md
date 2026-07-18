---
description: "Scaffold a new MindBase project (v2 layout). Usage: /mb:init <name> [template] [-- mission ...]"
---

Scaffold a new MindBase project.

**Arguments**: `$ARGUMENTS`

Parse:
- First positional token = project name (required).
- Optional `--template <name>` (default: `empty`). Allowed: `empty`, `investigation`, `literature-review`, `market-research`, `reading-companion`, `topic-tracker`.
- Optional `--mission "<one-liner>"`.

If `$ARGUMENTS` is empty, ask the user:
1. What's the project name?
2. (Optional) Which template? List the 6 options above.
3. (Optional) One-line mission?

Then call `mindbase_init_project({ name, template, mission })`. The tool will:
- Slugify name → projectId.
- Create `~/mindbase-data/projects/<projectId>/{README.md, context.md, index.yaml, sources/contributors/, sources/research/, sources/raw/, state/, logs/, artifacts/}`.
- Refuse if the project already exists.

After success, also write `currentProjectId` into `~/mindbase-data/config.json` using `mindbase_load_project` (or write directly if config.json doesn't exist yet) so subsequent sessions auto-load this project.

Report to user:
```
✓ Project '<projectId>' created at <projectRoot>
Files: README.md, context.md, index.yaml, logs/<today>.md
Now run /mb:contribute to add your first thought.
```
