/**
 * Zod schemas for AI outputs. Shaped for OpenAI Structured Outputs (strict mode): every field is
 * required, optional values are nullable, and there are no open-ended records.
 */
import { z } from "zod";

export const Activity = z.enum(["cleanup", "plantation", "school", "water", "other"]);
export const Stage = z.enum(["before", "during", "after", "ongoing", "unknown"]);
const Confidence = z.number().min(0).max(1);

/** What the model returns for a photo. */
export const PhotoAnalysisOutput = z.object({
  caption: z.string(),
  activity: Activity,
  stage: Stage,
  visibleCounts: z.array(z.object({ label: z.string(), count: z.number().int().min(0), confidence: Confidence })),
  visualSignals: z.array(z.string()),
  sdgs: z.array(z.number().int().min(1).max(17)),
  childrenVisible: z.boolean(),
  textInImage: z.string().nullable(),
  confidence: Confidence,
});

/** Stored form: every AI-produced value is marked ai_estimated, with the model that made it. */
export const PhotoAnalysis = PhotoAnalysisOutput.extend({
  method: z.literal("ai_estimated"),
  model: z.string(),
  /** Stored with the asset: which provider produced it (mock-derived values never ship). */
  providerMode: z.enum(["mock", "real"]).optional(),
});
export type PhotoAnalysis = z.infer<typeof PhotoAnalysis>;

/** Trust Engine bands (lib/trust). */
export const TrustBandFilter = z.enum(["VERIFIED", "NEEDS_REVIEW", "FLAGGED"]);
export const SourceFilter = z.enum(["witness", "upload", "archive", "planted_test"]);

/**
 * Filters as the parser read them: plain strings, because a model can return anything.
 * lib/search.ts validates each against the allowed values and reports what it rejected.
 */
export const SearchFilters = z.object({
  /** Project slug (or id). */
  project: z.string().nullable(),
  /** VERIFIED | NEEDS_REVIEW | FLAGGED */
  band: z.string().nullable(),
  /** witness | upload | archive | planted_test ("test inputs") */
  source: z.string().nullable(),
  /** cleanup | plantation | school | water | other */
  activity: z.string().nullable(),
  /** ISO dates (YYYY-MM-DD), inclusive. */
  from: z.string().nullable(),
  to: z.string().nullable(),
});
export type SearchFilters = z.infer<typeof SearchFilters>;

export const ParsedSearch = z.object({
  /** Free-text part to rank by ("" when the query is only filters), in English. */
  semantic: z.string(),
  filters: SearchFilters,
  /** Words the parser read differently: Hinglish ("paudhe" → "saplings") and typos. */
  rewrites: z.array(z.object({ from: z.string(), to: z.string() })),
});
export type ParsedSearch = z.infer<typeof ParsedSearch>;
