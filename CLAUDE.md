# MindBase — North Star for Claude Code

> If you're an agent working on this codebase, read in this order:
> 1. **`docs/pivot-plan-2026-05-25.md`** — the CURRENT canonical plan. We
>    are pivoting from "AI second brain" to "AI research analyst that
>    builds a wiki." Everything before this date is legacy direction.
> 2. **`docs/llm-wiki.md`** — Karpathy's pattern, our foundational thesis.
> 3. **This file** — what's built, what's missing, hard contracts, repo
>    conventions.
>
> If a change conflicts with the pivot plan, the pivot plan wins. If a
> change preserves a feature the pivot plan kills (chat-as-home, daily
> journal, SRS UI surface, generic "PKM" framing), push back.

---

## Product thesis (one paragraph)

MindBase implements Andrej Karpathy's **LLM-Wiki pattern** (`docs/llm-wiki.md`),
turned into a product for users who can't or won't run `claude-code + obsidian + a
hand-written CLAUDE.md` themselves. The LLM **incrementally builds and maintains
a persistent wiki** from your raw sources — not RAG-retrieves at query time.
The wiki is a **compounding artifact**: cross-references are pre-baked,
contradictions pre-flagged, synthesis pre-written. The LLM owns the wiki layer;
the user owns sources, exploration, and asking the right questions.

This is NOT another Notion / Obsidian / NotebookLM. Specifically:
- **Notion** is a passive container — you organize, it stores.
- **NotebookLM** is RAG — knowledge is re-derived per query, never accumulates.
- **Obsidian** is a markdown editor — humans do all the maintenance.
- **MindBase** is the active maintainer that gardens your knowledge for you.

## The 3-layer architecture (from Karpathy)

| Layer | Owner | In MindBase |
|---|---|---|
| **Raw sources** — articles, PDFs, web clips, captures. Immutable. | User curates; LLM reads. | `~/mindbase-data/raw/<date>/<id>.{md,meta.json,original.pdf}` |
| **The wiki** — markdown concept pages, entity pages, summaries. | LLM writes & maintains. | `~/mindbase-data/wiki/{concepts,notes,sources,attachments}/` |
| **The schema** — conventions, page formats, ingest workflow. | User and LLM co-evolve. | ⚠️ **Currently hard-coded in prompts**. Should become a per-project user-editable file. |

## The 3 operations (from Karpathy)

| Operation | Karpathy's spec | MindBase status |
|---|---|---|
| **Ingest** | Drop source → LLM reads → **discusses takeaways** → writes summary → updates 10-15 wiki pages → appends to log. | ✅ `apps/server/src/routes/compile.ts` + `packages/core/src/compile/l1.ts`. **❌ No discuss-takeaways turn**. Black-box one-shot today. |
| **Query** | Search → read → synthesize → cite → **good answers get filed back as wiki pages**. | ✅ Hybrid search + chat. **❌ Answers never become wiki pages** — they vanish into chat history. |
| **Lint** | Periodic health check: contradictions / stale claims / orphan pages / missing concepts / suggested investigations. | ❌ **Not implemented**. This is a killer differentiator — Notion / Obsidian / NotebookLM cannot do this. |

## Special files (from Karpathy)

- **`index.md`** — content-oriented catalog the LLM reads first when answering. ❌ MindBase has internal `wikiIndex` (sqlite) but no markdown index file users or the LLM can browse.
- **`log.md`** — chronological append-only. ✅ `wiki/log.md` + `wiki/_changes.md`.

## Beyond Karpathy (where MindBase has an edge today)

- **Typed knowledge graph** — `contradicts` / `supersedes` / `elaborates` / `cites` edges between concepts (`packages/core/src/graph/index/wiki-index.ts`). Karpathy's raw pattern is untyped wikilinks. We can surface contradictions and supersession proactively.
- **Multi-surface capture** — `apps/browser-ext` (Chrome), `apps/test-game/apps/mobile` (mobile), `apps/mcp` (MCP server for other agents).
- **Built-in local PDF/web extraction** — pdfjs-dist, no API roundtrip. (Verified 2026-05-25.)
- **Daily Brief** auto-generation (`apps/server/src/lib/brief.ts`).
- **Spaced repetition** built into the data model (`apps/server/src/lib/srs-worker.ts`).
- **Tab-bar surface for ingested PDFs** with native viewer + extracted text toggle (`RawSourceView`).
- **AI classify-into-folder** for both notes AND raw imports (`POST /api/classify/raw/:rawId` as of 2026-05-25).

