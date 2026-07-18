---
description: "Query the MindBase wiki — cited answer using hybrid search + graph expansion. Usage: /mb:ask [-p <project-id>] <question> [--all-projects]"
---

Query the user's MindBase wiki.

**Arguments**: `$ARGUMENTS`

Parse:
- `--project <id>` or `-p <id>` flag → target project id (mutually exclusive with `--all-projects`).
- `--all-projects` flag → search across all projects, not just current.
- Remaining text = the question.

If both `--project` and `--all-projects` provided, tell the user to pick one. If question empty, ask "What do you want to know about your wiki?"

**Procedure**:
1. Call `mindbase_search_wiki({ query, projectId?, limit: 8 })` for fast keyword candidates.
2. Call `mindbase_ask_wiki({ query, projectId? })` for graph-aware retrieval (top hits + 1-hop wikilink neighbors).
3. Read the top 3-5 hits via `mindbase_read_wiki_page({ slug })`.
4. Synthesize a cited answer. Inline citations as `[<slug>:<line-range>]`. List sources at the end with full paths.
5. If `--all-projects`, use `mindbase_search_all_projects` instead of the per-project tools in steps 1-2.

`projectId` in the MCP calls: pass user's `-p` value; if `-p` absent AND `--all-projects` absent, MCP tools default to `config.json` currentProjectId. `-p` does NOT change current project.

**After answering, ASK** the user: "Save this answer as a wiki page?" If yes, call `mindbase_save_chat_excerpt` or `mindbase_contribute` (mode=concept, pass same `projectId`) to file it back. This is the Karpathy "good answers compound" loop.

**Do not invent facts.** If the wiki doesn't contain the answer, say so explicitly — never silently fall back to general knowledge.

**Examples**:
- `/mb:ask "how did I resolve auth ambiguity"` → current project
- `/mb:ask -p ai-agents "what's my stance on agent marketplaces"` → ai-agents
- `/mb:ask --all-projects "RAG vs fine-tuning"` → all projects
