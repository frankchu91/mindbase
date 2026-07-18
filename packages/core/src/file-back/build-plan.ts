// packages/core/src/file-back/build-plan.ts
//
// "File answer back" plan builder — Karpathy's third op: take a high-quality
// chat answer and promote it to a permanent wiki page so query results
// compound into the wiki just like ingest does.
//
// Crucially, this constructs a CompileL1Plan WITHOUT calling the LLM. The
// user already read the answer; they don't need LLM commentary. We
// deterministically produce a 1-action plan (create_note) plus optional
// "related-to" link actions back-pointing from cited slugs to the new page.
//
// Same wire format (ToolUseBlock-shaped ProposedAction) as conversational
// ingest, so the UI / MCP / skill / server all reuse the same execute path.

import type { CompileL1Plan, ProposedAction } from '../compile/l1';
import type { ToolCall } from '../types';

export interface FileBackInput {
  /** The user's question — used as the new note's title. */
  question: string;
  /** The LLM's answer — becomes the note body. */
  answer: string;
  /** Slugs the answer cited (extracted from `[[...]]` or known from chat context). */
  sourceSlugs: string[];
  /** Optional title override (UI may let user edit). Default = question. */
  titleOverride?: string;
  /** Optional pre-derived slug. Default = slugified title. */
  slug?: string;
  /**
   * When true, also propose "related-to" link actions FROM each cited slug
   * BACK to the new page. Default true — strengthens graph reciprocity so
   * the new synthesis surfaces from the pages it was synthesized from.
   */
  proposeBackLinks?: boolean;
}

function slugify(s: string): string {
  return s.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/[\s-]+/g, '-')
    .slice(0, 60);
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Construct a CompileL1Plan from a chat question + answer. Deterministic;
 * does not invoke an LLM. The returned plan can be:
 *   - shown to the user via the standard approval UI (same takeaways/actions
 *     shape as conversational ingest)
 *   - cached via the existing planCache and executed via compileL1Execute
 */
export function buildFileBackPlan(input: FileBackInput): CompileL1Plan {
  const title = (input.titleOverride ?? input.question).trim();
  const slug = input.slug ?? (slugify(title) || `chat-answer-${todayIsoDate()}-${Date.now().toString().slice(-4)}`);
  const noteBody = composeNoteBody({
    title,
    question: input.question,
    answer: input.answer,
    sourceSlugs: input.sourceSlugs,
  });

  const proposed: ProposedAction[] = [];

  // (1) Main action: create the synthesized note.
  const createCall: ToolCall = {
    id: `fb-create-${Date.now().toString(36)}`,
    name: 'create_note',
    arguments: {
      name: title,
      slug,
      content: noteBody,
      kind: 'note',
      sources: input.sourceSlugs,
      created_via: 'chat-file-back',
    },
  };
  proposed.push({
    id: createCall.id,
    call: createCall,
    simulatedResult: { ok: true, result: { slug, planned: true } },
  });

  // (2) Reciprocal back-links: for each cited slug, propose a "related-to"
  //     edge FROM that slug TO the new note. The user can uncheck any
  //     they don't want via the standard approval modal.
  if (input.proposeBackLinks ?? true) {
    for (const src of input.sourceSlugs) {
      const linkCall: ToolCall = {
        id: `fb-link-${src}-${Date.now().toString(36)}`,
        name: 'link',
        arguments: {
          from: src,
          to: slug,
          type: 'related-to',
          reason: `Cited in synthesis "${title}" (filed back from chat answer).`,
        },
      };
      proposed.push({
        id: linkCall.id,
        call: linkCall,
        simulatedResult: { ok: true, result: { from: src, to: slug, planned: true } },
      });
    }
  }

  const citationList = input.sourceSlugs.length > 0
    ? input.sourceSlugs.map((s) => `[[${s}]]`).join(', ')
    : '(no explicit citations)';

  return {
    raw_id: `chat-answer-${Date.now().toString(36)}`,
    takeaways: `Filing back a chat answer as **${title}** at \`wiki/notes/${slug}.md\`. Cites: ${citationList}. ${
      (input.proposeBackLinks ?? true) && input.sourceSlugs.length > 0
        ? `Also adding "related-to" back-links from each cited page so this synthesis surfaces from them.`
        : ''
    }`,
    proposed,
    total_usage: { input_tokens: 0, output_tokens: 0 },
  };
}

function composeNoteBody(opts: {
  title: string;
  question: string;
  answer: string;
  sourceSlugs: string[];
}): string {
  const lines = [
    `# ${opts.title}`,
    '',
    '> Filed back from chat — synthesized from the cited pages below.',
    '',
    '## Question',
    '',
    opts.question.trim(),
    '',
    '## Answer',
    '',
    opts.answer.trim(),
    '',
  ];
  if (opts.sourceSlugs.length > 0) {
    lines.push('## Cites');
    lines.push('');
    for (const s of opts.sourceSlugs) lines.push(`- [[${s}]]`);
    lines.push('');
  }
  return lines.join('\n');
}
