# mindbase-mcp

> **Turn your MindBase wiki into the long-term memory of every AI agent you use.**

A [Model Context Protocol](https://modelcontextprotocol.io) server that lets Claude Desktop, Claude Code, Cursor, Windsurf, Cline, and any other MCP-compatible client read, write, and reason about your local MindBase wiki.

Built for the engineer who wants their AI tools to *actually know what they know*.

---

## What you get

- **49 tools** — project scaffolding, contribute, build, search, read, ingest, save chat excerpts, run graph health, find orphans, suggest links, deep-research save…
- **5 resource feeds** — *recent activity*, *top hubs*, *orphans*, *insights*, plus per-page (`mindbase://wiki/<slug>`) and per-chat (`mindbase://chats/<id>`) resources
- **7 prompts** — `daily-digest`, `brainstorm`, `audit`, `connect`, `explain`, `quiz`, `write` (surface as slash commands in clients that support MCP prompts)
- **Graph-aware retrieval** — `ask_wiki` doesn't just keyword-match; it traverses your wikilink graph so the AI sees the surrounding cluster
- **Audit trail** — anything an AI writes is tagged `created_via: mcp` with the client/tool, so you always know what's human and what's machine
- **Standalone process** — runs on stdio against your wiki on disk; the MindBase web app does not need to be running
- **Multi-vault** — one config can connect Claude to a personal wiki and a work wiki simultaneously
- **Privacy-first** — everything stays local, no telemetry, no outbound calls except the LLM you've configured

---

## Install

No clone, no build — npm has everything:

```bash
npx -y mindbase-mcp --help
```

Every client config below uses the same two lines: `command: "npx"`, `args: ["-y", "mindbase-mcp"]`.

<details>
<summary>Prefer building from source?</summary>

```bash
git clone https://github.com/frankchu91/mindbase
cd mindbase
pnpm install
pnpm -F mindbase-mcp build
# binary at apps/mcp/dist/cli.js — use `node /absolute/path/to/apps/mcp/dist/cli.js`
# in place of the npx command in the configs below
```

</details>

---

## Connect your AI client

Pick your client. Each section is copy-paste.

### Claude Code (CLI)

One command:

```bash
claude mcp add mindbase --scope user npx -- -y mindbase-mcp
```

Verify:

```bash
claude mcp list
# mindbase: npx -y mindbase-mcp - ✓ Connected
```

Restart your Claude Code session. Tools appear as `mcp__mindbase__search_wiki`, `mcp__mindbase__list_recent`, etc.

> **Tip:** the full MindBase Claude Code plugin (slash commands like `/mb:contribute`, sub-agents, auto-context hook) is a superset of this MCP server. See the [main repo](https://github.com/frankchu91/mindbase#claude-code-flagship-experience).

### Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "mindbase": {
      "command": "npx",
      "args": ["-y", "mindbase-mcp"]
    }
  }
}
```

Quit Claude Desktop fully (`Cmd+Q`), reopen. The MindBase tools and prompts are now available.

### Cursor

Edit `~/.cursor/mcp.json` (global) or `<project>/.cursor/mcp.json` (project-scoped):

```json
{
  "mcpServers": {
    "mindbase": {
      "command": "npx",
      "args": ["-y", "mindbase-mcp"]
    }
  }
}
```

Restart Cursor.

### Windsurf

Settings → MCP → add server with command `npx` and args `["-y", "mindbase-mcp"]`. Or edit `~/.codeium/windsurf/mcp_config.json` directly with the same shape as Cursor.

### Cline (VS Code extension)

Cline reads `mcp_config.json` at the path it shows in its settings UI. Use the same config shape as Claude Desktop.

### MCP Inspector (testing without a real client)

```bash
npx @modelcontextprotocol/inspector npx -y mindbase-mcp
```

Opens a browser GUI where you can click any tool, fill the input form, and see real responses against your wiki. Best place to debug.

---

## First things to try

Once connected, paste these into your AI client:

- *"Run a wiki health check on my MindBase and tell me the three most important things to clean up."*
- *"What's been added to my wiki in the last 7 days? Group by topic."*
- *"Find pages related to `<your-top-hub-slug>` and summarize the cluster in five bullets."*
- *"Save this conversation as a wiki excerpt titled 'MCP testing notes'."*
- *"Quiz me on what I've added this week."*

The AI will pick the right tools (`run_wiki_health`, `list_recent`, `find_related`, `save_chat_excerpt`, the `quiz` prompt) on its own.

---

## Multi-vault

Run two servers, each pointing at a different data directory:

```json
{
  "mcpServers": {
    "mindbase-personal": {
      "command": "npx",
      "args": ["-y", "mindbase-mcp", "--data-dir", "/Users/you/mindbase-personal"]
    },
    "mindbase-work": {
      "command": "npx",
      "args": ["-y", "mindbase-mcp", "--data-dir", "/Users/you/mindbase-work"]
    }
  }
}
```

Tools from each are namespaced (e.g. `mcp__mindbase-personal__search_wiki`).

---

## CLI flags

```
mindbase-mcp [options]

  --data-dir <path>    Data directory (default: ~/mindbase-data)
  --version, -v        Print version
  --help, -h           Show help
