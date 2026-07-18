# MindBase Pivot Plan v1
**Date:** 2026-05-25  
**Status:** Founder review — needs sign-off before any code changes  
**Supersedes:** `product-strategy-2026-05-25.md` + `addendum.md` (kept for context)

---

## TL;DR — The new MindBase in one sentence

> **MindBase is an AI research analyst that builds and maintains a personal
> wiki of everything you read. You curate the sources and review the work.
> The agent does the reading, structuring, cross-referencing, and bookkeeping.**

Three substantive changes from today:

1. **Product position**: not a PKM tool, not a note-taking app, not a "second
   brain." A **research agent** for knowledge workers doing sustained
   inquiry. Wedge: PhDs, analysts, founders learning a space, journalists,
   solo consultants, lawyers, doctors building case knowledge.

2. **Architecture**: not "LLM calls inside a UI." A **persistent agent**
   that plans, executes multi-step tasks with tools, maintains memory
   across sessions, runs autonomously between user sessions, and surfaces
   work for approval. Built on Karpathy's LLM-Wiki pattern as canonical
   implementation.

3. **UX**: not chat-as-home. **Project-dashboard-as-home** with visible
   agent activity, approval inbox, and the wiki as the central artifact.
   The user's job is curation + approval + inquiry. The agent's job is
   everything else.

**Timeline**: 16 weeks to public launch. Sprint mode, single founder, bootstrapped.

**Target by week 16**: 100 active users, 10 paying at $20/mo. By month 12:
1-2k paying users, $25-40k MRR. By month 24: profitable indie at $80-150k
MRR or optional seed for team SKU.

---

## Part 1 — Why the pivot, in 5 bullets

1. **The Karpathy LLM-Wiki gist went viral 7 weeks ago** (16M views, 5k
   stars). The pattern is hot RIGHT NOW. Multiple implementations shipping
   (lucasastorian/llmwiki, Pratiyush/llm-wiki, ΩmegaWiki). Startups citing
   it (Dume.ai, remio 3.0). **Window: 3-6 months to be the canonical
   implementation**, not 12-18.

2. **Horizontal AI PKM has produced zero winners in 5 years**. mem.ai
   ($29M, no traction), Roam (declining), Notion AI (bolted-on, complained
   about). Every horizontal play has died. We can't beat Notion at
   horizontal. We *can* beat them at a wedge they don't care about.

3. **Granola + Cursor prove the AI-native + sharp-wedge formula**. Granola:
   $0 → $1.5B in 36 months on meeting notes. Cursor: $0 → $50B / $2B ARR
   in 18 months on coding. Both replaced a workflow incumbent with an
   AI-native experience. **The research wedge has no Granola yet**.

4. **The current MindBase architecture mismatches the thesis**. Wiki and
   notes are physically the same directory. Compile produces 1 page per
   source (was 18-22 in May, degraded to 1-4 by 5/25). No conversational
   ingest. No lint. INDEX.md is dead. The product feels like "AI is
   rewriting my note" because that's literally what it does today.

5. **An agent product, not an LLM-call product, is the only way to
   actually feel like a research analyst**. mem.ai's failure mode was
   trying to be a chat-with-AI-on-notes. Granola's success mode was
   becoming an autonomous note-taker. The agent isn't a feature — it IS
   the product.

---

## Part 2 — What the product actually is

### The mental model the user has

> *"I hired a brilliant research analyst. I tell them what I'm researching,
> hand them papers and links, and they build me a personal Wikipedia. They
> work overnight. They tell me when they find contradictions. They ask
> before doing anything risky. They cite everything. I can read the wiki
> directly, or ask them questions in plain English."*

### The 3 modes the agent runs in

| Mode | Trigger | Example |
|---|---|---|
| **Reactive** | User drops a source | "I added a paper. Read it and integrate it. Tell me what you found." |
| **Autonomous** | Schedule or detected signal | Nightly lint → "I found 2 contradictions, 4 orphan concepts, suggested 3 sources to look up." Weekly brief → "Here's what your wiki learned this week." |
| **On-demand** | User asks | "What do I currently believe about RAG? Make me a comparison table of the methods I've read." |

### What the user does (their job)

- **Curates sources** — the only thing that requires human taste at the
  intake layer. Agent doesn't know what's worth reading; user does.
- **Approves agent proposals** — risky actions (creating 5 pages, merging
  concepts, deleting) require user sign-off.
- **Asks questions** — directs the agent's analysis attention.
- **Reads the wiki** — consumption is the payoff.

