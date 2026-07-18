import type { SynthesisThread, Gap, Contradiction, PulseSnapshot, NetworkView } from '@mindbase/core';

export interface SynthesisStreamEvent {
  kind: 'meta' | 'thread' | 'gap' | 'contradiction' | 'done' | 'error';
  payload: unknown;
}

/**
 * Stream a synthesis result via SSE. Caller passes `onEvent` to react to
 * incremental pieces.
 */
export async function synthesizeTopic(
  topic: string,
  opts: { onEvent: (e: SynthesisStreamEvent) => void; signal?: AbortSignal; force?: boolean },
): Promise<void> {
  const res = await fetch('/api/synthesize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ topic, force: opts.force ?? false }),
    signal: opts.signal,
  });
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let lineEnd: number;
    while ((lineEnd = buf.indexOf('\n\n')) !== -1) {
      const frame = buf.slice(0, lineEnd);
      buf = buf.slice(lineEnd + 2);
      const eventLine = frame.match(/^event:\s*(\S+)/m);
      const dataLine = frame.match(/^data:\s*(.+)$/m);
      if (!eventLine || !dataLine) continue;
      const kind = eventLine[1] as SynthesisStreamEvent['kind'];
      try {
        opts.onEvent({ kind, payload: JSON.parse(dataLine[1]!) });
      } catch { /* skip malformed */ }
    }
  }
}

export async function getPulse(date?: string, refresh?: boolean): Promise<PulseSnapshot> {
  const qs = new URLSearchParams();
  if (date) qs.set('date', date);
  if (refresh) qs.set('refresh', 'true');
  const res = await fetch(`/api/pulse?${qs}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as PulseSnapshot;
}

export async function getNetwork(slug: string, refresh?: boolean): Promise<NetworkView> {
  const qs = refresh ? '?refresh=true' : '';
  const res = await fetch(`/api/network/${encodeURIComponent(slug)}${qs}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as NetworkView;
}

export type { SynthesisThread, Gap, Contradiction, PulseSnapshot, NetworkView };

export interface SchemaFileEntry { file: string; modified: boolean; }

export async function listSchemaFiles(): Promise<SchemaFileEntry[]> {
  const res = await fetch('/api/schema');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return ((await res.json()) as { files: SchemaFileEntry[] }).files;
}

export async function getSchemaFile(file: string): Promise<string> {
  const res = await fetch(`/api/schema/${encodeURIComponent(file)}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return ((await res.json()) as { content: string }).content;
}

export async function putSchemaFile(file: string, content: string): Promise<void> {
  const res = await fetch(`/api/schema/${encodeURIComponent(file)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

export async function resetSchemaFile(file: string): Promise<void> {
  const res = await fetch(`/api/schema/${encodeURIComponent(file)}/reset`, { method: 'POST' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

export interface InsightsReport {
  page_count: number;
  edge_count: number;
  hubs: Array<{ slug: string; in_count: number; out_count: number; role: string }>;
  orphans: string[];
  broken_links: Array<{ from: string; to: string }>;
  generated_at: string;
}

export async function getInsights(refresh?: boolean): Promise<InsightsReport> {
  const qs = refresh ? '?refresh=true' : '';
  const res = await fetch(`/api/wiki/insights${qs}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as InsightsReport;
}

export interface AnalysisCommunitySummary {
  id: number;
  size: number;
  label: string;
}
export interface AnalysisGodNode {
  slug: string;
  title: string;
  inboundCount: number;
  outboundCount: number;
}
export interface AnalysisBridgeNode {
  slug: string;
  title: string;
  communityCount: number;
  communities: number[];
  neighborCount: number;
}
export interface AnalysisOrphanCluster {
  slugs: string[];
  size: number;
}
export interface AnalysisSuggestion {
  kind: 'orphan_cluster' | 'contradiction' | 'god_node_disambiguation' | 'bridge_elaboration' | 'ambiguous_edge';
  message: string;
  actionable: { slugs: string[] };
  severity: 'low' | 'medium' | 'high';
}
export interface AnalysisContradiction {
  slugA: string;
  slugB: string;
  reason: string;
}
export interface AnalysisInsightsPayload {
  communities: AnalysisCommunitySummary[];
  godNodes: AnalysisGodNode[];
  bridgeNodes: AnalysisBridgeNode[];
  orphanClusters: AnalysisOrphanCluster[];
  suggestions: AnalysisSuggestion[];
  contradictions: AnalysisContradiction[];
  computedAt: string;
}

export async function getAnalysisInsights(): Promise<AnalysisInsightsPayload | null> {
  try {
    const r = await fetch('/api/analysis/insights');
    if (!r.ok) return null;
    const j = (await r.json()) as { insights: AnalysisInsightsPayload };
    return j.insights;
  } catch {
    return null;
  }
}