```

Environment variables (used by the underlying LLM adapter — only when calling tools that require an LLM, e.g. `ingest_source`, `ask_wiki`, `run_wiki_health`):

- `OPENAI_API_KEY` — for OpenAI models
- `ANTHROPIC_API_KEY` — for Anthropic models
- `MINDBASE_MODEL` — overrides the model from `mindbase.config.json`

Read-only tools (`search_wiki`, `read_wiki_page`, `find_related`, `find_orphans`, `get_graph_insights`, `list_recent`, `list_chats`, `recall_chat`) require **no LLM key** — they run entirely on local indexes.

---

## Tools reference

49 tools, grouped by purpose. Highlights below — connect [MCP Inspector](#mcp-inspector-testing-without-a-real-client) for the full list with schemas.

### Project lifecycle (wiki v2)

| Tool | What it does |
|---|---|
| `mindbase_init_project` | Scaffold a new project: `README.md` + `context.md` + `index.yaml` + `sources/` + `logs/` + `artifacts/`. Sets it as current. |
| `mindbase_load_project` | Load README + context + index for a project (read-only by default; `persist: true` switches the current project). |
| `mindbase_contribute` | Append a thought / source summary to today's contributor file (append-only). Accepts `projectId` for cross-project routing. |
| `mindbase_gather_sources` | List contributor + research files modified since the last build. |
| `mindbase_atomic_write_context` | Write a new `context.md` with snapshot-first rollback safety. |
| `mindbase_rebuild_index` | Regenerate `index.yaml` from disk. |
| `mindbase_status` | Dashboard: line counts, contributors, sources, logs, artifacts. |
| `mindbase_validate_structure` | Check a project's layout matches the v2 contract. |
| `mindbase_append_log` | Append an operation record to `logs/<date>.md`. |
| `mindbase_research_save` | Save deep-research output to `sources/research/<slug>.md`. |
| `mindbase_migrate` | One-time legacy v1 → v2 layout conversion (snapshot + recovery archive). |
| `mindbase_export` | Bundle a project as markdown-bundle or zip-archive. |

### Read

| Tool | What it does |
|---|---|
| `search_wiki` | Full-text search across page titles, one-liners, and slugs. Ranked, with snippets. |
| `read_wiki_page` | Full markdown body + frontmatter + incoming/outgoing wikilinks for a slug. |
| `list_recent` | Pages added or updated within the past N days, newest first. |
| `find_related` | Pages connected via wikilinks, shared tags, or shared sources, with rationale. |
| `semantic_search` | Embedding-based search; falls back to keyword if embeddings unavailable. |
| `search_in_project` | Search restricted to pages tagged with a specific project (`project` frontmatter). |
| `ask_wiki` | Natural-language Q&A with **graph-aware retrieval**: top hits + 1-hop neighbors as context. |

### Write

| Tool | What it does |
|---|---|
| `ingest_source` | Save a new source (URL, paste, file) → run LLM compile → create/update wiki pages → cross-link. |
| `quick_capture` | Save to inbox without triggering compile. For batch-processing later. |
| `save_chat_excerpt` | Save a fragment of the current AI conversation as a new wiki page (LLM auto-titles). |
| `append_to_page` | Append content to a section of an existing page (creates section if missing). |
| `update_note_section` | Replace the content under a section heading on an existing page. |
| `tag_note` | Add or replace tags on a page. |
| `set_visibility` | Set `public` / `internal` / `pii` — controls inclusion in semantic search and Q&A. |

### Chat history

| Tool | What it does |
|---|---|
| `list_chats` | Recent saved chat sessions, newest first. |
| `recall_chat` | Search past saved chats by content. |

### Graph & maintenance

| Tool | What it does |
|---|---|
| `get_graph_insights` | Top hubs, orphans, broken links, fragmented tag clusters. |
| `find_orphans` | Pages with no incoming links. |
| `suggest_links` | Wikilinks that should be added to a specific page (review mode — does not modify). |
| `run_wiki_health` | Full pipeline: graph → insights → auto cross-link → L2 lint. Writes `_insights.md`. |
| `export_subgraph` | Export a page + its N-hop neighbors as a self-contained markdown bundle. |

### Write-tool safety

Tools that modify human-edited pages refuse by default and require `force: true`. Every AI-written page or section is tagged in frontmatter:

```yaml
created_via: mcp
mcp_client: claude-desktop
mcp_tool: save_chat_excerpt
```

So you can always tell which content came from a person vs. an AI.

---

## Resources reference

| URI | Content |
|---|---|
| `mindbase://recent` | Markdown digest of the last 7 days of wiki updates |
| `mindbase://hubs` | Most-linked-to pages |
| `mindbase://orphans` | Pages with no incoming links |
| `mindbase://insights` | Latest structural analysis report |
| `mindbase://wiki/<slug>` | A specific wiki page (one resource per page) |
| `mindbase://chats/<id>` | A specific saved chat session |

