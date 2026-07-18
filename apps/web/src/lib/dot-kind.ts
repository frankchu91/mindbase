// apps/web/src/lib/dot-kind.ts

export type DotKind = 'person' | 'company' | 'concept' | 'source' | 'chat';

export interface DotInput {
  slug: string;
  title: string;
  type: string;
}

/** Heuristic — picks a dot color category based on slug + title cues. */
export function detectDotKind(node: DotInput): DotKind {
  if (node.type === 'source') return 'source';

  if (node.slug.startsWith('entities/')) {
    if (/\b(inc|llc|corp|ai|labs|co)\b/i.test(node.title) || node.title.includes('.')) {
      return 'company';
    }
    return 'person';
  }

  // Heuristic: "First Last" pattern (two TitleCase words) → person
  if (/^[A-Z][a-z]+ [A-Z][a-z]+$/.test(node.title)) return 'person';

  // Heuristic: looks like a brand/company (contains ".ai", "AI", "Labs", etc.)
  if (/\b(AI|Labs|Inc|Co)\b|\.ai|\.com/.test(node.title)) return 'company';

  return 'concept';
}

/** CSS color value for a dot kind (uses Twilight tokens). */
export function dotColor(kind: DotKind): string {
  switch (kind) {
    case 'person': return 'var(--accent-azure)';
    case 'company': return 'var(--accent-amber)';
    case 'source': return 'rgba(180, 180, 200, 0.5)';
    case 'chat': return 'rgba(180, 180, 200, 0.5)';
    case 'concept':
    default: return 'rgba(255, 255, 255, 0.4)';
  }
}
