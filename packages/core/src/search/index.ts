import MiniSearch from 'minisearch';
import type { WikiFileType } from '../types';
import { multilingualTokenize } from './tokenizer';

export interface SearchDoc {
  path: string;
  title: string;
  body: string;
  type: WikiFileType | 'raw';
}

export interface SearchResult {
  path: string;
  title: string;
  score: number;
  type: SearchDoc['type'];
}

const FIELDS = ['title', 'body'];
const STORE_FIELDS = ['path', 'title', 'type'];
const ID_FIELD = 'path';

/**
 * Bump this when the tokenizer or any indexing behavior changes in a way that
 * makes old persisted indexes incompatible. The on-disk JSON has a version
 * stamp; mismatch → SearchIndex.load() throws and the caller falls back to a
 * fresh in-memory index rebuilt from the wiki files.
 *
 * History:
 *  - 1: initial English-only MiniSearch
 *  - 2: multilingual tokenizer (CJK bigram + pinyin) with empty-token guard
 */
const INDEX_VERSION = 2;

/** Shared MiniSearch config used for both construction and loadJS. */
const MINI_OPTIONS = {
  idField: ID_FIELD,
  fields: FIELDS,
  storeFields: STORE_FIELDS,
  tokenize: multilingualTokenize,
  processTerm: (t: string) => {
    const trimmed = t?.trim();
    return trimmed && trimmed.length >= 1 ? trimmed : null;
  },
  searchOptions: {
    prefix: true,
    fuzzy: 0.2, // tighter than 0.6 to prevent false positives in mixed-lang
    boost: { title: 3, tags: 2 },
    combineWith: 'OR' as const,
    tokenize: multilingualTokenize,
  },
};

export class SearchIndex {
  private mini: MiniSearch<SearchDoc>;

  constructor() {
    this.mini = new MiniSearch<SearchDoc>(MINI_OPTIONS);
  }

  add(doc: SearchDoc): void {
    if (this.mini.has(doc.path)) {
      this.mini.replace(doc);
    } else {
      this.mini.add(doc);
    }
  }

  remove(path: string): void {
    if (this.mini.has(path)) {
      this.mini.discard(path);
    }
  }

  search(query: string): SearchResult[] {
    if (!query.trim()) return [];
    const hits = this.mini.search(query);
    return hits.map((h) => ({
      path: h.id as string,
      title: (h as unknown as { title: string }).title,
      score: h.score,
      type: (h as unknown as { type: SearchDoc['type'] }).type,
    }));
  }

  serialize(): string {
    // Wrap MiniSearch's JSON output with our own envelope so we can detect
    // version mismatches on load. Old plain MiniSearch JSON (no envelope)
    // is rejected by load() and triggers a fresh rebuild from disk.
    return JSON.stringify({
      __mindbase_index_version: INDEX_VERSION,
      mini: this.mini.toJSON(),
    });
  }

  /**
   * Deserialize a persisted index. Throws if the format/version doesn't match
   * the currently-running code; callers should treat the throw as "rebuild from
   * scratch" — the wiki files on disk are the source of truth so nothing is
   * lost, just a few seconds of indexing cost.
   */
  static load(json: string): SearchIndex {
    const parsed = JSON.parse(json);
    const version = parsed?.__mindbase_index_version;
    if (version !== INDEX_VERSION) {
      throw new Error(
        `SearchIndex version mismatch: persisted=${version ?? 'legacy'} current=${INDEX_VERSION}`,
      );
    }
    if (!parsed.mini) {
      throw new Error('SearchIndex persisted blob missing "mini" field');
    }
    const idx = new SearchIndex();
    idx.mini = MiniSearch.loadJS(parsed.mini, MINI_OPTIONS);
    return idx;
  }
}
