import { useEffect, useMemo, useRef, useState } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import type { ForceGraphMethods } from 'react-force-graph-2d';
import { apiGet } from '../lib/api';
import { edgeTypeStyle, EdgeTypeBadge } from './EdgeTypeBadge';
import type { EdgeType } from '@mindbase/core';

// Inline copy of EDGE_TYPES to avoid a value import from @mindbase/core
// (value imports pull in node:* deps that break the Vite browser build).
const EDGE_TYPES: EdgeType[] = [
  'mentions', 'elaborates', 'cites', 'contradicts',
  'supersedes', 'is_a', 'part_of', 'example_of',
];

// Shape returned by graphToJSON (packages/core/src/graph/export.ts → toJSON),
// augmented server-side with `kind` (Task 18) for per-kind shape/color rendering.
interface RawNode {
  id: string;        // slug
  label: string;     // title
  category: string;
  tags: string[];
  summary?: string;
  community: number | null;
  kind?: string;
  projectId?: string;
  /** Lightweight stub node representing a target in another project. */
  crossProjectStub?: boolean;
}

interface RawLink {
  source: string;
  target: string;
  relation: string;
  confidence: string;
  edgeType?: EdgeType;
  broken?: boolean;
  crossProject?: boolean;
  sourceProjectId?: string;
  targetProjectId?: string;
}

interface GraphData {
  directed: boolean;
  multigraph: boolean;
  graph: { exported_at: string; total_nodes: number; total_edges: number };
  nodes: RawNode[];
  links: RawLink[];
}

// Annotated node shape used internally (adds val + color + degree for rendering)
interface AnnotatedNode extends RawNode {
  val: number;
  color: string;
  degree: number;
  updated_at?: string;
}

interface GraphViewProps {
  onBack: () => void;
  onOpenArticle: (slug: string, path: string) => void;
}

// Community palette — same as packages/core/src/graph/export.ts for visual consistency
const COMMUNITY_COLORS = [
  '#4E79A7', '#F28E2B', '#E15759', '#76B7B2', '#59A14F',
  '#EDC948', '#B07AA1', '#FF9DA7', '#9C755F', '#BAB0AC',
];

const NOW = Date.now();
const DAY_MS = 86_400_000;

function nodeColorForCommunity(community: number | null): string {
  if (community == null) return '#9ca3af';
  return COMMUNITY_COLORS[community % COMMUNITY_COLORS.length] ?? '#9ca3af';
}

// Deterministic project-color: hash a projectId to a stable index into
// COMMUNITY_COLORS so the same project always paints the same hue.
function projectColor(projectId: string): string {
  let h = 0;
  for (let i = 0; i < projectId.length; i++) h = (h * 31 + projectId.charCodeAt(i)) | 0;
  const idx = Math.abs(h) % COMMUNITY_COLORS.length;
  return COMMUNITY_COLORS[idx]!;
}

function baseNodeColor(node: AnnotatedNode, colorByProject: boolean = false): string {
  // In all-projects mode, project membership is the most important signal.
  if (colorByProject && node.projectId) return projectColor(node.projectId);
  // Per-kind color takes precedence when the node has an explicit kind (Task 18).
  if (node.kind) return kindStyle(node.kind).color;
  if (node.degree >= 5) return '#60a5fa'; // hub — azure
  if (node.community != null) return nodeColorForCommunity(node.community);
  return '#9ca3af'; // readable muted grey
}

function recencyOpacity(updatedAt: string | undefined): number {
  if (!updatedAt) return 1;
  const age = NOW - new Date(updatedAt).getTime();
  if (age < 7 * DAY_MS) return 1;
  if (age < 30 * DAY_MS) return 0.85;
  return 0.65;
}

