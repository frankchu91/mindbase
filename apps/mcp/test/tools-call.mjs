/**
 * MCP tools/call round-trip test.
 * Creates a minimal fixture wiki, calls search_wiki, list_review_cards, get_graph_insights.
 * Run from apps/mcp/ directory: node test/tools-call.mjs
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Create fixture data dir
const dataDir = mkdtempSync(join(tmpdir(), 'mb-mcp-tools-'));
const notesDir = join(dataDir, 'wiki', 'notes');
mkdirSync(notesDir, { recursive: true });

const now = new Date().toISOString();
writeFileSync(join(notesDir, 'fixture-page.md'),
  '# Fixture Page\n\nThis is a test wiki page for MCP tools/call round-trip tests.');
writeFileSync(join(notesDir, 'fixture-page.meta.json'), JSON.stringify({
  id: 'fixture-page',
  title: 'Fixture Page',
  type: 'concept',
  one_liner: 'Test fixture page',
  edit_state: 'ai_generated',
  created: now,
  updated: now,
  word_count: 15,
}));
writeFileSync(join(notesDir, 'linked-page.md'),
  '# Linked Page\n\nThis page links to [[fixture-page]].');
writeFileSync(join(notesDir, 'linked-page.meta.json'), JSON.stringify({
  id: 'linked-page',
  title: 'Linked Page',
  type: 'concept',
  one_liner: 'Linked to fixture',
  edit_state: 'ai_generated',
  created: now,
  updated: now,
  word_count: 8,
}));

const proc = spawn('node', ['dist/cli.js', '--data-dir', dataDir], {
  stdio: ['pipe', 'pipe', 'pipe'],
});

function send(msg) { proc.stdin.write(JSON.stringify(msg) + '\n'); }

const pending = new Map();
let exitCode = 0;

let buf = '';
proc.stdout.on('data', (chunk) => {
  buf += chunk.toString();
  const lines = buf.split('\n');
  buf = lines.pop() ?? '';
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const msg = JSON.parse(line);
      if (msg.id !== undefined && pending.has(msg.id)) {
        const { resolve } = pending.get(msg.id);
        pending.delete(msg.id);
        resolve(msg);
      }
    } catch { /* non-JSON */ }
  }
});

proc.stderr?.on('data', () => {}); // suppress stderr

function call(id, name, args) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`Timeout waiting for tool "${name}" (id=${id})`));
    }, 10000);
    pending.set(id, { resolve: (msg) => { clearTimeout(t); resolve(msg); } });
    send({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } });
  });
}

async function run() {
  // Give the server a moment to start
  await new Promise(r => setTimeout(r, 500));

  // --- Test 1: search_wiki ---
  try {
    const res = await call(1, 'search_wiki', { query: 'Fixture Page' });
    if (res.error) {
      console.error('FAIL search_wiki:', res.error.message);
      exitCode = 1;
    } else {
      const content = res.result?.content ?? [];
      const text = content.map(c => c.text).join('');
      if (text.length === 0) {
        console.error('FAIL search_wiki: empty result for "Fixture Page"');
        exitCode = 1;
      } else {
        console.log('OK: search_wiki returned results for "Fixture Page"');
      }
    }
  } catch (e) {
    console.error('FAIL search_wiki:', e.message);
    exitCode = 1;
  }

  // --- Test 2: list_review_cards (no cards seeded → empty) ---
  try {
    const res = await call(2, 'list_review_cards', { due_only: false });
    if (res.error) {
      console.error('FAIL list_review_cards:', res.error.message);
      exitCode = 1;
    } else {
      const content = res.result?.content ?? [];
      const text = content.map(c => c.text).join('');
      // Should be parseable JSON
      try {
        JSON.parse(text);
        console.log('OK: list_review_cards returned valid JSON (no cards seeded)');
      } catch {
        console.error('FAIL list_review_cards: response is not valid JSON:', text.slice(0, 200));
        exitCode = 1;
      }
    }
  } catch (e) {
    console.error('FAIL list_review_cards:', e.message);
    exitCode = 1;
  }

  // --- Test 3: get_graph_insights ---
  try {
    const res = await call(3, 'get_graph_insights', {});
    if (res.error) {
      console.error('FAIL get_graph_insights:', res.error.message);
      exitCode = 1;
    } else {
      const content = res.result?.content ?? [];
      const text = content.map(c => c.text).join('');
      if (text.length === 0) {
        console.error('FAIL get_graph_insights: empty result');
        exitCode = 1;
      } else {
        console.log('OK: get_graph_insights returned data:', text.slice(0, 100));
      }
    }
  } catch (e) {
    console.error('FAIL get_graph_insights:', e.message);
    exitCode = 1;
  }

  // --- Test 4: read_wiki_page ---
  try {
    const res = await call(4, 'read_wiki_page', { slug: 'fixture-page' });
    if (res.error) {
      console.error('FAIL read_wiki_page:', res.error.message);
      exitCode = 1;
    } else {
      const content = res.result?.content ?? [];
      const text = content.map(c => c.text).join('');
      if (!text.includes('Fixture Page')) {
        console.error('FAIL read_wiki_page: expected "Fixture Page" in result');
        exitCode = 1;
      } else {
        console.log('OK: read_wiki_page returned fixture content');
      }
    }
  } catch (e) {
    console.error('FAIL read_wiki_page:', e.message);
    exitCode = 1;
  }
}

run().then(() => {
  proc.kill();
  rmSync(dataDir, { recursive: true, force: true });
  console.log(exitCode === 0 ? '\n✓ All tools/call checks passed' : '\n✗ Some tools/call checks failed');
  process.exit(exitCode);
}).catch((e) => {
  console.error('Fatal error:', e);
  proc.kill();
  rmSync(dataDir, { recursive: true, force: true });
  process.exit(1);
});
