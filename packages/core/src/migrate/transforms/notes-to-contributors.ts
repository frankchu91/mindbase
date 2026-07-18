import { readdir, mkdir, rename, readFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Moves wiki/notes/daily-YYYY-MM-DD.md → sources/contributors/<user>/YYYY-MM-DD.md
 * Moves wiki/notes/<other>.md → sources/contributors/<user>/<slug>.md
 */
export async function notesToContributors(projectRoot: string, user: string): Promise<{ moved: number }> {
  const notesDir = join(projectRoot, 'wiki', 'notes');
  const contribDir = join(projectRoot, 'sources', 'contributors', user);
  await mkdir(contribDir, { recursive: true });

  let moved = 0;
  try {
    const files = (await readdir(notesDir)).filter((f) => f.endsWith('.md'));
    for (const f of files) {
      const src = join(notesDir, f);
      let dst: string;
      const daily = f.match(/^daily-(\d{4}-\d{2}-\d{2})\.md$/);
      if (daily) {
        dst = join(contribDir, `${daily[1]}.md`);
      } else {
        dst = join(contribDir, f);
      }
      try {
        await rename(src, dst);
        moved++;
      } catch {
        // Cross-filesystem rename may fail; fall back to read+write
        const body = await readFile(src, 'utf-8');
        const { writeFile } = await import('node:fs/promises');
        await writeFile(dst, body, 'utf-8');
        moved++;
      }
    }
  } catch { /* ok */ }
  return { moved };
}
