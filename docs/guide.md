# MindBase Guide — daily workflows, projects, troubleshooting

> Install and quickstart live in the [README](../README.md). This guide
> covers what you'll do every day once you're set up.

## First project (2 minutes)

Once your editor has the MCP server connected, create your first project.

### Claude Code

```
/mb:init my-research --mission "Study transformer attention mechanisms"
```

Claude will scaffold `~/mindbase-data/projects/my-research/` with `README.md`, `context.md`, `index.yaml`, and empty `sources/`, `logs/`, `artifacts/` directories, and set it as your current project.

### Cursor / Windsurf / Cline / Continue

Type in chat:

```
Create a new mindbase project called my-research about transformer 
attention mechanisms.
```

The LLM will call `mindbase_init_project({ name: "my-research", mission: "..." })` and confirm.

### Verify

```
/mb:status              # in Claude Code
```

Or ask any other IDE:

```
what's the status of my mindbase?
```

You should see:

```
MindBase — Project: my-research
Location: ~/mindbase-data/projects/my-research

README     28 lines
context.md 8 lines  (last built: never)
index.yaml 5 lines

Contributors: 0 users, 0 entries
Sources:      0 research, 0 raw
Logs:         1 day
Artifacts:    0 outputs
```

You're ready.

---

## Core workflows

The four things you'll do every day.

### 1. Contribute a thought

Add a short observation, a decision, or a hot take. Goes straight into today's contributor file, no ceremony.

**Claude Code:**
```
/mb:contribute "Attention is basically a soft dictionary lookup — each query 
retrieves a weighted average of values based on similarity to keys."
```

**Any other IDE:**
```
Add to my mindbase: Attention is basically a soft dictionary lookup — each 
query retrieves a weighted average of values based on similarity to keys.
```

**Result:** appends to `~/mindbase-data/projects/my-research/sources/contributors/<you>/2026-07-11.md` and logs the operation.

### 2. Ingest a substantive source (paper, article, PDF)

For a real source, MindBase walks through Karpathy's 8-step ingest.

**Claude Code (flagship — with sub-agent):**
```
/mb:contribute /Downloads/attention-is-all-you-need.pdf
```

The `contributor` sub-agent will:
1. Read the PDF fully
2. Come back to you with 3 key takeaways
3. Propose which wiki pages to create/update
4. Wait for your approval
5. Execute — creating `sources/research/attention-mechanism.md`, updating `context.md`, appending log
6. Confirm: `✓ Created 4, updated 3, logged.`

**Any other IDE (lite mode — no sub-agent):**
```
Read this paper [/Downloads/paper.pdf] and ingest it into my mindbase. 
Walk me through the 3 key takeaways before committing anything.
```

You get most of the value but the sub-agent's structured approval flow is a Claude Code exclusive. The LLM in Cursor/Windsurf/Cline will typically call `mindbase_contribute` directly — you can steer the ritual manually via your prompt.

### 3. Ask your wiki

Query with cited answers.

**Claude Code:**
```
/mb:ask "how did I resolve the attention scaling factor question?"
```

**Any other IDE:**
```
Search my mindbase — how did I resolve the attention scaling factor question?
```

The LLM calls `mindbase_ask_wiki` (graph-aware retrieval: top hits + wikilink neighbors) then synthesizes a cited answer:

```
You resolved this on 2026-06-15 [context.md:42-51]. The 1/√d_k scaling 
prevents dot products from growing too large in high dimensions, which 
would push softmax into low-gradient regions [attention-mechanism.md:23-28].

Sources:
- [[context.md]]
- [[attention-mechanism.md]]
- [[sources/research/scaled-attention.md]]
```

### 4. Build (regenerate context.md)

After a few contributions, regenerate the curated `context.md` so it reflects your current thinking.

**Claude Code (flagship — with sub-agent):**
```
/mb:build
```

The `builder` sub-agent:
1. Validates project structure
2. Gathers all unbuilt sources since last build
3. Synthesizes them into a fresh `context.md`
4. Writes atomically (snapshots the old one first so you can rollback)
5. Rebuilds the index

**Any other IDE:**
```
Rebuild my mindbase context.md — synthesize all unbuilt sources.
```

The LLM will orchestrate the equivalent MCP tool calls. Slightly less structured than the sub-agent flow but functionally equivalent.