// Per-kind shape + color mapping (Task 18). Unknown / user-defined kinds fall
// through to the `concept` default branch.
type KindShape = 'circle' | 'outline-circle' | 'square' | 'diamond' | 'rect';
interface KindStyle {
  shape: KindShape;
  color: string;
  sizeMultiplier: number;
  borderWidth?: number; // extra outline thickness for 'circle' shapes (person)
}

function kindStyle(kind: string | undefined): KindStyle {
  switch (kind) {
    case 'note':    return { shape: 'outline-circle', color: '#60a5fa', sizeMultiplier: 0.9 };
    case 'daily':   return { shape: 'square',         color: '#34d399', sizeMultiplier: 0.75 };
    case 'meeting': return { shape: 'diamond',        color: '#a78bfa', sizeMultiplier: 0.85 };
    case 'person':  return { shape: 'circle',         color: '#fbbf24', sizeMultiplier: 0.9, borderWidth: 2 };
    case 'project': return { shape: 'rect',           color: '#fb923c', sizeMultiplier: 1.0 };
    case 'concept':
    default:        return { shape: 'circle',         color: '#60a5fa', sizeMultiplier: 1.0 };
  }
}

export function GraphView({ onBack, onOpenArticle }: GraphViewProps) {
  const [data, setData] = useState<GraphData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [allProjects, setAllProjects] = useState(false);
  const fgRef = useRef<ForceGraphMethods<AnnotatedNode, RawLink> | undefined>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 800, height: 600 });

  // Load graph data. Re-fetch when the user toggles all-projects mode.
  useEffect(() => {
    setError(null);
    apiGet<GraphData>(allProjects ? '/graph?scope=all' : '/graph')
      .then(setData)
      .catch((e: unknown) => setError((e as Error).message));
  }, [allProjects]);

  // Resize canvas to container
  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const obs = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (r) setSize({ width: r.width, height: r.height });
    });
    obs.observe(el);
    // Set initial size
    setSize({ width: el.offsetWidth, height: el.offsetHeight });
    return () => obs.disconnect();
  }, []);

  // Compute degree-based node sizes + community colors
  const annotatedData = useMemo(() => {
    if (!data) return null;
    const degreeMap = new Map<string, number>();
    for (const l of data.links) {
      degreeMap.set(l.source as string, (degreeMap.get(l.source as string) ?? 0) + 1);
      degreeMap.set(l.target as string, (degreeMap.get(l.target as string) ?? 0) + 1);
    }
    const nodes: AnnotatedNode[] = data.nodes.map((n) => {
      const deg = degreeMap.get(n.id) ?? 0;
      return {
        ...n,
        degree: deg,
        val: 1 + Math.log2(1 + deg),
        color: nodeColorForCommunity(n.community),
      };
    });
    return { nodes, links: data.links as RawLink[] };
  }, [data]);

  // Stats bar
  const stats = useMemo(() => {
    if (!data) return null;
    const degree = new Map<string, number>();
    for (const l of data.links) {
      degree.set(l.source as string, (degree.get(l.source as string) ?? 0) + 1);
      degree.set(l.target as string, (degree.get(l.target as string) ?? 0) + 1);
    }
    const hubs = [...degree.values()].filter((d) => d >= 5).length;
    return { pages: data.nodes.length, links: data.links.length, hubs };
  }, [data]);

  // Search: set of matching slugs (null = no search active)
  const matchedSlugs = useMemo(() => {
    if (!search.trim() || !data) return null;
    const q = search.toLowerCase();
    return new Set(
      data.nodes
        .filter(
          (n) =>
            n.id.toLowerCase().includes(q) ||
            n.label.toLowerCase().includes(q) ||
            (n.summary ?? '').toLowerCase().includes(q) ||
            n.tags.some((t) => t.toLowerCase().includes(q)),
        )
        .map((n) => n.id),
    );
  }, [search, data]);

  function nodeColor(node: AnnotatedNode): string {
    if (matchedSlugs) {
      if (!matchedSlugs.has(node.id)) return 'rgba(100, 100, 100, 0.15)';
      return '#fbbf24'; // amber highlight
    }
    return baseNodeColor(node, allProjects);
  }

  // Tune simulation forces after graph mounts / data changes
  useEffect(() => {
    if (!fgRef.current || !annotatedData) return;
    const fg = fgRef.current as unknown as {
      d3Force: (name: string) => { strength: (v: number) => void; distance: (v: number) => void } | undefined;
    };
    fg.d3Force('charge')?.strength(-200);
    fg.d3Force('link')?.distance(40);
  }, [annotatedData]);

  function linkColor(link: RawLink): string {
    if (matchedSlugs) {
      const src = typeof link.source === 'string' ? link.source : (link.source as AnnotatedNode)?.id;
      const tgt = typeof link.target === 'string' ? link.target : (link.target as AnnotatedNode)?.id;
      if (!matchedSlugs.has(src) && !matchedSlugs.has(tgt)) return 'rgba(80, 80, 80, 0.08)';
    }
    // Cross-project edges: distinctive muted purple so the user notices
    // them as bridges across project boundaries.
    if (link.crossProject) return 'rgba(155, 109, 220, 0.85)';
    // Broken edges: faded gray takes visual precedence over edge-type color
    if (link.broken) return 'rgba(160,160,160,0.4)';
    return edgeTypeStyle(link.edgeType ?? 'mentions').color;
  }

  function linkWidth(link: RawLink): number {
    if (link.crossProject) return 1.5;
    return edgeTypeStyle(link.edgeType ?? 'mentions').weight;
  }

  function linkLineDash(link: RawLink): number[] {
    // Cross-project edges always dashed (Option B's visual contract).
    if (link.crossProject) return [6, 4];
    return edgeTypeStyle(link.edgeType ?? 'mentions').dashed ? [4, 4] : [];
  }

  function reset() {
    fgRef.current?.zoomToFit(800, 40);
  }

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg-sidebar)' }}>
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 py-3 shrink-0"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <button
          onClick={onBack}
          className="text-[11px] px-2 py-1 rounded transition-colors"
          style={{ color: 'var(--text-mid)' }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        >
          ← Back
        </button>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search pages…"
          className="flex-1 px-3 py-1 rounded-md text-[11px] outline-none"
          style={{
            background: 'var(--surface-1)',
            border: '1px solid var(--border-subtle)',
            color: 'var(--text-default)',
          }}
        />
        <button
          onClick={() => setAllProjects((v) => !v)}
          className="text-[11px] px-2 py-1 rounded transition-colors inline-flex items-center gap-1.5"
          style={{
            color: allProjects ? 'var(--accent-fg, #fff)' : 'var(--text-mid)',
            background: allProjects ? 'var(--accent, #6366f1)' : 'transparent',
            border: '1px solid var(--border-subtle)',
          }}
          title={allProjects
            ? 'Showing every project in one graph — click for current-project view'
            : 'Showing current project + outgoing cross-edges — click to see every project'}
        >
          <span style={{
            width: 6, height: 6, borderRadius: 999,
            background: allProjects ? 'rgba(255,255,255,0.85)' : 'rgba(155,109,220,0.85)',
          }} />
          {allProjects ? 'All projects' : 'Current project'}
        </button>
        <button
          onClick={reset}
          className="text-[11px] px-2 py-1 rounded transition-colors"
          style={{ color: 'var(--accent, #6366f1)' }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          title="Zoom to fit"
        >
          ⟲ Reset
        </button>
      </div>

      {/* Stats */}
      {stats && (
        <div
          className="px-4 py-1.5 text-[10px] shrink-0"
          style={{ color: 'var(--text-faint)', borderBottom: '1px solid var(--border-subtle)' }}
        >
          {stats.pages} pages · {stats.links} links · {stats.hubs} hub{stats.hubs !== 1 ? 's' : ''}
          {matchedSlugs && (
            <span style={{ color: '#fbbf24' }}>
              {' '}· {matchedSlugs.size} match{matchedSlugs.size !== 1 ? 'es' : ''}
            </span>
          )}
        </div>
      )}

      {/* Canvas area */}
      <div ref={containerRef} className="flex-1 relative overflow-hidden">
        {/* Edge-type legend */}
        <div style={{
          position: 'absolute',
          top: 12,
          right: 12,
          display: 'flex',
          flexWrap: 'wrap',
          gap: 4,
          maxWidth: 280,
          padding: 8,
          background: 'rgba(255,255,255,0.85)',
          border: '0.5px solid var(--hairline)',
          borderRadius: 8,
          fontSize: 10,
          color: 'var(--text-mid)',
          zIndex: 5,
          pointerEvents: 'none',
        }}>
          {EDGE_TYPES.map((t) => <EdgeTypeBadge key={t} type={t} />)}
        </div>

        {error && (
          <div className="p-4 text-[12px]" style={{ color: 'var(--error, #ef4444)' }}>
            Error loading graph: {error}
          </div>
        )}
        {!error && !annotatedData && (
          <div className="p-4 text-[12px]" style={{ color: 'var(--text-faint)' }}>
            Loading graph…
          </div>
        )}
        {annotatedData && (
          <ForceGraph2D<AnnotatedNode, RawLink>
            ref={fgRef}
            graphData={annotatedData}
            width={size.width}
            height={size.height}
            backgroundColor="transparent"
            nodeLabel={(n) => `${n.label}${n.summary ? ` — ${n.summary}` : ''}`}
            nodeVal={(n) => n.val ?? 1}
            nodeColor={nodeColor}
            linkColor={linkColor}
            linkWidth={linkWidth}
            linkLineDash={linkLineDash}
            linkDirectionalArrowLength={3}
            linkDirectionalArrowRelPos={1}
            cooldownTicks={150}
            d3VelocityDecay={0.3}
            onNodeClick={async (node) => {
              const n = node as AnnotatedNode;
              // Cross-project stub: switch to that project first, then open.
              if (n.crossProjectStub && n.projectId) {
                try {
                  await fetch('/api/projects/switch', {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({ id: n.projectId }),
                  });
                } catch { /* navigate anyway; the next reload will sort it */ }
              }
              onOpenArticle(n.id, `wiki/notes/${n.id}.md`);
            }}
            onEngineStop={() => fgRef.current?.zoomToFit(400, 60)}
            nodeCanvasObject={(node, ctx, globalScale) => {
              const n = node as AnnotatedNode & { x: number; y: number };
              const ks = kindStyle(n.kind);
              const baseRadius = Math.max(3, n.val ?? 4);
              const radius = baseRadius * ks.sizeMultiplier;
              const color = nodeColor(n);
              // Cross-project stubs render at reduced opacity to signal "lives elsewhere".
              const baseOpacity = matchedSlugs ? 1 : recencyOpacity(n.updated_at);
              const opacity = n.crossProjectStub ? baseOpacity * 0.55 : baseOpacity;

              // Draw recency glow ring for recent pages (updated within 7 days)
              if (!matchedSlugs && n.updated_at) {
                const age = NOW - new Date(n.updated_at).getTime();
                if (age < 7 * DAY_MS) {
                  ctx.beginPath();
                  ctx.arc(n.x, n.y, radius + 3, 0, 2 * Math.PI, false);
                  ctx.fillStyle = 'rgba(74,222,128,0.25)';
                  ctx.fill();
                }
              }

              // Draw node shape per kind
              ctx.globalAlpha = opacity;
              switch (ks.shape) {
                case 'square': {
                  // daily — small filled square
                  ctx.fillStyle = color;
                  ctx.fillRect(n.x - radius, n.y - radius, radius * 2, radius * 2);
                  break;
                }
                case 'diamond': {
                  // meeting — rotated square / diamond
                  ctx.beginPath();
                  ctx.moveTo(n.x, n.y - radius);
                  ctx.lineTo(n.x + radius, n.y);
                  ctx.lineTo(n.x, n.y + radius);
                  ctx.lineTo(n.x - radius, n.y);
                  ctx.closePath();
                  ctx.fillStyle = color;
                  ctx.fill();
                  break;
                }
                case 'rect': {
                  // project — rounded rectangle (wider than tall)
                  const w = radius * 2.8;
                  const h = radius * 1.4;
                  const rx = radius * 0.3;
                  const x0 = n.x - w / 2;
                  const y0 = n.y - h / 2;
                  ctx.beginPath();
                  ctx.moveTo(x0 + rx, y0);
                  ctx.lineTo(x0 + w - rx, y0);
                  ctx.quadraticCurveTo(x0 + w, y0, x0 + w, y0 + rx);
                  ctx.lineTo(x0 + w, y0 + h - rx);
                  ctx.quadraticCurveTo(x0 + w, y0 + h, x0 + w - rx, y0 + h);
                  ctx.lineTo(x0 + rx, y0 + h);
                  ctx.quadraticCurveTo(x0, y0 + h, x0, y0 + h - rx);
                  ctx.lineTo(x0, y0 + rx);
                  ctx.quadraticCurveTo(x0, y0, x0 + rx, y0);
                  ctx.closePath();
                  ctx.fillStyle = color;
                  ctx.fill();
                  break;
                }
                case 'outline-circle': {
                  // note — outlined circle, no fill
                  ctx.beginPath();
                  ctx.arc(n.x, n.y, radius, 0, 2 * Math.PI, false);
                  ctx.lineWidth = 2;
                  ctx.strokeStyle = color;
                  ctx.stroke();
                  break;
                }
                case 'circle':
                default: {
                  // concept / person / unknown — filled circle (person gets thicker border)
                  ctx.beginPath();
                  ctx.arc(n.x, n.y, radius, 0, 2 * Math.PI, false);
                  ctx.fillStyle = color;
                  ctx.fill();
                  if (ks.borderWidth) {
                    ctx.lineWidth = ks.borderWidth;
                    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
                    ctx.stroke();
                  }
                  break;
                }
              }
              ctx.globalAlpha = 1;

              // Draw label for hub nodes or when zoomed in enough
              const showLabel = n.degree >= 3 || globalScale > 1.5;
              if (showLabel) {
                const fontSize = Math.max(8, 12 / globalScale);
                ctx.font = `${fontSize}px system-ui, sans-serif`;
                const label = n.label ?? n.id;
                const textWidth = ctx.measureText(label).width;
                const textX = n.x;
                const textY = n.y + radius + 3;

                // Background bar behind text for readability
                ctx.fillStyle = 'rgba(0,0,0,0.5)';
                ctx.fillRect(textX - textWidth / 2 - 2, textY, textWidth + 4, fontSize + 2);

                ctx.textAlign = 'center';
                ctx.textBaseline = 'top';
                ctx.fillStyle = 'rgba(255,255,255,0.9)';
                ctx.fillText(label, textX, textY + 1);
              }
            }}
            nodePointerAreaPaint={(node, color, ctx) => {
              const n = node as AnnotatedNode & { x: number; y: number };
              const ks = kindStyle(n.kind);
              const baseRadius = Math.max(3, n.val ?? 4);
              const radius = baseRadius * ks.sizeMultiplier;
              // Hit-region: use a circle sized to enclose the widest shape (rect
              // is widest at ~1.4 * radius). Slightly inflated for easier clicks.
              const hitRadius = Math.max(6, (ks.shape === 'rect' ? radius * 1.5 : radius) + 2);
              ctx.fillStyle = color;
              ctx.beginPath();
              ctx.arc(n.x, n.y, hitRadius, 0, 2 * Math.PI, false);
              ctx.fill();
            }}
          />
        )}
      </div>
    </div>
  );
}
