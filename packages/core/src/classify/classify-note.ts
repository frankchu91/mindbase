import type { Store } from '../storage/store';
import type { LLMAdapter } from '../adapters/types';
import type { MetaJson } from '../types';
import { loadFolders, INBOX_PATH } from './folders';
import { loadClassifyRules } from './rules';
import { sampleNotesPerFolder } from './samples';
import { buildClassifyPrompt } from './prompt';

export interface ClassifyResult {
  folder: string;
  reason: string;
}

export interface ClassifyNoteInput {
  adapter: LLMAdapter;
  store: Store;
  slug: string;
  model: string;
}

/**
 * Content-agnostic classification — works for any title+body pair, not just
 * notes loaded from disk. `classifyNote` is the slug-based convenience wrapper;
 * use this directly for raw imports, captures, or anything else without a
 * `wiki/notes/<slug>.md` shape.
 */
export interface ClassifyContentInput {
  adapter: LLMAdapter;
  store: Store;
  model: string;
  title: string;
  body: string;
}

const ATTACHMENT_URL_RE = /\/api\/wiki\/attachments\/([^/)\s]+)\/([0-9a-f]+\.(?:png|jpg|jpeg|gif|webp))/gi;

/**
 * Scan markdown for attachment refs and append OCR sidecar text (if any).
 * Returns the body with OCR text appended as "[OCR from <filename>]\n<text>"
 * blocks. Missing sidecars are silently skipped (worker may not have run yet,
 * or the image had no text).
 */
async function appendOcrText(store: Store, body: string): Promise<string> {
  const matches = Array.from(body.matchAll(ATTACHMENT_URL_RE));
  if (matches.length === 0) return body;
  const blocks: string[] = [];
  for (const m of matches) {
    const slugDir = m[1]!;
    const file = m[2]!;
    const ocrPath = `attachments/${slugDir}/${file}.ocr.txt`;
    try {
      const txt = await store.readText(ocrPath);
      if (txt.trim().length > 0) {
        blocks.push(`[OCR from ${file}]\n${txt.trim()}`);
      }
    } catch { /* sidecar missing — skip */ }
  }
  if (blocks.length === 0) return body;
  return `${body}\n\n${blocks.join('\n\n')}`;
}

/**
 * Single-turn LLM classification on a title+body pair. No disk reads — caller
 * supplies the content. On any failure (parse, invalid folder, adapter error)
 * returns { folder: 'inbox', reason: '<why it failed>' } so the caller can
 * always write a result.
 */
export async function classifyContent(input: ClassifyContentInput): Promise<ClassifyResult> {
  const { adapter, store, model, title, body } = input;

  const folders = await loadFolders(store);
  const userRules = await loadClassifyRules(store);
  const samples = await sampleNotesPerFolder(store);
  const validPaths = new Set(folders.map((f) => f.path));

  const messages = buildClassifyPrompt({
    folders, samples, userRules,
    noteTitle: title,
    noteContent: body,
  });

  let text = '';
  let errored = false;
  try {
    for await (const chunk of adapter.chat({
      model,
      messages,
      max_tokens: 200,
      temperature: 0.2,
    })) {
      if (chunk.kind === 'delta') text += chunk.text;
      if (chunk.kind === 'error') { errored = true; break; }
    }
  } catch {
    errored = true;
  }
  if (errored) {
    return { folder: INBOX_PATH, reason: 'AI classification failed (adapter error) — please reassign' };
  }

  let parsed: { folder?: unknown; reason?: unknown };
  try {
    const cleaned = text.trim().replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
    parsed = JSON.parse(cleaned);
  } catch {
    return { folder: INBOX_PATH, reason: 'AI classification failed (invalid JSON) — please reassign' };
  }

  const folder = typeof parsed.folder === 'string' ? parsed.folder : '';
  const reason = typeof parsed.reason === 'string' ? parsed.reason : '';

  if (!validPaths.has(folder)) {
    return {
      folder: INBOX_PATH,
      reason: `AI suggested unknown folder "${folder}" — please reassign`,
    };
  }

  return { folder, reason: reason || 'classified by AI' };
}

/**
 * Slug-based convenience wrapper for notes stored at `wiki/notes/<slug>.md`.
 * Throws only if the note itself doesn't exist.
 */
export async function classifyNote(input: ClassifyNoteInput): Promise<ClassifyResult> {
  const { adapter, store, slug, model } = input;

  const meta = await store.readJSON<MetaJson>(`wiki/notes/${slug}.meta.json`);
  const rawBody = await store.readText(`wiki/notes/${slug}.md`);
  const body = await appendOcrText(store, rawBody);

  return classifyContent({ adapter, store, model, title: meta.title, body });
}
