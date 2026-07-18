# MindBase Product Strategy — 2026-05-25

> Written after a 30-commit session that exposed: the product is drifting toward
> being "AI-flavored Notion" while the unique architecture (LLM-Wiki pattern
> per Karpathy) is buried under generic chrome. This doc is the strategic reset.

## 0. The Verdict (TL;DR)

**Stop building a general PKM tool.** That market has no winner because no one
needs a slightly-better Notion + AI. Re-aim MindBase at **one sharp wedge** the
Karpathy LLM-Wiki pattern dominates:

> **"The research-wiki for knowledge workers doing sustained inquiry."**  
> Drop 50 papers / articles / interview transcripts on a topic → get back a
> structured, interlinked wiki you can navigate, cite from, and grow over months.

This is a $500M+ niche (researchers + analysts + investigative journalists +
solo consultants + grad students), high WTP ($20-50/mo), demoable in 5 minutes,
and structurally unattackable by Notion / NotebookLM / ChatGPT Memory.

**Tear out**: chat-as-main-surface, the Notes/Wiki tab confusion, the homepage
chat starter, broad PKM positioning, mobile-first investments.

**Double down on**: per-project wikis, conversational ingest, lint operation,
INDEX-first retrieval, typed contradiction graph, local-first data ownership.

12-month target: 1,000 paying users × $25/mo avg = **$25k MRR** + a brand that
researchers self-organize around.

---

## 1. Market Reality (where we actually are)

### The PKM category has been failing for 5 years

- **Roam Research**: peaked 2020-21. ~70% user decline since. Founder went
  quiet. The "graph database for thought" thesis didn't hold.
- **mem.ai**: $33M raised (2022), pivoted twice, struggled with retention.
  Recent product is barely recognizable as the original "AI notes" pitch.
- **Notion AI**: bolted on, monetized weakly. Users describe it as "okay
  autocomplete," not transformative. ARR contribution unclear.
- **Heptabase / Capacities / Tana / Mymind**: each carved a small loyal
  audience (~10-50k paying), none breaking out.
- **Obsidian**: profitable, no VC, dominant in local-first prosumer niche
  via community plugins — but explicitly not AI-native.

**Conclusion**: "AI + PKM" without a sharp wedge has failed in market 5 times
running. The next "AI notes app" gets ignored. **Generic doesn't win here.**

### What HAS worked in 2024-25

- **Granola** (AI meeting notes): exploded. One wedge — meeting notes — done
  10x better than incumbents. ~$15M ARR within 18 months.
- **Cursor**: replaced VSCode for many developers. One wedge — coding — done
  AI-natively from scratch. $100M+ ARR within 18 months.
- **Perplexity**: AI search. Different category but same pattern: AI-native
  beats AI-bolted-on, and a sharp wedge beats horizontal.
- **NotebookLM Audio Overviews**: viral 2024. Proved that AI knowledge
  products CAN go viral when the demo is concrete and the AI is the surprise.

**The pattern**: AI-first + sharp wedge + viral demo = breakout. AI-bolted-on
+ horizontal positioning = dies in obscurity.

### What's coming that threatens us

1. **ChatGPT Memory + Projects** — already shipping. Generic users won't need
   a separate PKM tool for "ask AI about my stuff."
2. **Claude Projects + Skills** — Anthropic's version. Similar trajectory.
3. **NotebookLM expanding to persistent wikis** — most likely competitor.
   Cloud-only is their structural weakness.
4. **Notion AI rebuild** — they'll get desperate to defend, eventually ship
   "Notion AI Wiki Maintainer." Slow but will arrive.

**Window**: ~12-18 months before AI-native PKM is table stakes. Need to
establish a defensible category position now.

---

## 2. The Karpathy Pattern is the Lever — But Pattern ≠ Product

Karpathy's article is the best articulation of the AI-native PKM thesis
anywhere. It will become as influential as Vannevar Bush's Memex essay was
for hypertext.