## Critical gaps vs the pattern (in priority order)

1. **No user-editable `schema.md` per project** — Karpathy says this is THE key config. Users can't tell the LLM "in this project, concept pages should have these sections" without code changes.
2. **No `lint` operation** — health check that surfaces contradictions, orphans, stale claims.
3. **No file-answer-back** — chat answers are ephemeral. Karpathy's pattern files them back as wiki pages.
4. **No conversational ingest** — current flow is one-shot. Should be: stream takeaways → ask user what to emphasize → commit.
5. **No first-class Project / scope** — everything bleeds into one global wiki. Karpathy's examples (reading a book / researching a topic / planning a trip) all imply *bounded* projects.
6. **No `index.md` markdown catalog** — only internal sqlite.
7. **Wiki is hidden behind a tab** — should be the main surface. (Notes vs Wiki confuses every new user.)

## Product positioning (work in progress, 2026-05-25)

Working hypothesis:

> **"MindBase: Karpathy's LLM-Wiki pattern, no terminal required.
> You feed the sources; the AI gardens the wiki."**

Differentiation angle vs the raw pattern (= `obsidian + claude-code + CLAUDE.md`):
1. **Accessibility** — works for users who don't write CLAUDE.md or use git.
2. **Active wiki** — daily briefs, contradiction alerts, growth dashboard, SRS. The wiki pushes back, not just stores.
3. **Visible LLM-at-work** — streaming compile UX where you watch pages get created/updated in real-time (like "Claude is editing"). The raw pattern requires you to alt-tab between IDE and Obsidian; we build it in.
4. **Team variant (future)** — Slack threads + meeting transcripts → wiki, with human-in-the-loop review.

---

## Hard contracts from `docs/llm-wiki.md` (Architecture / Operations / Indexing)

These are non-negotiable. Any change that violates them is a regression of the
pattern. When implementing a feature, the first question is "does this honor
these contracts?"

### Architecture contract — 3 physically distinct layers

1. **`raw/`** is immutable. No worker, prompt, or user-action mutates files
   here. The compile pipeline reads but never writes.
2. **`wiki/concepts/`** (TO BE BUILT) is **LLM-owned end-to-end**. Karpathy:
   *"You read it; the LLM writes it."* User edits to this dir are an
   exceptional override that must be logged. The current collapse of
   user-notes and LLM-concepts into `wiki/notes/` is a fundamental violation
   that explains why users perceive compile as "AI rewriting my note" —
   because physically that's what it looks like.
3. **`wiki/schema.md`** (TO BE BUILT) is the per-project conventions file
   the LLM reads at every operation. It is **user-editable** and
   **co-evolves**. It is NOT `packages/core/src/compile/prompts.ts` — that
   file is implementation, not configuration. Prompts must be built at
   runtime from `schema.md`, not hard-coded.

### Operations contract — all 3 are first-class product surfaces

**Ingest** must support these 8 steps in order:
  1. User drops source into raw
  2. User **explicitly tells** the LLM to process (not background worker)
  3. LLM reads
  4. LLM **discusses key takeaways with the user** (conversational turn —
     missing today; this is what makes ingest feel collaborative vs black-box)
  5. LLM writes a summary page
  6. LLM **updates `INDEX.md`**
  7. LLM updates **multiple relevant entity/concept pages** — target 5-15
     touches per substantive source (current avg: 1-4; was 18-22 on May 22
     before prompt rewrite degraded it)
  8. LLM appends to `log.md`

  Two modes, user-selectable per project via `schema.md`:
  - **interactive** (one source at a time, high supervision, step 4 mandatory)
  - **batch** (many sources, low supervision, step 4 abbreviated to one-shot summary)

**Query** must support filing answers back. A chat answer the user values
should become a wiki page with one click (or by LLM suggestion). Without
this, explorations don't compound — they vanish into chat history. Karpathy:
*"good answers can be filed back into the wiki as new pages."*

  Answer formats Karpathy explicitly lists (aspirational): markdown page,
  comparison table, slide deck (Marp), chart (matplotlib), canvas. We are
  markdown-only today.

**Lint** is a distinct operation, surfaced in the UI. Karpathy's 6 checks
plus 2 suggestions:
  - contradictions between pages
  - stale claims (superseded by newer sources)
  - orphan pages (no inbound links)
  - important concepts mentioned but lacking their own page
  - missing cross-references
  - data gaps that could be filled with web search
  - suggested new questions to investigate
  - suggested new sources to look for

  Output is structured cards in an inbox-like surface. **This is the killer
  differentiator no other PKM tool has.**

