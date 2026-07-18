import type { Command } from 'commander';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  FileStore, WikiIndex, reindex, createAdapter, compileL1Plan, compileL1Execute,
  ingestFile, ingestPaste,
} from '@mindbase/core';
import prompts from 'prompts';
import { loadConfig } from '../config.js';
import { out } from '../output.js';

export function ingestCmd(program: Command): void {
  program
    .command('ingest <pathOrUrl>')
    .description('Ingest a file or URL — LLM proposes changes, you approve, wiki grows')
    .option('--yes', 'auto-approve all proposed actions')
    .action(async (pathOrUrl: string, opts: { yes?: boolean }) => {
      const cfg = await loadConfig();
      if (!cfg.apiKey) {
        out.err('No API key. Set ANTHROPIC_API_KEY or OPENAI_API_KEY.');
        process.exit(1);
      }
      const store = new FileStore(cfg.dataDir);
      const dbPath = path.join(os.tmpdir(), `mindbase-cli-wiki-${Date.now()}.sqlite`);
      const wikiIndex = WikiIndex.open(dbPath);
      await reindex(store, wikiIndex);
      const adapter = createAdapter(cfg.adapter as 'anthropic' | 'openai' | 'ollama', {
        apiKey: cfg.apiKey,
        model: cfg.model ?? 'claude-opus-4-7',
        ...(cfg.baseUrl ? { baseUrl: cfg.baseUrl } : {}),
      });

      // Ingest the source — text-only for URLs in CLI v0, full file otherwise
      out.info(`Reading source: ${pathOrUrl}`);
      const isUrl = /^https?:\/\//.test(pathOrUrl);
      let rawDoc;
      if (isUrl) {
        rawDoc = await ingestPaste(store, { text: pathOrUrl, title: pathOrUrl });
      } else {
        const buf = await fs.readFile(pathOrUrl);
        const blob = new Blob([new Uint8Array(buf)]);
        const file = new File([blob], path.basename(pathOrUrl));
        rawDoc = await ingestFile(store, file);
      }

      // Plan
      out.info('Planning…');
      const hybridSearch = async (_q: string, _l: number) => [];   // v0 CLI: no hybrid search
      const plan = await compileL1Plan({
        raw: rawDoc, adapter, store, model: cfg.model ?? 'claude-opus-4-7',
        wikiIndex, hybridSearch,
      });

      out.header(`Plan: ${plan.proposed.length} actions`);
      for (const a of plan.proposed) {
        const args = a.call.arguments as Record<string, unknown>;
        const title = (args['name'] ?? args['concept_name'] ?? args['from'] ?? '?') as string;
        out.info(`  ${a.call.name}  ${title}`);
      }

      // Approve
      let approve = opts.yes;
      if (!approve) {
        const resp = await prompts({ type: 'confirm', name: 'go', message: 'Apply all?', initial: true });
        approve = !!resp['go'];
      }
      if (!approve) {
        out.warn('Aborted.');
        wikiIndex.close();
        return;
      }

      // Execute
      out.info('Applying…');
      const approvals = {};   // empty = all approved
      for await (const { action, result } of compileL1Execute(
        { raw: rawDoc, store, wikiIndex },
        plan, approvals,
      )) {
        const args = action.call.arguments as Record<string, unknown>;
        const title = (args['name'] ?? args['concept_name'] ?? '?') as string;
        if (result.ok) out.ok(`${action.call.name}  ${title}`);
        else out.err(`${action.call.name}  ${title}  → ${result.error ?? 'unknown error'}`);
      }
      wikiIndex.close();
      out.header('Done.');
    });
}
