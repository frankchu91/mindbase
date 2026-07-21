/**
 * MCP full smoke test — verifies tool surface, resources, and prompts.
 * Run from the apps/mcp/ directory: node test/full-smoke.mjs
 */
import { spawn } from 'node:child_process';

const REQUIRED_TOOLS = [
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
  'find_orphans',
  'suggest_links',
  'run_wiki_health',
  'export_subgraph',
  'list_recent',
  'find_related',
  'semantic_search',
  'search_in_project',
  'ingest_source',
  'quick_capture',
  'append_to_page',
  'update_note_section',
  'tag_note',
  'set_visibility',
  'list_chats',
  'recall_chat',
];

const proc = spawn('node', ['dist/cli.js'], { stdio: ['pipe', 'pipe', 'inherit'] });

function send(msg) { proc.stdin.write(JSON.stringify(msg) + '\n'); }

let results = {};

let buf = '';
proc.stdout.on('data', (chunk) => {
  buf += chunk.toString();
  const lines = buf.split('\n');
  buf = lines.pop() ?? '';
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const msg = JSON.parse(line);
      console.log('<<', JSON.stringify(msg).slice(0, 240));
      if (msg.id) results[msg.id] = msg;
    } catch { /* skip */ }
  }
});

setTimeout(() => send({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }), 200);
setTimeout(() => send({ jsonrpc: '2.0', id: 2, method: 'resources/list', params: {} }), 600);
setTimeout(() => send({ jsonrpc: '2.0', id: 3, method: 'prompts/list', params: {} }), 1000);

setTimeout(() => {
  proc.kill();

  let exitCode = 0;

  // --- Assertions ---
  const toolsRes = results[1];
  if (!toolsRes || !toolsRes.result) {
    console.error('FAIL: tools/list returned no result');
    exitCode = 1;
  } else {
    const tools = toolsRes.result.tools ?? [];
    const names = tools.map(t => t.name);
    console.log(`\nTotal tools: ${names.length}`);

    if (names.length < 27) {
      console.error(`FAIL: expected ≥27 tools, got ${names.length}`);
      exitCode = 1;
    } else {
      console.log(`OK: tool count ${names.length} ≥ 27`);
    }

    for (const expected of REQUIRED_TOOLS) {
      if (!names.includes(expected)) {
        console.error(`FAIL: missing required tool "${expected}"`);
        exitCode = 1;
      } else {
        console.log(`OK: tool "${expected}" present`);
      }
    }
  }

  const resourcesRes = results[2];
  if (!resourcesRes || !resourcesRes.result) {
    console.error('FAIL: resources/list returned no result');
    exitCode = 1;
  } else {
    const resources = resourcesRes.result.resources ?? [];
    console.log(`\nTotal resources: ${resources.length}`);
    // Check for mindbase://recent or mindbase://hubs or wiki scheme
    const uris = resources.map(r => r.uri);
    const hasWikiScheme = uris.some(u => u.startsWith('mindbase://'));
    if (!hasWikiScheme) {
      console.error('FAIL: no mindbase:// resource URI found');
      exitCode = 1;
    } else {
      console.log('OK: mindbase:// resource scheme present');
    }
  }

  const promptsRes = results[3];
  if (!promptsRes || !promptsRes.result) {
    console.error('FAIL: prompts/list returned no result');
    exitCode = 1;
  } else {
    const prompts = promptsRes.result.prompts ?? [];
    console.log(`\nTotal prompts: ${prompts.length}`);
    const hasDailyDigest = prompts.some(p => p.name === 'daily-digest');
    if (!hasDailyDigest) {
      console.error('FAIL: missing prompt "daily-digest"');
      exitCode = 1;
    } else {
      console.log('OK: prompt "daily-digest" present');
    }
  }

  console.log(exitCode === 0 ? '\n✓ All smoke checks passed' : '\n✗ Some smoke checks failed');
  process.exit(exitCode);
}, 2500);
