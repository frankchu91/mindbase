// Strip a leading YAML frontmatter block (--- ... ---) from a markdown string.
// Preserves wiki.ts semantics byte-exact.

export function stripFrontmatter(text: string): string {
  return text.replace(/^---\n[\s\S]*?\n---\n?/, '');
}
