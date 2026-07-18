import { describe, it, expect } from 'vitest';
import { multilingualTokenize } from './tokenizer';

describe('multilingualTokenize', () => {
  it('returns empty array for empty input', () => {
    expect(multilingualTokenize('')).toEqual([]);
  });

  it('tokenizes English text, strips stop words', () => {
    const tokens = multilingualTokenize('the quick brown fox');
    expect(tokens).toContain('quick');
    expect(tokens).toContain('brown');
    expect(tokens).toContain('fox');
    // stop words removed
    expect(tokens).not.toContain('the');
  });

  it('strips diacritics from Latin text', () => {
    const tokens = multilingualTokenize('café résumé');
    expect(tokens).toContain('cafe');
    expect(tokens).toContain('resume');
    // original with diacritics should not appear
    expect(tokens).not.toContain('café');
  });

  it('tokenizes Chinese text into unigrams, bigrams, and pinyin', () => {
    const tokens = multilingualTokenize('机器学习');
    // Unigrams
    expect(tokens).toContain('机');
    expect(tokens).toContain('器');
    expect(tokens).toContain('学');
    expect(tokens).toContain('习');
    // Bigrams
    expect(tokens).toContain('机器');
    expect(tokens).toContain('器学');
    expect(tokens).toContain('学习');
    // Pinyin should be present (ji, qi, xue, xi)
    expect(tokens).toContain('ji');
    expect(tokens).toContain('qi');
    expect(tokens).toContain('xue');
    expect(tokens).toContain('xi');
  });

  it('tokenizes Japanese hiragana text', () => {
    const tokens = multilingualTokenize('こんにちは');
    // Should have unigrams for CJK-range chars
    expect(tokens).toContain('こ');
    expect(tokens).toContain('ん');
    // Should have bigrams
    expect(tokens).toContain('こん');
  });

  it('handles mixed English and Chinese text', () => {
    const tokens = multilingualTokenize('Apple iPad 苹果');
    // Latin
    expect(tokens).toContain('apple');
    expect(tokens).toContain('ipad');
    // Chinese
    expect(tokens).toContain('苹');
    expect(tokens).toContain('果');
    expect(tokens).toContain('苹果');
  });

  it('returns unique tokens (no duplicates)', () => {
    const tokens = multilingualTokenize('test test test');
    const testTokens = tokens.filter((t) => t === 'test');
    expect(testTokens).toHaveLength(1);
  });

  it('handles whitespace-only input', () => {
    expect(multilingualTokenize('   ')).toEqual([]);
  });

  it('tokenizes Korean hangul', () => {
    const tokens = multilingualTokenize('안녕하세요');
    expect(tokens).toContain('안');
    expect(tokens).toContain('안녕');
  });

  it('does not include stop words in output', () => {
    const stops = ['the', 'a', 'an', 'is', 'are', 'was', 'were', 'to', 'of', 'in', 'on', 'at', 'and', 'or', 'but', 'for'];
    const tokens = multilingualTokenize(stops.join(' '));
    for (const stop of stops) {
      expect(tokens).not.toContain(stop);
    }
  });

  it('generates full pinyin string for compound CJK query', () => {
    const tokens = multilingualTokenize('机器学习');
    // Full pinyin: jiqixuexi
    const fullPinyin = tokens.find((t) => t.length > 4 && /^[a-z]+$/.test(t));
    expect(fullPinyin).toBeTruthy();
  });
});
