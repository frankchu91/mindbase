import { describe, it, expect } from 'vitest';
import { applySectionPatch, type PatchResult } from './patches';

describe('applySectionPatch', () => {
  it('replaces the body under an existing H2 section', () => {
    const body = `# Page\n\nIntro.\n\n## Variants\n\nOld content.\n\n## See also\n\n[[other]]\n`;
    const result = applySectionPatch(body, {
      sectionAnchor: 'Variants',
      newContent: 'New multi-vector variant.',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.patched).toContain('## Variants');
    expect(result.patched).toContain('New multi-vector variant.');
    expect(result.patched).not.toContain('Old content.');
    // See also section preserved
    expect(result.patched).toContain('## See also');
    expect(result.patched).toContain('[[other]]');
  });

  it('creates the section + content when section does not exist (append at end)', () => {
    const body = `# Page\n\nIntro.\n`;
    const result = applySectionPatch(body, {
      sectionAnchor: 'Variants',
      newContent: 'First variant.',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.patched).toContain('## Variants');
    expect(result.patched).toContain('First variant.');
  });

  it('preserves the title (H1) and other sections', () => {
    const body = `# Original Title\n\n## Background\n\nA.\n\n## Examples\n\nB.\n`;
    const result = applySectionPatch(body, {
      sectionAnchor: 'Examples',
      newContent: 'Updated B.',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.patched).toContain('# Original Title');
    expect(result.patched).toContain('## Background');
    expect(result.patched).toContain('A.');
    expect(result.patched).toContain('Updated B.');
  });

  it('matches section anchors case-insensitively', () => {
    const body = `# Page\n\n## variants\n\nOld.\n`;
    const result = applySectionPatch(body, {
      sectionAnchor: 'Variants',  // different case from doc
      newContent: 'New.',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.patched).toContain('New.');
    expect(result.patched).not.toContain('Old.');
  });

  it('rejects empty section_anchor', () => {
    const body = `# Page\n`;
    const result = applySectionPatch(body, { sectionAnchor: '', newContent: 'x' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('section_anchor');
  });

  it('rejects empty new_content', () => {
    const body = `# Page\n\n## Variants\n\nOld.\n`;
    const result = applySectionPatch(body, { sectionAnchor: 'Variants', newContent: '' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('new_content');
  });

  it('handles section as the last section (no following H2)', () => {
    const body = `# Page\n\n## Examples\n\nA.\n\n## Final\n\nLast one.\n`;
    const result = applySectionPatch(body, { sectionAnchor: 'Final', newContent: 'Updated last.' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.patched).toContain('Updated last.');
    expect(result.patched).not.toContain('Last one.');
  });
});
