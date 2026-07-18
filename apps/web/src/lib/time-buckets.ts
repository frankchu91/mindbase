// apps/web/src/lib/time-buckets.ts

export type BucketMode = 'knowledge' | 'chats';

export interface Bucket<T> {
  label: string;
  items: T[];
}

const MS_DAY = 86400_000;
const MS_HOUR = 3600_000;
const MS_MINUTE = 60_000;

function startOfToday(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function startOfYesterday(): number {
  return startOfToday() - MS_DAY;
}

/** Returns Monday 00:00 of the current ISO week (local time). */
function startOfWeek(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const diff = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - diff);
  return d.getTime();
}

function startOfMonth(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(1);
  return d.getTime();
}

/**
 * Group items into time buckets, sorted newest-first within each bucket.
 *
 * - mode='knowledge': Today / This Week / This Month / Earlier
 * - mode='chats':     Today / Yesterday / This Week / Earlier
 */
export function bucketByTime<T>(
  items: T[],
  dateOf: (item: T) => string,
  mode: BucketMode,
): Bucket<T>[] {
  const today = startOfToday();
  const yesterday = startOfYesterday();
  const week = startOfWeek();
  const month = startOfMonth();

  const sorted = [...items].sort((a, b) => dateOf(b).localeCompare(dateOf(a)));

  const buckets: Record<string, T[]> = {};
  const order: string[] = mode === 'knowledge'
    ? ['Today', 'This Week', 'This Month', 'Earlier']
    : ['Today', 'Yesterday', 'This Week', 'Earlier'];
  for (const label of order) buckets[label] = [];

  for (const item of sorted) {
    const t = new Date(dateOf(item)).getTime();
    if (Number.isNaN(t)) {
      buckets['Earlier']!.push(item);
      continue;
    }

    if (mode === 'knowledge') {
      if (t >= today) buckets['Today']!.push(item);
      else if (t >= week) buckets['This Week']!.push(item);
      else if (t >= month) buckets['This Month']!.push(item);
      else buckets['Earlier']!.push(item);
    } else {
      if (t >= today) buckets['Today']!.push(item);
      else if (t >= yesterday) buckets['Yesterday']!.push(item);
      else if (t >= week) buckets['This Week']!.push(item);
      else buckets['Earlier']!.push(item);
    }
  }

  return order
    .map((label) => ({ label, items: buckets[label] ?? [] }))
    .filter((b) => b.items.length > 0);
}

/** Format an ISO timestamp as a short relative time: "2h", "4d", "2w", "1mo", "1y". */
export function relativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const diff = Date.now() - t;
  if (diff < MS_MINUTE) return 'now';
  if (diff < MS_HOUR) return `${Math.floor(diff / MS_MINUTE)}m`;
  if (diff < MS_DAY) return `${Math.floor(diff / MS_HOUR)}h`;
  if (diff < 7 * MS_DAY) return `${Math.floor(diff / MS_DAY)}d`;
  if (diff < 30 * MS_DAY) return `${Math.floor(diff / (7 * MS_DAY))}w`;
  if (diff < 365 * MS_DAY) return `${Math.floor(diff / (30 * MS_DAY))}mo`;
  return `${Math.floor(diff / (365 * MS_DAY))}y`;
}
