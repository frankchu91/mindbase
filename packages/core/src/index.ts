export type * from './types';
export type { Store, DirEntry } from './storage/store';
export { MemoryStore } from './storage/memory_store';
export { FileStore } from './storage/file_store';
export { ProjectScopedStore } from './storage/project-scoped-store';
export type { TrashEntry } from './storage/file_store';
export { OPFSStore } from './storage/opfs';
export { newShortId } from './storage/ids';
export * as paths from './storage/paths';
export { slugify } from './storage/paths';

/** Regex to detect LLM auto-save markers in responses: [AUTO_SAVE: title] */
export const AUTO_SAVE_REGEX = /\[AUTO_SAVE:\s*(.+?)\]\s*$/;
export { createAdapter } from './adapters/registry';
export type { LLMAdapter, AdapterConfig } from './adapters/types';
export { SearchIndex } from './search/index';
export type { SearchDoc, SearchResult } from './search/index';
export { EmbeddingStore } from './search/embedding-store';
export type { CachedEmbedding } from './search/embedding-store';
export { parseOperators, extractSnippet, hybridSearch } from './search/hybrid';
export type { HybridQuery, HybridResult, SearchFilters, SnippetResult } from './search/hybrid';
export { multilingualTokenize } from './search/tokenizer';
export { ingestPaste } from './ingest/paste';
export { ingestFile } from './ingest/file';
export { compileL1, compileL1Plan, compileL1Execute } from './compile/l1';
export type { CompileL1Result } from './compile/l1';
export type { CompileL1ProgressEvent } from './compile/l1';
export type { CompileL1Plan, ProposedAction, ApprovalMap } from './compile/l1';
export { compileL2 } from './compile/l2';
export type { CompileL2Result } from './compile/l2';
export { readIndex, parseIndex } from './compile/index_md';
export type { IndexEntry } from './compile/index_md';
export { gatherCompileContext, serializeContext } from './compile/context';
export type { CompileContext, ContextPage, ContextEdge, ContextDeps } from './compile/context';
export { AuditLogWriter } from './compile/audit';
export type { AuditEntry, CompileAction, StartAuditOptions, CompleteAuditOptions } from './compile/audit';
export { applySectionPatch } from './compile/patches';
export type { SectionPatch, PatchResult } from './compile/patches';
export { COMPILE_V2_SYSTEM_PROMPT, buildL1MessagesV2 } from './compile/prompts';
export { askQuestion } from './qa/query';
export type { QAEvent } from './qa/query';
export { runCrosslinker } from './compile/crosslink';
export type { CrosslinkResult } from './compile/crosslink';

// Classify module — note auto-folder pipeline
export { classifyNote, classifyContent } from './classify/classify-note';
export type { ClassifyResult, ClassifyNoteInput, ClassifyContentInput } from './classify/classify-note';
export { buildClassifyPrompt } from './classify/prompt';
export type { BuildClassifyPromptInput } from './classify/prompt';
export { loadFolders, saveFolders, ensureInbox, isValidFolderPath, FOLDERS_PATH, INBOX_PATH } from './classify/folders';
export type { Folder } from './classify/folders';
export { loadClassifyRules, saveClassifyRules, ensureDefaultRules, RULES_PATH, RULES_MAX_CHARS, RulesTooLongError } from './classify/rules';
export { sampleNotesPerFolder, SAMPLES_PER_FOLDER } from './classify/samples';

// OCR module — image OCR adapter + markdown attachment extraction
export type { OCRResult, OCRAdapter } from './ocr/adapter';
export { NoopOCRAdapter } from './ocr/adapter';
export { extractBase64Images } from './ocr/extract';
export type { ExtractedImage, ExtractionResult } from './ocr/extract';

// Tree module — unified folder + note tree for LeftRail
export type { TreeNodeId, TreeNode } from './tree/types';
export { encodeNodeId, decodeNodeId, sameNodeId } from './tree/types';
export { generateOrder, compareOrder } from './tree/order';
export { buildTree } from './tree/build';
export type { BuildTreeInput } from './tree/build';

// Graph module
export type {
  PageNode, PageEdge, PageGraph, EdgeConfidence,
  HubInfo, BridgeInfo, CohesionInfo, SurprisingEdge,
  OrphanAdjacent, BrokenLink, InsightsReport, InsightsDelta,
} from './graph/types';
export { buildGraph } from './graph/builder';
export {
  getHubs, getOrphans, getBridges, getCohesion,
  getSurprising, getOrphanAdjacent, getBrokenLinks,
} from './graph/analysis';
export { generateInsights, renderInsightsMarkdown } from './graph/insights';
export { crossLink } from './graph/crosslinker';
export type { CrossLinkSuggestion, CrossLinkResult } from './graph/crosslinker';
export { toJSON as graphToJSON, toGraphML, toCypher, toHTML as graphToHTML } from './graph/export';
export { WikiIndex } from './graph/index/wiki-index';
export type { PageRow, LinkRow, PageUpsert } from './graph/index/wiki-index';
export { reindex, reindexAllProjects } from './graph/index/reindex';
export type { ReindexResult } from './graph/index/reindex';
export { buildFileBackPlan } from './file-back/build-plan';
export type { FileBackInput } from './file-back/build-plan';
export { rebuildIndex, indexUpsertConcept } from './wiki/index-md';
export { ensureSchema, loadSchema, SCHEMA_PATH, DEFAULT_SCHEMA } from './wiki/schema';
export { parseSchemaSections, loadSchemaSections } from './wiki/schema-sections';
export type { SchemaSections } from './wiki/schema-sections';
export { lintWiki } from './wiki/lint';
export type { LintReport, LintFinding, LintOptions } from './wiki/lint';
export { parseLog, filterSince } from './wiki/log-parse';
export type { LogEntry } from './wiki/log-parse';
export { extractWikilinks } from './graph/index/extract-links';
export type { ExtractedLink, LinkConfidence } from './graph/index/extract-links';
export { EDGE_TYPES, isEdgeType } from './graph/index/edge-type';
export type { EdgeType } from './graph/index/edge-type';
export { classifyLinks } from './graph/index/classify-edges';
export type { ClassifiedLink, ClassifyContext } from './graph/index/classify-edges';
export { reclassify } from './graph/index/reclassify';
export type { ReclassifyResult } from './graph/index/reclassify';
export { backlinkBoost, recencyBoost, exactMatchBoost } from './search/retrieval-signals';

