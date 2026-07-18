interface SynthesisNote { slug: string; title: string; body: string; updated: string; }
interface CandidateNote { slug: string; title: string; summary: string; }

function numberLines(body: string): string {
  return body.split('\n').map((l, i) => `${i + 1}: ${l}`).join('\n');
}

export function buildSynthesisPrompt(opts: {
  topic: string;
  notes: SynthesisNote[];
  schemaPreamble?: string;
}): string {
  const preamble = (opts.schemaPreamble ?? '').trim();
  const preambleBlock = preamble ? `## User schema\n\n${preamble}\n\n---\n\n` : '';
  const noteBlocks = opts.notes
    .map((n) => `--- ${n.slug} (${n.title}, last updated ${n.updated}) ---\n${numberLines(n.body)}`)
    .join('\n\n');

  return `${preambleBlock}You are synthesizing what a user's personal wiki knows about a topic.
The user has written ${opts.notes.length} note(s) on or related to "${opts.topic}".

${noteBlocks}

Produce a JSON object with this exact shape (no extra keys, no markdown fences):
{
  "summary": "<one paragraph, <= 80 words>",
  "threads": [
    {
      "heading": "<concise declarative claim>",
      "content": "<2-4 sentences>",
      "citations": [{"slug": "<note slug>", "line_range": [start, end]}]
    }
  ],
  "contradictions": [
    {
      "with_slug": "<slug>",
      "your_claim_excerpt": "<<= 50 words>",
      "conflicting_claim_excerpt": "<<= 50 words>",
      "confidence": "low" | "medium" | "high",
      "explanation": "<<= 30 words>"
    }
  ],
  "gaps": [
    { "suggestion": "<<= 30 words, actionable>", "related_notes": ["slug",...] }
  ]
}

CONSTRAINTS:
- Every sentence in "content" MUST be backed by at least one citation. Post-processing drops uncited sentences.
- Use line ranges from the source notes shown above. Don't invent line numbers.
- Match the language of the source notes (Chinese → Chinese, English → English, mixed → dominant).
- Don't add facts not present in the notes. Only synthesize, don't extrapolate.
- If notes are short / few / disconnected, return small synthesis. Don't pad.
- Output ONLY the JSON. No prose before or after.`;
}

export function buildContradictionPrompt(opts: {
  notes: SynthesisNote[];
  schemaPreamble?: string;
}): string {
  const preamble = (opts.schemaPreamble ?? '').trim();
  const preambleBlock = preamble ? `## User schema\n\n${preamble}\n\n---\n\n` : '';
  const noteBlocks = opts.notes
    .map((n) => `--- ${n.slug} (${n.title}, ${n.updated}) ---\n${n.body}`)
    .join('\n\n');

  return `${preambleBlock}You're reviewing a personal wiki for self-contradictions.
The user has written these notes:

${noteBlocks}

Find places where the user has made claims that contradict each other across notes.
Return JSON (no markdown fences):
{
  "contradictions": [
    {
      "topic": "<short topic name>",
      "note_a_slug": "...",
      "note_a_claim": "<<= 50 words verbatim or close paraphrase>",
      "note_b_slug": "...",
      "note_b_claim": "<<= 50 words>",
      "confidence": "low" | "medium" | "high",
      "explanation": "<<= 30 words>"
    }
  ]
}

CONSTRAINTS:
- Disagreement over time (user's view evolved) = "low".
- Genuine internal inconsistency = "high".
- Only "medium" or "high" surfaces to the user; tag carefully.
- Max 5 contradictions.
- If unsure, omit.
- Output ONLY the JSON.`;
}

export function buildMissingLinksPrompt(opts: {
  thisNote: { slug: string; title: string; body: string };
  candidates: CandidateNote[];
  schemaPreamble?: string;
}): string {
  const preamble = (opts.schemaPreamble ?? '').trim();
  const preambleBlock = preamble ? `## User schema\n\n${preamble}\n\n---\n\n` : '';
  const candList = opts.candidates
    .map((c) => `· ${c.slug} — "${c.title}" — ${c.summary}`)
    .join('\n');

  return `${preambleBlock}You're looking at one note from a personal wiki and a set of candidate notes
to potentially link.

THIS NOTE:
${opts.thisNote.slug} — "${opts.thisNote.title}"
${opts.thisNote.body}

CANDIDATE NOTES (semantically similar but not currently linked):
${candList}

Return JSON (no markdown fences):
{
  "missing_links": [
    {
      "slug": "candidate-slug",
      "reason": "<<= 25 words>",
      "confidence": "low" | "medium" | "high"
    }
  ]
}

CONSTRAINTS:
- Only return links with confidence >= medium.
- Maximum 3 suggestions.
- Don't suggest links that already appear as [[slug]] in THIS NOTE's body.
- Output ONLY the JSON.`;
}
