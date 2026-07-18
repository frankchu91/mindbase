# mindbase-cli

> The canonical implementation of Andrej Karpathy's
> [LLM-Wiki pattern](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f),
> as a single npm package. Your local AI-maintained research wiki.

## What is this

Most "AI + documents" tools (NotebookLM, ChatGPT file upload, RAG libraries)
re-derive knowledge from raw chunks on every query. They never accumulate.

The LLM-Wiki pattern is different: the LLM **incrementally builds and
maintains a persistent wiki** that sits between you and your raw sources.
Cross-references are pre-baked. Contradictions are pre-flagged. The wiki
compounds.

`mindbase-cli` is the pattern as a CLI you can run on any markdown
directory. It uses the same engine as the [MindBase](https://mindbase.app)
hosted product — Karpathy-style ingest with plan/approve/execute,
`lintWiki` for health checks, INDEX.md for retrieval.

### Companion: the Claude Code plugin

For an even better experience, install the [MindBase Claude Code plugin](https://github.com/haobing0304/mindbase-plugin):

```bash
curl -fsSL https://mindbase.app/install.sh | bash
```

The plugin gives you a Claude Code skill + 4 slash commands (`/mb-ingest`, `/mb-lint`, `/mb-daily-brief`, `/mb-new-project`) + a weekly synthesizer sub-agent, all wired to use this CLI plus the [mindbase-mcp](https://www.npmjs.com/package/mindbase-mcp) for richer tool access.

## Quick start (5 minutes)

```bash
# 1. Install
npm install -g mindbase-cli

# 2. Make a research directory
mkdir my-research && cd my-research

# 3. Scaffold
mindbase init
# → Creates wiki/concepts, wiki/notes, wiki/sources, schema.md, INDEX.md

# 4. Set your API key
export ANTHROPIC_API_KEY=sk-ant-xxx

# 5. Ingest a source
mindbase ingest paper.pdf
# → AI: "Plan: 8 actions"
# → AI: "Apply all? (Y/n)"
# → Y
# → ✓ create_concept  Retrieval-Augmented Generation
# → ✓ create_concept  Hypothetical Documents
# → ✓ ...

# 6. Lint your wiki
mindbase lint
# → 3 orphans, 2 missing concepts, 0 stale pages

# 7. Find pages
mindbase query "retrieval"
# → matches in INDEX.md
```

## What gets created

```
my-research/
├── .mindbase.json
├── wiki/
│   ├── concepts/          ← LLM-owned (you read, it writes)
│   ├── notes/             ← user-owned drafts
│   ├── sources/           ← provenance stubs
│   ├── schema.md          ← user-editable conventions
│   ├── INDEX.md           ← auto-maintained catalog
│   └── log.md             ← chronological audit
└── raw/
    └── <date>/<id>.{md,meta.json,original.pdf}
```

## Configuration

Priority order:
1. `mindbase.config.ts` (cwd)
2. `.mindbase.json` (cwd)
3. Env vars: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `MINDBASE_MODEL`

`mindbase.config.ts`:
```ts
export default {
  adapter: 'anthropic',
  model: 'claude-opus-4-7',
};
```

## What this is NOT

- **Not a server / SaaS** — runs entirely on your machine.
- **Not a note-taking app** — you bring the sources, the LLM maintains the wiki.
- **Not a RAG library** — the wiki IS the retrieval surface, INDEX-first.

## What the MindBase product adds beyond this CLI

The hosted MindBase product builds on this same core engine and adds:
- Project switcher (multiple wikis side by side)
- Browser extension for one-click ingest from any page
- Sync across devices
- Premium models (GPT-5, Opus) included
- Agent scheduler (daily lint, weekly briefs)
- Lint subscription (contradiction alerts in your inbox)

See [mindbase.app](https://mindbase.app) (coming soon).

## License

MIT.
