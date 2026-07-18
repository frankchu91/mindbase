import type { Visibility, WikiFileType } from '../types';
import type { EdgeType } from './index/edge-type';

export interface PageNode {
  slug: string;
  path: string;
  title: string;
  type: WikiFileType;
  tags: string[];
  category: string;
  visibility?: Visibility;
  project?: string;
  /** Owning project id (multi-project graph). */
  projectId?: string;
  /** Lightweight stub representing a cross-project link target. */
  crossProjectStub?: boolean;
  wordCount: number;
  summary?: string;
  kind?: string; // mirrors MetaJson.kind — note kind for UX differentiation
  community_id?: number | null;
}

export type EdgeConfidence = 'extracted' | 'inferred' | 'ambiguous';

export interface PageEdge {
  source: string;
  target: string;
  confidence: EdgeConfidence;
  broken: boolean;
  /** Phase 2: typed edge (mentions / elaborates / cites / ...). */
  edgeType: EdgeType;
  /** Phase 2: which rule inferred this type, or null for pure fallback. */
  inferenceRule: string | null;
  /** Multi-project graph: source and target live in different projects. */
  crossProject?: boolean;
  sourceProjectId?: string;
  targetProjectId?: string;
}

export interface PageGraph {
  nodes: Map<string, PageNode>;
  edges: PageEdge[];
  incoming: Map<string, string[]>;
  outgoing: Map<string, string[]>;
}

export interface HubInfo {
  slug: string;
  title: string;
  incoming: number;
  outgoing: number;
  role: 'connector' | 'sink';
}

export interface BridgeInfo {
  slug: string;
  title: string;
  bridges: string;
  pairCount: number;
}

export interface CohesionInfo {
  tag: string;
  pageCount: number;
  score: number;
}

export interface SurprisingEdge {
  source: string;
  target: string;
  reason: string;
  score: number;
}

export interface OrphanAdjacent {
  slug: string;
  title: string;
  linkedFrom: string[];
}

export interface BrokenLink {
  source: string;
  target: string;
}

export interface InsightsDelta {
  newPages: number;
  removedPages: number;
  newLinks: number;
  removedLinks: number;
  newlyConnected: string[];
  lostIncoming: string[];
}

export interface InsightsReport {
  generatedAt: string;
  pageCount: number;
  edgeCount: number;
  hubs: HubInfo[];
  bridges: BridgeInfo[];
  cohesion: { cohesive: CohesionInfo[]; fragmented: CohesionInfo[] };
  surprising: SurprisingEdge[];
  orphanAdjacent: OrphanAdjacent[];
  orphans: string[];
  brokenLinks: BrokenLink[];
  delta?: InsightsDelta;
  questions: string[];
}
