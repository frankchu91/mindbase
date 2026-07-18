/**
 * Extract named H2 sections from schema.md so compile / lint / query
 * prompts can inject relevant guidance into their system prompts.
 *
 * Karpathy's pattern (docs/llm-wiki.md): the schema is "the per-project
 * conventions file the LLM reads at every operation."
 *
 * This module provides parseSchemaSections() which pulls out the named
 * sections so the LLM can use them contextually. For example, the compile
 * prompt can say "Here are the page conventions the user defined:" before
 * injecting conventions?.
 */

import type { Store } from '../storage/store';
import { loadSchema } from './schema';

export interface SchemaSections {
  conventions?: string;
  types?: string;
  linking?: string;
  ingestPrefs?: string;
}

/**
 * Extract named H2 sections from schema.md body text.
 *
 * Supported section headers (case-insensitive, partial match):
 *   - "Page conventions"
 *   - "Page types"
 *   - "Linking conventions"
 *   - "Ingest preferences" or "Ingest workflow preferences"
 *
 * Each section body is everything from the H2 header to the next H2 or EOF.
 * Returns a map of section name → body text (with header + body trimmed).
 *
 * Example:
 *   const body = `## Page conventions\nUse H1 for titles.\n\n## Linking conventions\nUse cites.`;
 *   const s = parseSchemaSections(body);
 *   // { conventions: "## Page conventions\nUse H1 for titles.", linking: "## Linking conventions\nUse cites." }
 */
export function parseSchemaSections(body: string): SchemaSections {
  const sections: SchemaSections = {};

  const matchers: Array<[keyof SchemaSections, RegExp]> = [
    ['conventions', /^##\s+Page conventions\b/im],
    ['types', /^##\s+Page types\b/im],
    ['linking', /^##\s+Linking conventions\b/im],
    // Match either "Ingest preferences" or "Ingest workflow preferences"
    ['ingestPrefs', /^##\s+Ingest\s+(?:workflow\s+)?preferences\b/im],
  ];

  for (const [key, re] of matchers) {
    const m = re.exec(body);
    if (!m) continue;

    const startIdx = m.index;
    const after = body.slice(startIdx);

    // Find the next H2 header after this one (look for \n## to avoid matching at startIdx)
    const nextH2 = /\n##\s+/.exec(after.slice(1));

    // Extract section body: from current header to next H2, or to EOF
    const sectionBody = nextH2 ? after.slice(0, nextH2.index + 1) : after;

    sections[key] = sectionBody.trim();
  }

  return sections;
}

/**
 * Load schema from store and extract named sections.
 * Convenience wrapper for parseSchemaSections(loadSchema()).
 */
export async function loadSchemaSections(store: Store): Promise<SchemaSections> {
  const body = await loadSchema(store);
  return parseSchemaSections(body);
}
