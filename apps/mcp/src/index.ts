// apps/mcp/src/index.ts
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadContext } from './context.js';
import { registerTools } from './tools/index.js';
import { registerResources } from './resources/index.js';
import { registerPrompts } from './prompts/index.js';

export interface RunOptions {
  dataDir?: string;
}

const SERVER_INSTRUCTIONS = `You have access to the user's MindBase — their personal knowledge base of curated notes, research, and saved AI conversations. They have invested real time building it. Treat it as their long-term memory and as the authoritative source for their own opinions, prior research, and accumulated knowledge.

WHEN TO PROACTIVELY READ FROM MINDBASE
Always reach for MindBase first (don't rely solely on training data) when the user:
- Asks about their own views, decisions, or past reasoning ("what did I think about X", "what's my take on", "remind me why I chose")
- Asks about something they've likely researched: products, people, companies, technical concepts they've mentioned before
- Says "what have I been working on", "what's new", "summarize my week"
- Asks you to write or analyze something where their personal perspective, prior notes, or domain expertise should ground the output
- References "my notes", "my wiki", "my research", "I read about", "I saved"

Default playbook for these:
1. \`search_wiki\` — fast keyword search; use first when you have specific terms
2. \`ask_wiki\` — use for complex questions; it does graph-aware retrieval (top hits + 1-hop wikilink neighbors), so it surfaces related context the user might not have named explicitly
3. \`read_wiki_page\` — once you have a slug, pull the full page (body + wikilinks + frontmatter)
4. \`find_related\` — to expand from a known page into its cluster
5. \`list_recent\` — for "what's new" / "this week" questions

WHEN TO SKIP MINDBASE
Don't burn tool calls when the user clearly wants generic help: writing standalone code, math, debugging an error message, explaining a public concept they haven't researched. Use judgment — if MindBase plausibly has relevant signal, check; otherwise just answer.

WHEN TO PROACTIVELY WRITE TO MINDBASE
After producing substantial research, analysis, or synthesis in a conversation, offer to save it via \`save_chat_excerpt\`. Especially when:
- You and the user just worked through a non-trivial topic together
- The user shared a useful insight worth keeping
- The conversation produced a list, comparison, or framework worth referencing later

Don't auto-save without offering. Phrase it as a question: "Want me to save this to your MindBase?"

Smaller writes:
- \`quick_capture\` — for "save this for later" without LLM compile
- \`append_to_page\` / \`update_note_section\` — to extend existing pages (refuses to clobber human-edited content unless force=true)
- \`tag_note\` / \`set_visibility\` — for metadata edits

SAFETY RULES
- Pages with \`visibility: internal\` or \`pii\` are excluded from semantic search and ask_wiki by default — only access them if the user explicitly asks for that page by slug
- Every write is auto-tagged with \`created_via: mcp\` plus the client and tool name. Don't try to suppress this — the audit trail is a feature
- If a write tool returns a "human-edited page" error, surface it to the user; ask before passing force=true

GRAPH MAINTENANCE
When the user asks for an audit, cleanup, or "what should I improve":
- \`run_wiki_health\` — runs the full pipeline (graph build + insights + auto cross-link + L2 lint)
- \`find_orphans\`, \`suggest_links\`, \`get_graph_insights\` — for narrower checks

Treat MindBase as a living thing the user cares about. Be useful but precise; this is their second brain, not a scratchpad.`;


export async function runServer(opts: RunOptions = {}): Promise<void> {
  const ctx = await loadContext({ dataDir: opts.dataDir });

  const server = new Server(
    { name: 'mindbase-mcp', version: '0.1.2' },
    {
      capabilities: {
        tools: {},
        resources: {},
        prompts: {},
      },
      instructions: SERVER_INSTRUCTIONS,
    },
  );

  registerTools(server, ctx);
  registerResources(server, ctx);
  registerPrompts(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Server runs until parent process closes stdin
  process.stderr.write(`[mindbase-mcp] connected · dataDir=${ctx.dataDir} · client=${ctx.mcpClient}\n`);
}
