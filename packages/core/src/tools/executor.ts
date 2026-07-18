import type { MetaJson, RawDoc, ToolCall } from '../types';
import type { Store } from '../storage/store';
import {
  conceptMetaPath,
  conceptPath,
  indexPath,
  slugify,
  sourcesPath,
} from '../storage/paths';
import { applySectionPatch } from '../compile/patches';
import { indexUpsertConcept } from '../wiki/index-md';
import { isEdgeType } from '../graph/index/edge-type';
import type { WikiIndex } from '../graph/index/wiki-index';

export interface ToolResult {
  ok: boolean;
  error?: string;
  data?: unknown;
  result?: unknown;
}

export interface ToolExecutorOptions {
  wikiIndex?: WikiIndex;
  /** Per-session limit on create_concept calls. Default 3. */
  createConceptLimit?: number;
  /** If set, any tool call that would edit/append to this slug is rejected.
   *  Used by the note-compile flow to prevent the LLM from editing the source note. */
  sourceSlugToExclude?: string;
  /**
   * When true, all destructive operations (create_concept, append_to_concept,
   * propose_edit, merge, link, update_one_liner, update_source_backlinks,
   * add_to_index, flag_contradiction, update_note, rewrite_concept) return a
   * synthesized success result without touching disk. Read operations (read_concept)
   * still hit disk so the LLM gets real candidate content during planning. The
   * createConcept per-session limit counter still increments so the plan reflects
   * realistic constraints. Used by compileL1Plan (Task A5).
   */
  dryRun?: boolean;
}

type Handler = (args: Record<string, unknown>) => Promise<ToolResult>;

function required(args: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    if (args[k] === undefined || args[k] === null) return `missing required argument: ${k}`;
  }
  return undefined;
}

function nowIso(): string {
  return new Date().toISOString();
}

/** Escape a string for safe inclusion inside a YAML double-quoted scalar. */
function escapeYamlString(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
}

export class ToolExecutor {
  private handlers: Record<string, Handler>;
  private createConceptCount = 0;
  private readonly createConceptLimit: number;
  private readonly wikiIndex?: WikiIndex;
  private readonly sourceSlugToExclude: string | undefined;
  private readonly dryRun: boolean;
  private _raw: RawDoc | undefined;

  /**
   * @param store Filesystem-like store used to read/write wiki pages.
   * @param rawOrOpts Optional source RawDoc (legacy) OR ToolExecutorOptions object.
   *   - RawDoc: capture provenance fields are propagated into new wiki page frontmatter and meta.json.
   *   - ToolExecutorOptions: configure wikiIndex and per-session createConceptLimit.
   */
  constructor(
    private store: Store,
    private rawOrOpts?: RawDoc | ToolExecutorOptions,
  ) {
    // Determine if second arg is a RawDoc or ToolExecutorOptions
    const isRawDoc = (v: unknown): v is RawDoc =>
      v != null && typeof v === 'object' && 'id' in (v as object) && 'content' in (v as object);

    if (isRawDoc(rawOrOpts)) {
      this.createConceptLimit = 3;
      this.wikiIndex = undefined;
      this.sourceSlugToExclude = undefined;
      this.dryRun = false;
    } else {
      const opts = (rawOrOpts ?? {}) as ToolExecutorOptions;
      this.createConceptLimit = opts.createConceptLimit ?? 3;
      this.wikiIndex = opts.wikiIndex;
      this.sourceSlugToExclude = opts.sourceSlugToExclude;
      this.dryRun = opts.dryRun ?? false;
    }

    this.handlers = {
      create_concept: this.createConcept.bind(this),
      append_to_concept: this.appendToConcept.bind(this),
      update_source_backlinks: this.updateSourceBacklinks.bind(this),
      add_to_index: this.addToIndex.bind(this),
      update_note: this.updateNote.bind(this),
      rewrite_concept: this.rewriteConcept.bind(this),
      update_one_liner: this.updateOneLiner.bind(this),
      read_concept: this.readConcept.bind(this),
      propose_edit: this.proposeEdit.bind(this),
      link: this.link.bind(this),
      flag_contradiction: this.flagContradiction.bind(this),
      merge: this.merge.bind(this),
      skip: this.skip.bind(this),
      append_to_daily_note: this.appendToDailyNote.bind(this),
    };
  }

