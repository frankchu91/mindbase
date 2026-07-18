# Manual Smoke Checklist

Run after merging substantial work. Should take ~30 minutes.

## Server bootup
- [ ] `pnpm -F @mindbase/server dev` boots without errors
- [ ] `curl localhost:4321/api/devices/pair-code` returns a QR
- [ ] mDNS log line appears

## Web app
- [ ] Loads at localhost:4321 with no console errors
- [ ] Left panel resize works (drag + double-click reset)
- [ ] Settings full-screen mode shows 7 sections
- [ ] Provider / LLM section lets you fill baseUrl/model/apiKey

## Chat + Inline Citations
- [ ] Ask a question that should reference wiki pages
- [ ] Answer shows clickable [N] superscripts
- [ ] Clicking a [N] opens the cited wiki page
- [ ] Sources footer lists each citation

## Wiki editor
- [ ] Open any wiki page, click Edit
- [ ] Type `/` → slash menu appears
- [ ] Pick "Heading 1" → `# ` inserted
- [ ] Type `[[` → wikilink autocomplete works
- [ ] ⌘+S saves, "Saved …" appears
- [ ] AI command (Continue) streams into the editor

## Wikilink hover preview
- [ ] Hover any `[[link]]` in a wiki page for 300ms → popover with title + excerpt
- [ ] Click "Click to open →" navigates

## Graph view
- [ ] Sidebar "Graph" button opens force-directed graph
- [ ] Hubs are visibly larger than orphans
- [ ] Search filters nodes (matching = amber, others = dim)
- [ ] Click node opens its article

## Inbox + capture flow (full)
- [ ] Settings → Provider/LLM → set baseUrl + model
- [ ] Browser extension → pair via QR code from Devices section
- [ ] Save a URL via extension popup
- [ ] Popup shows "queued" → "processing" → "compiled" within ~90s
- [ ] Toolbar icon shows badge count while processing
- [ ] Inbox view shows the entry transitioning states
- [ ] Compiled entry's "View wiki page →" link works

## RSS auto-ingest
- [ ] Settings → RSS Feeds → add `https://news.ycombinator.com/rss`
- [ ] Click "Refresh all" → entries appear in inbox
- [ ] Within 60s the entries compile to wiki pages

## Daily Brief
- [ ] Settings → Daily Brief → fill SMTP + recipient + enable
- [ ] Click "Send test brief" → email arrives
- [ ] Email has `[N]` clickable citations
- [ ] Today's Brief card on home view shows summary

## Spaced Repetition
- [ ] Open a wiki page → CardsOnArticle section → "Generate cards" → 1-3 cards appear
- [ ] Sidebar "Review" badge shows count
- [ ] Open Review view → card displayed
- [ ] Space flips, 3 (Good) advances, "All caught up!" at end

## MCP
- [ ] New Claude Code session → tools include `mcp__mindbase__list_review_cards`, `mcp__mindbase__add_rss_feed`, `mcp__mindbase__generate_daily_brief`
- [ ] Ask Claude "what do I know about X?" → it calls `ask_wiki` and renders citations

## Browser extension
- [ ] Toolbar icon has the mindbase logo
- [ ] Popup form pre-fills title from current tab
- [ ] After save, popup shows new entry below form with "queued" status
- [ ] Background polling updates the status badge live without reopening popup
- [ ] Right-click "Save selection to MindBase" works
- [ ] Right-click "Save screenshot to MindBase" captures the visible tab
- [ ] ⌘+Shift+M shortcut opens popup

## iOS (if you have a paired iPhone)
- [ ] App builds in Xcode on simulator
- [ ] Settings → Pair this device → scan QR → paired
- [ ] Voice tab records, uploads, appears in inbox
- [ ] Share Extension appears in Safari share sheet
- [ ] Sharing a URL from Safari → appears in inbox

## Android (if you have one)
- [ ] App opens in Android Studio, syncs Gradle, builds
- [ ] Same pairing flow as iOS
- [ ] Sharing a URL from Chrome → appears in inbox
