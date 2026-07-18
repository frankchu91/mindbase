import { compileL1, ingestPaste, type RawDoc } from '@mindbase/core';
import type { ServerContext } from '../context';
import { makeHybridSearchClosure } from './compile-deps';
import type { Inbox, InboxEntry } from './inbox';
import { transcribeAudio } from './audio';
import { extractText } from './ocr';
import { extractArticleText } from './article-extract';

/**
 * Background worker that drains the capture inbox.
 *
 * Each pending entry is:
 *   1) Resolved into plain text (transcribing audio / OCR'ing images as needed)
 *   2) Persisted as a RawDoc via {@link ingestPaste} with full capture provenance
 *   3) Compiled by {@link compileL1} into one or more wiki pages
 *   4) Marked as compiled (or failed) on the inbox
 */
export class CaptureWorker {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private ctx: ServerContext,
    private inbox: Inbox,
    private intervalMs: number = 60_000,
  ) {}

  start(): void {
    if (this.timer) return;
    const tick = async () => {
      if (this.running) return;
      this.running = true;
      try {
        const ids = await this.inbox.pendingIds();
        for (const id of ids) {
          try {
            await this.processOne(id);
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            await this.inbox.markFailed(id, msg).catch(() => {});
          }
        }
      } finally {
        this.running = false;
      }
    };
    // Fire once immediately so items queued before start() are not delayed by a full interval.
    tick();
    // setInterval is non-blocking; unref so we don't keep the event loop alive in tests.
    this.timer = setInterval(tick, this.intervalMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async processOne(id: string): Promise<void> {
    const entry = await this.inbox.read(id);
    // Allow retry from 'failed' state (Retry button in inbox UI); skip 'compiled' / 'processing'.
    if (!entry || (entry.status !== 'queued' && entry.status !== 'failed')) return;

    await this.inbox.markProcessing(id);

    const text = (await this.resolveText(entry)).trim();
    if (text.length < 10) {
      throw new Error('Captured content too short to compile');
    }

    const title = entry.title?.trim() || deriveTitle(text);

    // TODO(task-8): once ServerContext exposes a device store, look up the
    // human-readable device name from entry.captured_device_id and pass it
    // here instead of the raw ULID.
    const raw: RawDoc = await ingestPaste(this.ctx.store, {
      text,
      title,
      source_url: entry.url ?? null,
      captured_via: entry.captured_via,
      captured_at: entry.captured_at,
      kind: 'capture',
      captured_device: entry.captured_device_id,
      tags: entry.tags,
    });

    const adapter = this.ctx.getAdapter();
    const compiled = await compileL1({
      raw,
      adapter,
      store: this.ctx.store,
      model: this.ctx.config.model,
      wikiIndex: this.ctx.wikiIndex,
      hybridSearch: makeHybridSearchClosure(this.ctx),
    });

    let slug: string | undefined;
    for (const tr of compiled.tool_results) {
      if (tr.call.name === 'create_concept' && tr.result.ok) {
        const data = tr.result.data as { slug?: string } | undefined;
        if (data?.slug) {
          slug = data.slug;
          break;
        }
      }
    }
    if (!slug) {
      // Compile ran but produced no create_concept tool call. Common causes:
      //   - LLM proxy/endpoint unreachable (silent failure mode)
      //   - Captured content didn't warrant a concept (LLM judgment)
      //   - Tool-call parsing failed
      // Either way: don't silently fake-succeed with a non-existent wiki slug.
      // The raw doc is preserved; user can retry from the inbox.
      const errMsg = compiled.error
        ? `LLM compile produced no wiki page: ${compiled.error}`
        : 'LLM compile produced no wiki page (check that your LLM endpoint is reachable and the model supports tool calls)';
      throw new Error(errMsg);
    }

    await this.ctx.reindexWiki();
    await this.inbox.markCompiled(id, slug);

    // Incremental embedding update (fire-and-forget — doesn't block response)
    void this.ctx.embeddingIndexer?.indexOne(slug);
  }

  private async resolveText(entry: InboxEntry): Promise<string> {
    if (entry.type === 'audio' && entry.audio_path) {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        throw new Error('OPENAI_API_KEY is required for audio capture transcription');
      }
      return transcribeAudio(entry.audio_path, apiKey);
    }
    if (entry.type === 'image' && entry.image_path) {
      const ocr = await extractText(entry.image_path);
      if (entry.note && entry.note.trim()) {
        return `${entry.note.trim()}\n\n${ocr}`;
      }
      return ocr;
    }
    // For URL captures: if the client sent no body text, fetch the page and
    // run Mozilla Readability. The browser extension / iOS share extension
    // commonly send just { url, title } — same path RSS worker uses.
    if (entry.type === 'url' && entry.url && (!entry.text || entry.text.trim().length < 200)) {
      try {
        const { text, title } = await extractArticleText(entry.url, {
          userAgent: this.ctx.config.rss?.fetchUserAgent ?? 'MindBase/0.1',
          timeoutMs: this.ctx.config.rss?.fetchTimeoutMs ?? 15000,
        });
        const header = (entry.title ?? title ?? '').trim();
        const note = (entry.note ?? '').trim();
        const parts = [
          header ? `# ${header}` : '',
          note ? `> ${note}` : '',
          text,
        ].filter(Boolean);
        return parts.join('\n\n');
      } catch (err) {
        // If readability fails, fall back to whatever the client did send.
        // This covers paywalled / SPA-only / login-walled pages where we'll
        // at least preserve the title + note + url and let the LLM compile
        // a stub page.
        const fallback = [
          entry.title ? `# ${entry.title}` : '',
          entry.note ? `> ${entry.note}` : '',
          entry.url ? `Source: ${entry.url}` : '',
          entry.text ?? '',
          `_Readability extraction failed: ${(err as Error).message}_`,
        ].filter(Boolean).join('\n\n');
        return fallback;
      }
    }
    return entry.text ?? '';
  }
}

/** Derive a short, human-readable title from the first non-empty line of body text. */
export function deriveTitle(text: string): string {
  const firstLine = text.split('\n').find((l) => l.trim().length > 0);
  if (!firstLine) return 'Untitled capture';
  return firstLine.trim().slice(0, 80);
}
