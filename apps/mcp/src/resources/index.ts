// apps/mcp/src/resources/index.ts
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { ListResourcesRequestSchema, ReadResourceRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import type { Context } from '../context.js';
import type { MetaJson } from '@mindbase/core';
import { getHubs, getOrphans } from '@mindbase/core';

export function registerResources(server: Server, ctx: Context): void {
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    const resources: Array<{ uri: string; name: string; description: string; mimeType: string }> = [];

    // Static well-known resources
    resources.push({ uri: 'mindbase://recent', name: 'Recent activity', description: 'Last 7 days of wiki updates', mimeType: 'text/markdown' });
    resources.push({ uri: 'mindbase://hubs', name: 'Top hubs', description: 'Most-linked-to pages', mimeType: 'text/markdown' });
    resources.push({ uri: 'mindbase://orphans', name: 'Orphan pages', description: 'Pages with no incoming links', mimeType: 'text/markdown' });
    resources.push({ uri: 'mindbase://insights', name: 'Wiki insights report', description: 'Structural analysis of the wiki', mimeType: 'text/markdown' });

    // All wiki pages
    try {
      const entries = await ctx.store.listDir('wiki/notes');
      for (const entry of entries) {
        if (entry.kind !== 'file' || !entry.name.endsWith('.md')) continue;
        const slug = entry.name.replace(/\.md$/, '');
        let title = slug;
        let one = '';
        try {
          const m = await ctx.store.readJSON<MetaJson>(`wiki/notes/${slug}.meta.json`);
          title = m.title;
          one = m.one_liner ?? '';
        } catch { /* ok */ }
        resources.push({ uri: `mindbase://wiki/${slug}`, name: title, description: one, mimeType: 'text/markdown' });
      }
    } catch { /* ok */ }

    // All chats
    try {
      const entries = await ctx.store.listDir('chats');
      for (const entry of entries) {
        if (entry.kind !== 'file' || !entry.name.endsWith('.json')) continue;
        const id = entry.name.replace(/\.json$/, '');
        try {
          const s = await ctx.store.readJSON<{ id: string; title: string }>(`chats/${entry.name}`);
          resources.push({ uri: `mindbase://chats/${s.id}`, name: `Chat: ${s.title}`, description: '', mimeType: 'text/markdown' });
        } catch { /* skip */ }
      }
    } catch { /* ok */ }

    return { resources };
  });

  server.setRequestHandler(ReadResourceRequestSchema, async (req) => {
    const uri = req.params.uri;

    // mindbase://wiki/<slug>
    const wikiMatch = uri.match(/^mindbase:\/\/wiki\/(.+)$/);
    if (wikiMatch) {
      const slug = wikiMatch[1]!;
      const body = await ctx.store.readText(`wiki/notes/${slug}.md`);
      return { contents: [{ uri, mimeType: 'text/markdown', text: body }] };
    }

    // mindbase://chats/<id>
    const chatMatch = uri.match(/^mindbase:\/\/chats\/(.+)$/);
    if (chatMatch) {
      const id = chatMatch[1]!;
      const s = await ctx.store.readJSON<{ id: string; title: string; messages: Array<{ role: string; text: string }> }>(`chats/${id}.json`);
      let md = `# ${s.title}\n\n`;
      for (const m of s.messages) {
        md += `## ${m.role}\n\n${m.text}\n\n`;
      }
      return { contents: [{ uri, mimeType: 'text/markdown', text: md }] };
    }

    // mindbase://recent
    if (uri === 'mindbase://recent') {
      const cutoff = Date.now() - 7 * 86400_000;
      const lines: string[] = ['# Recent activity (7 days)\n'];
      const entries = await ctx.store.listDir('wiki/notes');
      const items: Array<{ slug: string; title: string; updated: string }> = [];
      for (const entry of entries) {
        if (entry.kind !== 'file' || !entry.name.endsWith('.meta.json')) continue;
        const slug = entry.name.replace(/\.meta\.json$/, '');
        try {
          const m = await ctx.store.readJSON<MetaJson>(`wiki/notes/${entry.name}`);
          const t = new Date(m.updated).getTime();
          if (Number.isFinite(t) && t >= cutoff) {
            items.push({ slug, title: m.title, updated: m.updated });
          }
        } catch { /* skip */ }
      }
      items.sort((a, b) => b.updated.localeCompare(a.updated));
      for (const it of items) lines.push(`- [[${it.slug}]] — ${it.title} (${it.updated.slice(0, 10)})`);
      return { contents: [{ uri, mimeType: 'text/markdown', text: lines.join('\n') }] };
    }

    // mindbase://hubs
    if (uri === 'mindbase://hubs') {
      const graph = ctx.wikiIndex.buildGraph();
      const hubs = getHubs(graph, 10);
      let md = '# Top hubs\n\n';
      for (const h of hubs) md += `- [[${h.slug}]] (${h.incoming} incoming) — ${h.title}\n`;
      return { contents: [{ uri, mimeType: 'text/markdown', text: md }] };
    }

    // mindbase://orphans
    if (uri === 'mindbase://orphans') {
      const graph = ctx.wikiIndex.buildGraph();
      const orphans = getOrphans(graph);
      let md = `# Orphan pages (${orphans.length})\n\n`;
      for (const slug of orphans) {
        const n = graph.nodes.get(slug);
        md += `- [[${slug}]] — ${n?.title ?? slug}\n`;
      }
      return { contents: [{ uri, mimeType: 'text/markdown', text: md }] };
    }

    // mindbase://insights
    if (uri === 'mindbase://insights') {
      try {
        const text = await ctx.store.readText('wiki/_insights.md');
        return { contents: [{ uri, mimeType: 'text/markdown', text }] };
      } catch {
        return { contents: [{ uri, mimeType: 'text/markdown', text: '# No insights yet\n\nRun `run_wiki_health` to generate.' }] };
      }
    }

    throw new Error(`Unknown resource URI: ${uri}`);
  });
}
