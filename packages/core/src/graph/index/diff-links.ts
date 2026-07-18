import type { ClassifiedLink } from './classify-edges';
import type { EdgeType } from './edge-type';
import type { LinkConfidence } from './extract-links';

/**
 * Slim representation of a row in the `links` table for diff purposes.
 */
export interface StoredLink {
  target: string;
  edgeType: EdgeType;
  confidence: LinkConfidence;
  inferenceRule: string | null;
}

export interface LinkDiff {
  toInsert: ClassifiedLink[];
  toDelete: StoredLink[];
  toUpdate: ClassifiedLink[];  // same target, different (edgeType|confidence|inferenceRule)
}

function isUpdate(stored: StoredLink, incoming: ClassifiedLink): boolean {
  return (
    stored.edgeType !== incoming.edgeType ||
    stored.confidence !== incoming.confidence ||
    stored.inferenceRule !== incoming.inferenceRule
  );
}

export function diffLinks(prev: StoredLink[], next: ClassifiedLink[]): LinkDiff {
  const prevByTarget = new Map(prev.map((l) => [l.target, l]));
  const nextByTarget = new Map(next.map((l) => [l.target, l]));

  const toInsert: ClassifiedLink[] = [];
  const toUpdate: ClassifiedLink[] = [];
  const toDelete: StoredLink[] = [];

  for (const link of next) {
    const existing = prevByTarget.get(link.target);
    if (!existing) toInsert.push(link);
    else if (isUpdate(existing, link)) toUpdate.push(link);
  }
  for (const link of prev) {
    if (!nextByTarget.has(link.target)) toDelete.push(link);
  }

  return { toInsert, toDelete, toUpdate };
}
