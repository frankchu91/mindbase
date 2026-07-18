# Addendum: Competitive Intel Delta (2026-05-25)

External research came back with data that **shortens the timeline** and
**sharpens the threat surface** from my Phase 1 strategy doc.

## What changed

### 1. Karpathy's gist went viral 7 weeks ago

- **16M+ views** on the original tweet (Apr 3-4, 2026)
- **5,000+ GitHub stars** on the gist
- Multiple working implementations already shipped:
  - `Pratiyush/llm-wiki` (Claude Code / Cursor / Codex sessions)
  - `lucasastorian/llmwiki` (open-source, MCP-connected)
  - ΩmegaWiki (680+ stars, v1.4.0)
  - LLM Wiki v2 gist (extending with agent memory)
- Funded startups explicitly citing the pattern:
  - **Dume.ai** — desktop AI agent for non-technical users
  - **remio 3.0** (Apr 2026) — connects ChatGPT/Gemini histories into queryable wiki

**Implication**: The pattern is no longer a niche essay. The land grab is
HAPPENING. We have ~3-6 months to be the canonical implementation, not the
12-18 I estimated. **Ship faster or get framed by remio / Dume.**

### 2. The AI-native PKM velocity benchmark is brutal

- **Granola**: $0 → $1.5B valuation in 36 months. $4.25M seed (May 2023) →
  $20M A (Oct 2024, 5k WAU) → $43M B ($250M, May 2025) → $125M C ($1.5B,
  Mar 2026). 250% revenue growth in the quarter before C.
- **Cursor**: $400M → $50B in 18 months. ARR $0 → $2B.

Both are AI-native wedge plays (meetings / coding) that replaced a workflow
incumbent. **This is what's achievable** when AI-native + sharp wedge align.

### 3. Tana is the closest funded competitor — but not Karpathy-pattern

- **$25M raised Feb 2025** ($14M A at $100M post, plus $11M seed)
- 160K waitlist; Fortune 500 customers claimed
- Pricing: Free / $8 / $14 per month
- Positioning: "AI-powered knowledge graph for work"
- **Critical**: Tana is block/supertag-based, not LLM-Wiki pattern. They are
  building structure for humans to maintain; we are building structure the
  LLM maintains. Different thesis.
- **They have a 12-month head start on distribution**. We have to win on
  thesis clarity + execution speed.

### 4. mem.ai is the cautionary tale we must internalize

- $29M raised → 4 years → no disclosed ARR/MAU
- 9 employees
- Rebuilt twice ("Mem 2.0" relaunched Oct 2025)
- Medium piece "The $40M Second Brain Failure" circulating widely
- **Failure mode**: positioned as "AI thought partner" — horizontal, no
  wedge, no specific workflow it dominates

This validates the strategy doc's core thesis: **horizontal AI PKM does
not work**. Don't repeat their mistake.

### 5. The "PKMS is Dying" sentiment is real and growing

- Medium article ("PKMS is Dying") widely circulated 2025
- Reddit /r/PKMS / /r/productivity recurring "I quit PKM" posts
- Core complaint: "too many tools storing things, none doing synthesis"
- **This is the demand signal for the Karpathy pattern, validated in the
  wild.** People want synthesis and recall, not another place to store.

### 6. Specific competitor threats with hard numbers

- **NotebookLM Plus**: $19.99/month in Google One AI Premium. Free tier
  active. 3M+ monthly visits Sep 2024. **Highest threat for casual users.**
- **ChatGPT Memory + Claude Memory + Gemini Memory**: all shipped 2024-26.
  Amorphous chat memory, not structured wiki. **Our differentiation holds**:
  structured + cited + exportable beats chat-memory-vibes for serious work.
- **Notion AI**: $15/user/mo Business tier; billing-trap complaints
  surging; "becomes a maintenance project" sentiment. **Our attack surface.**

### 7. WTP signals across wedges (sharpened)

| Wedge | Comparable | Their pricing | Their scale | MindBase WTP estimate |
|---|---|---|---|---|
| Reading | Readwise | $7.99/mo | 100k+ paying = ~$10M ARR | $10-15/mo |
| Research / Academic | Paperpile, ReadCube | $15-25/mo | smaller, niche | $20-30/mo |
| Due diligence / consulting | Harvey AI (legal) | $1k+/seat enterprise | high WTP | $50-200/mo solo, enterprise unbounded |
| Personal journal | Day One | $35/yr | mass consumer | $10-15/mo |
| Internal team wiki | Notion Business | $15/user/mo | massive | $20-25/user/mo (self-maintaining premium) |

Research wedge confirmed as highest WTP. Reading wedge has 100k+ paying user
proof point (Readwise) — much more validated than I estimated.

### 8. Obsidian's $25M ARR with 7 people = the alternative model

Obsidian quietly built ~$25M ARR with 7 people, zero VC, via Sync + Publish
subscriptions on top of a free local-first product. This is a **completely
viable alternative to venture-scale GTM** — bootstrap profitable, never
raise, keep optionality.