**But Karpathy explicitly says you don't need a product** — `claude-code +
obsidian + CLAUDE.md` does it. That's true for 100k power users.

**The product opportunity is the other 100M people** who:
- Want the LLM-Wiki workflow
- Won't run a terminal
- Won't write a CLAUDE.md
- Won't manually invoke `lint` on Saturday morning
- Need mobile/web capture
- Need this to "just work" on day one

The product wraps the pattern in:
1. Zero-config onboarding ("I'm researching X" → project scaffolded)
2. Visible LLM-at-work (streaming compile, conversational ingest)
3. Active wiki (daily briefs, contradiction alerts, lint cards)
4. Cross-device capture (web ext, mobile, MCP for agents)
5. Polished retrieval (INDEX.md + hybrid search hybrid)

**The product is not the pattern. The product is the pattern made effortless.**

---

## 3. Three Strategic Paths (so you can reject mine)

| Path | Position | Who's it for | WTP | Risk |
|---|---|---|---|---|
| **A. Stay horizontal** ("AI second brain") | Compete with Notion / mem.ai | "Everyone" | $10/mo, race-to-bottom | High — category has no winners. Likely fail to differentiate. |
| **B. Pick the research wedge** ("LLM-Wiki for sustained inquiry") | Compete with Notion-for-research + Zotero + Roam + NotebookLM | Researchers, analysts, journalists, grad students | $20-50/mo, paid by users or institutions | Medium — wedge is real, but execution-heavy |
| **C. Pick the consumer reading wedge** ("Tolkien Gateway for any book") | Compete with Goodreads / Readwise | Avid readers, lifelong learners | $5-10/mo, consumer | High — consumer ARPU low, demos are viral but conversion weak |

**My recommendation: Path B (research wedge).** Reasons:

- **Highest WTP** ($20-50 sustainable, vs $5-10 consumer)
- **Sharpest pain** (researcher reads 100+ papers/year, remembers <10%)
- **Demoable** (drop 30 papers on RAG → working wiki in 5 min = viral video)
- **Sophisticated customer** (gives product feedback, advocates publicly)
- **Once won, expandable**: research wedge → consulting wedge → team wedge → consumer reading wedge (each as adjacent SKU)
- **Aligns with founder taste** (Karpathy himself uses it this way)

Path C is the second-best if A is rejected — and we could even run B and C as
separate product lines later. But picking one first is critical.

---

## 4. The Recommended Wedge: Research Wiki

### The customer

**Primary ICP**: Knowledge worker doing sustained inquiry on a topic over weeks/months.

Concrete examples:
- PhD student writing a literature review (target: 200+ papers)
- Founder researching a new market before raising (target: 50+ interviews, reports)
- Tech analyst tracking a vertical (target: ongoing, 10 sources/week)
- Investigative journalist on a story (target: court docs, interviews, FOIA)
- Solo consultant building reusable IP per practice area
- Lawyer building case knowledge (target: precedents, depositions, briefs)
- Doctor / researcher tracking a condition (target: papers, patient notes)

What unites them:
- **Volume**: 50-500+ sources per project
- **Duration**: weeks to years
- **Multi-source synthesis required** (single paper insufficient)
- **Citation matters** (must trace claims back to sources)
- **Recall over time matters** (return to project after weeks/months)
- **Budget exists** ($20-200/mo professional tool)

### The pain (sharp, urgent, current)

Current workflow for our ICP:
- Papers/articles scattered across Zotero, browser tabs, Notion, OneNote
- Highlights / notes pile up but never synthesize into anything reusable
- "What did I learn last month?" → impossible to answer without re-reading
- New paper arrives → no easy way to know "does this contradict what I thought?"
- Bibliography for the eventual paper / report = a week of work at the end

Current solutions and their gaps:
- **Zotero**: bibliography only, no synthesis
- **Notion / Obsidian**: manual organization, abandons after 100 sources
- **Roam Research**: graph but no AI maintenance, declined
- **NotebookLM**: cloud-only, conversation-mode (not accumulating wiki),
  10-source cap, no projects, no privacy
- **Perplexity Pro**: ad-hoc search, not building a corpus you own
- **ChatGPT Projects**: memory is amorphous chat history, not a navigable wiki

**Nobody is shipping "the AI research analyst that builds your wiki for you."**

### Why MindBase wins this wedge

Already-built advantages (the silver lining of having over-built):
- Compile pipeline that updates multiple pages per source (degraded but
  fixable per the May 22 logs showing 18-22 actions/source)
- Typed knowledge graph with contradiction detection
- Local-first markdown storage (privacy = required for research)
- Multi-surface capture (browser, mobile, MCP)
- Hybrid retrieval infrastructure
- Streaming compile that can become "watch the AI work"

What needs to be built/changed:
- Per-project scoping (current global wiki kills this wedge)
- Conversational ingest (the missing step 4 from Karpathy)
- Lint operation (the killer differentiator)
- INDEX-first retrieval (proper implementation of Karpathy's spec)
- Onboarding focused on research projects (not chat / notes)
- 3-layer architecture made physical (not collapsed into `wiki/notes/`)

---

## 5. What to RIP OUT of current MindBase

To win the research wedge, these have to go (or get massively de-emphasized):

| Current feature | Verdict | Why |
|---|---|---|
| Chat as home/main surface | **Demote**. Chat is one operation, not the product. | Karpathy's Query op is supplemental to wiki, not the main UX. Researchers don't open "chat" first — they open "my research project." |
| Notes vs Wiki tab toggle | **Rename + restructure**. Notes → "Drafts (you)" / Wiki → "Knowledge (AI)" — and Knowledge is the default. | Today's split confuses everyone. |
| Home view (PulseHome) | **Replace** with project dashboard | Current home is generic. Need project-centric: "Your research project on X — 47 sources, 23 concept pages, 3 contradictions to review." |
| Daily notes / journal | **Move to optional separate product**. | Diverts focus from research wedge. Reuse the engine later for journal SKU. |
| Spaced repetition (SRS) | **Keep but deprioritize UI**. Power-user feature. | Don't market it. Research wedge users may discover it; that's fine. |
| Folders as primary organization | **De-emphasize**. Projects subsume folders. | Folders are Notion-think. Projects + auto-classified wiki pages are the real structure. |
| Mobile app | **Pause unless capture-only**. | Research happens at desk. Mobile = capture (highlight → send to wiki) only, not a full app. Defer 6 months. |
| Browser ext | **Sharpen**: focus on academic / paper sites (arXiv, Google Scholar, Semantic Scholar, ssrn.com, jstor.org) | Right now it's a generic web clipper. Make it the best paper-capture tool. |
| Multi-language search | **Keep**. Researchers globally. Cheap to maintain. | Real edge for non-English research. |
| Audio Overviews (deferred) | **Stay deferred**. | Not in research wedge value chain. |
| Settings complexity | **Simplify radically**. One settings page max. | Researchers want zero-config. |

Roughly **30-40% of current UI surface** disappears in this reset. That's the
price of focus.

---

## 6. The Wedge Roadmap (12 months, opinionated)

### Phase 1: Architectural reset (Month 1) — non-negotiable foundation
- Physically separate `wiki/concepts/` (LLM-owned) from `wiki/notes/` (user)
- Implement `wiki/schema.md` per project (Karpathy's "key configuration file")
- Make `INDEX.md` auto-maintained and the primary retrieval path
- Expand `log.md` to record queries + lint passes, not just ingests
- Fix compile prompt back to 10-15 page touches per source (was working May 22)
- Add conversational ingest (the missing "discuss takeaways" turn)
- Build lint operation (the 6 checks + 2 suggestions Karpathy listed)
- **Ship/don't-ship gate**: open with a brand-new research project, drop 5
  papers, watch wiki grow from 0 → 30 interlinked pages. If demo feels magic,
  ship. If not, iterate.

### Phase 2: Project as first-class + reposition (Month 2)
- "Project" replaces "global workspace" as primary entity
- Project templates: Literature Review / Market Research / Investigation /
  Case File / Topic Tracker
- Each project = its own scope (sources, wiki, schema, INDEX, log, chat)
- Onboarding: "What are you researching?" → scaffolds a project
- Rebrand: landing page leads with research wedge messaging
- New home: project dashboard (growth metrics, recent wiki updates, lint
  cards, suggested next questions)
- **Ship/don't-ship gate**: external user can complete onboarding and reach
  "wiki has 5+ pages" in under 10 minutes without asking for help.

### Phase 3: Viral demo + 100 early users (Month 3)
- Record 5-minute demo: "Watch me research [topic] in 10 minutes — 30 papers
  in, wiki grows, contradictions surface, exportable bibliography out"
- Twitter/X seeding with researcher influencers (especially ML researchers
  given the Karpathy connection — natural amplifier)
- Hacker News launch ("Show HN: We built Karpathy's LLM-Wiki pattern as a
  product"). The article cite is gold.
- Reddit /r/PhD, /r/AcademicQuant, /r/MachineLearning
- Goal: 100 active free users, 10 paying for early-access Pro at $20/mo

### Phase 4: Pro tier + capture polish (Months 4-6)
- Pro $20/mo: hosted LLM, sync across devices, premium models, higher
  ingest limits
- Browser extension v2: ace academic paper sites
- "Project export": full markdown bundle, BibTeX, PDF compiled wiki
- "Project share": read-only public link (researchers love showing off)
- MCP server v2: any LLM agent (Claude Code, Cursor) can read/write your wiki
- Goal: 500 paying users × $20/mo = $10k MRR

### Phase 5: Specialization + adjacent SKUs (Months 6-9)
- Per-discipline schema templates (Bio, Law, Finance, History, ML, Medicine)
- Pre-built ingest connectors (Zotero import, Readwise import, Notion import,
  Pocket import, Kindle highlights)
- "Lint subscription": weekly digest of wiki health → email or app
- Consider Reading wedge launch as separate landing page ("MindBase for
  Books") with shared backend
- Goal: 1,500 paying users × $25/mo blended = $37k MRR

### Phase 6: Team variant beta (Months 9-12)
- Research labs / consulting firms / investigative newsrooms — 5-20 person
  teams
- Shared projects + role permissions
- Slack import + meeting transcript import (Otter / Granola APIs)
- Pilot pricing: $50/user/mo, 5 design partners
- Goal: 3-5 paying teams × ~$500/mo each = additional $2k MRR

**Realistic 12-month outcome**: ~$30-40k MRR, ~2k paying users, recognized as
"the research wiki product" within the LLM-aware knowledge worker community.
A respectable seed/A1 fundable trajectory if external capital wanted.

---

## 7. Business model

### Pricing tiers (proposed)

| Tier | Price | Includes |
|---|---|---|
| **Free** | $0 | Local-only. Unlimited sources/pages. BYO API key. No sync, no mobile, no hosted LLM. Use case: power users / evaluation. |
| **Pro** | $20/mo or $200/yr | Hosted LLM (we pay), sync across devices, browser ext + mobile capture, 500 ingests/mo, all features. Use case: individual researcher / analyst. |
| **Research** | $50/mo or $500/yr | Pro + premium models (Opus / GPT-5), priority lint, 5,000 ingests/mo, scheduled briefs, MCP server access, project export to PDF book. Use case: serious / professional users. |
| **Team** (later) | $50/user/mo | Shared projects, RBAC, Slack/meeting import, audit logs. 5+ users. |
| **Enterprise** (later) | Custom | On-prem option, SSO, dedicated support. |

### Why this works
- Free tier = product-led growth + viral demo
- $20 Pro = anchor most common conversion
- $50 Research = self-selected serious users; high gross margin (heavy users
  pay more but use more API)
- Team = future leverage when single-user retention is proven

### Unit economics sketch
- Hosted LLM cost per Pro user: $3-8/mo (claim model, mostly Sonnet)
- Pro gross margin: 60-85%
- Research user margin: 50-70% (heavier API use, premium models)
- Break-even at ~500 paying users assuming $5k/mo opex (1 founder + minimal infra)

### Distribution
- **Inbound**: SEO ("AI for literature review," "AI research tool," "Karpathy
  LLM wiki"), HN, Twitter/X, demos on YouTube
- **Community**: ML / academic Twitter, PhD Discord servers, Roam refugees,
  Obsidian community
- **Partnerships (later)**: Zotero plugin, Readwise integration, Anthropic
  Skills directory feature
- **Paid (later)**: highly targeted academic Google Ads, ResearchGate ads
- **Anti-distribution**: do NOT pursue Producthunt-style spray (low-quality
  signups, no retention)

---

## 8. Moats — what makes this defensible

In order of strength:

1. **Per-project evolving schema** (`wiki/schema.md`). The longer you use it,
   the better tuned to YOUR research style. Switching cost compounds. Cannot
   be replicated by a competitor onboarding from zero.

2. **Local-first + data ownership.** A meaningful fraction of researchers
   will not consider cloud-only tools (HIPAA-adjacent fields, journalists,
   IP-sensitive work). Notion and NotebookLM structurally cannot serve them.

3. **Typed contradiction graph** that gets denser with corpus. A new entrant
   has to re-detect contradictions on import; we surface them as you go.
   Quality of this feature is corpus-dependent.

4. **MCP-as-platform**. Once you're the LLM agent's persistent memory for
   research, agents accumulate context inside you. Cursor / Claude Code /
   future agents become your distribution because they need you.

5. **Brand as "the Karpathy-pattern product."** First-mover on the named
   pattern. Influencer reach via the gist. We can build the canonical
   implementation in public.

6. **Speed of iteration on the pattern.** Whoever ships lint / file-back /
   conversational ingest first owns the mental model. Notion is too big to
   pivot; NotebookLM is constrained by Google review cycles.

What is NOT a moat:
- Pretty UI (copyable)
- LLM quality (we use the same models)
- Compile speed (model providers dominate)
- Folder UX (Notion / Obsidian are better)
- Generic chat (everyone has it)

---

## 9. Existential risks (in priority)

1. **ChatGPT / Claude Memory eats casual use case.** Probability: 70%
   within 12 months.
   - Mitigation: dominate the research wedge before this. Our users need
     structure (citations, exports, contradictions) — chat memory is
     amorphous. Different job.

2. **NotebookLM ships persistent wikis.** Probability: 50% within 12 months.
   - Mitigation: we're local-first; they're not. Privacy researchers / IP-
     sensitive fields are ours. Also: ship faster.

3. **The Karpathy pattern just doesn't scale past 1000 pages.** Probability:
   30% — real engineering risk.
   - Mitigation: dogfood hard. Build at 1000+ page scale in our own usage.
     Have a "scale strategy" (smarter indexing, page partitioning, cluster
     summaries) ready to ship if hit.

4. **Unit economics on hosted LLM Pro tier are upside-down.** Probability:
   40% if not careful.
   - Mitigation: aggressive prompt caching, smart model routing (Haiku for
     classification, Sonnet for compile, Opus only on demand), per-user
     monthly LLM budget, BYO-API option for heavy users.

5. **Researchers won't trust a "AI black box" for serious work.** Probability:
   40%.
   - Mitigation: provenance everywhere, citations visible, audit log
     surfaced, "show me the prompts" mode for skeptics.

6. **Founder bandwidth.** Probability: high if solo.
   - Mitigation: ruthless scope. Don't build a journaling app, a team SKU,
     a mobile app, AND a research wedge simultaneously.

---

## 10. What this strategy explicitly rejects

For clarity — these are decisions, not oversights:

- ❌ **Becoming a Notion alternative.** That market has no winners and we
  can't out-broad Notion.
- ❌ **Becoming a consumer journaling app.** Lower WTP, less differentiation
  from Reflect / Mymind.
- ❌ **Building a team SKU in year 1.** Team products require sales / support
  / SOC2 / enterprise UX that solo founders can't sustain.
- ❌ **Building a mobile-first product.** Research happens at desk. Mobile
  is capture-only.
- ❌ **Going after Cursor / NotebookLM / ChatGPT directly.** We can't.
  Find adjacent ground.
- ❌ **AI auto-everything.** Conversational ingest is the OPPOSITE — user
  curates, AI executes. Don't try to be "magic AI that does it all."
- ❌ **Spending time on chat UX polish.** Chat is supplementary, not core.

---

## 11. The decisions I need from you

Before any code changes, these need your call:

| # | Decision | Recommended | Cost of being wrong |
|---|---|---|---|
| 1 | **Pick the wedge: A (horizontal) / B (research) / C (reading)** | **B (research)** | If wrong: 6 months wasted positioning. |
| 2 | **Free + Pro + Research tier model OR something else?** | Free / $20 Pro / $50 Research | Wrong: pricing arbitrage |
| 3 | **Cut chat from home / make wiki the main surface?** | **YES, cut it** | Wrong: confused users |
| 4 | **Tear out folders in favor of projects, or keep both?** | Projects subsume folders | Wrong: migration pain |
| 5 | **Phase 1 architectural reset starts when?** | This week | Wrong: drift continues |
| 6 | **Hire / cofounder / solo for next 12 months?** | Solo to product-market fit; cofounder around month 6 | Wrong: scope / morale |
| 7 | **Raise external capital or bootstrap?** | Bootstrap to first $10k MRR, then optional seed | Wrong: dilution / wrong board |

---

## 12. Closing thesis

MindBase is a year too early or two years too late as "yet another AI PKM tool."
It's exactly on time as **the canonical implementation of Karpathy's LLM-Wiki
pattern, sharpened to the research-wiki wedge.**

The next 90 days decide whether MindBase becomes:
- (A) Another forgotten note-taking app that pivoted three times, or
- (B) The product researchers / analysts cite when asked "how do you keep
  track of everything you've read?"

The architecture is mostly right. The product surface is mostly wrong.
The fix is tractable but requires saying no to most current code.

**My recommendation: commit to Path B, start Phase 1 (architectural reset)
this week, ship a demo-able research wedge by end of Q1.**

If you reject this, the next-best is Path C (reading wedge) — same
architecture, different ICP, lower WTP but more viral.

Path A (stay horizontal) I do not recommend at any price. The PKM graveyard
is full of horizontal AI tools.
