import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Synthesizes wiki/INDEX.md + wiki/concepts/*.md into a new context.md.
 * Each concept becomes a section. Empty starter sections are added per the v2 spec.
 */
export async function indexToContext(projectRoot: string, projectName: string, isoDate: string): Promise<void> {
  const indexBody = await readFile(join(projectRoot, 'wiki', 'INDEX.md'), 'utf-8').catch(() => '');

  let conceptsBody = '';
  try {
    const conceptsDir = join(projectRoot, 'wiki', 'concepts');
    const files = (await readdir(conceptsDir)).filter((f) => f.endsWith('.md'));
    for (const f of files) {
      const body = await readFile(join(conceptsDir, f), 'utf-8').catch(() => '');
      const slug = f.replace(/\.md$/, '');
      conceptsBody += `\n### ${slug}\n\n${body.trim()}\n`;
    }
  } catch { /* ok */ }

  const context = `# ${projectName} — Context\n*Last built: ${isoDate} (migrated)*\n\n## Current Focus\n\n*Migrated from legacy INDEX + concepts. Run \`/mb:build\` to re-synthesize.*\n\n## Active Topics\n${conceptsBody}\n\n## Key Decisions\n\n## Learnings\n\n*Index contents preserved below for reference:*\n\n${indexBody}\n\n## Open Questions\n\n## Blockers\n`;
  await writeFile(join(projectRoot, 'context.md'), context, 'utf-8');
}
