import { pinyin } from 'pinyin-pro';

// CJK character ranges: Unified Ideographs, Hiragana, Katakana, Hangul
const CJK_REGEX = /[一-鿿぀-ゟ゠-ヿ가-힯]/;
const LATIN_TOKEN = /[a-zA-Z0-9]+/g;
const STOP_LATIN = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were',
  'to', 'of', 'in', 'on', 'at', 'and', 'or', 'but', 'for',
]);

/**
 * Universal tokenizer for indexing + querying.
 * - Latin: word-split, lowercase, NFD-strip-diacritics, stop-word filter
 * - CJK: bigram (every 2 adjacent chars) + unigram + pinyin (chars to pinyin)
 * - Mixed: handled per character category
 *
 * IMPORTANT: CJK extraction happens on the ORIGINAL text before NFD normalization,
 * because NFD decomposes Hangul syllables into Jamo characters (different Unicode range).
 */
export function multilingualTokenize(text: string): string[] {
  const tokens = new Set<string>();

  // Extract CJK chars BEFORE NFD normalization (Hangul decomposes to Jamo under NFD)
  const cjkChars = [...text].filter((c) => CJK_REGEX.test(c));

  // Normalize for Latin processing: NFD decompose then strip combining diacritical marks
  const normalized = text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  // Latin / numeric word-style tokens
  const latinMatches = normalized.match(LATIN_TOKEN);
  if (latinMatches) {
    for (const w of latinMatches) {
      if (!STOP_LATIN.has(w) && w.length >= 1) tokens.add(w);
    }
  }
  if (cjkChars.length > 0) {
    // Unigrams (for short queries / single-char lookups)
    for (const c of cjkChars) tokens.add(c);

    // Bigrams (2-char windows) — primary CJK index unit
    for (let i = 0; i < cjkChars.length - 1; i++) {
      tokens.add(cjkChars[i]! + cjkChars[i + 1]!);
    }

    // Pinyin (per-char, no tone) so romanized queries can find CJK pages
    try {
      const cjkText = cjkChars.join('');
      const py = pinyin(cjkText, { toneType: 'none', type: 'array' });
      for (const p of py) {
        if (p && p.length > 0) tokens.add(p);
      }
      // Full pinyin string (e.g. "jiqixuexi") also indexed for compound queries
      const full = py.join('');
      if (full.length > 0) tokens.add(full);
    } catch {
      /* pinyin lib failure — skip silently */
    }
  }

  // Defensive: filter out any zero-length or whitespace-only tokens that
  // slipped through. MiniSearch's internal radix tree crashes with
  // "Cannot read properties of undefined (reading 'keys')" during
  // performVacuuming when empty-string tokens are indexed.
  return [...tokens].filter((t) => t.trim().length > 0);
}
