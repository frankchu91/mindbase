// apps/mcp/src/lib/markdown-bundle.ts
import type { Store, PageGraph } from '@mindbase/core';

export async function bundlePages(store: Store, graph: PageGraph, slugs: string[]): Promise<string> {
  let out = `# Subgraph Export — ${new Date().toISOString()}\n\n`;
  out += `Pages included: ${slugs.length}\n\n`;
  out += `## Index\n\n`;
  for (const slug of slugs) {
    const node = graph.nodes.get(slug);
    out += `- [[${slug}]] — ${node?.title ?? slug}\n`;
  }
  out += `\n---\n\n`;
  for (const slug of slugs) {
    try {
      const body = await store.readText(`wiki/notes/${slug}.md`);
      out += `## ${slug}\n\n${body}\n\n---\n\n`;
    } catch { /* skip */ }
  }
  return out;
}
