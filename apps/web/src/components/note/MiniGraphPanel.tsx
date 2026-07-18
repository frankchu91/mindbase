// apps/web/src/components/note/MiniGraphPanel.tsx
//
// Small force-directed graph showing the 1-hop neighborhood around the
// current page. Lives in the RightRail "Graph" tab. Click a node to navigate.
import { useEffect, useRef, useState } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import type { ForceGraphMethods } from 'react-force-graph-2d';
import { useCanvasRoute } from '../../store/canvas-route';

interface RawNode {
  id: string;
  label: string;
  projectId?: string;
  crossProjectStub?: boolean;
}

interface RawLink {
  source: string;
  target: string;
  crossProject?: boolean;
}

interface GraphData {
  nodes: RawNode[];
  links: RawLink[];
}

interface MiniNode extends RawNode {
  x?: number;
  y?: number;
  isCenter?: boolean;
  color: string;
}

export function MiniGraphPanel({ slug }: { slug: string }) {
  const [data, setData] = useState<{ nodes: MiniNode[]; links: RawLink[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<ForceGraphMethods<MiniNode, RawLink> | undefined>(undefined);
  const [size, setSize] = useState({ width: 240, height: 240 });
  const navigate = useCanvasRoute((s) => s.navigate);

  useEffect(() => {
    setErr(null);
    fetch('/api/graph')
      .then((r) => r.json() as Promise<GraphData>)
      .then((g) => {
        // 1-hop neighborhood: keep edges incident to `slug` and the nodes they touch.
        const neighborhood = new Set<string>([slug]);
        const edges: RawLink[] = [];
        for (const l of g.links) {
          if (l.source === slug || l.target === slug) {
            edges.push(l);
            neighborhood.add(typeof l.source === 'string' ? l.source : (l.source as RawNode).id);
            neighborhood.add(typeof l.target === 'string' ? l.target : (l.target as RawNode).id);
          }
        }
        const nodes: MiniNode[] = g.nodes
          .filter((n) => neighborhood.has(n.id))
          .map((n) => ({
            ...n,
            isCenter: n.id === slug,
            color: n.id === slug
              ? '#5e76f0'
              : n.crossProjectStub
                ? 'rgba(155, 109, 220, 0.6)'
                : '#76B7B2',
          }));
        setData({ nodes, links: edges });
      })
      .catch((e: Error) => setErr(e.message));
  }, [slug]);

  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const obs = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (r) setSize({ width: r.width, height: Math.max(180, r.width) });
    });
    obs.observe(el);
    setSize({ width: el.offsetWidth, height: Math.max(180, el.offsetWidth) });
    return () => obs.disconnect();
  }, []);

  if (err) {
    return (
      <div className="p-4 text-[11.5px]" style={{ color: 'var(--text-mid)' }}>
        Couldn&apos;t load graph: {err}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-4 text-[11.5px]" style={{ color: 'var(--text-mid)' }}>
        Loading neighborhood…
      </div>
    );
  }

  if (data.nodes.length <= 1) {
    return (
      <div className="p-4 text-[11.5px] leading-relaxed" style={{ color: 'var(--text-mid)' }}>
        This page has no connections yet. As other pages link to <code>{slug}</code>, they&apos;ll appear here.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div ref={containerRef} className="relative" style={{ height: size.height }}>
        <ForceGraph2D
          ref={fgRef}
          graphData={data}
          width={size.width}
          height={size.height}
          nodeRelSize={4}
          linkColor={(l) => ((l as RawLink).crossProject ? 'rgba(155,109,220,0.7)' : 'rgba(120,120,120,0.45)')}
          linkWidth={(l) => ((l as RawLink).crossProject ? 1.4 : 0.9)}
          linkLineDash={(l) => ((l as RawLink).crossProject ? [4, 3] : [])}
          backgroundColor="rgba(0,0,0,0)"
          cooldownTicks={80}
          d3VelocityDecay={0.35}
          onNodeClick={(n) => {
            const node = n as MiniNode;
            if (node.id === slug) return;
            navigate({ kind: 'note', slug: node.id, path: `wiki/notes/${node.id}.md`, autofocus: false });
          }}
          nodeCanvasObject={(n, ctx, globalScale) => {
            const node = n as MiniNode & { x: number; y: number };
            const r = node.isCenter ? 7 : 4.5;
            ctx.beginPath();
            ctx.arc(node.x, node.y, r, 0, 2 * Math.PI, false);
            ctx.fillStyle = node.color;
            ctx.fill();
            if (node.isCenter) {
              ctx.lineWidth = 1.5;
              ctx.strokeStyle = 'rgba(255,255,255,0.9)';
              ctx.stroke();
            }
            if (globalScale > 1.4 || node.isCenter) {
              const fontSize = Math.max(8, 11 / globalScale);
              ctx.font = `${fontSize}px system-ui, sans-serif`;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'top';
              ctx.fillStyle = 'rgba(40,40,40,0.85)';
              ctx.fillText(node.label, node.x, node.y + r + 2);
            }
          }}
        />
      </div>
      <div className="px-3 py-2 text-[10.5px]" style={{ color: 'var(--text-mid)', borderTop: '0.5px solid var(--hairline)' }}>
        {data.nodes.length - 1} neighbour{data.nodes.length - 1 === 1 ? '' : 's'} · click any node to navigate
      </div>
    </div>
  );
}
