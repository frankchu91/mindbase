import type { MetaJson, NoteKind } from '../types';
import type { Store } from '../storage/store';
import type { TemplateStore } from './template-store';

export interface CreateNoteParams {
  title?: string;
  slug?: string;
  kind?: string;
  template?: string;
  content?: string;
  tags?: string[];
  project?: string;
  variables?: Record<string, string>;
  createdVia: 'web' | 'mcp' | 'cli' | 'extension';
  mcpClient?: string;
  mcpTool?: string;
}

export interface CreateNoteResult {
  slug: string;
  path: string;
  meta: MetaJson;
  content: string;
  created: boolean; // false when slug already existed and we returned it untouched
}

export class SlugConflictError extends Error {
  constructor(public readonly existingSlug: string) {
    super(`slug already exists: ${existingSlug}`);
    this.name = 'SlugConflictError';
  }
}

const SLUG_RE = /^[a-z0-9][a-z0-9_-]*$/;

export function slugify(input: string): string {
  const s = input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return s || 'untitled';
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function todayIsoDate(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function shiftDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

/**
 * Resolve a day-of-week name (e.g. "Friday") from an ISO date string.
 * Anchored at noon local time so DST + adjacent-midnight cases don't shift
 * the rendered weekday. Used by both buildStandardVars (date_long) and
 * createOrOpenDaily (default title).
 */
export function dayNameOf(isoDate: string): string {
  return new Date(`${isoDate}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long' });
}

/**
 * Maps known template names to their corresponding note kind.
 * Unknown / user-defined templates fall back to 'note' at the call site.
 */
export const TEMPLATE_TO_KIND: Record<string, string> = {
  note: 'note',
  daily: 'daily',
  meeting: 'meeting',
  person: 'person',
  project: 'project',
};

export function buildStandardVars(opts: {
  title?: string;
  slug: string;
  now?: Date;
  isoDate?: string;
}): Record<string, string> {
  const isoDate = opts.isoDate ?? todayIsoDate(opts.now);
  // Anchor to noon local time so toLocaleDateString returns the correct
  // month-name / date parts for the requested date. Noon avoids DST edge cases.
  const anchored = opts.now ?? new Date(`${isoDate}T12:00:00`);
  const dayName = dayNameOf(isoDate);
  const monthName = anchored.toLocaleDateString('en-US', { month: 'long' });
  const dateLong = `${dayName}, ${monthName} ${anchored.getDate()}, ${anchored.getFullYear()}`;
  const time = `${pad(anchored.getHours())}:${pad(anchored.getMinutes())}`;
  return {
    date: isoDate,
    date_long: dateLong,
    time,
    title: opts.title ?? '',
    slug: opts.slug,
    yesterday_slug: `daily-${shiftDays(isoDate, -1)}`,
    tomorrow_slug: `daily-${shiftDays(isoDate, +1)}`,
  };
}

async function pageExists(store: Store, slug: string): Promise<boolean> {
  return store.exists(`wiki/notes/${slug}.meta.json`);
}

async function uniqueSlug(store: Store, base: string): Promise<string> {
  let candidate = base;
  let i = 2;
  while (await pageExists(store, candidate)) {
    candidate = `${base}-${i}`;
    i += 1;
  }
  return candidate;
}

export async function createNote(
  store: Store,
  templates: TemplateStore,
  params: CreateNoteParams,
): Promise<CreateNoteResult> {
  // 1. Derive slug
  let slug: string;
  if (params.slug) {
    if (!SLUG_RE.test(params.slug)) throw new Error(`invalid slug: '${params.slug}'`);
    if (await pageExists(store, params.slug)) {
      throw new SlugConflictError(params.slug);
    }
    slug = params.slug;
  } else {
    const base = params.title
      ? slugify(params.title)
      : `untitled-${todayIsoDate()}-${Date.now().toString().slice(-4)}`;
    slug = await uniqueSlug(store, base);
  }

  // Friendly fallback title when caller doesn't supply one. The slug
  // itself ("untitled-2026-05-17-1423") is ugly for the sidebar; show
  // "Untitled YYYY-MM-DD" instead. The PUT route auto-syncs this from
  // the body's first H1 on first save, so the placeholder is short-lived.
  const effectiveTitle = params.title || `Untitled ${todayIsoDate()}`;

  // 2. Resolve body — explicit content wins; otherwise apply template; otherwise blank
  let body = '';
  if (typeof params.content === 'string' && params.content.length > 0) {
    body = params.content;
  } else if (params.template) {
    const tmplBody = await templates.get(params.template);
    if (tmplBody === null) throw new Error(`template not found: '${params.template}'`);
    const vars = { ...buildStandardVars({ title: effectiveTitle, slug }), ...(params.variables ?? {}) };
    body = templates.apply(tmplBody, vars);
  } else {
    body = `# ${effectiveTitle}\n\n`;
  }

  // 3. Build meta
  const now = new Date().toISOString();
  const meta: MetaJson = {
    id: slug,
    type: 'concept',
    title: effectiveTitle,
    created: now,
    updated: now,
    sources: [],
    related: [],
    one_liner: '',
    word_count: body.split(/\s+/).filter(Boolean).length,
    compile_version: 0,
    edit_state: 'human_touched',
    last_human_edit: now,
    kind: (params.kind ?? 'note') as NoteKind,
    created_via: params.createdVia,
    ...(params.mcpClient ? { mcp_client: params.mcpClient } : {}),
    ...(params.mcpTool ? { mcp_tool: params.mcpTool } : {}),
    ...(params.project ? { project: params.project } : {}),
  };
  if (params.tags && params.tags.length > 0) {
    meta.tags = params.tags;
  }

  // 4. Persist
  const mdPath = `wiki/notes/${slug}.md`;
  const metaPath = `wiki/notes/${slug}.meta.json`;
  await store.writeText(mdPath, body);
  await store.writeJSON(metaPath, meta);

  return { slug, path: mdPath, meta, content: body, created: true };
}

export async function createOrOpenDaily(
  store: Store,
  templates: TemplateStore,
  opts: { isoDate?: string; createdVia: 'web' | 'mcp' | 'cli' | 'extension'; mcpClient?: string; mcpTool?: string },
): Promise<CreateNoteResult> {
  const isoDate = opts.isoDate ?? todayIsoDate();
  const slug = `daily-${isoDate}`;

  // If exists, return it untouched
  if (await pageExists(store, slug)) {
    const meta = await store.readJSON<MetaJson>(`wiki/notes/${slug}.meta.json`);
    const content = await store.readText(`wiki/notes/${slug}.md`);
    return { slug, path: `wiki/notes/${slug}.md`, meta, content, created: false };
  }

  // Else create from the 'daily' template (falls back to bare title if missing)
  const tmpl = (await templates.get('daily')) ?? `# {{date_long}}\n\n`;
  const vars = buildStandardVars({ slug, isoDate });
  const body = templates.apply(tmpl, vars);

  const dayName = dayNameOf(isoDate);

  const result = await createNote(store, templates, {
    slug,
    kind: 'daily',
    content: body,
    title: `${dayName} ${isoDate}`,
    createdVia: opts.createdVia,
    mcpClient: opts.mcpClient,
    mcpTool: opts.mcpTool,
  });
  return { ...result, created: true };
}
