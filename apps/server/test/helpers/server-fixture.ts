/**
 * Test fixture helper: boots a real Express server against a tmpdir
 * with a deterministic mock LLM adapter (no real API keys needed).
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express from 'express';
import type { Server } from 'node:http';
import { createContext } from '../../src/context';
import { ingestRoutes } from '../../src/routes/ingest';
import { compileRoutes } from '../../src/routes/compile';
import { ingestStreamRoutes } from '../../src/routes/ingest-stream';
import { askRoutes } from '../../src/routes/ask';
import { wikiRoutes } from '../../src/routes/wiki';
import { fileToWikiRoutes } from '../../src/routes/file_to_wiki';
import { configRoutes } from '../../src/routes/config';
import { lintRoutes } from '../../src/routes/lint';
import { searchRoutes } from '../../src/routes/search';
import { chatRoutes } from '../../src/routes/chats';
import { crosslinkRoutes } from '../../src/routes/crosslink';
import { googleRoutes } from '../../src/routes/google';
import { graphRoutes } from '../../src/routes/graph';
import { agentHistoryRoutes } from '../../src/routes/agent-history';
import { semanticSearchRoutes } from '../../src/routes/semantic-search';
import { obsidianRoutes } from '../../src/routes/obsidian';
import { captureRoutes } from '../../src/routes/capture';
import { devicesRoutes } from '../../src/routes/devices';
import { inboxRoutes } from '../../src/routes/inbox';
import { briefRoutes } from '../../src/routes/brief';
import { feedsRoutes } from '../../src/routes/feeds';
import { srsRoutes } from '../../src/routes/srs';
import { synthesizeRoutes } from '../../src/routes/synthesize';
import { networkRoutes } from '../../src/routes/network';
import { pulseRoutes } from '../../src/routes/pulse';
import { schemaRoutes } from '../../src/routes/schema';
import { insightsRoutes } from '../../src/routes/insights';
import { CaptureWorker } from '../../src/lib/capture-worker';
import { BriefScheduler } from '../../src/lib/brief-scheduler';
import { RSSWorker } from '../../src/lib/rss-worker';
import { SRSExtractor } from '../../src/lib/srs-worker';
import type { LLMAdapter } from '@mindbase/core';
import type { ServerContext } from '../../src/context';

// ---------------------------------------------------------------------------
// Mock LLM adapter — deterministic, no network, no API keys
// ---------------------------------------------------------------------------
export function mockAdapter(): LLMAdapter {
  return {
    name: 'openai' as const,
    supportsTools: false,
    estimateTokens: (text: string) => Math.ceil(text.length / 4),
    testConnection: async () => ({ ok: true }),
    async *chat(req) {
      const userMsg =
        (req.messages.find((m) => m.role === 'user')?.content as string) ?? '';
      // lastMsg is the most-recent user message; in multi-turn compileL1 loops
      // it carries tool results from the previous turn (e.g. "Tool read_concept(...) returned:...").
      const lastMsg =
        ([...req.messages].reverse().find((m) => m.role === 'user')?.content as string) ?? userMsg;

      // Karpathy revision-ingest test fixture: 3-turn scripted flow for raw doc about Sam Altman
      // Order matters: most-specific (later turns) must be checked first because the
      // accumulated prompt grows and earlier turn's keywords are still present.
      if (lastMsg.includes('Tool append_to_concept')) {
        // Turn 3 — after append was executed, wrap up with a text summary
        yield { kind: 'delta' as const, text: 'Done.' };
        yield { kind: 'done' as const, usage: { input_tokens: 30, output_tokens: 5 } };
        return;
      }
      if (lastMsg.includes('Tool read_concept') && lastMsg.includes('sam-altman')) {
        // Turn 2 — read_concept result returned; now append to the existing concept
        yield {
          kind: 'tool_call' as const,
          tool_call: {
            id: 'mock-2',
            name: 'append_to_concept',
            arguments: {
              concept_name: 'sam-altman',
              section: 'Recent Updates',
              content: 'Sam Altman returned to the OpenAI board in 2026.',
              raw_id: 'sam-update-test',
            },
          },
        };
        yield { kind: 'done' as const, usage: { input_tokens: 50, output_tokens: 30 } };
        return;
      }
      if (userMsg.includes('Sam Altman') && !lastMsg.includes('Tool ')) {
        // Turn 1 — initial ingest: index shows sam-altman exists; read it first
        yield {
          kind: 'tool_call' as const,
          tool_call: { id: 'mock-1', name: 'read_concept', arguments: { slug: 'sam-altman' } },
        };
        yield { kind: 'done' as const, usage: { input_tokens: 100, output_tokens: 20 } };
        return;
      }

      // compileL1 path: the prompt contains "Raw id:" from buildL1Messages
      if (userMsg.includes('Raw id:') || userMsg.includes('create_concept') || userMsg.includes('wiki compiler')) {
        // Extract the raw id from the prompt so the tool executor can create
        // the right page. Format from prompts.ts: "Raw id: <id>"
        const rawIdMatch = userMsg.match(/Raw id:\s*(\S+)/);
        const rawId = rawIdMatch?.[1] ?? 'unknown';
        // Use a unique concept name per raw doc so repeated compiles don't collide
        const conceptName = `Compiled Concept ${rawId.slice(-6)}`;
        yield {
          kind: 'delta' as const,
          text: `\`\`\`json\n[{"action":"create_concept","name":"${conceptName}","one_liner":"Automatically compiled test page","initial_content":"This is the body of the compiled test concept page with enough characters to satisfy any minimum length requirement in the system.","raw_id":"${rawId}"}]\n\`\`\``,
        };
        yield { kind: 'done' as const, usage: { input_tokens: 200, output_tokens: 80 } };
        return;
      }

      // SRS extraction path
      if (userMsg.includes('spaced-repetition') || userMsg.includes('review cards') || userMsg.includes('extracting')) {
        yield {
          kind: 'delta' as const,
          text: '[{"question":"What is the bottleneck of RAG?","answer":"Not retrieval, but chunking strategy.","excerpt":"Chunking is the key engineering challenge."}]',
        };
        yield { kind: 'done' as const, usage: { input_tokens: 150, output_tokens: 50 } };
        return;
      }

      // Daily brief path
      if (userMsg.includes('morning brief') || userMsg.includes('200-word') || userMsg.includes('brief')) {
        yield {
          kind: 'delta' as const,
          text: 'You captured 3 things yesterday [1]. They cluster around topic X [2]. Worth following up [1][2].',
        };
        yield { kind: 'done' as const, usage: { input_tokens: 80, output_tokens: 40 } };
        return;
      }

      // synthesis path: prompt starts with "You are synthesizing what a user's personal wiki"
      if (userMsg.includes('synthesizing what a user') || userMsg.includes('"threads"')) {
        yield { kind: 'delta' as const, text: JSON.stringify({
          summary: 'Mock synthesis of the topic.',
          threads: [{
            heading: 'Thread heading',
            content: 'A sentence [rag-1:1-1].',
            citations: [{ slug: 'rag-1', line_range: [1, 1] }],
          }],
          contradictions: [],
          gaps: [],
        })};
        yield { kind: 'done' as const, usage: { input_tokens: 100, output_tokens: 50 } };
        return;
      }

      // missing-links prompt path (Engine C / network): contains "CANDIDATE NOTES"
      if (userMsg.includes('CANDIDATE NOTES')) {
        yield { kind: 'delta' as const, text: JSON.stringify({ missing_links: [] }) };
        yield { kind: 'done' as const, usage: { input_tokens: 50, output_tokens: 20 } };
        return;
      }

      // contradiction detection path (Engine B / pulse): contains "self-contradictions"
      if (userMsg.includes('self-contradictions') || userMsg.includes('"contradictions"')) {
        yield { kind: 'delta' as const, text: JSON.stringify({ contradictions: [] }) };
        yield { kind: 'done' as const, usage: { input_tokens: 50, output_tokens: 20 } };
        return;
      }

      // ask_wiki / wiki context path
      if (userMsg.includes('# Wiki context') || userMsg.includes('wiki') || userMsg.includes('context')) {
        yield {
          kind: 'delta' as const,
          text: 'The user is interested in topic X [1]. The wiki notes this further [2]. [AUTO_SAVE: Test note]',
        };
        yield { kind: 'done' as const, usage: { input_tokens: 100, output_tokens: 50 } };
        return;
      }

      // Generic / AI-complete path
      yield { kind: 'delta' as const, text: 'Generic mock response from the LLM adapter.' };
      yield { kind: 'done' as const, usage: { input_tokens: 10, output_tokens: 8 } };
    },
  } as LLMAdapter;
}

// ---------------------------------------------------------------------------
// Boot helper
// ---------------------------------------------------------------------------
export interface TestServer {
  url: string;
  dataDir: string;
  ctx: ServerContext;
  captureWorker: CaptureWorker;
  close: () => Promise<void>;
}

export async function bootTestServer(): Promise<TestServer> {
  const dataDir = mkdtempSync(join(tmpdir(), 'mb-e2e-'));
  process.env['MINDBASE_DATA_DIR'] = dataDir;

  const ctx = await createContext(dataDir);
  // Override the real adapter with our deterministic mock
  ctx.getAdapter = () => mockAdapter();

  const captureWorker = new CaptureWorker(ctx, ctx.inbox);
  ctx.captureWorker = captureWorker;

  const briefScheduler = new BriefScheduler(ctx);
  ctx.briefScheduler = briefScheduler;

  const rssWorker = new RSSWorker(ctx, ctx.feeds, ctx.inbox);
  ctx.rssWorker = rssWorker;

  const srsExtractor = new SRSExtractor(ctx, ctx.cards);
  ctx.srsExtractor = srsExtractor;

  const app = express();
  app.use(express.json({ limit: '10mb' }));

  // Mirror the route registration order from apps/server/src/index.ts
  app.use('/api/ingest', ingestRoutes(ctx));
  app.use('/api/compile', compileRoutes(ctx));
  app.use('/api/wiki/ingest-stream', ingestStreamRoutes(ctx));
  app.use('/api/ask', askRoutes(ctx));
  app.use('/api/wiki/file', fileToWikiRoutes(ctx));
  app.use('/api/wiki/insights', insightsRoutes(ctx));
  app.use('/api/wiki', wikiRoutes(ctx));
  app.use('/api/config', configRoutes(ctx));
  app.use('/api/lint', lintRoutes(ctx));
  app.use('/api/search', searchRoutes(ctx));
  app.use('/api/chats', chatRoutes(ctx));
  app.use('/api/crosslink', crosslinkRoutes(ctx));
  app.use('/api/google', googleRoutes(ctx));
  app.use('/api/graph', graphRoutes(ctx));
  app.use('/api/obsidian', obsidianRoutes(ctx));
  app.use('/api/agent-history', agentHistoryRoutes(ctx));
  app.use('/api/semantic-search', semanticSearchRoutes(ctx));
  app.use('/api/capture', captureRoutes(ctx, ctx.devices, ctx.inbox));
  app.use('/api/devices', devicesRoutes(ctx.devices));
  app.use('/api/inbox', inboxRoutes(ctx.inbox, captureWorker));
  app.use('/api/brief', briefRoutes(ctx, briefScheduler));
  app.use('/api/feeds', feedsRoutes(ctx, ctx.feeds, rssWorker));
  app.use('/api/srs', srsRoutes(ctx, ctx.cards, srsExtractor));
  app.use('/api/synthesize', synthesizeRoutes(ctx));
  app.use('/api/network', networkRoutes(ctx));
  app.use('/api/pulse', pulseRoutes(ctx));
  app.use('/api/schema', schemaRoutes(ctx));
  app.get('/api/health', (_req, res) => res.json({ ok: true, dataDir: ctx.dataDir }));

  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });

  const address = server.address() as { port: number };
  const url = `http://localhost:${address.port}`;

  return {
    url,
    dataDir,
    ctx,
    captureWorker,
    close: () =>
      new Promise((resolve) => {
        captureWorker.stop();
        server.close(() => {
          rmSync(dataDir, { recursive: true, force: true });
          resolve();
        });
      }),
  };
}

// ---------------------------------------------------------------------------
// Pair a fresh device and return bearer token + deviceId
// ---------------------------------------------------------------------------
export async function pairDevice(url: string, name = 'Test Device'): Promise<{ token: string; deviceId: string }> {
  const codeRes = await fetch(`${url}/api/devices/pair-code`);
  const { code } = (await codeRes.json()) as { code: string };
  const pairRes = await fetch(`${url}/api/devices/pair`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, device_name: name, device_type: 'browser-ext' }),
  });
  const { token, deviceId } = (await pairRes.json()) as { token: string; deviceId: string };
  return { token, deviceId };
}
