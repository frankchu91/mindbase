// packages/core/src/graph/insights.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryStore } from '../storage/memory_store';
import { buildGraph } from './builder';
import { generateInsights, renderInsightsMarkdown } from './insights';

async function seed(store: MemoryStore, slug: string, body: string, title?: string) {
  await store.writeText(`wiki/notes/${slug}.md`, body);
  await store.writeJSON(`wiki/notes/${slug}.meta.json`, {
    id: `note-${slug}`, type: 'concept', title: title ?? slug,
    created: '2026-01-01T00:00:00Z', updated: '2026-01-01T00:00:00Z',
    sources: [], related: [], one_liner: '', word_count: body.split(/\s+/).length,
    compile_version: 1, edit_state: 'auto', last_human_edit: null,
  });
}

describe('insights', () => {
  let store: MemoryStore;
  beforeEach(() => { store = new MemoryStore(); });

  it('generates a report from a graph', async () => {
    await seed(store, 'a', '# A\n\nLinks to [[B]] and [[C]].');
    await seed(store, 'b', '# B\n\nLinks to [[C]].');
    await seed(store, 'c', '# C');
    await seed(store, 'orphan', '# Orphan\n\nNothing links here.');
    const graph = await buildGraph(store);
    const report = await generateInsights(graph, store);
    expect(report.pageCount).toBe(4);
    expect(report.orphans).toContain('orphan');
    expect(report.hubs[0]?.slug).toBe('c');
  });

  it('renders insights markdown with a graph snapshot', async () => {
    await seed(store, 'a', '# A\n\nLinks to [[B]].');
    await seed(store, 'b', '# B');
    const graph = await buildGraph(store);
    const report = await generateInsights(graph, store);
    const md = renderInsightsMarkdown(report, graph);
    expect(md).toContain('# Wiki Insights');
    expect(md).toContain('GRAPH_SNAPSHOT');
  });

  it('computes delta against previous snapshot', async () => {
    await seed(store, 'a', '# A\n\nLinks to [[B]].');
    await seed(store, 'b', '# B');
    const graph1 = await buildGraph(store);
    const report1 = await generateInsights(graph1, store);
    const md1 = renderInsightsMarkdown(report1, graph1);
    await store.writeText('wiki/_insights.md', md1);

    await seed(store, 'c', '# C');
    const graph2 = await buildGraph(store);
    const report2 = await generateInsights(graph2, store);
    expect(report2.delta?.newPages).toBe(1);
  });
});
