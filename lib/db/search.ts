/**
 * Asset search over validated filters (project, trust band, source, activity, date range), ranked
 * either semantically (cosine distance on the embedding, pgvector HNSW) or by Postgres full-text
 * search over caption, tags and place (the fallback when the AI provider is the mock).
 */
import { and, cosineDistance, desc, eq, getTableColumns, gte, isNotNull, lt, sql, type SQL } from "drizzle-orm";
import type { DB } from "./client";
import { assets, EMBEDDING_DIMENSIONS, type Asset } from "./schema";

// Everything except the 1536-float embedding.
const { embedding: _embedding, ...summaryColumns } = getTableColumns(assets);
void _embedding;

/** Filters that already passed lib/search validation. */
export interface AssetFilters {
  projectId?: string | null;
  band?: NonNullable<Asset["trustBand"]> | null;
  source?: Asset["source"] | null;
  activity?: string | null;
  /** YYYY-MM-DD, inclusive. */
  from?: string | null;
  to?: string | null;
}

export interface AssetSearchInput {
  /** Query embedding for semantic ranking. */
  embedding?: number[] | null;
  /** Free text for full-text ranking (used when there is no embedding). */
  text?: string | null;
  /** Full-text only: alternatives for a query word (synonyms); the word itself when omitted. */
  expand?: (word: string) => string[];
  filters?: AssetFilters;
  limit?: number;
}

function filterConditions(f: AssetFilters): SQL[] {
  const conds: SQL[] = [];
  if (f.projectId) conds.push(eq(assets.projectId, f.projectId));
  if (f.band) conds.push(eq(assets.trustBand, f.band));
  if (f.source) conds.push(eq(assets.source, f.source));
  if (f.activity) conds.push(sql`${assets.ai}->>'activity' = ${f.activity}`);
  if (f.from) conds.push(gte(assets.capturedAt, new Date(`${f.from}T00:00:00Z`)));
  if (f.to) {
    const end = new Date(`${f.to}T00:00:00Z`);
    end.setUTCDate(end.getUTCDate() + 1); // inclusive end date
    conds.push(lt(assets.capturedAt, end));
  }
  return conds;
}

/** The document full-text search runs over: caption, tags (underscores as spaces), place and the archive title. */
const document = sql`to_tsvector('english', coalesce(${assets.caption}, '') || ' ' || replace(array_to_string(${assets.cldTags}, ' '), '_', ' ') || ' ' || coalesce(${assets.placeName}, '') || ' ' || coalesce(${assets.attribution}->>'title', ''))`;

/** Words safe to put into a tsquery. */
const lexemes = (text: string) => [...new Set(text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])].slice(0, 12);

export type SearchMode = "semantic" | "fulltext" | "filters";

export async function searchAssets(db: DB, { embedding, text, expand, filters = {}, limit = 20 }: AssetSearchInput = {}) {
  const conds = filterConditions(filters);
  const k = Math.max(1, Math.min(limit, 200));

  if (embedding) {
    if (embedding.length !== EMBEDDING_DIMENSIONS) {
      throw new RangeError(`Query embedding must have ${EMBEDDING_DIMENSIONS} dimensions, got ${embedding.length}`);
    }
    const distance = cosineDistance(assets.embedding, embedding);
    const rows = await db
      .select({ ...summaryColumns, distance: sql<number>`${distance}` })
      .from(assets)
      .where(and(isNotNull(assets.embedding), ...conds))
      .orderBy(distance)
      .limit(k);
    return rows.map(({ distance: d, ...asset }) => ({ asset, distance: Number(d), rank: null as number | null, mode: "semantic" as SearchMode }));
  }

  const words = text ? lexemes(text) : [];
  if (words.length) {
    // Each word or one of its synonyms; all words first, then any word (ranked by matches).
    const alt = (w: string) => `(${[...new Set((expand?.(w) ?? [w]).flatMap(lexemes))].join(" | ")})`;
    for (const op of [" & ", " | "]) {
      const query = sql`to_tsquery('english', ${words.map(alt).join(op)})`;
      const rank = sql<number>`ts_rank(${document}, ${query})`;
      const rows = await db
        .select({ ...summaryColumns, rank })
        .from(assets)
        .where(and(sql`${document} @@ ${query}`, ...conds))
        .orderBy(desc(rank), desc(assets.uploadedAt))
        .limit(k);
      if (rows.length || op === " | ") return rows.map(({ rank: r, ...asset }) => ({ asset, distance: null as number | null, rank: Number(r), mode: "fulltext" as SearchMode }));
    }
  }

  const rows = await db
    .select(summaryColumns)
    .from(assets)
    .where(and(...conds))
    .orderBy(sql`${assets.capturedAt} desc nulls last`, desc(assets.uploadedAt))
    .limit(k);
  return rows.map((asset) => ({ asset, distance: null as number | null, rank: null as number | null, mode: "filters" as SearchMode }));
}
