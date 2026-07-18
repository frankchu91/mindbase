// Extract concept slug list from a "Cited by" section in a markdown body.
// Preserves wiki.ts semantics byte-exact.

/** Parse concept slugs cited by a raw doc from its sources backlink file. */
export function parseCitedByConcepts(body: string): string[] {
  const slugs: string[] = [];
  const re = /\[\[([a-z0-9][a-z0-9_-]*)\]\]/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    slugs.push(m[1]!);
  }
  return slugs;
}
