import { Router } from 'express';
import { askQuestion, slugify, AUTO_SAVE_REGEX } from '@mindbase/core';
import type { MetaJson } from '@mindbase/core';
import type { ServerContext } from '../context';

export function askRoutes(ctx: ServerContext): Router {
  const router = Router();

  router.post('/', async (req, res) => {
    const { question, history } = req.body as {
      question: string;
      history?: Array<{ role: 'user' | 'assistant'; text: string }>;
    };
    if (!question?.trim()) {
      res.status(400).json({ ok: false, error: 'question is required' });
      return;
    }

    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    let fullText = '';

    try {
      const adapter = ctx.getAdapter();
      for await (const event of askQuestion({
        question,
        store: ctx.store,
        index: ctx.searchIndex,
        adapter,
        model: ctx.config.model,
        history,
        maxSourceChars: ctx.config.maxContextChars,
      })) {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
        if (event.kind === 'delta') {
          fullText += event.text;
        }
      }

      // Auto-save if enabled and LLM suggested it
      if (ctx.config.autoSave) {
        const match = fullText.match(AUTO_SAVE_REGEX);
        if (match?.[1]) {
          const title = match[1].trim();
          const content = fullText.replace(AUTO_SAVE_REGEX, '').trimEnd();
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
            edit_state: 'auto',
            last_human_edit: null,
          };
          await ctx.store.writeJSON(metaPath, meta);

          // Update INDEX.md
          let indexBody = '';
          try {
            indexBody = await ctx.store.readText('wiki/INDEX.md');
          } catch {
            indexBody = '# MindBase Wiki Index\n\n';
          }
          if (!indexBody.includes(`${slug}.md`)) {
            indexBody = `${indexBody.trimEnd()}\n- [${title}](${mdPath}) — ${title}\n`;
            await ctx.store.writeText('wiki/INDEX.md', indexBody);
          }

          await ctx.reindexWiki();

          // Notify client that auto-save happened
          res.write(`data: ${JSON.stringify({ kind: 'auto_saved', title, path: mdPath })}\n\n`);
        }
      }
    } catch (e) {
      res.write(`data: ${JSON.stringify({ kind: 'error', error: (e as Error).message })}\n\n`);
    }

    res.end();
  });

  return router;
}
