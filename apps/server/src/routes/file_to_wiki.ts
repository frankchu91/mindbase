import { Router } from 'express';
import type { MetaJson } from '@mindbase/core';
import { createAdapter, slugify } from '@mindbase/core';
import type { ServerContext } from '../context';

async function generateTitle(ctx: ServerContext, content: string): Promise<string> {
  try {
    const adapter = ctx.getAdapter();
    let title = '';
    for await (const chunk of adapter.chat({
      model: ctx.config.model,
      messages: [
        {
          role: 'user',
          content: `<system-reminder>Generate a short, descriptive title (max 8 words) for the following knowledge note. Output ONLY the title, nothing else.</system-reminder>\n\n${content.slice(0, 1000)}`,
        },
      ],
      max_tokens: 30,
      temperature: 0.2,
    })) {
      if (chunk.kind === 'delta') title += chunk.text;
    }
    // Clean up: remove quotes, trailing periods
    title = title.trim().replace(/^["']|["']$/g, '').replace(/\.$/, '').trim();
    return title || 'Untitled Note';
  } catch (e) {
    console.warn('[file-to-wiki] Title generation failed:', (e as Error).message);
    return 'Untitled Note';
  }
}

export function fileToWikiRoutes(ctx: ServerContext): Router {
  const router = Router();

  router.post('/', async (req, res) => {
    try {
      let { title, content } = req.body as { title?: string; content: string };
      if (!content?.trim()) {
        res.status(400).json({ ok: false, error: 'content required' });
        return;
      }

      // Generate title with LLM if not provided or if it looks like raw content
      if (!title || title.length > 80 || title.startsWith('Based on') || title.startsWith('The ') || title.startsWith('Here')) {
        title = await generateTitle(ctx, content);
      }

      const slug = slugify(title);
      const mdPath = `wiki/notes/${slug}.md`;
      const metaPath = `wiki/notes/${slug}.meta.json`;

      await ctx.store.writeText(mdPath, `# ${title}\n\n${content}\n`);
      const meta: MetaJson = {
        id: `note-${slug}`,
        type: 'concept',
        title,
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        sources: [],
        related: [],
        one_liner: title,
        word_count: content.split(/\s+/).length,
        compile_version: 1,
        edit_state: 'human_touched',
        last_human_edit: new Date().toISOString(),
      };
      await ctx.store.writeJSON(metaPath, meta);

      // Add to INDEX.md
      let indexBody = '';
      if (await ctx.store.exists('wiki/INDEX.md')) {
        indexBody = await ctx.store.readText('wiki/INDEX.md');
      } else {
        indexBody = '# MindBase Wiki Index\n\n';
      }
      if (!indexBody.includes(`${slug}.md`)) {
        indexBody = `${indexBody.trimEnd()}\n- [${title}](${mdPath}) — ${title}\n`;
        await ctx.store.writeText('wiki/INDEX.md', indexBody);
      }

      await ctx.reindexWiki();
      res.json({ ok: true, path: mdPath, title });
    } catch (e) {
      res.status(500).json({ ok: false, error: (e as Error).message });
    }
  });

  return router;
}
