#!/usr/bin/env node
import { createContext } from './context';
import { ingestPaste, compileL1, compileL2, askQuestion, FileStore, WikiIndex, reindex } from '@mindbase/core';
import { makeHybridSearchClosure } from './lib/compile-deps';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';

const args = process.argv.slice(2);
const command = args[0];

async function main() {
  if (!command) {
    console.log('Usage: mindbase <command>\n');
    console.log('Commands:');
    console.log('  serve              Start the web server');
    console.log('  ingest "text"      Ingest text into the knowledge base');
    console.log('  ask "question"     Ask a question against the knowledge base');
    console.log('  lint               Run L2 health check on the wiki');
    console.log('  reindex            Rebuild the graph index from wiki/notes/');
    console.log('  search "query"     Search the knowledge base');
    process.exit(0);
  }

  if (command === 'serve') {
    await import('./index');
    return;
  }

  const ctx = await createContext();

  if (command === 'ingest') {
    const text = args.slice(1).join(' ');
    if (!text.trim()) {
      console.error('Usage: mindbase ingest "some text to ingest"');
      process.exit(1);
    }
    const raw = await ingestPaste(ctx.store, { text });
    console.log(`Ingested raw/${raw.id}`);

    console.log('Compiling...');
    const adapter = ctx.getAdapter();
    const result = await compileL1({ raw, adapter, store: ctx.store, model: ctx.config.model, wikiIndex: ctx.wikiIndex, hybridSearch: makeHybridSearchClosure(ctx) });
    if (result.ok) {
      await ctx.reindexWiki();
      console.log(`Compiled successfully (${result.tool_results.length} actions)`);
    } else {
      console.error(`Compile failed: ${result.error}`);
    }
    return;
  }

  if (command === 'ask') {
    const question = args.slice(1).join(' ');
    if (!question.trim()) {
      console.error('Usage: mindbase ask "your question"');
      process.exit(1);
    }
    const adapter = ctx.getAdapter();
    for await (const event of askQuestion({
      question,
      store: ctx.store,
      index: ctx.searchIndex,
      adapter,
      model: ctx.config.model,
    })) {
      switch (event.kind) {
        case 'progress':
          process.stderr.write(`[${event.phase}${event.detail ? `: ${event.detail}` : ''}]\n`);
          break;
        case 'delta':
          process.stdout.write(event.text);
          break;
        case 'done':
          process.stdout.write('\n');
          if (event.citations.length > 0) {
            process.stderr.write('\nSources:\n');
            event.citations.forEach((c, i) => process.stderr.write(`  [${i + 1}] ${c.title} (${c.path})\n`));
          }
          break;
        case 'error':
          console.error(`Error: ${event.error}`);
          process.exit(1);
      }
    }
    return;
  }

  if (command === 'lint') {
    console.log('Running L2 health check...');
    const adapter = ctx.getAdapter();
    const result = await compileL2({ adapter, store: ctx.store, model: ctx.config.model });
    if (result.ok) {
      await ctx.reindexWiki();
      console.log(`L2 complete: ${result.tool_results.length} actions applied`);
      for (const tr of result.tool_results) {
        console.log(`  - ${tr.call.name}: ${tr.result.ok ? 'ok' : tr.result.error}`);
      }
    } else {
      console.error(`L2 failed: ${result.error}`);
    }
    return;
  }

  if (command === 'reindex') {
    const dataDir = process.env['MINDBASE_DATA_DIR'] ?? path.join(os.homedir(), 'mindbase-data');
    const store = new FileStore(dataDir);
    await fs.mkdir(path.join(dataDir, '.index'), { recursive: true });
    const index = WikiIndex.open(path.join(dataDir, '.index', 'db.sqlite'));
    console.log(`[reindex] scanning ${dataDir} …`);
    const r = await reindex(store, index);
    console.log(
      `[reindex] done — ${r.pagesProcessed} pages, ${r.linksWritten} links, ` +
      `${r.pagesRemoved} phantoms removed, ${r.durationMs}ms`,
    );
    index.close();
    process.exit(0);
  }

  if (command === 'search') {
    const query = args.slice(1).join(' ');
    if (!query.trim()) {
      console.error('Usage: mindbase search "your query"');
      process.exit(1);
    }
    const results = ctx.searchIndex.search(query);
    if (results.length === 0) {
      console.log('No results found.');
    } else {
      for (const r of results) {
        console.log(`  ${r.title} (${r.path}) — score: ${r.score.toFixed(1)}`);
      }
    }
    return;
  }

  console.error(`Unknown command: ${command}`);
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
