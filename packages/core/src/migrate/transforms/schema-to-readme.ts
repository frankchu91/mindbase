import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Converts wiki/schema.md (legacy YAML frontmatter + prose) into per-project README.md
 * (prose + ## Contribution Rules YAML fenced block).
 */
export async function schemaToReadme(projectRoot: string, projectId: string): Promise<void> {
  const legacy = await readFile(join(projectRoot, 'wiki', 'schema.md'), 'utf-8').catch(() => '');
  const fmMatch = legacy.match(/^---\n([\s\S]*?)\n---/);
  const frontmatter = fmMatch?.[1] ?? '';
  const body = legacy.replace(/^---\n[\s\S]*?\n---\n?/, '').trim();

  const yaml = frontmatter || `status_vocab: [wip, blocked, done, superseded]`;

  const readme = `# ${projectId} — Operations Manual\n\n${body || `Migrated from legacy schema.md.`}\n\n## Contribution Rules\n\n\`\`\`yaml\n${yaml}\n\`\`\`\n`;
  await writeFile(join(projectRoot, 'README.md'), readme, 'utf-8');
}
