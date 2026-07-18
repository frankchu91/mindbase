// Lightweight YAML frontmatter helpers for wiki/schema.md.
//
// Surgical line-based edits preserve comments and ordering. All known leaf
// keys are globally unique (see schema-templates/*.md), so a leaf-key match
// without parent disambiguation is safe.

export type SchemaSettings = {
  ingest: {
    discuss_takeaways: boolean;
    require_citations: boolean;
    auto_classify_folders: boolean;
    target_pages_per_source: number;
  };
  linking: {
    edge_types: string[];
  };
  lint: {
    stale_after_days: number;
  };
  query: {
    offer_to_file_back: boolean;
  };
};

export const DEFAULT_SETTINGS: SchemaSettings = {
  ingest: {
    discuss_takeaways: true,
    require_citations: true,
    auto_classify_folders: false,
    target_pages_per_source: 8,
  },
  linking: { edge_types: ['related-to'] },
  lint: { stale_after_days: 90 },
  query: { offer_to_file_back: true },
};

const FENCE = '---';

export function splitFile(content: string): { frontmatter: string; body: string } {
  const lines = content.split('\n');
  if (lines[0]?.trim() !== FENCE) return { frontmatter: '', body: content };
  const end = lines.findIndex((l, i) => i > 0 && l.trim() === FENCE);
  if (end < 0) return { frontmatter: '', body: content };
  const frontmatter = lines.slice(1, end).join('\n');
  const body = lines.slice(end + 1).join('\n');
  return { frontmatter, body };
}

export function joinFile(frontmatter: string, body: string): string {
  const fmTrimmed = frontmatter.replace(/\n+$/, '');
  const bodyTrimmed = body.replace(/^\n+/, '');
  return `${FENCE}\n${fmTrimmed}\n${FENCE}\n\n${bodyTrimmed}`;
}

function leafLineRegex(key: string): RegExp {
  // Matches "  key: value" or "  key: value  # comment", any leading indent ≥2.
  return new RegExp(`^(\\s{2,}${escape(key)}:\\s*)([^#\\n]*?)(\\s*(#.*)?)$`, 'm');
}

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function readLeaf(fm: string, key: string): string | undefined {
  const m = fm.match(leafLineRegex(key));
  return m ? m[2]?.trim() : undefined;
}

function writeLeaf(fm: string, key: string, raw: string): string {
  const re = leafLineRegex(key);
  if (re.test(fm)) return fm.replace(re, (_full, p1, _p2, p3) => `${p1}${raw}${p3}`);
  // Leaf not present — append at end (rare; templates ship every key).
  return `${fm.replace(/\n+$/, '')}\n${key}: ${raw}\n`;
}

function parseBool(v: string | undefined, fallback: boolean): boolean {
  if (v === undefined) return fallback;
  if (v === 'true') return true;
  if (v === 'false') return false;
  return fallback;
}

function parseNum(v: string | undefined, fallback: number): number {
  if (v === undefined) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function parseList(v: string | undefined, fallback: string[]): string[] {
  if (!v) return fallback;
  const m = v.match(/^\[(.*)\]$/);
  if (!m) return fallback;
  return m[1]!
    .split(',')
    .map((s) => s.trim().replace(/^["']|["']$/g, ''))
    .filter(Boolean);
}

export function parseSettings(frontmatter: string): SchemaSettings {
  const d = DEFAULT_SETTINGS;
  return {
    ingest: {
      discuss_takeaways: parseBool(readLeaf(frontmatter, 'discuss_takeaways'), d.ingest.discuss_takeaways),
      require_citations: parseBool(readLeaf(frontmatter, 'require_citations'), d.ingest.require_citations),
      auto_classify_folders: parseBool(readLeaf(frontmatter, 'auto_classify_folders'), d.ingest.auto_classify_folders),
      target_pages_per_source: parseNum(readLeaf(frontmatter, 'target_pages_per_source'), d.ingest.target_pages_per_source),
    },
    linking: {
      edge_types: parseList(readLeaf(frontmatter, 'edge_types'), d.linking.edge_types),
    },
    lint: {
      stale_after_days: parseNum(readLeaf(frontmatter, 'stale_after_days'), d.lint.stale_after_days),
    },
    query: {
      offer_to_file_back: parseBool(readLeaf(frontmatter, 'offer_to_file_back'), d.query.offer_to_file_back),
    },
  };
}

export type SettingPath =
  | 'ingest.discuss_takeaways'
  | 'ingest.require_citations'
  | 'ingest.auto_classify_folders'
  | 'ingest.target_pages_per_source'
  | 'linking.edge_types'
  | 'lint.stale_after_days'
  | 'query.offer_to_file_back';

export function setSetting(
  frontmatter: string,
  path: SettingPath,
  value: boolean | number | string[],
): string {
  const leaf = path.split('.')[1]!;
  let raw: string;
  if (typeof value === 'boolean') raw = value ? 'true' : 'false';
  else if (typeof value === 'number') raw = String(value);
  else raw = `[${value.join(', ')}]`;
  return writeLeaf(frontmatter, leaf, raw);
}
