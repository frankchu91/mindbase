// packages/core/src/wiki/log-parse.ts
/**
 * Parser for log.md — activity timeline for dashboard (F7).
 *
 * Log format per CLAUDE.md:
 *   ## [YYYY-MM-DD] {ingest|query|lint} | <title>
 *   - key: value
 *   - key2: value2
 */

export interface LogEntry {
  timestamp: string;    // ISO date like "2026-05-22"
  kind: string;         // "ingest" | "query" | "lint"
  title: string;
  bullets: Record<string, string>;
  raw: string;          // original block text
}

const HEADER_RE = /^##\s+\[([^\]]+)\]\s+(\w+)\s+\|\s+(.+)$/;

/**
 * parseLog — extract all entries from log.md body.
 * Returns sorted by timestamp descending (newest first).
 */
export function parseLog(body: string): LogEntry[] {
  const entries: LogEntry[] = [];

  // Split by headers (look-ahead to avoid losing text)
  const blocks = body.split(/\n(?=##\s+\[)/);

  for (const block of blocks) {
    const lines = block.split('\n');
    const headerLine = lines[0]?.trim() ?? '';
    const m = HEADER_RE.exec(headerLine);
    if (!m) continue;

    const [, timestamp, kind, title] = m;

    // Parse bullet list into Record<key, value>
    const bullets: Record<string, string> = {};
    for (const line of lines.slice(1)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      // Match "- key: value" or "- key: value1 value2 ..."
      const bm = /^-\s+([^:]+):\s*(.+)$/.exec(trimmed);
      if (bm) {
        bullets[bm[1]!.trim()] = bm[2]!.trim();
      }
    }

    entries.push({
      timestamp: timestamp!,
      kind: kind!,
      title: title!,
      bullets,
      raw: block,
    });
  }

  // Sort descending by timestamp (newest first)
  return entries.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

/**
 * filterSince — keep only entries within the last N milliseconds.
 * Uses simple string date comparison; handles ISO dates like "2026-05-22".
 *
 * Example: filterSince(entries, 7 * 24 * 60 * 60 * 1000) for last 7 days.
 */
export function filterSince(entries: LogEntry[], sinceMs: number): LogEntry[] {
  const cutoff = Date.now() - sinceMs;
  return entries.filter((e) => {
    // Try ISO date parsing; fall back to timestamp string comparison
    const t = Date.parse(e.timestamp);
    if (Number.isFinite(t)) {
      return t >= cutoff;
    }
    // Fallback: simple string comparison (works for YYYY-MM-DD)
    const cutoffDate = new Date(cutoff).toISOString().split('T')[0];
    return e.timestamp >= (cutoffDate ?? '');
  });
}
