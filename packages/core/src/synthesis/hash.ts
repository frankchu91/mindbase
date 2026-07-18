import { createHash } from 'node:crypto';

/** Stable short hash of a markdown body. Used as cache key fragment. */
export function sourceHashOf(body: string): string {
  const h = createHash('sha256').update(body, 'utf8').digest('hex');
  return `sha256:${h.slice(0, 16)}`;
}

/** Build a slug → hash map from a list of {slug, body} pairs. */
export async function hashMap(
  notes: Array<{ slug: string; body: string }>,
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const n of notes) out[n.slug] = sourceHashOf(n.body);
  return out;
}
