/**
 * Phase 2 retrieval signals — multiplicative boosts applied to the base
 * RRF-fused hybrid score in `hybridSearch`. All are pure functions; testable
 * in isolation; safe for missing/invalid inputs (return neutral 1.0).
 */

/**
 * Backlink boost — popular pages rank higher.
 *
 *   boost = 1 + 0.05 · ln(1 + inbound_count)
 *
 * The 0.05 coefficient was calibrated empirically. Log scale ensures
 * diminishing returns so a single super-hub doesn't dominate every query.
 */
export function backlinkBoost(inboundCount: number): number {
  if (!Number.isFinite(inboundCount) || inboundCount < 0) return 1.0;
  return 1.0 + 0.05 * Math.log(1 + inboundCount);
}

/**
 * Recency boost — recently-updated pages rank slightly higher.
 *
 * Grace period of 7 days where recency = 1.0 (no penalty), then exponential
 * decay with a 60-day half-life. Designed to gently surface recent work
 * without burying classics.
 *
 *   boost = exp(-max(0, days - 7) / 86.56)   // 86.56 = 60 / ln(2)
 */
const RECENCY_GRACE_DAYS = 7;
const RECENCY_TAU_DAYS = 86.56;  // 60 / ln(2), gives 60-day half-life past grace

export function recencyBoost(updatedAt: string | null | undefined, now: Date = new Date()): number {
  if (!updatedAt) return 1.0;
  const t = Date.parse(updatedAt);
  if (Number.isNaN(t)) return 1.0;
  const ageDays = (now.getTime() - t) / 86_400_000;
  if (ageDays <= RECENCY_GRACE_DAYS) return 1.0;
  return Math.exp(-(ageDays - RECENCY_GRACE_DAYS) / RECENCY_TAU_DAYS);
}

/**
 * Exact-match boost — the query string appearing as a whole word in the
 * page title gets a small lift. Token boundary matching avoids spurious
 * hits inside other words (e.g. "rag" should NOT boost "fragment").
 *
 *   boost = 1.10 if title contains query as token, else 1.0
 */
const EXACT_BOOST_FACTOR = 1.10;

export function exactMatchBoost(query: string, title: string | null | undefined): number {
  if (!query || !title) return 1.0;
  const q = query.trim().toLowerCase();
  if (!q) return 1.0;
  const t = title.toLowerCase();
  // Token boundary: \b before and after the query. Escape regex specials in q.
  const escaped = q.replace(/[-\\/\\^$*+?.()|[\]{}]/g, '\\$&');
  const tokenRe = new RegExp(`\\b${escaped}\\b`);
  return tokenRe.test(t) ? EXACT_BOOST_FACTOR : 1.0;
}
