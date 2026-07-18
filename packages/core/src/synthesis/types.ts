/**
 * Core types for the Active Wiki engines.
 * Storage lives in ~/mindbase-data/{synthesis,network,pulse}/ as JSON.
 */

export interface Citation {
  slug: string;
  line_range: [number, number]; // 1-indexed, inclusive
}

export interface SynthesisThread {
  heading: string;
  content: string;
  citations: Citation[];
}

export interface Contradiction {
  with_slug: string;
  your_claim_excerpt: string;
  conflicting_claim_excerpt: string;
  confidence: 'low' | 'medium' | 'high';
  explanation?: string;
}

export interface Gap {
  suggestion: string;
  related_notes: string[];
}

export interface SynthesisResult {
  topic: string;
  generated_at: string; // ISO
  model: string;
  source_hashes: Record<string, string>; // slug → sha256 of body
  summary: string;
  threads: SynthesisThread[];
  contradictions: Contradiction[];
  gaps: Gap[];
}

export interface PulseWeeklyWrite {
  slug: string;
  title: string;
  written_at: string;
  kind?: string;
}

export interface PulseNewConnection {
  from_slug: string;
  to_slug: string;
  reason: string;
  confidence: 'low' | 'medium' | 'high';
}

export interface PulseStaleNote {
  slug: string;
  title: string;
  days_since: number;
  kind?: string;
}

export interface PulseGap {
  suggestion: string;
  related_notes: string[];
}

export interface PulseSnapshot {
  generated_at: string;
  date: string; // YYYY-MM-DD
  greeting: string;
  weekly_writes: PulseWeeklyWrite[];
  new_connections: PulseNewConnection[];
  stale_notes: PulseStaleNote[];
  contradictions: Contradiction[];
  gaps: PulseGap[];
  srs_due_count: number;
}

export interface NetworkRelated {
  slug: string;
  similarity: number;
  why?: string;
}

export interface NetworkMissingLink {
  slug: string;
  reason: string;
  confidence: 'low' | 'medium' | 'high';
}

export interface NetworkMention {
  slug: string;
  snippet: string;
  date?: string;
}

export interface NetworkView {
  slug: string;
  generated_at: string;
  semantic_related: NetworkRelated[];
  missing_links: NetworkMissingLink[];
  contradictions: Contradiction[];
  mentioned_in: NetworkMention[];
}
