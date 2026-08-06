// Mirrors apps/server/src/ops/{types,runner}.ts — the web bundle may not
// value-import from server code, so the wire types are re-declared here.
export type OpAction =
  | { kind: 'create_research_page'; slug: string; markdown: string }
  | { kind: 'update_context'; markdown: string }
  | { kind: 'append_context_section'; section: string; markdown: string }
  | { kind: 'add_wikilinks'; path: string; links: string[] };

export type OpEvent =
  | { kind: 'phase'; phase: string }
  | { kind: 'plan'; planId: string; takeaways: string[]; plan: OpAction[] }
  | { kind: 'applied'; applied: string[]; failed: Array<{ action: string; error: string }> }
  | { kind: 'done' }
  | { kind: 'error'; error: string };

export type OpName = 'contribute' | 'build';

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
