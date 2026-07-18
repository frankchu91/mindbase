import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';

export interface ArticleExtractOptions {
  /** ms before abort (default 15000) */
  timeoutMs?: number;
  userAgent?: string;
  /** Minimum chars in extracted body before we consider it "good enough" (default 200) */
  minLength?: number;
}

/**
 * Fetch a URL and extract its main article text via Mozilla Readability.
 * Returns `{ text, title }` on success.
 * Throws `Error('readability: <reason>')` if extraction fails or content too short.
 *
 * Used by both the RSS worker (for feed entries) and the capture worker (for
 * URL captures from the browser extension / mobile share extensions, when the
 * client only sent the URL + title and no body text).
 */
export async function extractArticleText(
  url: string,
  opts: ArticleExtractOptions = {},
): Promise<{ text: string; title?: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 15000);
  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        'User-Agent': opts.userAgent ?? 'MindBase/0.1',
        Accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
      },
      signal: ctrl.signal,
      redirect: 'follow',
    });
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new Error(`readability: HTTP ${res.status}`);

  const html = await res.text();
  const dom = new JSDOM(html, { url });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();
  const text = (article?.textContent ?? '').trim();
  const minLength = opts.minLength ?? 200;
  if (text.length < minLength) {
    throw new Error(`readability: extracted text too short (${text.length} chars)`);
  }
  return { text, title: article?.title ?? undefined };
}
