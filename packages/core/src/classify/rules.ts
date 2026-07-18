import type { Store } from '../storage/store';

export const RULES_PATH = 'wiki/classify-rules.md';
export const RULES_MAX_CHARS = 4000;

export class RulesTooLongError extends Error {
  constructor(actual: number) {
    super(`Classify rules exceed ${RULES_MAX_CHARS} chars (got ${actual})`);
    this.name = 'RulesTooLongError';
  }
}

const DEFAULT_RULES = `# How I want my notes classified

(Edit this file to teach the AI your preferences. The AI reads this every time it classifies a note. Keep it under ${RULES_MAX_CHARS} characters.)

1. If you genuinely can't decide, put the note in \`inbox\`.
2. Prefer the existing folder that already contains conceptually similar notes (the AI sees recent titles per folder).
3. If a note clearly belongs to a topic but no matching folder exists yet, fall back to the closest parent (e.g. "knowledge" if "knowledge/<topic>" doesn't exist).
`;

export async function loadClassifyRules(store: Store): Promise<string> {
  try {
    return await store.readText(RULES_PATH);
  } catch {
    return '';
  }
}

export async function saveClassifyRules(store: Store, content: string): Promise<void> {
  if (content.length > RULES_MAX_CHARS) {
    throw new RulesTooLongError(content.length);
  }
  await store.writeText(RULES_PATH, content);
}

export async function ensureDefaultRules(store: Store): Promise<void> {
  const existing = await loadClassifyRules(store);
  if (existing.length > 0) return;
  await store.writeText(RULES_PATH, DEFAULT_RULES);
}
