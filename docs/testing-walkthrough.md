# Testing Walkthrough — Solo Dogfooding

A concrete, step-by-step walkthrough to verify every user-visible feature works
on **your** machine. 31 items, ~90 minutes if you do them all. Each item is
self-contained — skip around freely. Tick the boxes as you go.

## Prerequisites

```bash
# Server must be running (keep this in a terminal window)
pnpm -F @mindbase/server dev

# Open the web app
open http://localhost:4321
```

LLM proxy at `localhost:3456` must be running for AI features (Tier 3, 5, 7, 8).
Without it, you can still test Tiers 1, 2, 4, 6 (capture, RSS, settings, basic
UI).

Browser extension must be built: `pnpm -F @mindbase/browser-ext build`.

---

## Tier 1 — Web Basics (no config, 5 min)

### 1. Resizable left panel
- [ ] Hover the vertical divider between left aside and main area → cursor changes to `↔`
- [ ] **Drag** left/right → width changes
- [ ] **Double-click** the handle → resets to 320px
- [ ] Reload the page → width persists

### 2. Settings full-screen
- [ ] Click sidebar "Settings" button → entire app switches to full-screen settings
- [ ] Left rail shows 7 sections: Provider / Daily Brief / RSS / SRS / AI Clients / Obsidian / Graph Export
- [ ] Click each section → main area updates
- [ ] Click "← Done" → returns to wiki list view

### 3. Command Palette
- [ ] Press `⌘+K` (or click the search field at top of left panel)
- [ ] Type any keyword → fuzzy-matched wiki pages appear
- [ ] Press Enter → opens that page

### 4. Article view
- [ ] Click any wiki page from the list → enters article view
- [ ] Scroll to bottom → see capture provenance footer (if captured) + Cards section + Save button

### 5. Wikilink hover preview
- [ ] In an article body, find a `[[link]]` (rendered as a blue underlined link)
- [ ] **Hover for 250ms** → popover appears with title + one-liner + 200-char excerpt
- [ ] Click "Click to open →" → navigates to that page
- [ ] Hover then move mouse away → popover closes

### 6. Graph View
- [ ] Click sidebar "✦ Graph" button → force-directed canvas
- [ ] Hubs are visibly larger than orphans
- [ ] Top search field: type `theo` (or any partial slug) → matching nodes turn amber, others dim
- [ ] Click any node → opens that article
- [ ] Click "⟲ Reset" → re-centers + zooms to fit

---

## Tier 2 — Editor (30s, no LLM)

### 7. Edit mode
- [ ] In an article, click "Edit" button (top-right header)
- [ ] Page swaps to CodeMirror markdown editor with syntax highlighting
- [ ] Top bar shows "Saved …" + Save + Done buttons

### 8. Slash commands
- [ ] In the editor, **on a new empty line**, press `/`
- [ ] Floating menu appears with 5 categories (Format / Blocks / Links / AI / Templates), 19 commands
- [ ] Type `head` → menu filters to Heading 1/2/3
- [ ] Use ↑↓ to navigate, Enter to insert → `# ` (or `## ` etc.) appears at cursor

### 9. Wikilink autocomplete
- [ ] In the editor, type `[[r` (or any letter) → dropdown appears with matching wiki pages
- [ ] ↓ to choose, Enter → inserts `slug]]`

### 10. Save behavior
- [ ] Modify content → top bar shows "Saving…"
- [ ] After 2 seconds → "Saved 1s ago"
- [ ] Press `⌘+S` → immediate save
- [ ] Click "Done" → returns to read view, changes preserved
- [ ] Reload page → changes persist

---

## Tier 3 — Chat + Inline Citations (LLM required, 1 min)

### 11. Chat answer with clickable citations
- [ ] In right-side chat panel, ask a question about something you've actually written about (e.g. `我对 RAG 的看法是什么`)
- [ ] Answer streams in. Should include `[1]`, `[2]` markers between sentences
- [ ] After answer completes, markers render as **amber superscript buttons**
- [ ] **Click a `[1]`** → opens the cited wiki page in left panel
- [ ] Below the answer, "Sources" section lists each `[N]` with title + clickable link
- [ ] Auto-save: if the LLM emitted `[AUTO_SAVE: ...]`, a "Saved to Knowledge" indicator appears under the answer

---

## Tier 4 — AI Commands in Editor (LLM required, 1 min)

