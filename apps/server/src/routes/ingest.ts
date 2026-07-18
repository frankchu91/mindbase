import { Router } from 'express';
import multer from 'multer';
import { ingestPaste, ingestFile } from '@mindbase/core';
import type { ServerContext } from '../context';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// URL detection
const YT_REGEX = /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/;
const URL_REGEX = /^https?:\/\/\S+$/;

function extractYouTubeId(text: string): string | null {
  const match = text.trim().match(YT_REGEX);
  return match?.[1] ?? null;
}

function isUrl(text: string): boolean {
  return URL_REGEX.test(text.trim());
}

async function fetchUrlContent(url: string): Promise<{ title: string; text: string; kind: 'pdf' | 'webpage' }> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/pdf,*/*',
    },
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`Failed to fetch URL: ${res.status}`);

  const contentType = res.headers.get('content-type') ?? '';

  // PDF
  if (contentType.includes('application/pdf') || url.toLowerCase().endsWith('.pdf')) {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const buf = await res.arrayBuffer();
    const doc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
    const parts: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const pageText = content.items
        .map((it) => ('str' in it ? (it as { str: string }).str : ''))
        .join(' ');
      parts.push(pageText);
    }
    // Try to get title from first line or URL
    const text = parts.join('\n\n');
    const firstLine = text.split('\n').find((l) => l.trim().length > 10)?.trim() ?? url;
    return { title: firstLine.slice(0, 120), text, kind: 'pdf' };
  }

  // HTML webpage
  const html = await res.text();

  // Extract title
  let title = url;
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch?.[1]) {
    title = titleMatch[1].trim();
  }

  // Extract main content: try article/main, fallback to body
  // Simple extraction — strip tags, scripts, styles
  let content = html;
  // Remove script and style blocks
  content = content.replace(/<script[\s\S]*?<\/script>/gi, '');
  content = content.replace(/<style[\s\S]*?<\/style>/gi, '');
  content = content.replace(/<nav[\s\S]*?<\/nav>/gi, '');
  content = content.replace(/<header[\s\S]*?<\/header>/gi, '');
  content = content.replace(/<footer[\s\S]*?<\/footer>/gi, '');

  // Try to find article or main content
  const articleMatch = content.match(/<article[^>]*>([\s\S]*?)<\/article>/i)
    ?? content.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
  if (articleMatch?.[1]) {
    content = articleMatch[1];
  }

  // Strip remaining HTML tags
  content = content.replace(/<[^>]+>/g, ' ');
  // Clean whitespace
  content = content.replace(/\s+/g, ' ').trim();

  if (content.length < 50) {
    throw new Error('Could not extract meaningful content from this URL');
  }

  return { title, text: content, kind: 'webpage' };
}

async function fetchYouTubeTranscript(videoId: string): Promise<{ title: string; text: string }> {
  const { execSync } = await import('node:child_process');
  const os = await import('node:os');
  const fs = await import('node:fs/promises');
  const path = await import('node:path');

  const tmpDir = path.join(os.tmpdir(), `atlas-yt-${videoId}`);
  await fs.mkdir(tmpDir, { recursive: true });
  const outPath = path.join(tmpDir, 'sub');

  try {
    let title = `YouTube: ${videoId}`;
    try {
      title = execSync(
        `yt-dlp --get-title "https://www.youtube.com/watch?v=${videoId}"`,
        { encoding: 'utf-8', timeout: 15000 },
      ).trim();
    } catch (e) { console.warn(`[yt-dlp] Failed to get title for ${videoId}:`, (e as Error).message); }

    try {
      execSync(
        `yt-dlp --write-auto-sub --sub-lang "en,en-US,zh-Hans,zh,ja,ko,es,fr,de" --skip-download --sub-format vtt -o "${outPath}" "https://www.youtube.com/watch?v=${videoId}"`,
        { encoding: 'utf-8', timeout: 30000, stdio: 'pipe' },
      );
    } catch (e) {
      console.warn(`[yt-dlp] Preferred langs failed, trying any lang:`, (e as Error).message);
      execSync(
        `yt-dlp --write-auto-sub --skip-download --sub-format vtt -o "${outPath}" "https://www.youtube.com/watch?v=${videoId}"`,
        { encoding: 'utf-8', timeout: 30000, stdio: 'pipe' },
      );
    }

    const files = await fs.readdir(tmpDir);
    const vttFile = files.find((f) => f.endsWith('.vtt'));
    if (!vttFile) throw new Error('No subtitle file generated');

    const vtt = await fs.readFile(path.join(tmpDir, vttFile), 'utf-8');

    const lines = vtt.split('\n');
    const textParts: string[] = [];
    const seen = new Set<string>();
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (trimmed.startsWith('WEBVTT')) continue;
      if (trimmed.startsWith('Kind:')) continue;
      if (trimmed.startsWith('Language:')) continue;
      if (trimmed.includes('-->')) continue;
      if (/^\d+$/.test(trimmed)) continue;
      const clean = trimmed.replace(/<[^>]+>/g, '').trim();
      if (!clean) continue;
      if (seen.has(clean)) continue;
      seen.add(clean);
      textParts.push(clean);
    }

    if (textParts.length === 0) throw new Error('No transcript text extracted');

    return { title, text: textParts.join(' ') };
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

async function extractPdfText(file: File): Promise<string> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
  const parts: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((it) => ('str' in it ? (it as { str: string }).str : ''))
      .join(' ');
    parts.push(pageText);
  }
  return parts.join('\n\n');
}

const EXT_TO_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc: 'application/msword',
  epub: 'application/epub+zip',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
};

/**
 * Save the original uploaded file alongside the extracted .md. Writes the
 * RAW binary (not base64-encoded text) so the LLM-native PDF path can
 * forward it directly. Also persists `binary_path` + `binary_mime` into the
 * raw doc's meta.json so `findRawDoc` recovers them on read.
 */