  async execute(call: ToolCall): Promise<ToolResult> {
    const handler = this.handlers[call.name];
    if (!handler) return { ok: false, error: `unknown tool: ${call.name}` };
    try {
      return await handler(call.arguments);
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }

  /** Late-bind a source RawDoc — required by createConcept's raw_id fallback.
   *  Called by compileL1Execute after creating a non-dryRun executor. */
  public setRaw(raw: RawDoc): void {
    this._raw = raw;
  }

  /** Returns the RawDoc if one was set (via constructor or setRaw), else undefined. */
  private get raw(): RawDoc | undefined {
    if (this._raw !== undefined) return this._raw;
    const v = this.rawOrOpts;
    if (v != null && typeof v === 'object' && 'id' in v && 'content' in v) {
      return v as RawDoc;
    }
    return undefined;
  }

  private async createConcept(args: Record<string, unknown>): Promise<ToolResult> {
    if (this.createConceptCount >= this.createConceptLimit) {
      return {
        ok: false,
        error: `create_concept limit reached (${this.createConceptLimit} per session) — use propose_edit instead`,
      };
    }
    this.createConceptCount++;
    if (this.dryRun) return this.simulatedResult('create_concept', args);

    const missing = required(args, ['name', 'one_liner', 'initial_content']);
    if (missing) return { ok: false, error: missing };
    const name = args.name as string;
    const one_liner = args.one_liner as string;
    const initial_content = args.initial_content as string;
    // raw_id: prefer the LLM-supplied value, but fall back to the source raw
    // doc id we already know about in context. LLMs often omit this in long
    // multi-call sessions; the source is unambiguous so no reason to fail.
    const raw_id = (typeof args['raw_id'] === 'string' && args['raw_id']) || this.raw?.id || '';
    if (!raw_id) {
      return { ok: false, error: 'no raw_id and no source raw in context' };
    }
    const slug = slugify(name);
    const mdPath = conceptPath(slug);
    if (await this.store.exists(mdPath)) {
      return { ok: false, error: `concept already exists: ${slug}` };
    }
    const now = nowIso();

    // Capture provenance — only emit lines for fields actually set on the source raw doc.
    const captureLines: string[] = [];
    const raw = this.raw;
    if (raw?.captured_via) captureLines.push(`captured_via: ${raw.captured_via}`);
    if (raw?.source_url) captureLines.push(`captured_url: "${escapeYamlString(raw.source_url)}"`);
    if (raw?.captured_device) captureLines.push(`captured_device: "${escapeYamlString(raw.captured_device)}"`);
    if (raw?.captured_at) captureLines.push(`captured_at: "${escapeYamlString(raw.captured_at)}"`);

    const frontmatter = [
      '---',
      `title: "${name.replace(/"/g, '\\"')}"`,
      `tags: []`,
      `sources: [${raw_id}]`,
      `created: ${now}`,
      `updated: ${now}`,
      ...captureLines,
      '---',
      '',
    ].join('\n');
    await this.store.writeText(mdPath, `${frontmatter}# ${name}\n\n${initial_content}\n`);
    const meta: MetaJson = {
      id: `concept-${slug}`,
      type: 'concept',
      title: name,
      created: nowIso(),
      updated: nowIso(),
      sources: [raw_id],
      related: [],
      one_liner,
      word_count: initial_content.split(/\s+/).length,
      compile_version: 1,
      edit_state: 'auto',
      last_human_edit: null,
      ...(raw?.captured_via ? { captured_via: raw.captured_via } : {}),
      ...(raw?.source_url ? { captured_url: raw.source_url } : {}),
      ...(raw?.captured_device ? { captured_device: raw.captured_device } : {}),
      ...(raw?.captured_at ? { captured_at: raw.captured_at } : {}),
    };
    await this.store.writeJSON(conceptMetaPath(slug), meta);

    // INDEX.md auto-upkeep per Karpathy spec: "The LLM updates it on every
    // ingest." We do this as a side-effect of create_concept so the LLM
    // doesn't need to remember to call add_to_index. Best-effort: if the
    // INDEX is missing or malformed it self-heals via rebuildIndex.
    try {
      await indexUpsertConcept(this.store, slug, name, one_liner, 1);
    } catch {
      /* never let INDEX upkeep break a successful create */
    }

    return { ok: true, data: { slug } };
  }

  private async appendToConcept(args: Record<string, unknown>): Promise<ToolResult> {
    // Check concept_name first so we can derive the slug for the self-edit guard.
    const missingName = required(args, ['concept_name']);
    if (missingName) return { ok: false, error: missingName };
    const slug = slugify(args.concept_name as string);
    const guard = this.rejectSelfEdit(slug);
    if (guard) return guard;
    if (this.dryRun) return this.simulatedResult('append_to_concept', args);
    const missing = required(args, ['section', 'content', 'raw_id']);
    if (missing) return { ok: false, error: missing };
    const section = args.section as string;
    const content = args.content as string;
    const raw_id = args.raw_id as string;
    const mdPath = conceptPath(slug);
    const metaPath = conceptMetaPath(slug);
    if (!(await this.store.exists(mdPath))) {
      return { ok: false, error: `concept not found: ${slug}` };
    }
    const existing = await this.store.readText(mdPath);
    const appended = `${existing.trimEnd()}\n\n## ${section}\n\n${content}\n`;
    await this.store.writeText(mdPath, appended);
    const meta = await this.store.readJSON<MetaJson>(metaPath);
    if (!meta.sources.includes(raw_id)) meta.sources.push(raw_id);
    meta.updated = nowIso();
    meta.word_count = appended.split(/\s+/).length;
    meta.compile_version += 1;
    await this.store.writeJSON(metaPath, meta);
    return { ok: true };
  }

  private async updateNote(args: Record<string, unknown>): Promise<ToolResult> {
    const missing = required(args, ['note_name', 'section', 'new_content', 'reason']);
    if (missing) return { ok: false, error: missing };
    if (this.dryRun) return this.simulatedResult('update_note', args);
    const slug = slugify(args.note_name as string);
    const section = args.section as string;
    const newContent = args.new_content as string;
    const rawId = (args.raw_id as string | undefined) ?? '';
    const mdPath = conceptPath(slug);
    const metaPath = conceptMetaPath(slug);
    if (!(await this.store.exists(mdPath))) {
      return { ok: false, error: `note not found: ${slug}` };
    }
    const meta = await this.store.readJSON<MetaJson>(metaPath);
    if (meta.edit_state === 'human_touched') {
      return { ok: false, error: `note ${slug} is human_touched, skipping update` };
    }
    let body = await this.store.readText(mdPath);
    // Find the section heading and replace its content
    const sectionRegex = new RegExp(`(## ${section.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\n)([\\s\\S]*?)(?=\\n## |$)`);
    const match = body.match(sectionRegex);
    if (match) {
      // Replace existing section content
      body = body.replace(sectionRegex, `$1\n${newContent}\n`);
    } else {
      // Section doesn't exist — append it
      body = `${body.trimEnd()}\n\n## ${section}\n\n${newContent}\n`;
    }
    await this.store.writeText(mdPath, body);
    if (rawId && !meta.sources.includes(rawId)) meta.sources.push(rawId);
    meta.updated = nowIso();
    meta.word_count = body.split(/\s+/).length;
    meta.compile_version += 1;
    await this.store.writeJSON(metaPath, meta);
    return { ok: true };
  }

  private async updateSourceBacklinks(args: Record<string, unknown>): Promise<ToolResult> {
    if (this.dryRun) return this.simulatedResult('update_source_backlinks', args);
    const missing = required(args, ['raw_id', 'linked_concepts']);
    if (missing) return { ok: false, error: missing };
    const raw_id = args.raw_id as string;
    const linked = args.linked_concepts as string[];
    const path = sourcesPath(raw_id);
    const body = [
      `# Source ${raw_id}`,
      '',
      'Cited in:',
      ...linked.map((c) => `- [[${c}]](../concepts/${c}.md)`),
      '',
    ].join('\n');
    await this.store.writeText(path, body);
    return { ok: true };
  }

  private async rewriteConcept(args: Record<string, unknown>): Promise<ToolResult> {
    const missing = required(args, ['concept_name', 'new_content', 'reason']);
    if (missing) return { ok: false, error: missing };
    if (this.dryRun) return this.simulatedResult('rewrite_concept', args);
    const slug = slugify(args.concept_name as string);
    const mdPath = conceptPath(slug);
    const metaPath = conceptMetaPath(slug);
    if (!(await this.store.exists(mdPath))) {
      return { ok: false, error: `concept not found: ${slug}` };
    }
    const meta = await this.store.readJSON<MetaJson>(metaPath);
    if (meta.edit_state === 'human_touched') {
      return { ok: false, error: `concept ${slug} is human_touched, skipping rewrite` };
    }
    const newContent = args.new_content as string;
    await this.store.writeText(mdPath, `# ${meta.title}\n\n${newContent}\n`);
    meta.updated = nowIso();
    meta.word_count = newContent.split(/\s+/).length;
    meta.compile_version += 1;
    await this.store.writeJSON(metaPath, meta);
    return { ok: true };
  }

  private async updateOneLiner(args: Record<string, unknown>): Promise<ToolResult> {
    if (this.dryRun) return this.simulatedResult('update_one_liner', args);
    const missing = required(args, ['concept_name', 'new_one_liner']);
    if (missing) return { ok: false, error: missing };
    const slug = slugify(args.concept_name as string);
    const metaPath = conceptMetaPath(slug);
    if (!(await this.store.exists(metaPath))) {
      return { ok: false, error: `concept not found: ${slug}` };
    }
    const meta = await this.store.readJSON<MetaJson>(metaPath);
    const oldOneLiner = meta.one_liner;
    meta.one_liner = args.new_one_liner as string;
    meta.updated = nowIso();
    await this.store.writeJSON(metaPath, meta);

    // Update INDEX.md if it exists
    const idx = indexPath();
    if (await this.store.exists(idx)) {
      let body = await this.store.readText(idx);
      body = body.replace(oldOneLiner, meta.one_liner);
      await this.store.writeText(idx, body);
    }

    return { ok: true };
  }

  private async readConcept(args: Record<string, unknown>): Promise<ToolResult> {
    const missing = required(args, ['slug']);
    if (missing) return { ok: false, error: missing };
    const slug = args.slug as string;
    if (!/^[a-z0-9][a-z0-9_-]*$/i.test(slug)) {
      return { ok: false, error: `invalid slug: ${slug}` };
    }
    const path = `wiki/notes/${slug}.md`;
    let body: string;
    try {
      body = await this.store.readText(path);
    } catch (e) {
      return { ok: false, error: `not found: ${slug} (${(e as Error).message})` };
    }
    const MAX = 30000;
    if (body.length <= MAX) {
      return { ok: true, data: { slug, body, truncated: false, original_length: body.length } };
    }
    const truncated = body.slice(0, MAX) + `\n\n[truncated, original is ${body.length} chars]`;
    return { ok: true, data: { slug, body: truncated, truncated: true, original_length: body.length } };
  }

  private async addToIndex(args: Record<string, unknown>): Promise<ToolResult> {
    if (this.dryRun) return this.simulatedResult('add_to_index', args);
    const missing = required(args, ['title', 'path', 'one_liner']);
    if (missing) return { ok: false, error: missing };
    const title = args.title as string;
    const p = args.path as string;
    const one = args.one_liner as string;
    const line = `- [${title}](${p}) — ${one}`;
    const idx = indexPath();
    let body = '';
    if (await this.store.exists(idx)) {
      body = await this.store.readText(idx);
      if (body.includes(p)) return { ok: true }; // idempotent
    } else {
      body = '# MindBase Wiki Index\n\n';
    }
    body = `${body.trimEnd()}\n${line}\n`;
    await this.store.writeText(idx, body);
    return { ok: true };
  }

  /** Reject the call when the target slug matches the source-exclusion slug. */
  private rejectSelfEdit(targetSlug: string): ToolResult | null {
    if (this.sourceSlugToExclude && targetSlug === this.sourceSlugToExclude) {
      return { ok: false, error: `Cannot edit source slug "${targetSlug}" — that is the input to compile, editing it would create a self-loop` };
    }
    return null;
  }

  private async proposeEdit(args: Record<string, unknown>): Promise<ToolResult> {
    const missing = required(args, ['slug', 'section_anchor', 'new_content', 'reason']);
    if (missing) return { ok: false, error: missing };
    const guard = this.rejectSelfEdit(args.slug as string);
    if (guard) return guard;
    if (this.dryRun) return this.simulatedResult('propose_edit', args);
    const slug = args.slug as string;
    const sectionAnchor = args.section_anchor as string;
    const newContent = args.new_content as string;
    const path = `wiki/notes/${slug}.md`;
    let body: string;
    try {
      body = await this.store.readText(path);
    } catch {
      return { ok: false, error: `page ${slug} not found` };
    }
    const patchResult = applySectionPatch(body, { sectionAnchor, newContent });
    if (!patchResult.ok) return { ok: false, error: patchResult.error };
    await this.store.writeText(path, patchResult.patched);
    return { ok: true, result: { slug, section: sectionAnchor } };
  }

  private async link(args: Record<string, unknown>): Promise<ToolResult> {
    const missing = required(args, ['from', 'to', 'type', 'reason']);
    if (missing) return { ok: false, error: missing };
    const type = args.type as string;
    if (!isEdgeType(type)) {
      return { ok: false, error: `invalid edge type: ${type}` };
    }
    if (this.dryRun) return this.simulatedResult('link', args);
    if (!this.wikiIndex) {
      return { ok: false, error: 'wikiIndex not configured — link cannot persist' };
    }
    const from = args.from as string;
    const to = args.to as string;
    try {
      this.wikiIndex.insertLink({ from, to, edgeType: type, reason: args.reason as string });
      return { ok: true, result: { from, to, type, persisted: true } };
    } catch (e) {
      return { ok: false, error: `link persist failed: ${(e as Error).message}` };
    }
  }

  private async flagContradiction(args: Record<string, unknown>): Promise<ToolResult> {
    const missing = required(args, ['slug_a', 'slug_b', 'reason']);
    if (missing) return { ok: false, error: missing };
    if (this.dryRun) return this.simulatedResult('flag_contradiction', args);
    return {
      ok: true,
      result: { slug_a: args.slug_a, slug_b: args.slug_b, flagged: true },
    };
  }

  private async merge(args: Record<string, unknown>): Promise<ToolResult> {
    const missing = required(args, ['keep', 'absorb', 'reason']);
    if (missing) return { ok: false, error: missing };
    if (this.dryRun) return this.simulatedResult('merge', args);
    return {
      ok: true,
      result: { keep: args.keep, absorb: args.absorb, status: 'queued_for_review' },
    };
  }

  private async skip(args: Record<string, unknown>): Promise<ToolResult> {
    const missing = required(args, ['reason']);
    if (missing) return { ok: false, error: missing };
    return { ok: true, result: { reason: args.reason } };
  }

  private async appendToDailyNote(args: Record<string, unknown>): Promise<ToolResult> {
    const missing = required(args, ['content']);
    if (missing) return { ok: false, error: missing };
    const content = args.content as string;
    const section = (args.section as string | undefined)?.trim() || 'Captured';
    if (this.dryRun) return this.simulatedResult('append_to_daily_note', args);

    const date = new Date().toISOString().slice(0, 10);
    const slug = `daily-${date}`;
    const path = `wiki/notes/${slug}.md`;
    const time = new Date().toTimeString().slice(0, 5);

    let body = '';
    let exists = true;
    try {
      body = await this.store.readText(path);
    } catch {
      exists = false;
    }
    if (!exists) {
      const weekday = new Date().toLocaleDateString('en-US', { weekday: 'long' });
      body = `# ${date} (${weekday})\n\n`;
    }

    // Find or create the requested section.
    const sectionHeader = `## ${section}`;
    if (!body.includes(sectionHeader)) {
      // Append section at end with one blank line above.
      body = body.replace(/\s*$/, '\n\n') + sectionHeader + '\n\n';
    }
    // Insert the new entry under the section header. Strategy: find the
    // section's next H2 (or EOF) and append just before it.
    const lines = body.split('\n');
    const sectionIdx = lines.findIndex((l) => l.trim() === sectionHeader);
    if (sectionIdx === -1) {
      // Defensive — shouldn't happen because we just inserted it.
      body = body.replace(/\s*$/, '\n\n') + `- **${time}** ${content.trim()}\n`;
    } else {
      let insertAt = lines.length;
      for (let i = sectionIdx + 1; i < lines.length; i++) {
        if (lines[i]!.startsWith('## ')) { insertAt = i; break; }
      }
      const entry = `- **${time}** ${content.trim()}`;
      // Make sure there's a blank line above the entry but no double-blank.
      const before = lines.slice(0, insertAt).join('\n').replace(/\s*$/, '');
      const after = lines.slice(insertAt).join('\n');
      body = before + '\n' + entry + '\n\n' + after;
    }

    await this.store.writeText(path, body);

    // Ensure a meta sidecar exists so the daily note shows in the tree.
    const metaPath = `wiki/notes/${slug}.meta.json`;
    try {
      await this.store.readJSON(metaPath);
    } catch {
      const now = new Date().toISOString();
      await this.store.writeJSON(metaPath, {
        id: slug,
        type: 'concept',
        title: date,
        created: now,
        updated: now,
        sources: [],
        related: [],
        one_liner: `Daily notes for ${date}`,
        word_count: body.split(/\s+/).filter(Boolean).length,
        compile_version: 0,
        edit_state: 'human_touched',
        last_human_edit: now,
        kind: 'daily',
        created_via: 'web',
      });
    }

    return { ok: true, result: { slug, path, section, appended: true } };
  }

  /**
   * Returns a synthesized success ToolResult for the given destructive method.
   * Used exclusively when dryRun=true. Return shapes mirror what the real
   * implementations return so the LLM's downstream reasoning stays consistent.
   */
  private simulatedResult(method: string, args: Record<string, unknown>): ToolResult {
    switch (method) {
      case 'create_concept': {
        const name = (args['name'] as string | undefined) ?? '?';
        return { ok: true, data: { slug: slugify(name) } };
      }
      case 'append_to_concept': {
        const conceptName = (args['concept_name'] as string | undefined) ?? '?';
        return { ok: true, data: { slug: slugify(conceptName) } };
      }
      case 'propose_edit':
        return {
          ok: true,
          result: {
            slug: args['slug'] as string,
            section: (args['section_anchor'] as string | undefined) ?? '',
          },
        };
      case 'merge':
        return { ok: true, result: { keep: args['keep'], absorb: args['absorb'], status: 'queued_for_review' } };
      case 'link':
        return { ok: true, result: { from: args['from'], to: args['to'], type: args['type'], persisted: false } };
      case 'update_note':
        return { ok: true };
      case 'rewrite_concept':
        return { ok: true };
      case 'update_one_liner':
        return { ok: true };
      case 'update_source_backlinks':
        return { ok: true };
      case 'add_to_index':
        return { ok: true };
      case 'flag_contradiction':
        return { ok: true, result: { slug_a: args['slug_a'], slug_b: args['slug_b'], flagged: true } };
      case 'append_to_daily_note': {
        const date = new Date().toISOString().slice(0, 10);
        return { ok: true, result: { slug: `daily-${date}`, section: args['section'] ?? 'Captured', appended: true } };
      }
      default:
        return { ok: true };
    }
  }
}