### 12. AI continue / summarize / expand / translate
- [ ] Open editor on any article
- [ ] Highlight a paragraph (or place cursor at end of text)
- [ ] Press `/` → choose **Continue writing** → "AI thinking..." → text streams into cursor position
- [ ] Press `/` → **Summarize selection** → replaces selection with summary
- [ ] Press `/` → **Expand bullet** → develops a short note into a paragraph
- [ ] Press `/` → **Translate** → English ↔ Chinese auto-detected

---

## Tier 5 — Browser Extension Capture (5 min)

Prerequisites:
- [ ] Extension loaded (chrome://extensions → Load unpacked → `apps/browser-ext/.output/chrome-mv3/`)
- [ ] Server running

### 13. Pair the extension
- [ ] Web: Devices section → copy the 8-char pair code (e.g. `BU5E-MQVG`)
- [ ] Chrome toolbar: right-click MindBase icon → Options
- [ ] Paste code + device name → Pair
- [ ] Verify: web Devices section now lists the paired browser

### 14. URL capture with live status
- [ ] Open any website (e.g. a Wikipedia article)
- [ ] Press `⌘+Shift+M` (or click the MindBase toolbar icon)
- [ ] Form pre-fills title + URL. Add optional note + tags. Click Save
- [ ] **Popup stays open**, "RECENT" section shows new entry with `queued` badge
- [ ] Toolbar icon shows **amber badge "1"**
- [ ] Within ~10 seconds: status updates to `processing`
- [ ] Within ~60–90 seconds: status updates to `compiled`; badge disappears
- [ ] Click "Open wiki →" → opens the new wiki page in MindBase

### 15. Selection capture
- [ ] Highlight a paragraph on any website
- [ ] Right-click → "Save selection to MindBase"
- [ ] Toolbar badge increments
- [ ] After 60–90s, the selection compiles into a wiki page (check Inbox)

### 16. Screenshot capture
- [ ] Right-click any page → "Save screenshot to MindBase"
- [ ] Visible-tab screenshot captured + uploaded
- [ ] After 60–90s, OCR'd text becomes the wiki page body

### 17. Inbox view in MindBase web
- [ ] Sidebar "Inbox" → all captures listed with status badges
- [ ] Failed entries have "Retry" button
- [ ] Each entry has "Delete" option

---

## Tier 6 — Spaced Repetition (2 min)

### 18. Auto-extract cards from a wiki page
- [ ] Open a content-rich wiki page (≥ a paragraph of substance)
- [ ] Scroll to bottom → "Cards (0)" section → click **Generate**
- [ ] Within 15 seconds: 1–3 Q+A cards appear

### 19. Review View
- [ ] Sidebar "Review" button (with a count badge if cards are due)
- [ ] Card displays the question
- [ ] **Press space** → flip to answer
- [ ] **Press 1 / 2 / 3 / 4** = Forgot / Hard / Good / Easy
- [ ] Card transitions out, next one appears
- [ ] After last card → "All caught up!" empty state

### 20. SRS scheduling (passive check)
- [ ] After answering "Good", the card's `due_at` should be 1 day from now (visible via dev tools or `curl localhost:4321/api/srs/cards | jq`)
- [ ] After "Forgot", `due_at` resets to 1 day; repetitions = 0
- [ ] After "Easy", `due_at` is 4 days

---

## Tier 7 — RSS Auto-Ingest (5 min)

### 21. Subscribe to a feed
- [ ] Settings → "RSS Feeds" section
- [ ] Paste `https://news.ycombinator.com/rss` → click "Add feed"
- [ ] Feed appears in list with auto-fetched name + 0/24h counter

### 22. Force refresh
- [ ] Click "Refresh all" → server polls + ingests new entries
- [ ] Inbox count jumps (sidebar badge)
- [ ] Within 60s the new entries start compiling to wiki pages

### 23. OPML import
- [ ] Have an `.opml` file from any RSS reader (Feedly, Inoreader, etc.)
- [ ] Settings → RSS Feeds → "Import OPML" → upload file
- [ ] Bulk subscribe; all feeds appear in list

### 24. Per-feed config
- [ ] Click ⚙ on a feed → edit tags / project / enabled toggle
- [ ] Disabled feeds aren't polled

---

## Tier 8 — Daily Brief (10 min, optional SMTP)

### 25. Preview without sending
```bash
curl -s http://localhost:4321/api/brief/preview | jq -r .html | open -f -a "Safari"
```
- [ ] Browser opens HTML preview with 200-word summary + clickable `[N]` citations

### 26. Real email (requires SMTP config)
- [ ] Settings → "Daily Brief"
- [ ] Fill: enabled toggle ON, time `09:00`, timezone, recipient email
- [ ] SMTP host (e.g. `smtp.fastmail.com`), port `587`, secure off
- [ ] SMTP user + password (use app-specific password for Gmail/Fastmail)
- [ ] Click "Send test brief"
- [ ] Email arrives within seconds → 200-word summary + each `[N]` is a clickable link back to wiki

---

## Tier 9 — MCP via Claude Code / Cursor (5 min)

Prerequisites: a fresh Claude Code or Cursor session (MCP tools load at session
start).

### 27. Tool surface
- [ ] In new Claude Code session: `/mcp` or ask "what mindbase tools do you have?"
- [ ] Should list ≥27 tools (search/ask/read + RSS + SRS + Brief + write tools)

### 28. ask_wiki with citations
- [ ] Ask: "我 wiki 里对 RAG 有什么看法？"
- [ ] Claude calls `ask_wiki`, response includes `[N]` markers + a citations list with `mindbase://wiki/<slug>` URIs

### 29. add_rss_feed
- [ ] Ask: "subscribe me to https://stratechery.com/feed/"
- [ ] Claude calls `add_rss_feed`; verify in web Settings → RSS Feeds

### 30. list_review_cards + answer_card
- [ ] Ask: "what review cards do I have?"
- [ ] Claude calls `list_review_cards`, presents cards
- [ ] Answer "good" or "forgot" → Claude calls `answer_card`

### 31. save_chat_excerpt
- [ ] After any substantive conversation, ask: "save this as a wiki page titled 'MCP test'"
- [ ] Claude calls `save_chat_excerpt`
- [ ] Verify the new page in MindBase web wiki list, with `created_via: mcp` in its frontmatter

---

## iOS (Xcode required, 15 min)

### 32. iOS Simulator launch
```bash
cd apps/ios && xcodegen generate && open MindBase.xcodeproj
```
- [ ] In Xcode, press ▶ Run (iPhone 16 simulator)
- [ ] App launches, shows TabView with Voice / Inbox / Settings tabs

### 33. iOS pairing
- [ ] Settings tab → "Pair this device" → modal sheet
- [ ] Default server URL is `http://localhost:4321` (Mac running server reachable from sim)
- [ ] Get pair code from MindBase web → paste (or scan QR with iPhone real-device camera)
- [ ] Click "Pair this device" → ✓ Paired

### 34. iOS Voice recorder
- [ ] Voice tab → tap large mic button → records (allow mic permission first time)
- [ ] Tap again to stop → upload begins
- [ ] Status "✓ Saved to inbox" appears
- [ ] Check MindBase web Inbox → new entry with `captured_via: ios`

### 35. iOS Inbox view
- [ ] Inbox tab → list of captures with status badges
- [ ] Pull-to-refresh works

### 36. iOS Share Extension (real device only, simulator is unreliable)
- [ ] Real iPhone: Settings → Safari → any webpage → Share menu → More → enable "MindBase"
- [ ] Now Share menu has MindBase → tap → capture goes to inbox

---

## What's intentionally NOT in this list

- **Android** — your machine has no JDK/Android SDK; the app exists as a code skeleton only
- **Daily Brief cron firing at 09:00** — covered by `pnpm test:e2e` (`brief-scheduler.test.ts`), not worth waiting for manually
- **Visual polish across dark/light mode** — eyeball it; no acceptance criterion
- **MCP server installed in Claude Desktop** — same flow as Claude Code, just edit `~/Library/Application Support/Claude/claude_desktop_config.json`

## When something doesn't work

For each failing item, share:
1. The item number (e.g. "**#14 URL capture**")
2. The exact step that failed and what you saw instead
3. **F12 console** screenshot if it's a web/popup problem
4. **`chrome://extensions` → Inspect service worker → Console** screenshot if it's extension polling
5. Server log tail: `tail -50 /tmp/mindbase-server.log`

I'll fix.

## Automated test suite (for context)

This walkthrough is the **manual** layer. The **automated** test suite covers
most of the backend / API / core logic:

```bash
pnpm test:all     # ~7s — core + server + MCP + extension (Playwright-headed)
pnpm test:web     # ~14s — web UI Playwright (Chromium required)
pnpm test:ios     # ~35s — iOS XCUITest (Xcode required, kept out of test:all)
```

If `test:all` passes, the backend / capture / RSS / SRS / Daily Brief building
logic is healthy. This manual walkthrough catches the things automation can't:
mobile share sheets, real SMTP delivery, LLM output quality, visual polish.