### Indexing/logging contract — `INDEX.md` and `log.md` are the spine

**`INDEX.md`** (TO BE REBUILT as a live artifact):
  - Content-oriented catalog of every wiki page
  - Each entry: link + one-line summary + optional metadata (date, source count)
  - **Organized by category** (entities / concepts / sources / ...)
  - **LLM updates it on every ingest** (and lint, and file-answer-back)
  - **Query path reads `INDEX.md` first**, then drills into candidates
  - At moderate scale (~100 sources, hundreds of pages) this **replaces**
    embedding-based RAG — it is more accurate, more debuggable, more
    explainable. Hybrid search/embeddings become a complement for the long
    tail, not the primary retrieval path.

**`log.md`** (already exists, expand coverage):
  - Append-only
  - Records **all 3 operations**: ingests, queries, lint passes (currently
    only ingests)
  - Format: `## [YYYY-MM-DD] {ingest|query|lint} | <title or topic>` —
    date-only, not ISO datetime; greppable: `grep "^## \[" log.md | tail -5`
  - Each entry includes outcomes parseably: "created 4, updated 3" so the
    log itself is queryable by the LLM in future sessions

---

## Decision rules for any new code

Before merging any change, check:

1. **Does this respect the 3-layer separation?** Are raw / wiki-LLM-owned /
   schema clearly distinguished?
2. **Does this advance one of the 3 operations**, or is it Notion-style
   chrome?
3. **Does this read or update `INDEX.md` / `log.md`** if the operation is
   user-facing? Both files are the LLM's memory across sessions — missing
   updates here means context loss.
4. **Does this give the LLM-owned wiki MORE visibility**, or hide it deeper
   under tabs?

If a change fails any of these, it is technical debt against the North Star.
Note the violation in the commit body and open a follow-up to repay it.

## Working repo conventions (learned from prior sessions)

- pnpm monorepo: `packages/core` (TS strict, vitest), `apps/server` (Express), `apps/web` (React 19 + Zustand), `apps/browser-ext`, `apps/mcp`, `apps/mobile`.
- **`apps/web` may only `import type` from `@mindbase/core`.** Value imports break Vite via node:* leaks. Mirror helpers into `apps/web/src/lib/*` (see `apps/web/src/lib/tree.ts` as the canonical pattern).
- **TS strict, no `any`, prefer named exports.**
- **Commits authored by `Haobing Chu <haobing0304@gmail.com>`. NO `Co-Authored-By: Claude` trailer.**
- `docs/superpowers/` is gitignored (specs + plans for in-flight features).
- Data root: `~/mindbase-data/` — never hardcode this path; read from `ctx.store`.
- Server dev: `pnpm -F @mindbase/server dev` (tsx watch). Port 4321 serves API + the built `apps/web` bundle.
- Web dev/build: `pnpm --filter @mindbase/web {dev,build,typecheck}`.
- After modifying `packages/core` types, `pnpm --filter @mindbase/core build` before re-typechecking dependents.
- **`apps/plugin/` is the canonical Claude Code plugin** for MindBase. It bundles `apps/mcp` (via build script) as an MCP child process, ships slash commands and sub-agents. Install via `claude --plugin-dir apps/plugin` for local dev or `/plugin install mindbase@mindbase` when published.
- `apps/skill/` was removed in 2026-06-09 — the legacy `install.sh` skill-based deploy is gone; the plugin is the only install path. Users who installed the old way must manually remove `~/.claude/skills/mindbase/`, `~/.claude/commands/mb-*.md`, and `~/.claude/agents/mindbase-synthesizer.md`.
- Plugin builds: `pnpm -F @mindbase/plugin build` (bundles `apps/mcp` into `apps/plugin/mcp-server/dist`).

## When you change product surfaces

Default reflex: **does this make the LLM-Wiki pattern more visible to the user, or does it bury it deeper under Notion-like chrome?** If the latter, push back. The recent commits (PlusMenu, delete buttons, breadcrumb title, RightRail tabs) are necessary table-stakes — but every hour spent on "match Notion" is an hour not spent on "make Karpathy's pattern legible and delightful."

The unique value lives in `compile/`, `graph/`, `classify/`, `brief/`, `synthesis/`. Most product time should go toward surfacing those.