### 5. Health check (lint)

Ask MindBase to audit itself.

**Claude Code:**
```
/mb:lint
```

**Any other IDE:**
```
Run a health check on my mindbase — find contradictions, orphans, gaps.
```

Output looks like:

```
Found:
- 1 contradiction: attention-mechanism.md:15 says "scaling by √d" but 
  context.md:32 says "scaling by 1/√d". Same claim, different notation.
- 2 orphan pages: [[legacy-transformer-note]] and [[old-benchmark]] 
  have no inbound wikilinks.
- 1 gap: "positional encoding" is mentioned 4 times across the wiki 
  but has no dedicated page.
- 3 suggested cross-links: [[scaled-attention]] ↔ [[transformer-architecture]] 
  (co-mentioned in 3 sources).

Want to file follow-up notes for any of these?
```

---

## Working with multiple projects

You can have as many projects as you want (`ai-research`, `insurance`, `dissertation`). One is the "current" project — everything defaults to it. To switch, or to route a single operation to a specific project without switching, use flags.

### Switch current project

**Claude Code:**
```
/mb:load ai-research
```

**Any other IDE:**
```
Switch my mindbase to the ai-research project.
```

Writes `{"currentProjectId": "ai-research"}` to `~/mindbase-data/config.json`. Persists across sessions.

### One-off routing (`-p` flag) — Claude Code

Every command that takes a project supports `-p <project-id>` (or `--project <project-id>`):

```bash
/mb:contribute -p ai-agents "GPT-5 rumored 2026-Q4"
/mb:build -p insurance
/mb:ask -p ai-agents "my stance on agent marketplaces"
/mb:lint -p dissertation
/mb:daily-brief -p ai-agents --date 2026-07-05
```

The `-p` flag **does not change your current project**. It only routes this one operation.

### One-off routing — other IDEs

Just mention the project in natural language:

```
Add "GPT-5 rumored 2026-Q4" to my mindbase's ai-agents project.
```

The LLM passes `projectId: "ai-agents"` to the MCP tool call. Current project unchanged.


## Troubleshooting

### "MCP server not connected"

Cause: malformed config JSON, or the server binary can't start.

Fix:
1. Run it manually: `npx -y mindbase-mcp < /dev/null` — should print `[mindbase-mcp] connected · dataDir=…` on stderr and exit 0.
2. If that works, the issue is in your editor's config (typo, wrong file, trailing comma).
3. Claude Code plugin users: verify the bundle exists — `ls /path/to/mindbase/apps/plugin/mcp-server/dist/cli.js` — and rebuild with `pnpm --filter @mindbase/plugin build` if missing.
4. Restart your editor after fixing config.

### "No current project"

Cause: You haven't run `/mb:init` yet, or `config.json` is missing `currentProjectId`.

Fix:
```
/mb:init my-first-project
```

Or manually: `echo '{"currentProjectId": "my-project"}' > ~/mindbase-data/config.json`

### "V1_LAYOUT_UNSUPPORTED"

Cause: you have a legacy v1 project directory (from before the 2026-06 refactor).

Fix (Claude Code only):
```
/mb:migrate --project <legacy-project-name>
```

Or delete it and start fresh: `rm -rf ~/mindbase-data/projects/<legacy-project-name>` then `/mb:init`.

### Tools don't show in autocomplete

Cause: MCP handshake didn't complete.

Fix: Restart your editor. Check that no other MCP server is failing (a crash in one can block others in some clients).

### The LLM in Cursor/Windsurf ignores my "add to mindbase" request

Cause: the LLM didn't recognize the intent as a tool call opportunity.

Fix: Add the `.cursorrules` block from the [Cursor](#cursor) section. Being explicit ("call mindbase_contribute with text=...") works too.

### "/api/counts 404" in Web UI

Cause: a pre-existing server-side route gap. Non-blocking — some tab count badges show 0 until fixed.

Fix: known issue, coming in the next patch release. Track it on the [issues page](https://github.com/frankchu91/mindbase-llm-wiki/issues).

### More issues

Open a GitHub issue: [github.com/frankchu91/mindbase-llm-wiki/issues](https://github.com/frankchu91/mindbase-llm-wiki/issues)

