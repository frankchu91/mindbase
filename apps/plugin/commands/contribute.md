---
description: "Add a thought, source, or paste. Use --project/-p to target another project without switching current. Usage: /mb:contribute [-p <project-id>] <text-or-path-or-url> [--mode daily|concept|daily+concept]"
---

Contribute content to a MindBase project.

**Arguments**: `$ARGUMENTS`

Parse in order (flags may appear anywhere, but text is what remains):
- `--project <id>` or `-p <id>` — target project id. If omitted, uses `config.json` currentProjectId.
- `--mode <m>` — `daily` | `concept` | `daily+concept` | (default: auto).
- Remaining text = the body to contribute (file path, URL, raw paste, or short thought).

**Important**: `-p` / `--project` does **NOT** change the current project — it only routes THIS single contribution. Use `/mb:load <id>` to change current project persistently.

**Resolve input type** (in order):
1. File path ending in `.pdf`, `.md`, `.txt`, `.html`: use `Read` tool to load.
2. URL (`https?://...`): use `WebFetch`.
3. Raw doc id (`raw:<id>`): use `mindbase_read_wiki_page` or similar.
4. Pasted long text: ingest scale.
5. Short user thought (≤ 200 chars, time-anchored "today I…"): capture scale.
6. If empty: ask user what to add.

**Calibrate output volume**:
- Short thought → call `mindbase_contribute({ text, mode, projectId? })` ONCE. 1 action. Only include `projectId` in the call if user passed `-p`/`--project`.
- Substantive source → dispatch the `contributor` sub-agent via the Task tool. Pass **both** the source body **and** the resolved `projectId` (if any) in the sub-agent brief so it threads `projectId` through every MCP call.

**Routing prefix override** (highest priority): if text starts with `daily:` or `concept:` or `daily+concept:`, strip the prefix and pass the remaining text + mode through verbatim to `mindbase_contribute`.

**Examples**:
- `/mb:contribute "wiki v2 refactor 上线了"` → current project, mode=auto
- `/mb:contribute -p ai-agents "GPT-5 rumored 2026-Q4"` → ai-agents, current project unchanged
- `/mb:contribute --project insurance --mode concept "policy X: 覆盖 flood"` → insurance, concept mode
- `/mb:contribute /Downloads/paper.pdf` → current, auto (contributor sub-agent)
- `/mb:contribute -p ai-agents /Downloads/paper.pdf` → ai-agents, contributor sub-agent

After success, report:
```
✓ Contributed to <projectId>/sources/contributors/<you>/<today>.md
```