**Implication for MindBase**: bootstrap path is real and proven. Don't
default to "raise capital" thinking just because Granola did.

---

## What I'm changing in the recommendation

### Tightened: timing is months, not quarters

The strategy doc said "12-18 months window." Revised: **3-6 months until the
land grab is over** for the Karpathy-pattern-canonical position. Dume and
remio are already framing themselves as the implementation.

**New action**: ship the Phase 1 architectural reset **in 2 weeks**, not 4.
Ship a demoable research wedge **by end of June 2026** (~5 weeks).

### Sharpened: the wedge wording matters

Old wording: "research-wiki for knowledge workers doing sustained inquiry"

Better, given the data: 

> **"MindBase is the AI research analyst that builds your wiki. Drop 50
> papers; get a navigable, cited knowledge base that grows with you."**

Avoid "PKM," "second brain," "note-taking" — these are dead categories.
Lead with **research analyst** (the job) and **knowledge base** (the output).

### Reconsidered: reading wedge is more viable than I gave it credit

Readwise's 100k+ paying users at $7.99/mo proves consumer-scale reading-wedge
PKM works. I had this rated lower-priority. Revised: **Research wedge is
still primary, but reading wedge becomes Phase 4 (Q3) as a second SKU on
shared infra**, not a much-later optional thing.

### Added: defensive position against Tana

Tana's existence + funding means we cannot win on "knowledge graph for work"
generally. We need to **own the LLM-Wiki-pattern specifically** as a clean
counter-positioning:

| | Tana | MindBase |
|---|---|---|
| **Who writes the wiki?** | You (with supertag scaffolding) | The LLM |
| **Source of truth** | Your blocks | The raw sources |
| **Maintenance model** | Manual, structured-by-you | Automatic, structured-by-LLM |
| **Data location** | Cloud-first | Local-first |
| **Best for** | Power users who love structured note-taking | Researchers who want a wiki without the work |

Karpathy's framing IS our wedge against Tana. Lean into it explicitly in
marketing.

### Added: bootstrap path is now my recommended default

Strategy doc said "bootstrap to first $10k MRR, then optional seed." Given
Obsidian's $25M ARR with 7-person team and no VC, the new recommendation:

**Default to bootstrap. Reserve external capital for if a clear enterprise/
team SKU opportunity materializes around month 9-12.**

Venture capital pulls toward growth metrics that hurt research-niche
products (e.g., chasing horizontal adoption). For the research wedge
specifically, profitable indie at $50-100k MRR is more sustainable and
defensible than VC-backed $10M ARR with high burn.

### Added: ride the Karpathy-pattern wave deliberately

The pattern is hot RIGHT NOW. Specific tactical moves:

1. **Launch the open-source SDK / CLI version FIRST.** Before the polished
   product. Capture the developers who are already searching "how do I
   implement Karpathy's LLM-Wiki." Even if they don't pay, they become
   evangelists. Compete with the hobbyist GitHub repos for the canonical
   spot.

2. **Write the canonical implementation guide.** A blog post (or repo
   README) titled "How to actually ship Karpathy's LLM-Wiki pattern."
   Becomes SEO + credibility. Reference the gist; extend it with what we
   learned.

3. **Tweet Karpathy when we ship the product**. The man amplifies his own
   pattern's implementations.

4. **Show HN: launched on a Tuesday at 9am ET.** Title: "Show HN:
   MindBase — Karpathy's LLM-Wiki pattern, packaged as a research tool."

---

## Revised first-90-days plan

| Week | Milestone |
|---|---|
| 1-2 | Phase 1 architectural reset (separate `wiki/concepts/`, schema.md, INDEX-first, lint v0, fix compile prompt back to 10-15 actions per source). |
| 3 | Project as first-class entity. Repositioned home/onboarding around research. |
| 4 | Conversational ingest UX. Streaming compile that user can guide. |
| 5 | Polish 5-minute demo video. Onboard 10 friendly users (PhD friends, founder peers). |
| 6 | Write canonical "implementing Karpathy's pattern" blog post. Open-source SDK/CLI. |
| 7 | Show HN + Twitter launch. Target: 100 sign-ups in 48 hours. |
| 8-12 | Iterate based on first-50-user feedback. Ship Pro tier billing. Target $1k MRR. |

If at week 8 we have < 30 active users and < 5 paying, **stop and reassess
the wedge**. Don't fall in love with sunk cost.

---

## The single new decision to make NOW

The pattern is viral; the window is closing. **Are we sprinting or strolling?**

- **Sprinting**: 2-week architectural reset, ship demo June, public launch
  July. Single-minded focus, defer everything else.
- **Strolling**: comfortable 3-month rewrite, careful internal testing,
  launch Q4. Miss the Karpathy moment.

I recommend sprinting. The downside of sprinting and being wrong is "we
shipped a sharp v1 too early"; the downside of strolling is "remio + Dume
own the category we were going to define."
