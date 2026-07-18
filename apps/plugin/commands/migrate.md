---
description: "Convert a legacy MindBase project (wiki/-based) to the v2 layout. Usage: /mb:migrate [--project <id>] [--all] [--dry-run]"
---

Migrate a MindBase project from the legacy `wiki/` layout to the v2 layout (README + context + sources/contributors/ + etc).

**Arguments**: `$ARGUMENTS`

Parse:
- `--project <id>` — migrate a specific project.
- `--all` — migrate all projects under `~/mindbase-data/projects/`.
- `--dry-run` — report what would happen without writing.

At least one of `--project` or `--all` is required.

**Confirm intent**: tell the user this operation is one-way (data is preserved in archive, but the new layout is the new truth). Wait for confirmation unless `--dry-run`.

**Dispatch the migrator sub-agent** via the Task tool with `subagent_type: "migrator"` and a prompt naming the projectId(s) and flags.

Surface the sub-agent's report to the user.

After successful migration, recommend:
- `/mb:lint` to verify no orphans introduced.
- `/mb:build` to refresh context.md from migrated sources.
