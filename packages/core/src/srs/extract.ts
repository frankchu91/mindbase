import type { LLMAdapter } from '../adapters/types';
import type { ChatMessage } from '../types';

export interface ExtractedCard {
  question: string;
  answer: string;
  excerpt?: string;
}

export interface ExtractOptions {
  adapter: LLMAdapter;
  model: string;
  page: { title: string; one_liner: string; body: string; slug: string };
  max_cards?: number;
}

export const EXTRACT_PROMPT = `You are extracting spaced-repetition review cards from a knowledge wiki page. Identify the 1-3 most valuable facts, definitions, or insights worth remembering long-term.

For each card:
- Write a specific, answerable question (NOT "what is X?" — too vague). Good questions test understanding.
- Write a concise answer (1-2 sentences max).
- Optionally include a short "excerpt" (a 1-2 sentence quote from the page).

Skip cards entirely if:
- The page is < 100 words
- The content is purely procedural / tutorial (low retention value)
- The content is opinion or analysis without a discrete fact

Return a JSON array only. No prose. No markdown fences.

Format:
[{"question": "...", "answer": "...", "excerpt": "..."}]

If no cards are appropriate, return [].`;

export async function extractCards(opts: ExtractOptions): Promise<ExtractedCard[]> {
  const max = opts.max_cards ?? 3;
  const userMessage = `# Wiki page
Title: ${opts.page.title}
One-liner: ${opts.page.one_liner}

${opts.page.body}

Generate up to ${max} cards. Return JSON only.`;

  const messages: ChatMessage[] = [
    { role: 'user', content: `${EXTRACT_PROMPT}\n\n${userMessage}` },
  ];

  let fullText = '';
  for await (const chunk of opts.adapter.chat({
    model: opts.model,
    messages,
    max_tokens: 1024,
    temperature: 0.2,
  })) {
    if (chunk.kind === 'delta') fullText += chunk.text;
    if (chunk.kind === 'error') throw new Error(chunk.error);
  }

  return parseExtractedCards(fullText, max);
}

export function parseExtractedCards(text: string, max: number): ExtractedCard[] {
  // Strip markdown code fences if present
  let cleaned = text.trim();
  const fenceMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenceMatch) cleaned = fenceMatch[1]?.trim() ?? cleaned;

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const out: ExtractedCard[] = [];
  for (const item of parsed) {
    if (typeof item !== 'object' || item == null) continue;
    const q = (item as Record<string, unknown>).question;
    const a = (item as Record<string, unknown>).answer;
    if (typeof q !== 'string' || typeof a !== 'string') continue;
    if (q.trim().length < 5 || a.trim().length < 2) continue;
    const excerpt = typeof (item as Record<string, unknown>).excerpt === 'string'
      ? (item as Record<string, unknown>).excerpt as string
      : undefined;
    out.push({ question: q.trim(), answer: a.trim(), excerpt });
    if (out.length >= max) break;
  }
  return out;
}
