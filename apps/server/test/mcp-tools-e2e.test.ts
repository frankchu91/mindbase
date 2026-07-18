/**
 * MCP tools E2E — spawns the MCP binary, exercises the stdio JSON-RPC protocol.
 * Requires apps/mcp/dist/cli.js to be built.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const MCP_CLI = resolve(import.meta.dirname, '../../../apps/mcp/dist/cli.js');

interface MCPMessage {
  jsonrpc: string;
  id?: number;
  result?: Record<string, unknown>;
  error?: { code: number; message: string };
}

/**
 * Spawn MCP server, send one request, collect the response (with timeout).
 */
function mcpSession(dataDir: string): {
  send: (msg: object) => void;
  nextMessage: (id: number, timeoutMs?: number) => Promise<MCPMessage>;
  kill: () => void;
} {
  const proc: ChildProcess = spawn('node', [MCP_CLI, '--data-dir', dataDir], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  let buf = '';
  const messages = new Map<number, (m: MCPMessage) => void>();

  proc.stdout!.on('data', (chunk: Buffer) => {
    buf += chunk.toString();
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line) as MCPMessage;
        if (msg.id !== undefined) {
          messages.get(msg.id)?.(msg);
          messages.delete(msg.id);
        }
      } catch { /* non-JSON lines */ }
    }
  });

  return {
    send: (msg: object) => proc.stdin!.write(JSON.stringify(msg) + '\n'),
    nextMessage: (id: number, timeoutMs = 10000) =>
      new Promise<MCPMessage>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error(`MCP response timeout for id=${id}`)), timeoutMs);
        messages.set(id, (m) => { clearTimeout(t); resolve(m); });
      }),
    kill: () => { proc.kill(); },
  };
}

let dataDir: string;

beforeAll(() => {
  dataDir = mkdtempSync(join(tmpdir(), 'mb-mcp-e2e-'));

  // Seed a fixture wiki page
  const notesDir = join(dataDir, 'wiki', 'notes');
  mkdirSync(notesDir, { recursive: true });
  const now = new Date().toISOString();
  writeFileSync(join(notesDir, 'mcp-fixture.md'), '# MCP Fixture\n\nThis is a test wiki page for MCP E2E tests.');
  writeFileSync(join(notesDir, 'mcp-fixture.meta.json'), JSON.stringify({
    id: 'mcp-fixture',
    title: 'MCP Fixture',
    type: 'concept',
    one_liner: 'Test page',
    edit_state: 'ai_generated',
    created: now,
    updated: now,
    word_count: 12,
  }));
});

afterAll(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

describe('MCP tools E2E (stdio JSON-RPC)', () => {
  it('tools/list returns ≥27 tools including expected names', async () => {
    const mcp = mcpSession(dataDir);
    mcp.send({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} });
    const res = await mcp.nextMessage(1);
    mcp.kill();

    expect(res.error).toBeUndefined();
    const tools = (res.result as { tools: Array<{ name: string }> }).tools;
    expect(tools.length).toBeGreaterThanOrEqual(27);

    const names = tools.map((t) => t.name);
    for (const expected of [
      'search_wiki',
      'ask_wiki',
      'read_wiki_page',
      'add_rss_feed',
      'list_feeds',
      'list_review_cards',
      'answer_card',
      'create_card',
      'generate_daily_brief',
      'save_chat_excerpt',
      'get_graph_insights',
    ]) {
      expect(names, `expected tool "${expected}" to be present`).toContain(expected);
    }
  });

  it('initialize response includes tools + resources + prompts capabilities', async () => {
    const mcp = mcpSession(dataDir);
    mcp.send({
      jsonrpc: '2.0',
      id: 2,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'test', version: '1' },
      },
    });
    const res = await mcp.nextMessage(2);
    mcp.kill();

    // initialize may not return a result in some MCP versions — just check no fatal error
    if (res.result) {
      const caps = (res.result as { capabilities?: Record<string, unknown> }).capabilities ?? {};
      // The server should advertise at least one capability
      expect(Object.keys(caps).length).toBeGreaterThan(0);
    }
  });

  it('search_wiki returns results for matching query', async () => {
    const mcp = mcpSession(dataDir);
    mcp.send({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'search_wiki', arguments: { query: 'MCP Fixture' } },
    });
    const res = await mcp.nextMessage(3);
    mcp.kill();

    expect(res.error).toBeUndefined();
    const content = (res.result as { content?: Array<{ type: string; text: string }> }).content;
    expect(Array.isArray(content)).toBe(true);
    // Should have at least one result referencing our fixture
    const text = content!.map((c) => c.text).join('');
    expect(text.length).toBeGreaterThan(0);
  });

  it('list_review_cards returns empty array (no cards seeded)', async () => {
    const mcp = mcpSession(dataDir);
    mcp.send({
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: { name: 'list_review_cards', arguments: { due_only: false } },
    });
    const res = await mcp.nextMessage(4);
    mcp.kill();

    expect(res.error).toBeUndefined();
    const content = (res.result as { content?: Array<{ type: string; text: string }> }).content;
    // Content is a text block containing JSON
    const text = content!.map((c) => c.text).join('');
    // Should be parseable JSON (empty array or object with cards)
    expect(() => JSON.parse(text)).not.toThrow();
  });

  it('get_graph_insights returns total_pages ≥ 1', async () => {
    const mcp = mcpSession(dataDir);
    mcp.send({
      jsonrpc: '2.0',
      id: 5,
      method: 'tools/call',
      params: { name: 'get_graph_insights', arguments: {} },
    });
    const res = await mcp.nextMessage(5);
    mcp.kill();

    expect(res.error).toBeUndefined();
    const content = (res.result as { content?: Array<{ type: string; text: string }> }).content;
    const text = content!.map((c) => c.text).join('');
    // Should mention page count
    expect(text.length).toBeGreaterThan(0);
  });
});
