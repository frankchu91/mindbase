import { readdir, mkdir, rename, readFile } from 'node:fs/promises';
import { join } from 'node:path';

/** Moves wiki/sources/*.md → sources/research/*.md */
export async function sourcesToResearch(projectRoot: string): Promise<{ moved: number }> {
  const srcDir = join(projectRoot, 'wiki', 'sources');
  const dstDir = join(projectRoot, 'sources', 'research');
  await mkdir(dstDir, { recursive: true });

  let moved = 0;
  try {
    const files = (await readdir(srcDir)).filter((f) => f.endsWith('.md'));
    for (const f of files) {
      const src = join(srcDir, f);
      const dst = join(dstDir, f);
      try { await rename(src, dst); moved++; }
      catch {
        const body = await readFile(src, 'utf-8');
        const { writeFile } = await import('node:fs/promises');
        await writeFile(dst, body, 'utf-8');
        moved++;
      }
    }
  } catch { /* ok */ }
  return { moved };
}
