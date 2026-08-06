// Mirrors apps/server/src/ops/{types,runner}.ts — the web bundle may not
// value-import from server code, so the wire types are re-declared here.
export type OpAction =
  | { kind: 'create_research_page'; slug: string; markdown: string }
  | { kind: 'update_context'; markdown: string }
  | { kind: 'append_context_section'; section: string; markdown: string }
  | { kind: 'add_wikilinks'; path: string; links: string[] };

export type FindingKind =
  | 'contradiction' | 'stale' | 'orphan' | 'missing_page'
  | 'missing_link' | 'gap' | 'question';

export interface Finding {
  id: string;
  kind: FindingKind;
  pages: string[];
  detail: string;
  dismissed: boolean;
}

export type OpEvent =
  | { kind: 'phase'; phase: string }
  | { kind: 'plan'; planId: string; takeaways: string[]; plan: OpAction[] }
  | { kind: 'applied'; applied: string[]; failed: Array<{ action: string; error: string }>; note?: string }
  | { kind: 'findings'; date: string; findings: Finding[] }
  | { kind: 'done' }
  | { kind: 'error'; error: string };

export type OpName = 'contribute' | 'build' | 'lint' | 'research';

export const FINDING_LABEL: Record<FindingKind, string> = {
  contradiction: 'contradiction',
  stale: 'stale claim',
  orphan: 'orphan page',
  missing_page: 'missing page',
  missing_link: 'missing link',
  gap: 'gap',
  question: 'question',
};

export const FINDING_COLOR: Record<FindingKind, string> = {
  contradiction: '#e5484d',
  stale: '#e8a13c',
  orphan: '#8e8e93',
  missing_page: '#5e76f0',
  missing_link: '#5e76f0',
  gap: '#b08fe8',
  question: '#34a853',
};

export function actionTarget(a: OpAction): string {
  switch (a.kind) {
    case 'create_research_page': return `sources/research/${a.slug}.md`;
    case 'update_context':
    case 'append_context_section': return 'context.md';
    case 'add_wikilinks': return a.path;
  }
}

export function actionPreview(a: OpAction): string {
  const text = a.kind === 'add_wikilinks'
    ? `link → ${a.links.join(', ')}`
    : a.kind === 'append_context_section'
      ? `${a.section}: ${a.markdown}`
      : a.markdown;
  const oneLine = text.replace(/\s+/g, ' ').trim();
  return oneLine.length > 80 ? `${oneLine.slice(0, 80)}…` : oneLine;
}

export const ACTION_BADGE: Record<OpAction['kind'], string> = {
  create_research_page: 'new page',
  update_context: 'rewrite context',
  append_context_section: 'append',
  add_wikilinks: 'link',
};
