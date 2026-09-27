/**
 * Search: parse (AIProvider.parseSearch) → validate every filter against the allowed values →
 * rank (semantic with a real model; Postgres full-text with the mock) → results plus the
 * "Understood as" chips, including what was rejected and every Hinglish/typo rewrite.
 */
import { eq, or } from "drizzle-orm";
import type { DB } from "../db/client";
import { projects } from "../db/schema";
import { searchAssets, type AssetFilters, type SearchMode } from "../db/search";
import { THUMB } from "../library";
import type { AIProvider } from "../providers/ai";
import type { ParsedSearch } from "../providers/ai/schemas";
import type { MediaProvider } from "../providers/media";
import { synonymsOf } from "./synonyms";

export const BANDS = ["VERIFIED", "NEEDS_REVIEW", "FLAGGED"] as const;
export const SOURCES = ["witness", "upload", "archive", "planted_test"] as const;
export const ACTIVITIES = ["cleanup", "plantation", "school", "water", "other"] as const;

export type ChipKind = "project" | "band" | "source" | "activity" | "from" | "to" | "text" | "rewrite" | "rejected";
export interface Chip {
  kind: ChipKind;
  label: string;
  value: string;
}

const BAND_ALIASES: Record<string, (typeof BANDS)[number]> = {
  verified: "VERIFIED", trusted: "VERIFIED", high: "VERIFIED",
  needs_review: "NEEDS_REVIEW", "needs review": "NEEDS_REVIEW", review: "NEEDS_REVIEW", medium: "NEEDS_REVIEW",
  flagged: "FLAGGED", low: "FLAGGED",
};
const SOURCE_ALIASES: Record<string, (typeof SOURCES)[number]> = { "test inputs": "planted_test", test: "planted_test", planted: "planted_test", uploads: "upload", archival: "archive" };
const BAND_LABEL = { VERIFIED: "Verified", NEEDS_REVIEW: "Needs review", FLAGGED: "Flagged" } as const;
const SOURCE_LABEL = { witness: "Witness Capture", upload: "Uploads", archive: "Archive", planted_test: "Test inputs" } as const;

const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().startsWith(s);

export interface ValidatedFilters {
  filters: AssetFilters;
  chips: Chip[];
  rejected: Array<{ field: keyof ParsedSearch["filters"]; value: string; reason: string }>;
}

/** Keeps only filters whose values exist; everything else is reported, never silently used. */
export async function validateFilters(db: DB, raw: ParsedSearch["filters"]): Promise<ValidatedFilters> {
  const filters: AssetFilters = {};
  const chips: Chip[] = [];
  const rejected: ValidatedFilters["rejected"] = [];
  const reject = (field: keyof ParsedSearch["filters"], value: string, reason: string) => {
    rejected.push({ field, value, reason });
    chips.push({ kind: "rejected", label: `Ignored ${field} “${value}”: ${reason}`, value });
  };

  if (raw.project) {
    const v = raw.project.trim().toLowerCase();
    const [p] = await db
      .select({ id: projects.id, name: projects.name, slug: projects.slug })
      .from(projects)
      .where(/^[0-9a-f-]{36}$/.test(v) ? or(eq(projects.id, v), eq(projects.slug, v)) : eq(projects.slug, v))
      .limit(1);
    if (p) {
      filters.projectId = p.id;
      chips.push({ kind: "project", label: `Project: ${p.name}`, value: p.slug ?? p.id });
    } else reject("project", raw.project, "no such project");
  }
  if (raw.band) {
    const v = raw.band.trim();
    const band = (BANDS as readonly string[]).includes(v.toUpperCase()) ? (v.toUpperCase() as (typeof BANDS)[number]) : BAND_ALIASES[v.toLowerCase()];
    if (band) {
      filters.band = band;
      chips.push({ kind: "band", label: BAND_LABEL[band], value: band });
    } else reject("band", raw.band, `not one of ${BANDS.join(", ")}`);
  }
  if (raw.source) {
    const v = raw.source.trim().toLowerCase();
    const source = (SOURCES as readonly string[]).includes(v) ? (v as (typeof SOURCES)[number]) : SOURCE_ALIASES[v];
    if (source) {
      filters.source = source;
      chips.push({ kind: "source", label: SOURCE_LABEL[source], value: source });
    } else reject("source", raw.source, `not one of ${SOURCES.join(", ")}`);
  }
  if (raw.activity) {
    const v = raw.activity.trim().toLowerCase();
    if ((ACTIVITIES as readonly string[]).includes(v)) {
      filters.activity = v;
      chips.push({ kind: "activity", label: `Activity: ${v}`, value: v });
    } else reject("activity", raw.activity, `not one of ${ACTIVITIES.join(", ")}`);
  }
  for (const field of ["from", "to"] as const) {
    const v = raw[field];
    if (!v) continue;
    if (isDate(v)) {
      filters[field] = v;
      chips.push({ kind: field, label: `${field === "from" ? "From" : "Until"} ${v}`, value: v });
    } else reject(field, v, "not a YYYY-MM-DD date");
  }
  if (filters.from && filters.to && filters.from > filters.to) {
    reject("to", filters.to, `before ${filters.from}`);
    delete filters.to;
    const i = chips.findIndex((c) => c.kind === "to");
    if (i >= 0) chips.splice(i, 1);
  }
  return { filters, chips, rejected };
}

export interface SearchResult {
  query: string;
  mode: SearchMode;
  chips: Chip[];
  rejected: ValidatedFilters["rejected"];
  results: Array<{
    id: string;
    caption: string | null;
    band: string | null;
    status: string;
    source: string;
    testCase: string | null;
    projectId: string | null;
    placeName: string | null;
    capturedAt: string | null;
    thumbUrl: string;
    score: number | null;
  }>;
}

export async function runSearch(deps: { db: DB; ai: AIProvider; media: MediaProvider }, query: string, limit = 24): Promise<SearchResult> {
  const parsed = await deps.ai.parseSearch(query);
  const { filters, chips, rejected } = await validateFilters(deps.db, parsed.filters);
  for (const r of parsed.rewrites) chips.unshift({ kind: "rewrite", label: `“${r.from}” → ${r.to}`, value: r.to });
  const semantic = parsed.semantic.trim();
  if (semantic) chips.push({ kind: "text", label: `About: ${semantic}`, value: semantic });

  // The mock's hashed embeddings are not a real semantic space: rank by full text instead.
  const useEmbedding = !!semantic && deps.ai.kind === "real";
  const rows = await searchAssets(deps.db, {
    embedding: useEmbedding ? await deps.ai.embed(semantic) : null,
    text: useEmbedding ? null : semantic,
    expand: synonymsOf,
    filters,
    limit,
  });
  return {
    query,
    mode: rows[0]?.mode ?? (semantic ? (useEmbedding ? "semantic" : "fulltext") : "filters"),
    chips,
    rejected,
    results: rows.map(({ asset: a, distance, rank }) => ({
      id: a.id,
      caption: a.caption,
      band: a.trustBand,
      status: a.status,
      source: a.source,
      testCase: a.testCase,
      projectId: a.projectId,
      placeName: a.placeName,
      capturedAt: a.capturedAt?.toISOString() ?? null,
      thumbUrl: deps.media.url(a.cldPublicId, THUMB, { signed: true }),
      score: distance !== null ? Math.round((1 - distance) * 1000) / 1000 : rank !== null ? Math.round(rank * 1000) / 1000 : null,
    })),
  };
}
