export interface SectionPatch {
  sectionAnchor: string;     // e.g. "Variants" or "See also"
  newContent: string;
}

export type PatchResult =
  | { ok: true; patched: string }
  | { ok: false; error: string };

/**
 * Apply a section-anchor patch to markdown. Finds the H2 section matching
 * `sectionAnchor` (case-insensitive) and replaces its content (everything
 * after the heading line until the next H2 or end-of-document). If the
 * section is missing, appends it at the end of the document.
 *
 * Rejects empty section_anchor or empty new_content — the LLM should
 * always be specific about both fields.
 */
export function applySectionPatch(body: string, patch: SectionPatch): PatchResult {
  const anchor = patch.sectionAnchor.trim();
  const content = patch.newContent.trim();
  if (!anchor) return { ok: false, error: 'section_anchor must be non-empty' };
  if (!content) return { ok: false, error: 'new_content must be non-empty' };

  const lines = body.split('\n');
  let startIdx = -1;
  // Find the H2 heading that matches the anchor (case-insensitive).
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const m = line.match(/^##\s+(.+?)\s*$/);
    if (m && m[1]!.trim().toLowerCase() === anchor.toLowerCase()) {
      startIdx = i;
      break;
    }
  }

  if (startIdx === -1) {
    // Section missing — append at end with the anchor as heading.
    const trimmed = body.replace(/\s+$/, '');
    const appended = `${trimmed}\n\n## ${anchor}\n\n${content}\n`;
    return { ok: true, patched: appended };
  }

  // Find the next H2 (or EOF) — that bounds this section's content.
  let endIdx = lines.length;
  for (let i = startIdx + 1; i < lines.length; i++) {
    if (/^##\s+\S/.test(lines[i]!)) {
      endIdx = i;
      break;
    }
  }

  // Splice: keep [0..startIdx] (the heading), then a blank line + new content,
  // then [endIdx..]. Ensure exactly one blank line between heading and content,
  // and one blank line before the next section.
  const before = lines.slice(0, startIdx + 1);                // includes the H2 heading
  const after = lines.slice(endIdx);                          // next section onward (or empty)
  const middle = ['', content, ''];                            // blank, content, blank
  const patched = [...before, ...middle, ...after].join('\n').replace(/\n{3,}/g, '\n\n');

  return { ok: true, patched };
}
