// packages/core/src/graph/export.ts
import type { Visibility } from '../types';
import type { PageGraph } from './types';

interface ExportOpts {
  excludeVisibility?: Visibility[];
}

const COMMUNITY_COLORS = [
  '#4E79A7', '#F28E2B', '#E15759', '#76B7B2', '#59A14F',
  '#EDC948', '#B07AA1', '#FF9DA7', '#9C755F', '#BAB0AC',
];

function filterGraph(graph: PageGraph, opts: ExportOpts = {}): PageGraph {
  const block = new Set<Visibility>(opts.excludeVisibility ?? []);
  if (block.size === 0) return graph;
  const allowedSlugs = new Set<string>();
  const filteredNodes = new Map<string, typeof graph.nodes extends Map<string, infer V> ? V : never>();
  for (const [slug, node] of graph.nodes) {
    if (node.visibility && block.has(node.visibility)) continue;
    filteredNodes.set(slug, node);
    allowedSlugs.add(slug);
  }
  const filteredEdges = graph.edges.filter((e) => allowedSlugs.has(e.source) && allowedSlugs.has(e.target));
  const incoming = new Map<string, string[]>();
  const outgoing = new Map<string, string[]>();
  for (const slug of allowedSlugs) { incoming.set(slug, []); outgoing.set(slug, []); }
  for (const e of filteredEdges) {
    outgoing.get(e.source)!.push(e.target);
    incoming.get(e.target)!.push(e.source);
  }
  return { nodes: filteredNodes, edges: filteredEdges, incoming, outgoing };
}

/** Assign community ids — prefers Phase-4-persisted community_id when present,
 *  falls back to tag-based heuristic for fresh wikis without Louvain data. */