Resources are read-only and cheap — clients can subscribe to them as standing context without burning tool calls.

---

## Prompts reference

Surface as slash commands in clients that support MCP prompts (Claude Desktop, Claude Code, Cursor, etc.) — the exact prefix depends on your client and server key (e.g. `/mindbase:daily-digest`):

| Prompt | What it does |
|---|---|
| `daily-digest` | Summarize what was added today, grouped by topic |
| `brainstorm <topic>` | Brainstorm a topic, grounded in your wiki |
| `audit` | Audit wiki health and propose fixes |
| `connect` | Surface surprising cross-cluster connections |
| `explain <slug>` | Re-explain a wiki page from first principles |
| `quiz` | Quiz you on what you've recently learned |
| `write <topic>` | Write a long-form piece grounded in your wiki |

These are just composed prompts — they instruct the AI to call the right combination of tools above. You can also write your own.

---

## How it works

```
┌─────────────────────┐    stdio (JSON-RPC)    ┌──────────────────────┐
│  Claude / Cursor /  │  ◄───────────────────► │  mindbase-mcp-server │
│  Windsurf / etc.    │                        │  (this package)      │
└─────────────────────┘                        └──────────┬───────────┘
                                                          │ direct
                                                          ▼
                                        ┌────────────────────────────────┐
                                        │  ~/mindbase-data/              │
                                        │  ├─ config.json                │
                                        │  └─ projects/<id>/             │
                                        │      ├─ README.md  context.md  │
                                        │      ├─ index.yaml             │
                                        │      ├─ sources/{contributors, │
                                        │      │    research, raw}/      │
                                        │      ├─ logs/  artifacts/      │
                                        │      └─ state/                 │
                                        └────────────────────────────────┘
```

- **Transport:** stdio (the MCP standard for local servers).
- **Storage:** reads and writes the same file-based MindBase data directory the web app uses (`FileStore` from `@mindbase/core`).
- **No web server needed:** the MCP process talks to your wiki directly. You can have the MindBase web app running or not — they don't conflict (writes use atomic file locks).
- **LLM calls:** only the few tools that need them (`ingest_source`, `ask_wiki`, `run_wiki_health`) actually call your configured LLM. The rest run on local indexes.

---

## Privacy

- Everything runs locally. No telemetry. No analytics.
- The only outbound network calls are to the LLM endpoint you've configured (OpenAI, Anthropic, or your own via the LLM adapter).
- Read-only tools never call the LLM.
- Pages marked `visibility: internal` or `visibility: pii` are excluded from semantic search and `ask_wiki` by default — they're still readable by `read_wiki_page` if you ask explicitly.

---

## Troubleshooting

**"Server failed to connect" / shows red in Claude Desktop**

Run the binary by hand and watch stderr:

```bash
node /absolute/path/to/mindbase/apps/mcp/dist/cli.js
# expect: [mindbase-mcp] connected · dataDir=… · client=…
```

If that prints fine, the issue is in your client's config (wrong path, malformed JSON).

**"Cannot find module" or "ERR_MODULE_NOT_FOUND"**

The `dist/` directory is missing. Rebuild:

```bash
pnpm -F mindbase-mcp build
```

**Tools return empty results**

Check `--data-dir` points at a real MindBase data directory. The default is `~/mindbase-data`. Verify with:

```bash
ls ~/mindbase-data/projects
cat ~/mindbase-data/config.json    # should contain currentProjectId
```

**"No current project"**

Ask your AI client to *"create a new mindbase project called <name>"* (calls `mindbase_init_project`), or set one manually:

```bash
echo '{"currentProjectId": "my-project"}' > ~/mindbase-data/config.json
```

**Need to confirm the protocol works**

Use Inspector for a visual UI:

```bash
npx @modelcontextprotocol/inspector npx -y mindbase-mcp
```

---

## Development

```bash
# from monorepo root
pnpm -F mindbase-mcp dev        # tsx watch on src/cli.ts
pnpm -F mindbase-mcp build      # tsup bundle to dist/
pnpm -F mindbase-mcp typecheck  # tsc --noEmit
pnpm -F mindbase-mcp test       # vitest
```

Source layout:

```
src/
├── cli.ts              # bin entry — flag parsing, then start server
├── index.ts            # createServer() — wires SDK + tools + resources + prompts
├── context.ts          # FileStore + adapter + config loading
├── lib/
│   ├── error.ts        # consistent MCP error envelope
│   ├── safe-write.ts   # human-edit guard + audit-trail tagging
│   └── markdown-bundle.ts
├── tools/              # one file per tool (49 tools)
├── resources/index.ts  # resource handlers for the 6 schemes
└── prompts/            # one file per prompt (7 files)
```

`tsup` bundles `@mindbase/core` inline, so the published package has no workspace dependencies at runtime.

---

## License

MIT
