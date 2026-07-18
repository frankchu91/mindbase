import type { EdgeType } from './edge-type';
import type { ExtractedLink, LinkConfidence } from './extract-links';

export interface ClassifyContext {
  pageSlug: string;
  pageType: string;       // 'concept' | 'paper' | 'project' | 'note' | 'daily' | ...
  body: string;
}

export interface ClassifiedLink extends ExtractedLink {
  edgeType: EdgeType;
  /** ID of the rule that fired (e.g. 'cites_per'), or null if pure fallback. */
  inferenceRule: string | null;
}

/**
 * Pass A — per-edge context regex rules. First match wins.
 * Patterns match the verb/preposition BEFORE the wikilink within the
 * surrounding context window. Rules tuned empirically against our own
 * wiki corpora.
 */
const PASS_A_RULES: Array<{ id: string; pattern: RegExp; edgeType: EdgeType }> = [
  // elaborates — pointers to deeper / fuller treatments
  { id: 'elaborates_see',       pattern: /\b(see|refer to|discussed in|for more)\s+\[\[/i,          edgeType: 'elaborates' },
  { id: 'elaborates_described', pattern: /\bas (?:described|defined|shown|covered) in\s+\[\[/i,     edgeType: 'elaborates' },

  // cites — drawing evidence
  { id: 'cites_per',            pattern: /\b(per|according to|cites|cf\.?)\s+\[\[/i,                edgeType: 'cites' },

  // contradicts — disagreement / divergence
  { id: 'contradicts_vs',       pattern: /\b(vs\.?|versus|unlike|contrary to|contradicts?)\s+\[\[/i, edgeType: 'contradicts' },

  // supersedes — replacement
  { id: 'supersedes_replaces',  pattern: /\b(replaces?|supersedes?|deprecates?)\s+\[\[/i,           edgeType: 'supersedes' },

  // is_a — specialization
  { id: 'is_a_kind',            pattern: /\bis\s+(?:a|an)\s+(?:kind|type)\s+of\s+\[\[|\b(?:instance|specialization)\s+of\s+\[\[/i, edgeType: 'is_a' },

  // part_of — component
  { id: 'part_of',              pattern: /\b(part of|component of|sub-?(?:concept|topic) of)\s+\[\[/i, edgeType: 'part_of' },

  // example_of — concrete instance
  { id: 'example_of',           pattern: /\b(?:an?\s+)?example of\s+\[\[|\binstance of\s+\[\[|\bcase of\s+\[\[/i, edgeType: 'example_of' },
];

/**
 * Section name → forced edge type. Matched case-insensitively, exact name.
 */
const SECTION_OVERRIDES: Record<string, { edgeType: EdgeType; ruleId: string }> = {
  sources:    { edgeType: 'cites',      ruleId: 'section_sources' },
  references: { edgeType: 'cites',      ruleId: 'section_references' },
  citations:  { edgeType: 'cites',      ruleId: 'section_citations' },
  'see also': { edgeType: 'elaborates', ruleId: 'section_see_also' },
};

/**
 * Pass B — page-role prior. When neither Pass A nor section override fires,
 * default by host page's type. Marked INFERRED to signal "best guess, no
 * specific evidence." Pages without a registered prior fall through to
 * 'mentions' EXTRACTED (the link exists, we're confident about the link
 * itself; the type is just the no-information default).
 */
const PAGE_TYPE_PRIORS: Record<string, { edgeType: EdgeType; ruleId: string }> = {
  paper: { edgeType: 'cites', ruleId: 'prior_paper_cites' },
};

function applySectionOverride(section: string | null): { edgeType: EdgeType; ruleId: string } | null {
  if (!section) return null;
  const key = section.trim().toLowerCase();
  return SECTION_OVERRIDES[key] ?? null;
}

function applyPassA(contextSnippet: string | undefined): { edgeType: EdgeType; ruleId: string } | null {
  if (!contextSnippet) return null;
  for (const rule of PASS_A_RULES) {
    if (rule.pattern.test(contextSnippet)) {
      return { edgeType: rule.edgeType, ruleId: rule.id };
    }
  }
  return null;
}

function applyPassB(pageType: string): { edgeType: EdgeType; ruleId: string } | null {
  return PAGE_TYPE_PRIORS[pageType] ?? null;
}

/**
 * Classify a batch of extracted links into typed edges.
 *
 * Precedence:
 *   1. Section override (Sources/References/See also) → EXTRACTED
 *   2. Pass A regex on contextSnippet                  → EXTRACTED
 *   3. Pass B page-role prior                          → INFERRED
 *   4. Fallback                                         → 'mentions', EXTRACTED
 *
 * User-set AMBIGUOUS / INFERRED confidence markers from the extract layer
 * always win over the classifier's confidence assignment — the user's
 * intent is authoritative.
 */
export function classifyLinks(links: ExtractedLink[], ctx: ClassifyContext): ClassifiedLink[] {
  return links.map((l): ClassifiedLink => {
    // Determine edge type via precedence chain.
    const section = applySectionOverride(l.section);
    const passA = applyPassA(l.contextSnippet);
    const passB = applyPassB(ctx.pageType);

    let edgeType: EdgeType;
    let inferenceRule: string | null;
    let derivedConfidence: LinkConfidence;

    if (section) {
      edgeType = section.edgeType;
      inferenceRule = section.ruleId;
      derivedConfidence = 'extracted';
    } else if (passA) {
      edgeType = passA.edgeType;
      inferenceRule = passA.ruleId;
      derivedConfidence = 'extracted';
    } else if (passB) {
      edgeType = passB.edgeType;
      inferenceRule = passB.ruleId;
      derivedConfidence = 'inferred';
    } else {
      edgeType = 'mentions';
      inferenceRule = null;
      derivedConfidence = 'extracted';
    }

    // User markers override classifier confidence — but the edge type
    // computed above still stands (the user said "I'm uncertain" not
    // "you misclassified the relationship").
    const confidence: LinkConfidence =
      l.confidence === 'ambiguous' || l.confidence === 'inferred'
        ? l.confidence
        : derivedConfidence;

    return { ...l, edgeType, confidence, inferenceRule };
  });
}
