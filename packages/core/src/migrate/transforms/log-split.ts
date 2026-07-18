import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Splits wiki/log.md into logs/YYYY-MM-DD.md per day.
 * Reads "## [YYYY-MM-DD ...]" headings as day boundaries.
 */
export async function logSplit(projectRoot: string): Promise<{ days: number }> {
  const body = await readFile(join(projectRoot, 'wiki', 'log.md'), 'utf-8').catch(() => '');
  if (!body) return { days: 0 };

  const logsDir = join(projectRoot, 'logs');
  await mkdir(logsDir, { recursive: true });

  const buckets = new Map<string, string[]>();
  const lines = body.split('\n');
  let currentDay = '';
  for (const line of lines) {
    const m = line.match(/^##\s+\[(\d{4}-\d{2}-\d{2})/);
    if (m && m[1]) currentDay = m[1];
    if (!currentDay) continue;
    if (!buckets.has(currentDay)) buckets.set(currentDay, []);
    buckets.get(currentDay)!.push(line);
  }

  for (const [day, ls] of buckets) {
    await writeFile(join(logsDir, `${day}.md`), ls.join('\n') + '\n', 'utf-8');
  }
  return { days: buckets.size };
}
