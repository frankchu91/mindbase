export interface OutlineHeading {
  level: number;
  text: string;
  anchor: string;
  children: OutlineHeading[];
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Parses markdown headings into a hierarchical tree. Skips headings inside
 * fenced code blocks (``` … ```). Pure function; no DOM access.
 */
export function parseOutline(markdown: string): OutlineHeading[] {
  // Strip fenced code blocks first.
  let inFence = false;
  const lines = markdown.split('\n');
  const filtered: string[] = [];
  for (const line of lines) {
    if (line.startsWith('```')) {
      inFence = !inFence;
      continue;
    }
    if (!inFence) filtered.push(line);
  }

  const flat: OutlineHeading[] = [];
  const seenAnchors = new Map<string, number>();
  for (const line of filtered) {
    const m = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
    if (!m) continue;
    const level = m[1]!.length;
    const text = m[2]!;
    let anchor = slugify(text);
    if (seenAnchors.has(anchor)) {
      const n = seenAnchors.get(anchor)! + 1;
      seenAnchors.set(anchor, n);
      anchor = `${anchor}-${n}`;
    } else {
      seenAnchors.set(anchor, 0);
    }
    flat.push({ level, text, anchor, children: [] });
  }

  // Build nested tree.
  const roots: OutlineHeading[] = [];
  const stack: OutlineHeading[] = [];
  for (const h of flat) {
    while (stack.length > 0 && stack[stack.length - 1]!.level >= h.level) {
      stack.pop();
    }
    if (stack.length === 0) {
      roots.push(h);
    } else {
      stack[stack.length - 1]!.children.push(h);
    }
    stack.push(h);
  }

  return roots;
}