// Obsidian integration
export { buildColorGroups, mergeIntoGraphJson } from './obsidian/colorize';
export type { ColorizeMode } from './obsidian/colorize';

// Daily Brief
export { buildBrief } from './brief/build';
export type { BriefRecord, BriefSection, CitedSource as BriefCitedSource, BuildBriefContext, BuildBriefOpts } from './brief/build';

// RSS Feeds
export { FeedStore, parseOpml } from './feeds/store';
export type { Feed, FeedSummary } from './feeds/store';

// Spaced Repetition System
export { applyRating, newCard } from './srs/sm2';
export { CardStore } from './srs/store';
export { extractCards, parseExtractedCards, EXTRACT_PROMPT } from './srs/extract';
export type { ReviewCard, Rating, SRSStats } from './srs/types';
export type { ExtractedCard, ExtractOptions } from './srs/extract';

// Projects
export { listProjects, getProject, createProject, deleteProject } from './projects/store';
export type { ProjectMeta } from './projects/types';
export { isValidProjectId } from './projects/types';
export { PROJECT_TEMPLATES, listTemplates, getTemplateSchema } from './projects/templates';
export type { ProjectTemplateId } from './projects/templates';
export { migrateLegacyData } from './projects/migration';
export type { MigrationResult } from './projects/migration';

// Notes helpers (TemplateStore + createNote) — shared by server and MCP
export { TemplateStore } from './notes/template-store';
export type { TemplateInfo } from './notes/template-store';
export {
  createNote,
  createOrOpenDaily,
  slugify as slugifyNote,
  todayIsoDate,
  shiftDays,
  buildStandardVars,
  SlugConflictError,
  dayNameOf,
  TEMPLATE_TO_KIND,
} from './notes/create-note';
export type {
  CreateNoteParams,
  CreateNoteResult,
} from './notes/create-note';

// Tool definitions and executor
export { ToolExecutor } from './tools/executor';
export type { ToolResult } from './tools/executor';
export {
  READ_CONCEPT,
  APPEND_TO_CONCEPT,
  CREATE_CONCEPT,
  UPDATE_NOTE,
  UPDATE_SOURCE_BACKLINKS,
  ADD_TO_INDEX,
  REWRITE_CONCEPT,
  UPDATE_ONE_LINER,
  L1_TOOLS,
  L2_TOOLS,
} from './tools/schema';

// Active Wiki — synthesis types
export type {
  Citation,
  SynthesisThread,
  Contradiction,
  Gap,
  SynthesisResult,
  PulseWeeklyWrite,
  PulseNewConnection,
  PulseStaleNote,
  PulseGap,
  PulseSnapshot,
  NetworkRelated,
  NetworkMissingLink,
  NetworkMention,
  NetworkView,
} from './synthesis';

// Active Wiki — synthesis functions
export { buildSynthesisPrompt, buildMissingLinksPrompt, buildContradictionPrompt, validateSynthesis, hashMap } from './synthesis';

// Phase 4 — contradiction probe pipeline
export {
  findContradictionCandidates,
  judgeContradictionPair,
  runContradictionProbe,
  CONTRADICTION_JUDGE_PROMPT_VERSION,
} from './compile/contradiction-probe';
export type {
  ContradictionCandidate,
  Verdict,
  JudgeResult,
  RunContradictionProbeOptions,
  RunContradictionProbeResult,
} from './compile/contradiction-probe';

// Phase 4 — analysis layer
export { runAnalysis } from './analysis/insights';
export type { AnalysisInsights, RunAnalysisOptions } from './analysis/insights';
export { detectCommunities, persistCommunities } from './analysis/communities';
export type { CommunityResult, CommunitySummary } from './analysis/communities';
export { detectGodNodes, p99InboundThreshold } from './analysis/god-nodes';
export type { GodNode, GodNodeResult } from './analysis/god-nodes';
export { detectBridgeNodes } from './analysis/bridge-nodes';
export type { BridgeNode } from './analysis/bridge-nodes';
export { detectOrphanClusters } from './analysis/orphan-clusters';
export type { OrphanCluster } from './analysis/orphan-clusters';
export { generateSuggestions } from './analysis/suggestions';
export type { Suggestion, SuggestionInput, SuggestionKind, ContradictionSummary, AmbiguousLink } from './analysis/suggestions';
export { AnalysisCache, ContradictionCache } from './analysis/cache';
export type { AnalysisKind, AnalysisCacheEntry, ContradictionRecord, ContradictionVerdict, ContradictionPutInput } from './analysis/cache';

// Plugin layout (per-project paths)
export { projectPaths, isoToday } from './plugin-layout/index.js';
export type { ProjectPaths } from './plugin-layout/index.js';

// Migration pipeline (legacy → v2-layout)
export { migrateProject, snapshotProject } from './migrate/index.js';
export type { MigrateOptions, MigrateReport } from './migrate/index.js';