async function saveOriginalFile(store: import('@mindbase/core').Store, rawId: string, fileName: string, buffer: Buffer, sourceDate?: string) {
  const { todayDir } = await import('@mindbase/core/src/storage/paths');
  const date = sourceDate ?? todayDir();
  const ext = (fileName.split('.').pop() ?? 'bin').toLowerCase();
  const originalPath = `raw/${date}/${rawId}.original.${ext}`;
  await store.writeBinary(originalPath, new Uint8Array(buffer));

  // Backfill meta.json with binary fields so findRawDoc can find this on the
  // fast path (without falling back to filesystem probing).
  const mime = EXT_TO_MIME[ext];
  if (!mime) return; // unsupported extension — file is on disk but no meta update
  const metaPath = `raw/${date}/${rawId}.meta.json`;
  try {
    const meta = await store.readJSON<Record<string, unknown>>(metaPath);
    meta['binary_path'] = originalPath;
    meta['binary_mime'] = mime;
    await store.writeJSON(metaPath, meta);
  } catch {
    /* meta missing — saveOriginalFile is best-effort */
  }
}

export function ingestRoutes(ctx: ServerContext): Router {
  const router = Router();

  router.post('/text', async (req, res) => {
    try {
      const { text, title, source_url } = req.body as { text: string; title?: string; source_url?: string };
      if (!text?.trim()) {
        res.status(400).json({ ok: false, error: 'text is required' });
        return;
      }

      // Check if the text is a YouTube URL
      const ytId = extractYouTubeId(text);
      if (ytId) {
        try {
          const yt = await fetchYouTubeTranscript(ytId);
          const raw = await ingestPaste(ctx.store, {
            text: yt.text,
            title: title || yt.title,
            source_url: `https://www.youtube.com/watch?v=${ytId}`,
          });
          res.json({ ok: true, rawId: raw.id, title: title || yt.title, kind: 'youtube' });
          return;
        } catch (e) {
          res.status(400).json({ ok: false, error: `YouTube transcript failed: ${(e as Error).message}` });
          return;
        }
      }

      // Check if the text is a URL (non-YouTube)
      if (isUrl(text)) {
        try {
          const fetched = await fetchUrlContent(text);
          const raw = await ingestPaste(ctx.store, {
            text: fetched.text,
            title: title || fetched.title,
            source_url: text,
          });
          res.json({ ok: true, rawId: raw.id, title: title || fetched.title, kind: fetched.kind });
          return;
        } catch (e) {
          res.status(400).json({ ok: false, error: `URL fetch failed: ${(e as Error).message}` });
          return;
        }
      }

      const raw = await ingestPaste(ctx.store, { text, title, source_url });
      res.json({ ok: true, rawId: raw.id, title: raw.title, kind: 'text' });
    } catch (e) {
      res.status(500).json({ ok: false, error: (e as Error).message });
    }
  });

  router.post('/file', upload.single('file'), async (req, res) => {
    try {
      const file = req.file;
      if (!file) {
        res.status(400).json({ ok: false, error: 'file is required' });
        return;
      }
      const blob = new Blob([new Uint8Array(file.buffer)], { type: file.mimetype });
      const fileObj = new File([blob], file.originalname, { type: file.mimetype });
      const raw = await ingestFile(ctx.store, fileObj, { pdfExtract: extractPdfText });

      // Save original file (PDF, etc.) alongside the extracted text
      await saveOriginalFile(ctx.store, raw.id, file.originalname, file.buffer);

      res.json({ ok: true, rawId: raw.id, title: raw.title, kind: 'file' });
    } catch (e) {
      res.status(500).json({ ok: false, error: (e as Error).message });
    }
  });

  // Image ingest — uses LLM vision to extract text description
  router.post('/image', upload.single('file'), async (req, res) => {
    try {
      const file = req.file;
      if (!file) { res.status(400).json({ ok: false, error: 'file is required' }); return; }

      const base64 = file.buffer.toString('base64');
      const mimeType = file.mimetype || 'image/png';
      const adapter = ctx.getAdapter();

      // Ask LLM to describe the image
      let description = '';
      for await (const chunk of adapter.chat({
        model: ctx.config.model,
        messages: [{
          role: 'user',
          content: `<system-reminder>Describe this image in detail. Extract all text, diagrams, charts, or visual information. Output a comprehensive text description suitable for a knowledge base.</system-reminder>\n\n![image](data:${mimeType};base64,${base64})`,
        }],
        max_tokens: 4096,
        temperature: 0.2,
      })) {
        if (chunk.kind === 'delta') description += chunk.text;
      }

      if (!description.trim()) {
        res.status(400).json({ ok: false, error: 'LLM could not describe the image' });
        return;
      }

      const title = (req.body as { title?: string }).title || file.originalname.replace(/\.\w+$/, '');
      const raw = await ingestPaste(ctx.store, { text: description, title });

      // Save original image
      await saveOriginalFile(ctx.store, raw.id, file.originalname, file.buffer);

      res.json({ ok: true, rawId: raw.id, title, kind: 'image' });
    } catch (e) {
      res.status(500).json({ ok: false, error: (e as Error).message });
    }
  });

  return router;
}
