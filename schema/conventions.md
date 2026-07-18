# MindBase Wiki Conventions

## Page Structure

Every wiki page should have YAML frontmatter:

```yaml
---
title: Page Title
tags: [tag1, tag2]
sources: [raw-id-1, raw-id-2]
created: 2026-04-25T10:00:00Z
updated: 2026-04-25T10:00:00Z
provenance:
  extracted: 0.7
  inferred: 0.25
  ambiguous: 0.05
---
```

## Naming

- Slugs are lowercase-hyphenated: `soumith-chintala`, `thinking-machines-lab`
- Page titles use Title Case: "Soumith Chintala", "Thinking Machines Lab"
- One page per entity (person, company, product) and per concept (idea, trend, methodology)

## Linking

- Use [[wikilinks]] to connect pages: `[[Soumith Chintala]]` or `[[thinking-machines-lab|Thinking Machines Lab]]`
- Every page should have at least 2-3 outgoing wikilinks
- Bidirectional links are preferred (if A links to B, B should link back to A)

## Provenance Markers

- No marker = Extracted (source explicitly states this)
- `^[inferred]` = Inferred (synthesis, generalization)
- `^[ambiguous]` = Ambiguous (sources disagree)

## Special Files

- `wiki/INDEX.md` — Master index of all pages
- `wiki/log.md` — Chronological operation log
- `wiki/hot.md` — Session cache (~500 words of recent context)
- `.manifest.json` — Ingest tracking and deduplication