### What the user explicitly does NOT do

- Write wiki pages
- Maintain cross-references
- Find contradictions
- Categorize / classify / file
- Decide what's "current thesis"
- Periodically clean up orphans / stale claims

This is the user's value proposition: **the maintenance burden goes to zero**.

### The 5 things the agent produces

Per project, continuously:

1. **The wiki** itself — `wiki/concepts/*.md` (LLM-owned, structured, cited)
2. **The INDEX** — `wiki/INDEX.md` (categorized catalog, primary retrieval surface)
3. **The log** — `wiki/log.md` (chronological audit of every agent action)
4. **The schema** — `wiki/schema.md` (co-evolved conventions, this project's rules)
5. **The "current thesis"** page — `wiki/_thesis.md` (top-level synthesis,
   auto-updated as new evidence arrives)

These 5 artifacts are the deliverable. The product wraps them in a UI.

---

## Part 3 — Architecture: agent-first, not LLM-call

### Stack at a glance

```
┌────────────────────────────────────────────────────────────┐
│ apps/web — Agent Surface (NEW UX)                          │
│ • Project dashboard (replaces chat-home)                   │
│ • Approval inbox (agent proposals)                         │
│ • Activity feed (agent audit)                              │
│ • Wiki browser (the artifact)                              │
│ • Conversation with agent (focused, not generic chat)      │
└────────────────────────┬───────────────────────────────────┘
                         │ HTTP + SSE
┌────────────────────────▼───────────────────────────────────┐
│ apps/server                                                │
│                                                            │
│ ┌────────────────────────────────────────────────────┐     │
│ │ Agent Runtime (NEW ~600 lines, plain TS)           │     │
│ │ • Plan generator (LLM call: goal → plan)           │     │
│ │ • Execute loop (call tool → observe → reflect)     │     │
│ │ • State persistence (per project, resumable)       │     │
│ │ • Approval gate (risky ops pause for user)         │     │
│ │ • Streaming output to UI                           │     │
│ └────┬───────────────────────────────────────────────┘     │
│      │ tool calls (MCP protocol)                           │
│ ┌────▼───────────────────────────────────────────────┐     │
│ │ Tool Layer (EXPAND apps/mcp into full tool set)    │     │
│ │ • wiki.{create,update,link,read,lint,search}       │     │
│ │ • source.{ingest,search_web,fetch_pdf}             │     │
│ │ • user.{ask,notify,propose}                        │     │
│ │ • exec.{python,marp,chart}                         │     │
│ └────────────────────────────────────────────────────┘     │
│                                                            │
│ ┌────────────────────────────────────────────────────┐     │
│ │ Scheduler (NEW)                                    │     │
│ │ • Daily lint per project                           │     │
│ │ • Weekly brief                                     │     │
│ │ • On-source-arrived ingest                         │     │
│ │ • On-contradiction-detected notification           │     │
│ └────────────────────────────────────────────────────┘     │
└────────────────────────────────────────────────────────────┘
                         │
   ~/mindbase-data/                       ← unchanged storage model
   ├── raw/                               (immutable sources)
   ├── projects/<project>/                ← NEW per-project scope
   │   ├── wiki/concepts/                 (LLM-owned)
   │   ├── wiki/notes/                    (user drafts, optional)
   │   ├── wiki/INDEX.md                  (LLM-maintained)
   │   ├── wiki/log.md                    (audit)
   │   ├── wiki/schema.md                 (user-editable conventions)
   │   ├── wiki/_thesis.md                (current synthesis)
   │   └── agent-state/                   (NEW — agent memory, tasks)
   └── settings/
```

### Key architecture decisions

| Decision | Choice | Why |
|---|---|---|
| Agent framework | **Roll our own (~600 LOC plain TS)** | LangChain/LangGraph are heavy, magic, hard to debug. Anthropic & OpenAI have native tool calling. We already have store + adapter abstractions. |
| Tool protocol | **MCP** (Model Context Protocol) | Standard, future-proof. Means Cursor / Claude Code / external agents can use MindBase as their research memory — **distribution lever**. |
| State storage | **Plain JSON files on disk**, alongside the wiki | Local-first, debuggable, git-able. No sqlite/Postgres overhead for agent state. |
| Multi-agent vs single | **Single agent per project** | Simpler mental model for user. Multi-agent under the hood is implementation detail. |
| Approval model | **Risky ops gate** (create > 3 pages, merge, delete) | Researchers must trust the agent. Auto-approve safe ops (append, link, INDEX update); pause for risky. User-configurable per project in schema.md. |
| Memory | **3 tiers: working / project / long-term** | Working = current task. Project = schema + INDEX + log (Karpathy's spec). Long-term = user prefs across projects. |

### What we KEEP from current MindBase (70% reuse)

- `packages/core/src/compile/` → becomes one tool (`source.ingest`) the agent calls
- `packages/core/src/graph/index/wiki-index.ts` → becomes the agent's read tool for typed edges
- `hybridSearch` → becomes one tool option for search (complements INDEX-first)
- `packages/core/src/classify/` → becomes one tool the agent calls per source
- All markdown storage, store abstraction, LLM adapter, MCP server
- pdfjs-dist local PDF extraction
- Streaming compile UX pattern (will be reused for agent's streaming UI)
- Type-safe TS strict / pnpm monorepo / git author conventions

### What we BUILD new (the 30%)

- `packages/core/src/agent/` (~600 LOC)
  - `runtime.ts` — plan + execute loop
  - `state.ts` — per-project state persistence
  - `approvals.ts` — approval gate logic
  - `memory.ts` — 3-tier memory access
- `packages/core/src/wiki/index-md.ts` — INDEX.md auto-maintenance
- `packages/core/src/wiki/lint.ts` — the lint operation (6 checks + 2 suggestions)
- `packages/core/src/wiki/thesis.ts` — current-thesis page generator
- `apps/server/src/lib/agent-scheduler.ts` — autonomous triggers
- `apps/server/src/routes/agent.ts` — agent control / streaming endpoints
- `apps/web/src/components/agent/` — new UI surface
  - `ProjectDashboard.tsx`
  - `ApprovalInbox.tsx`
  - `ActivityFeed.tsx`
  - `AgentConversation.tsx`
- Project scoping throughout

### What we DELETE or DEFER

| Component | Verdict | Why |
|---|---|---|
| Chat-as-home (`PulseHome`) | **Delete** | Replaced by Project Dashboard |
| Notes/Wiki/Chats tab | **Restructure**: Project Dashboard / Wiki / Sources | Tabs become project-scoped, not global |
| Daily notes feature | **Defer to Q3** | Not in research wedge value chain |
| SRS / spaced repetition | **Defer** | Power-user feature, doesn't drive wedge |
| Folders as primary org | **Deprecate** | Projects subsume folders |
| Mobile app | **Pause, scope to capture-only** | Research happens at desk |
| Generic settings sprawl | **Compress to 1 page** | Researchers want zero-config |
| Wiki Health (current impl) | **Replace with lint** | Lint is the Karpathy-spec'd version |
| Synthesis cards | **Fold into agent's "current thesis"** | Same job, better surface |
| Audio Overviews | **Stay deferred** | Not value chain |
| Multi-surface capture | **Keep browser ext, focus on academic sites** | Real value for wedge |

Roughly **35% of current UI surface disappears**, **30% gets restructured**,
**35% stays roughly as-is**. The backend reuse is much higher (~70%).

---

## Part 4 — The new product surface (UX)

### Old home (today)
```
┌─────────────────────────────────────────┐
│ Pulse Home — chat starters              │
│  • Ask about my wiki                    │
│  • Continue last thread                 │
│  • Synthesize from inbox                │
│  • Find related                         │
│                                         │
│ + global tree of all notes (LeftRail)   │
│ + chat panel (right)                    │
└─────────────────────────────────────────┘
```

### New home (post-pivot)

```
┌─────────────────────────────────────────────────────────────┐
│ MindBase  ▼ Project: RAG research        [⏸ Pause agent]   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ ⚡ Agent is working                                         │
│   Reading "REPLUG: Retrieval-Augmented Black-Box LMs"      │
│   Step 3/7: Extracting claims and entities...               │
│   [Pause] [Watch]                                           │
│                                                             │
│ 📝 2 proposals need your approval                          │
│   ┌─────────────────────────────────────────────────────┐  │
│   │ Merge [[LangChain]] and [[langchain-rag]]?          │  │
│   │ Reason: Same concept, different slugs from 2 sources│  │
│   │ [Approve] [Reject] [Show me both pages]             │  │
│   └─────────────────────────────────────────────────────┘  │
│                                                             │
│ 🔔 3 things the agent noticed                              │
│   • Contradiction: [[fine-tuning beats RAG]] vs            │
│     [[RAG beats fine-tuning]] (both cite 2024 papers)      │
│   • [[ColBERT]] mentioned in 6 sources, no concept page    │
│   • Suggested source: "RAG vs Fine-tuning: 2024 update"    │
│                                                             │
│ 📊 This week                                                │
│   +14 concept pages • +52 typed links • 3 contradictions   │
│   resolved • 8 sources read                                 │
│                                                             │
│ ─────────────────────────────────────────                  │
│ Open: [Wiki] [Sources] [Activity log] [Ask the agent]      │
└─────────────────────────────────────────────────────────────┘
```

### The 5 product surfaces (per project)

1. **Dashboard** (above) — what the agent did + what needs your attention
2. **Wiki browser** — the artifact. Browse `concepts/`, see graph, read pages. **This is what makes us different from chat-only tools** — you can navigate.
3. **Sources library** — your raw collection. Drop new ones here. See which ones agent has processed.
4. **Activity log** — full audit. Every agent action with reason. Filter by type. Rollback any change.
5. **Ask the agent** — focused inquiry. Scoped to this project. Answers can be filed back into wiki.

Plus a project switcher and global settings. That's it. ~5 main surfaces vs current ~15.

### The "magic moment" demo (the 5-minute video)

```
[0:00] User: "I'm starting research on RAG for my dissertation."
[0:05] Click "New Project" → name it → done. Agent says hi.
[0:15] Drop 5 RAG papers into Sources.
[0:30] Agent: "Plan: read 5 papers, extract concepts, build initial wiki.
              ~12 minutes, ~$0.40. Approve?" → [Approve]
[0:45] Watch streaming: "Reading paper 1... Found 6 concepts: REPLUG,
       hypothetical documents, query rewriting...
       Creating [[REPLUG]]... Creating [[query-rewriting]]...
       Linking [[hypothetical-documents]] → [[query-rewriting]] (elaborates)..."
[3:00] Done. Wiki has 23 concept pages, 4 source summaries, 67 typed links.
[3:30] Click [Wiki] → browse. Pages are real. Cited. Cross-linked.
[4:00] User: "Make me a comparison table of the methods."
[4:30] Agent generates a table. User clicks "Save to wiki" → it's now [[methods-comparison]].
[5:00] "And now this wiki grows with every paper you add. Talk to you tomorrow."
```

**This is what we record and put on Twitter / HN.** Anyone watching gets it instantly.

---

## Part 5 — Business model

### Pricing tiers

| Tier | Price | What | Target |
|---|---|---|---|
| **Local** | $0 | Local-only, unlimited sources, BYO API key. No agent scheduler (you trigger). | Power users / evaluation / OSS evangelists |
| **Pro** | $20/mo | Hosted LLM (we pay), agent scheduler, sync, browser ext, 500 source ingests/mo, 3 projects | Individual researcher |
| **Research** | $50/mo | Pro + premium models (Opus, GPT-5) + 5,000 ingests + unlimited projects + scheduled briefs + MCP server access + export-to-book | Professional / heavy user |
| **Team** (Q3+) | $50/user/mo | Shared projects, RBAC, Slack/meeting connectors | 5-20 person research labs / consulting firms |

### Distribution / GTM (sprint-mode tactics)

**Pre-launch (weeks 1-12)**:
- Build in public. Tweet weekly progress. Reference Karpathy gist.
- Onboard 10 friendly users (PhD friends, founder peers). Get feedback.
- Record the 5-min demo. Multiple takes. Make it tight.

**Launch week (week 13-14)**:
- Open-source the **CLI version** of the agent — captures developers
  searching "how to implement Karpathy's LLM-Wiki." Become the canonical
  reference implementation.
- Tweet thread referencing Karpathy's gist with our demo. Tag Karpathy.
- Show HN on a Tuesday 9am ET, title: **"Show HN: MindBase — Karpathy's
  LLM-Wiki pattern as a research agent"**
- Post to /r/PhD, /r/MachineLearning, /r/AcademicQuant
- Write a blog post: **"How to actually ship Karpathy's LLM-Wiki pattern."**

**Post-launch (week 15+)**:
- Iterate based on first-50-user feedback
- Ship Pro tier billing (Stripe)
- Academic discount (educator / student pricing, 50% off)

### Why bootstrap, not raise

Obsidian's $25M ARR with 7 people, zero VC, is the proof point. Research
wedge doesn't reward horizontal-growth metrics that VC pushes for. A
$50-150k MRR profitable indie business is more sustainable, more
defensible, and keeps optionality.

Reserve external capital for **if and only if** a clear enterprise/team
SKU opportunity materializes around month 9-12 with paying design partners.

### Moats (in order of strength)

1. **Per-project schema co-evolution** — agent gets better tuned to YOUR
   research style over months. Switching cost compounds.
2. **Local-first + data ownership** — required for IP-sensitive,
   journalism, medical, legal. Cloud-only competitors structurally lose
   this segment.
3. **Typed contradiction graph** — gets denser with corpus. Cold-start
   disadvantage for competitors.
4. **MCP-as-platform** — external agents (Cursor, Claude Code) accumulate
   into your MindBase. Network effects.
5. **Brand as "the Karpathy-pattern product"** — first-mover canonical
   position via OSS CLI + the gist's reach.

Not a moat: pretty UI, LLM quality, compile speed, folder UX.

---

## Part 6 — 16-week execution plan

### Pre-week 0 — kill list + decisions

Before any code: founder sign-off on:
- Research wedge (vs reading / horizontal)
- Agent-first architecture
- Sprint mode (16 weeks to public launch)
- Bootstrap path
- This pivot plan as canonical

**Then** delete from main branch (or hide behind flags):
- Chat-as-home
- Daily journal feature
- SRS UI surface
- Audio Overviews (already deferred — confirm)

### Weeks 1-2 — Agent runtime v0 (the core bet)

**Goal**: agent can ingest ONE source via plan→execute→approve loop.

- `packages/core/src/agent/runtime.ts` — minimal plan + execute loop, ~300 LOC
- `packages/core/src/agent/state.ts` — JSON-on-disk per-project state
- `packages/core/src/agent/approvals.ts` — approval gate
- Wrap existing `compile()` as a tool the agent calls
- Streaming output via SSE
- **Ship gate**: agent ingests one PDF, proposes 5 actions, user approves,
  3 wiki pages created, all logged. End-to-end demo works.

### Weeks 3-4 — 3-layer architecture (the Karpathy spec)

- Physical `wiki/concepts/` directory (LLM-owned)
- Move existing AI-generated pages from `wiki/notes/` → `wiki/concepts/`
- `wiki/schema.md` per project (with sensible default + UI editor)
- `wiki/INDEX.md` auto-maintained on every ingest
- Make INDEX.md the primary retrieval path (hybrid search becomes complement)
- **Ship gate**: open the data dir in Obsidian, see the 3-layer separation.
  Drop a source, watch INDEX.md update.

### Weeks 5-6 — Agent UI surface (replaces chat-home)

- `ProjectDashboard.tsx` (mockup above)
- `ApprovalInbox.tsx` (proposals with approve/reject/modify)
- `ActivityFeed.tsx` (full audit, filterable)
- `AgentConversation.tsx` (focused inquiry, with "save to wiki" button)
- New nav: project switcher + dashboard / wiki / sources / activity / ask
- **Ship gate**: 10 friendly users can use it without tutorial.

### Weeks 7-8 — Conversational ingest + lint v1

- Conversational ingest UX: stream "discussing takeaways" turn
- Multi-source extraction (back to 10-15 page touches per source — fix the prompt regression)
- Lint operation v1: contradictions + orphans + missing-concept-pages
- Lint surfaces as Dashboard cards
- **Ship gate**: drop 5 papers, watch agent build a 20+ page wiki with
  contradictions surfaced and INDEX populated.

### Weeks 9-10 — Project scope + onboarding

- "Project" as first-class entity throughout (data model + UI)
- Onboarding wizard: "What are you researching?" → scaffolds Project with
  per-domain template (Literature Review / Market Research / Investigation /
  Case File / Topic Tracker)
- Per-project schema templates
- Source browser ext sharpened for academic sites (arXiv, Scholar, SSRN)
- **Ship gate**: external user (PhD friend) completes onboarding → wiki has
  5+ pages → in under 10 minutes, no help.

### Weeks 11-12 — Polish + demo

- Record THE 5-minute demo video (multiple takes, professional)
- Fix every "I noticed X feels broken" from 10-user testing
- Write blog post: "How to ship Karpathy's LLM-Wiki pattern"
- Pricing page, landing page, signup flow
- Stripe integration for Pro tier
- **Ship gate**: end-to-end signup → onboarding → first wiki page → would-pay moment, all clean.

### Weeks 13-14 — Open-source SDK + dry run

- Extract the agent runtime + tool layer as `mindbase-cli` open-source repo
- "Implementing Karpathy's LLM-Wiki pattern from scratch" tutorial in the README
- Internal demo run-through to 10 trusted people for final feedback

### Weeks 15-16 — Public launch

- Tuesday 9am ET Show HN
- Twitter launch thread, tag Karpathy
- Reddit cross-posts (/r/PhD, /r/MachineLearning, /r/AcademicQuant)
- Direct outreach to 50 academic Twitter accounts
- **Launch gate target**: 100 sign-ups in 48 hours, 10 paying in first week

### Months 4-12 — Iterate to MRR

- Q2 (m4-6): Pro tier polish, browser ext v2, $1k → $10k MRR
- Q3 (m7-9): Specializations (per-discipline schemas), connectors (Zotero, Readwise, Notion import), reading-wedge SKU launch
- Q4 (m10-12): Team SKU beta with 3-5 design partners, $25-40k MRR

### Stop-and-reassess gates

Failure trigger 1: **Week 8** — if internal team can't build a wiki with
20+ pages from 5 sources in under 30 min, the architecture isn't working.
Pause and re-plan.

Failure trigger 2: **Week 14** — if 10-user beta retention is <30% after 2
weeks, the wedge or UX is wrong. Pause and pivot within the wedge (try
reading wedge first).

Failure trigger 3: **Month 6** — if < $1k MRR with 100 active users,
business model is wrong. Pause and consider freemium adjustments or
enterprise pivot.

---

## Part 7 — Risks (named, with mitigations)

| Risk | Probability | Severity | Mitigation |
|---|---|---|---|
| ChatGPT/Claude Memory eats the casual segment | 70% within 12mo | Medium | Lean into structure + citations + exports for serious users. Different job from chat memory. |
| NotebookLM ships persistent wikis | 50% within 12mo | High | Local-first is our structural edge. Privacy researchers / IP-sensitive can't use cloud. Ship faster. |
| Karpathy pattern doesn't scale past 1000 pages | 30% | Critical | Dogfood at scale immediately. Build scale strategy (clustering, partitioned indexes) ready. |
| Unit economics underwater on Pro tier | 40% | High | Prompt caching, smart model routing (Haiku/Sonnet/Opus tiers), per-user LLM budget, BYO-API option |
| Researchers distrust black-box AI | 40% | High | Provenance everywhere. Audit log visible. "Show me the prompts" mode. Reasons on every action. |
| Solo founder bandwidth | 80% (it's hard) | High | Ruthless scope. NO journal, NO mobile, NO team SKU in year 1. Pivot plan IS the focus mechanism. |
| remio / Dume / new entrant beats us to launch | 50% within 6mo | Medium | Sprint mode + OSS CLI to capture mind-share. Open-source the pattern implementation BEFORE the polished product. |
| The pivot itself is wrong | 20% | Catastrophic | Stop-and-reassess gates at weeks 8 and 14. Failure is recoverable if caught early. |

---

## Part 8 — Decisions you need to make right now

Cannot proceed without these:

1. **Wedge confirmation**: Research wedge (recommended) / Reading / Horizontal?
2. **Sprint vs stroll**: 16 weeks to launch (sprint) / 6 months careful (stroll)?
3. **Bootstrap vs raise**: Bootstrap (recommended) / Seek seed now?
4. **Solo or recruit cofounder**: Solo to PMF (recommended) / Find cofounder
   for Q1?
5. **First kill**: Are you OK deleting chat-as-home + daily journal + SRS UI
   this week?
6. **OSS CLI launch**: Are you OK open-sourcing the agent runtime + tool
   layer as a separate repo? (Strong moat play but means competitors can
   fork. Recommended yes.)
7. **Public launch date target**: ~Aug 2026 (week 16 from now)?

---

## Closing

The current MindBase is a mostly-built engine in the wrong car. The engine
is exactly what Karpathy described 7 weeks ago. The car is "AI second
brain" — a category with no winners.

**Repaint the car**. Same engine, different vehicle, sharp wedge.

The next 16 weeks decide whether MindBase becomes the canonical product
that researchers cite when asked "how do you keep track of everything
you've read?" — or another forgotten note-taking app that pivoted three
times and ran out of runway.

Sprint or stroll. Bootstrap or raise. Research wedge or horizontal. One
of those answers is the bet I'd make with my own money.

---

*This is a living doc. Update via PR. The first 30-commit session that
prompted this pivot is the founder's witness — we built a lot, but most
of it served the wrong thesis. This doc is the correction.*
