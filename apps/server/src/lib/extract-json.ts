/**
 * Extract a JSON object/array from an LLM response that may include
 * surrounding prose, code fences, or stray punctuation. Small models
 * (llama3, mistral) rarely produce strict JSON without a wrapper.
 */
export function extractJson<T = unknown>(raw: string): T | null {
  const stripped = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  try { return JSON.parse(stripped) as T; } catch { /* fall through */ }

  const start = findFirst(stripped, '{', '[');
  if (start === -1) return null;
  const end = findBalancedEnd(stripped, start);
  if (end === -1) return null;
  try { return JSON.parse(stripped.slice(start, end + 1)) as T; } catch { return null; }
}

function findFirst(s: string, ...chars: string[]): number {
  let best = -1;
  for (const c of chars) {
    const ix = s.indexOf(c);
    if (ix !== -1 && (best === -1 || ix < best)) best = ix;
  }
  return best;
}

function findBalancedEnd(s: string, start: number): number {
  const open = s[start];
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i]!;
    if (escape) { escape = false; continue; }
    if (inString) {
      if (ch === '\\') escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === open) depth++;
    else if (ch === close) { depth--; if (depth === 0) return i; }
  }
  return -1;
}
