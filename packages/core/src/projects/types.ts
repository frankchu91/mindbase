export interface ProjectMeta {
  /** url-safe id, e.g. "default" or "lotr-reading". Used as directory name. */
  id: string;
  /** Display name, e.g. "LOTR Reading Companion". */
  name: string;
  /** ISO creation timestamp. */
  created: string;
  /** Optional template the project was scaffolded from. */
  template?: 'literature-review' | 'market-research' | 'investigation' | 'reading-companion' | 'topic-tracker';
  /** If true, ingest skips the approval modal (per-project setting). */
  autoApproveIngest?: boolean;
  /** Schema version of this project meta — bump when fields change. */
  schemaVersion: 1;
}

export const PROJECT_ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

export function isValidProjectId(id: string): boolean {
  return PROJECT_ID_RE.test(id);
}
