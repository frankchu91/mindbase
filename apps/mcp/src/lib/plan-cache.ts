// apps/mcp/src/lib/plan-cache.ts
//
// In-memory cache shared by ingest_plan and ingest_execute so the user can
// review a plan before committing without re-running the LLM.
import type { CompileL1Plan, RawDoc } from '@mindbase/core';

export interface PlanCacheEntry {
  plan: CompileL1Plan;
  rawDoc: RawDoc;
  cachedAt: number;
}

export const planCache = new Map<string, PlanCacheEntry>();

export const PLAN_TTL_MS = 30 * 60 * 1000;
