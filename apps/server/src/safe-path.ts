import path from 'node:path';

const SLUG_RE = /^[a-z0-9][a-z0-9_-]*$/;

/** Validate that a slug contains only safe characters (lowercase alphanumeric, hyphens, underscores). */
export function isValidSlug(slug: string): boolean {
  return SLUG_RE.test(slug) && !slug.includes('..');
}

/** Validate that a relative wiki path stays within wiki/ and contains no traversal. */
export function isValidWikiPath(relativePath: string): boolean {
  const normalized = path.posix.normalize(relativePath);
  if (normalized.startsWith('..') || normalized.startsWith('/')) return false;
  if (normalized.includes('..')) return false;
  return true;
}
