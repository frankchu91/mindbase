# Changelog

## 0.1.0 (2026-07-11)

First public release. MindBase is an AI research assistant that builds and
maintains a markdown wiki from your sources — Karpathy's LLM-Wiki pattern as
a product. Ships as an MCP server (works in Claude Code, Cursor, Windsurf,
Cline, Continue.dev, and any MCP-compatible client) plus an optional web UI.

### Added

- **Multi-IDE support verified** — MCP server tested end-to-end in Claude Code
  (flagship: slash commands + sub-agents) and Cursor (natural-language tool
  calls). Same `~/mindbase-data/` disk shared across all clients.
- **`-p` / `--project` routing flag** on all slash commands (`/mb:contribute`,
  `/mb:build`, `/mb:status`, `/mb:ask`, `/mb:lint`, `/mb:daily-brief`,
  `/mb:research`, `/mb:export`) — target any project without switching the
  current one. `/mb:load` remains the single path that changes
  `currentProjectId`.
- **Self-contained plugin bundle** via `pnpm deploy` — plugin's MCP server
  ships with its own `node_modules`, boots on a clean machine with only Node 20.
- **Rewritten README** — install guides for 6 editors, feature matrix,
  troubleshooting, data-layout documentation.

### Fixed

- `mindbase_load_project` no longer silently switches the current project as a
  side-effect; persisting is opt-in (`persist: true`).
- Plugin `.mcp.json` pointed at the library entry (`index.js`) instead of the
  executable (`cli.js`) — MCP server never started in fresh installs.
- `mindbase_init_project` / `load` now persist `currentProjectId` to
  `config.json` so follow-up tool calls resolve the project automatically.
- Sub-agent tool allowlists referenced the old `mcp__mindbase__*` namespace;
  now `mcp__mb__*` (matches the plugin's server key).
- Web UI: stripped all v1 dead paths (QuickCaptureModal, DailyNoteHeader,
  TemplatesSettings, `/api/wiki/*` callers) — the first-minute 404 storm is
  gone. Net -648 lines.

## 0.1.0-beta (2026-06-09)

### Added — Plugin pivot

- **`apps/plugin/`** — new Claude Code plugin package bundling the MCP server, slash commands, sub-agents, hooks, and templates. Install via `claude --plugin-dir apps/plugin` or eventually `/plugin install mindbase@mindbase`.
- **Per-project v2 layout** (`packages/core/src/plugin-layout/`) — `README.md` + `context.md` + `index.yaml` + `sources/contributors/<user>/YYYY-MM-DD.md` + `state/` + `logs/` + `artifacts/`. Replaces legacy `wiki/notes`, `wiki/concepts`, `wiki/sources` for new projects.
- **Migration pipeline** (`packages/core/src/migrate/`) — atomic legacy → v2-layout converter with snapshot, transforms (schema→README, INDEX→context, notes→contributors, sources→research, log split), and recovery archive. Vitest covered.
- **12 new MCP tools** in `apps/mcp`:
  - `mindbase_init_project` / `mindbase_load_project` — scaffold + load
  - `mindbase_contribute` / `mindbase_validate_structure` / `mindbase_append_log` — write + check
  - `mindbase_gather_sources` / `mindbase_atomic_write_context` / `mindbase_rebuild_index` — build pipeline
  - `mindbase_status` — dashboard JSON
  - `mindbase_migrate` — legacy conversion
- **9 slash commands** (`apps/plugin/commands/`): `/mb:init`, `/mb:load`, `/mb:contribute`, `/mb:build`, `/mb:ask`, `/mb:lint`, `/mb:status`, `/mb:daily-brief`, `/mb:migrate`.
- **4 sub-agents** (`apps/plugin/agents/`): `builder`, `contributor`, `curator`, `migrator`. Tool-restricted per agent: builder/contributor/curator cannot Edit/Write/Bash; only MCP tools.
- **SessionStart hook** (`apps/plugin/hooks/session-start`) — auto-injects current project's README + context + index.yaml as `additionalContext` JSON on every Claude Code session start. Cross-platform (Claude Code / Cursor / Copilot CLI variants).
- **9 templates** (`apps/plugin/templates/`): `README.md.template`, `soul.md.template`, `context.md.template`, `empty.md.template`, plus 5 schema templates ported from `apps/skill/`.
- **`apps/server` v2-awareness helpers** (`context.ts`): `currentProjectIdFromConfig`, `projectRoot`, `detectLayoutVersion`.
- **`POST /api/compile/build`** — stub endpoint that tells the UI to invoke `/mb:build` in Claude Code (v0.1 doesn't host server-side LLM synthesis).
- **`apps/web/src/lib/wikiPaths.ts`** — TS mirror of core's `projectPaths` for the bundle.

### Changed

- `apps/mcp` search/ask tools (`search-wiki`, `ask-wiki`) now accept both v1 (`wiki/notes/`) and v2 (`projects/<id>/sources/...`) slug paths via dual-regex.
- `apps/server` compile/lint/projects routes now resolve `wiki/log.md`, `wiki/_insights.md` via the v1/v2 helper; `GET /api/projects/:id` surfaces `layoutVersion`, `lastBuild`, `contributorsCount`.

### Deferred (manual follow-up before UI works on migrated data)

- `apps/server/src/routes/wiki.ts` (1098 lines) — the `/api/wiki/*` read/write routes still serve v1 paths exclusively. After running `/mb:migrate` on a project, the UI's tree + page views will 404 against that project. Needs a targeted refactor (likely via a `WikiCategories` abstraction) to add v2 categories to the `/wiki?category=` API surface.
- `apps/web` LeftRail/TreeRoot — depends on the above. The tree's categories are fetched from `/api/wiki?category=`; without v2 server support there is no v2 data to render.
- `apps/web/src/components/{NotesView,WikiView}.tsx` — file names from the plan did not match the codebase. Actual components (`WikiHome.tsx`, etc.) were not refactored; same blockers apply.

### Removed

- `apps/skill/` — legacy skill-based install (`install.sh` + `~/.claude/skills/mindbase/` deploy) deleted. The `mindbase-synthesizer` weekly-summary sub-agent was not ported (read v1 `wiki/log.md`; the plugin's `curator` + `builder` cover the same surface area for v2). Users with the old install must manually remove `~/.claude/{skills/mindbase, commands/mb-*.md, agents/mindbase-synthesizer.md}`.

### Notes

- Pre-existing typecheck error in `apps/mcp/src/tools/get-pulse.ts(94,47)` was not touched; unrelated to the pivot.
- `apps/plugin/mcp-server/dist/` is gitignored; rebuild via `pnpm -F @mindbase/plugin build` after pulling.
