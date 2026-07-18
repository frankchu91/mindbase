import type { ChatMessage } from '../types';
import type { Store } from '../storage/store';

const FALLBACK_L2 = `You are Atlas, a wiki health checker. Respond with a JSON array of improvement actions. Return [] if nothing needs fixing.`;

export interface WikiOverview {
  indexContent: string;
  concepts: Array<{ slug: string; title: string; one_liner: string; edit_state: string; word_count: number }>;
  structuralIssues?: {
    orphans: string[];
    brokenLinks: Array<{ source: string; target: string }>;
    fragmentedTags: Array<{ tag: string; pageCount: number; score: number }>;
  };
}

export async function buildL2Messages(overview: WikiOverview, store?: Store): Promise<ChatMessage[]> {
  let instructions = FALLBACK_L2;
  if (store) {
    try {
      instructions = await store.readText('schema/lint.md');
    } catch { /* use fallback */ }
  }

  const conceptList = overview.concepts
    .map((c) => `- ${c.slug}: "${c.one_liner}" (${c.word_count} words, ${c.edit_state})`)
    .join('\n');

  let userContent = `<system-reminder>\n${instructions}\n</system-reminder>

# Current wiki INDEX.md

${overview.indexContent}

# All concepts (${overview.concepts.length} total)

${conceptList}

Please review this wiki and suggest improvements.`;

  if (overview.structuralIssues) {
    const { orphans, brokenLinks, fragmentedTags } = overview.structuralIssues;
    let block = '\n\n## Structural Issues (from graph analysis)\n\n';
    if (orphans.length > 0) {
      block += `### Orphan pages (no incoming links): ${orphans.length}\n`;
      block += orphans.slice(0, 20).map((s) => `- ${s}`).join('\n') + '\n\n';
    }
    if (brokenLinks.length > 0) {
      block += `### Broken wikilinks: ${brokenLinks.length}\n`;
      block += brokenLinks.slice(0, 20).map((b) => `- [[${b.source}]] → ${b.target} (target page does not exist)`).join('\n') + '\n\n';
    }
    if (fragmentedTags.length > 0) {
      block += `### Fragmented tag clusters (low cohesion):\n`;
      block += fragmentedTags.map((c) => `- #${c.tag} — ${c.pageCount} pages, cohesion ${c.score.toFixed(2)}`).join('\n') + '\n\n';
    }
    userContent = userContent + block;
  }

  return [
    {
      role: 'user',
      content: userContent,
    },
  ];
}