function assignCommunities(graph: PageGraph): Map<string, number | null> {
  // If any page has a Phase-4-persisted community_id, prefer that signal entirely.
  let anyPersisted = false;
  for (const [, n] of graph.nodes) {
    if (n.community_id != null) { anyPersisted = true; break; }
  }
  if (anyPersisted) {
    const result = new Map<string, number | null>();
    for (const [slug, n] of graph.nodes) result.set(slug, n.community_id ?? null);
    return result;
  }

  // Fallback: tag-based heuristic (pre-Phase 4 behavior, kept for fresh wikis)
  const tagCounts = new Map<string, number>();
  for (const [, node] of graph.nodes) {
    const tag = node.tags[0];
    if (!tag) continue;
    tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
  }
  const sortedTags = [...tagCounts.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
  const tagToCommunity = new Map<string, number>();
  sortedTags.forEach((t, i) => tagToCommunity.set(t, i));

  const result = new Map<string, number | null>();
  for (const [slug, node] of graph.nodes) {
    const tag = node.tags[0];
    result.set(slug, tag ? (tagToCommunity.get(tag) ?? null) : null);
  }
  return result;
}

export function toJSON(graph: PageGraph, opts: ExportOpts = {}): string {
  const g = filterGraph(graph, opts);
  const community = assignCommunities(g);
  const out = {
    directed: false,
    multigraph: false,
    graph: {
      exported_at: new Date().toISOString(),
      total_nodes: g.nodes.size,
      total_edges: g.edges.length,
    },
    nodes: [...g.nodes.entries()].map(([slug, n]) => ({
      id: slug,
      label: n.title,
      category: n.category,
      tags: n.tags,
      summary: n.summary,
      community: community.get(slug),
      ...(n.kind ? { kind: n.kind } : {}),
      ...(n.projectId ? { projectId: n.projectId } : {}),
      ...(n.crossProjectStub ? { crossProjectStub: true } : {}),
    })),
    links: g.edges.filter((e) => !e.broken).map((e) => ({
      source: e.source, target: e.target,
      relation: 'wikilink', confidence: e.confidence.toUpperCase(),
      ...(e.crossProject ? { crossProject: true } : {}),
      ...(e.sourceProjectId ? { sourceProjectId: e.sourceProjectId } : {}),
      ...(e.targetProjectId ? { targetProjectId: e.targetProjectId } : {}),
    })),
  };
  return JSON.stringify(out, null, 2);
}

export function toGraphML(graph: PageGraph, opts: ExportOpts = {}): string {
  const g = filterGraph(graph, opts);
  const community = assignCommunities(g);
  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push('<graphml xmlns="http://graphml.graphdrawing.org/graphml">');
  lines.push('  <key id="label" for="node" attr.name="label" attr.type="string"/>');
  lines.push('  <key id="category" for="node" attr.name="category" attr.type="string"/>');
  lines.push('  <key id="community" for="node" attr.name="community" attr.type="int"/>');
  lines.push('  <key id="confidence" for="edge" attr.name="confidence" attr.type="string"/>');
  lines.push('  <graph id="wiki" edgedefault="undirected">');
  for (const [slug, n] of g.nodes) {
    lines.push(`    <node id="${escapeXml(slug)}">`);
    lines.push(`      <data key="label">${escapeXml(n.title)}</data>`);
    lines.push(`      <data key="category">${escapeXml(n.category)}</data>`);
    const c = community.get(slug);
    if (c != null) lines.push(`      <data key="community">${c}</data>`);
    lines.push('    </node>');
  }
  for (const e of g.edges.filter((e) => !e.broken)) {
    lines.push(`    <edge source="${escapeXml(e.source)}" target="${escapeXml(e.target)}">`);
    lines.push(`      <data key="confidence">${e.confidence.toUpperCase()}</data>`);
    lines.push('    </edge>');
  }
  lines.push('  </graph>');
  lines.push('</graphml>');
  return lines.join('\n');
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escapeCypher(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

export function toCypher(graph: PageGraph, opts: ExportOpts = {}): string {
  const g = filterGraph(graph, opts);
  const lines: string[] = [];
  lines.push(`// Wiki knowledge graph export — ${new Date().toISOString()}`);
  lines.push('');
  lines.push('// Nodes');
  for (const [slug, n] of g.nodes) {
    const tags = JSON.stringify(n.tags);
    lines.push(`MERGE (n:Page {id: "${escapeCypher(slug)}"}) SET n.label = "${escapeCypher(n.title)}", n.category = "${escapeCypher(n.category)}", n.tags = ${tags};`);
  }
  lines.push('');
  lines.push('// Relationships');
  for (const e of g.edges.filter((e) => !e.broken)) {
    lines.push(`MATCH (a:Page {id: "${escapeCypher(e.source)}"}), (b:Page {id: "${escapeCypher(e.target)}"}) MERGE (a)-[:WIKILINK {confidence: "${e.confidence.toUpperCase()}"}]->(b);`);
  }
  return lines.join('\n');
}

export function toHTML(graph: PageGraph, opts: ExportOpts = {}): string {
  const g = filterGraph(graph, opts);
  const community = assignCommunities(g);

  // Build degree map for hub detection and node sizing
  const degreeMap = new Map<string, number>();
  for (const [slug] of g.nodes) {
    const degree = (g.outgoing.get(slug)?.length ?? 0) + (g.incoming.get(slug)?.length ?? 0);
    degreeMap.set(slug, degree);
  }

  // Build incoming-edge count for orphan detection
  const incomingCount = new Map<string, number>();
  for (const [slug] of g.nodes) {
    incomingCount.set(slug, g.incoming.get(slug)?.length ?? 0);
  }

  const visNodes = [...g.nodes.entries()].map(([slug, n]) => {
    const c = community.get(slug);
    const color = c != null ? COMMUNITY_COLORS[c % COMMUNITY_COLORS.length] : '#666';
    const degree = degreeMap.get(slug) ?? 0;
    return {
      id: slug,
      label: n.title,
      color: { background: color, border: color },
      origColor: color,
      size: Math.min(degree * 3 + 8, 60),
      title: `${n.category} | tags: ${n.tags.join(', ') || '—'}`,
      degree,
      inDegree: incomingCount.get(slug) ?? 0,
    };
  });
  const visEdges = g.edges.filter((e) => !e.broken).map((e) => ({
    from: e.source, to: e.target,
    dashes: e.confidence === 'inferred' ? true : e.confidence === 'ambiguous' ? [4, 8] : false,
  }));

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>MindBase Knowledge Graph</title>
<script src="https://unpkg.com/vis-network/standalone/umd/vis-network.min.js"></script>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; background: #0f0f1a; color: #e0e0e0; font-family: -apple-system, sans-serif; display: flex; height: 100vh; }
  #graph { flex: 1; }
  #sidebar { width: 280px; background: #1a1a2e; border-left: 1px solid #2a2a4e; padding: 16px; overflow-y: auto; font-size: 13px; display: flex; flex-direction: column; gap: 14px; }
  h3 { color: #aaa; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; margin: 0 0 6px; }
  #info { line-height: 1.6; color: #ccc; }
  #info a { color: #7eb3f5; text-decoration: none; }
  #info a:hover { text-decoration: underline; }
  .legend-item { display: flex; align-items: center; gap: 8px; padding: 3px 0; font-size: 12px; }
  .dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
  #stats { color: #555; font-size: 11px; }
  #search { width: 100%; background: #0f0f1a; border: 1px solid #2a2a4e; border-radius: 4px; color: #e0e0e0; padding: 6px 8px; font-size: 12px; outline: none; }
  #search:focus { border-color: #4a6fa5; }
  .filter-btns { display: flex; flex-direction: column; gap: 5px; }
  .filter-btn { background: #0f0f1a; border: 1px solid #2a2a4e; border-radius: 4px; color: #ccc; padding: 5px 8px; font-size: 11px; cursor: pointer; text-align: left; transition: background 0.15s; }
  .filter-btn:hover { background: #1f1f3a; }
  .filter-btn.active { background: #2a3a5e; border-color: #4a6fa5; color: #7eb3f5; }
</style></head><body>
<div id="graph"></div>
<div id="sidebar">
  <div>
    <h3>Wiki Graph</h3>
    <div id="info">Click a node for details.</div>
  </div>
  <div>
    <h3>Search</h3>
    <input id="search" type="text" placeholder="Search nodes..." autocomplete="off" />
  </div>
  <div>
    <h3>Highlight</h3>
    <div class="filter-btns">
      <button class="filter-btn active" id="btn-all">Show all</button>
      <button class="filter-btn" id="btn-hubs">Hubs only (degree &ge; 5)</button>
      <button class="filter-btn" id="btn-orphans">Orphans (no incoming edges)</button>
    </div>
  </div>
  <div>
    <h3>Communities</h3>
    <div id="legend"></div>
  </div>
  <div id="stats"></div>
</div>
<script>
const NODES_DATA = ${JSON.stringify(visNodes)};
const EDGES_DATA = ${JSON.stringify(visEdges)};
const COMMUNITY_COLORS = ${JSON.stringify(COMMUNITY_COLORS)};
const COMMUNITY_MAP = ${JSON.stringify(Object.fromEntries(community))};

const nodesDS = new vis.DataSet(NODES_DATA);
const edgesDS = new vis.DataSet(EDGES_DATA);

const network = new vis.Network(document.getElementById('graph'), { nodes: nodesDS, edges: edgesDS }, {
  physics: { solver: 'forceAtlas2Based', forceAtlas2Based: { gravitationalConstant: -60, springLength: 120 }, stabilization: { iterations: 200 } },
  interaction: { hover: true },
  nodes: { shape: 'dot', borderWidth: 1.5, font: { color: '#ddd', size: 11 } },
  edges: { color: { color: '#444', opacity: 0.6 }, arrows: { to: { enabled: true, scaleFactor: 0.4 } } }
});

network.once('stabilizationIterationsDone', () => network.setOptions({ physics: { enabled: false } }));

// --- Click to open wiki page + info panel ---
network.on('click', function(params) {
  const sel = params.nodes;
  if (!sel.length) return;
  const nodeId = sel[0];
  const n = NODES_DATA.find(function(x) { return x.id === nodeId; });
  if (!n) return;
  const slug = nodeId;
  const url = '/api/wiki/notes/' + slug + '.md';
  document.getElementById('info').innerHTML =
    '<b>' + escHtml(n.label) + '</b>' +
    '<br><span style="color:#888;font-size:11px">' + escHtml(n.title || '') + '</span>' +
    '<br><a href="' + url + '" target="_blank" rel="noopener" style="font-size:11px">Open in MindBase &rarr;</a>';
  window.open(url, '_blank');
});

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// --- Search ---
var currentFilter = 'all';
var currentSearch = '';

function applyVisuals() {
  var search = currentSearch.toLowerCase();
  var updates = NODES_DATA.map(function(n) {
    var matchSearch = !search || n.label.toLowerCase().indexOf(search) !== -1;
    var matchFilter = true;
    if (currentFilter === 'hubs') { matchFilter = n.degree >= 5; }
    else if (currentFilter === 'orphans') { matchFilter = n.inDegree === 0; }
    var visible = matchSearch && matchFilter;
    return {
      id: n.id,
      color: visible
        ? { background: n.origColor, border: n.origColor, highlight: { background: n.origColor, border: '#fff' } }
        : { background: '#1a1a2e', border: '#2a2a4e', highlight: { background: '#1a1a2e', border: '#2a2a4e' } },
      opacity: visible ? 1 : 0.1,
    };
  });
  nodesDS.update(updates);
}

document.getElementById('search').addEventListener('input', function(e) {
  currentSearch = e.target.value;
  applyVisuals();
});

// --- Filter buttons ---
function setFilter(f) {
  currentFilter = f;
  document.querySelectorAll('.filter-btn').forEach(function(b) { b.classList.remove('active'); });
  document.getElementById('btn-' + f).classList.add('active');
  applyVisuals();
}

document.getElementById('btn-all').addEventListener('click', function() { setFilter('all'); });
document.getElementById('btn-hubs').addEventListener('click', function() { setFilter('hubs'); });
document.getElementById('btn-orphans').addEventListener('click', function() { setFilter('orphans'); });

// --- Legend ---
const counts = {};
Object.values(COMMUNITY_MAP).forEach(function(c) { if (c != null) counts[c] = (counts[c] || 0) + 1; });
const leg = document.getElementById('legend');
Object.entries(counts).sort(function(a,b) { return b[1]-a[1]; }).forEach(function(entry) {
  var cid = entry[0]; var n = entry[1];
  var color = COMMUNITY_COLORS[cid % COMMUNITY_COLORS.length];
  var div = document.createElement('div');
  div.className = 'legend-item';
  div.innerHTML = '<div class="dot" style="background:' + color + '"></div>Community ' + cid + ' (' + n + ')';
  leg.appendChild(div);
});

document.getElementById('stats').textContent = NODES_DATA.length + ' pages · ' + EDGES_DATA.length + ' links';
</script></body></html>`;
}
