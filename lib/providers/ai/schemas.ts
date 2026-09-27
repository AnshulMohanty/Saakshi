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
});
export type PhotoAnalysis = z.infer<typeof PhotoAnalysis>;

/** Trust Engine bands (lib/trust). */
export const TrustBandFilter = z.enum(["VERIFIED", "NEEDS_REVIEW", "FLAGGED"]);
export const SourceFilter = z.enum(["witness", "upload", "archive", "planted_test"]);

export const SearchFilters = z.object({
  projectId: z.string().nullable(),
  band: TrustBandFilter.nullable(),
  source: SourceFilter.nullable(),
  /** ISO dates (YYYY-MM-DD), inclusive. */
  from: z.string().nullable(),
  to: z.string().nullable(),
});
export type SearchFilters = z.infer<typeof SearchFilters>;

export const ParsedSearch = z.object({
  /** Free-text part to embed for semantic ranking ("" when the query is only filters). */
  semantic: z.string(),
  filters: SearchFilters,
});
export type ParsedSearch = z.infer<typeof ParsedSearch>;
