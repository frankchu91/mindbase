// packages/core/src/wiki/log-parse.test.ts
import { describe, it, expect } from 'vitest';
import { parseLog, filterSince, LogEntry } from './log-parse';

const sample = `# MindBase Wiki Log

## [2026-05-22T20:00:59.220Z] ingest | Faster R-CNN
- Source: manual input
- Raw ID: kzfriv
- Total actions: 22

## [2026-05-22T20:10:51.246Z] ingest | Focal Loss
- Source: manual input
- Total actions: 18

## [2026-05-21] query | Recent papers
- Query: transformer attention mechanisms
- Results count: 5
`;

describe('parseLog', () => {
  it('extracts entries with timestamp + kind + title + bullets', () => {
    const entries = parseLog(sample);
    expect(entries).toHaveLength(3);
    // First entry is newest (Focal Loss)
    expect(entries[0]!.kind).toBe('ingest');
    expect(entries[0]!.title).toContain('Focal Loss');
    expect(entries[0]!.bullets['Source']).toBe('manual input');
    expect(entries[0]!.bullets['Total actions']).toBe('18');
  });

  it('sorts entries by timestamp descending (newest first)', () => {
    const entries = parseLog(sample);
    expect(entries).toHaveLength(3);
    // ISO timestamps sort lexicographically
    expect(entries[0]!.timestamp).toBe('2026-05-22T20:10:51.246Z'); // Focal Loss
    expect(entries[1]!.timestamp).toBe('2026-05-22T20:00:59.220Z'); // Faster R-CNN
    expect(entries[2]!.timestamp).toBe('2026-05-21');
  });

  it('parses YYYY-MM-DD dates', () => {
    const entries = parseLog(sample);
    const dateEntry = entries.find((e) => e.title.includes('Recent'));
    expect(dateEntry!.timestamp).toBe('2026-05-21');
  });

  it('returns [] for empty or header-only log', () => {
    expect(parseLog('# Log\n\n')).toEqual([]);
    expect(parseLog('')).toEqual([]);
  });

  it('preserves original raw text in entry', () => {
    const entries = parseLog(sample);
    const queryEntry = entries.find((e) => e.kind === 'query')!;
    expect(queryEntry.raw).toContain('## [');
    expect(queryEntry.raw).toContain('query');
  });

  it('handles entries with many bullets', () => {
    const entries = parseLog(sample);
    const ingestEntry = entries.find((e) => e.kind === 'ingest')!;
    expect(Object.keys(ingestEntry.bullets).length).toBeGreaterThanOrEqual(2);
  });

  it('ignores malformed headers', () => {
    const malformed = `# Log
## Malformed header (no date)
- key: value

## [2026-05-22] ingest | Valid
- key: value
`;
    const entries = parseLog(malformed);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.title).toContain('Valid');
  });

  it('handles bullets with multiple colons', () => {
    const withColons = `## [2026-05-22] ingest | Test
- Message: This is: a test: with colons
`;
    const entries = parseLog(withColons);
    expect(entries[0]!.bullets['Message']).toBe('This is: a test: with colons');
  });
});

describe('filterSince', () => {
  it('keeps entries within time window', () => {
    const entries = parseLog(sample);
    // Include everything from 2026
    const recent = filterSince(entries, 365 * 86400_000 * 100);
    expect(recent.length).toBeGreaterThanOrEqual(1);
  });

  it('returns empty for very short window (1ms)', () => {
    const entries = parseLog(sample);
    const ancient = filterSince(entries, 1);
    expect(ancient.length).toBe(0);
  });

  it('works with ISO timestamps', () => {
    const isoSample = `## [2026-05-24T10:30:00Z] ingest | Test ISO
- key: value
`;
    const entries = parseLog(isoSample);
    const cutoff = 100 * 365 * 86400_000; // 100 years in future
    const result = filterSince(entries, cutoff);
    expect(result.length).toBe(1);
  });

  it('works with date-only timestamps', () => {
    const dateSample = `## [2026-05-24] ingest | Test Date
- key: value
`;
    const entries = parseLog(dateSample);
    // Future-date the cutoff so the old entry is still included
    const cutoff = 100 * 365 * 86400_000;
    const result = filterSince(entries, cutoff);
    expect(result.length).toBe(1);
  });
});
