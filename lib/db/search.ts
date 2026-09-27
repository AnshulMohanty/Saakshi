/**
 * Hybrid asset search: structured filters (project, trust band, date range, source) plus
 * semantic ranking by cosine distance on the embedding (pgvector HNSW index).
 */
import { and, cosineDistance, desc, eq, getTableColumns, gte, isNotNull, lt, sql, type SQL } from "drizzle-orm";
import type { SearchFilters } from "../providers/ai/schemas";
import type { DB } from "./client";
import { assets, EMBEDDING_DIMENSIONS } from "./schema";

// Everything except the 1536-float embedding.
const { embedding: _embedding, ...summaryColumns } = getTableColumns(assets);
void _embedding;

export interface AssetSearchInput {
  /** Query embedding; omit for filter-only search (newest first). */
  embedding?: number[] | null;
  filters?: Partial<SearchFilters>;
  limit?: number;
}

function filterConditions(f: Partial<SearchFilters>): SQL[] {
  const conds: SQL[] = [];
  if (f.projectId) conds.push(eq(assets.projectId, f.projectId));
  if (f.band) conds.push(eq(assets.trustBand, f.band));
  if (f.source) conds.push(eq(assets.source, f.source));
  if (f.from) conds.push(gte(assets.capturedAt, new Date(`${f.from}T00:00:00Z`)));
  if (f.to) {
    const end = new Date(`${f.to}T00:00:00Z`);
    end.setUTCDate(end.getUTCDate() + 1); // inclusive end date
    conds.push(lt(assets.capturedAt, end));
  }
  return conds;
}

export async function searchAssets(db: DB, { embedding, filters = {}, limit = 20 }: AssetSearchInput = {}) {
  const conds = filterConditions(filters);
  const k = Math.max(1, Math.min(limit, 200));

  if (!embedding) {
    const rows = await db
      .select(summaryColumns)
      .from(assets)
      .where(and(...conds))
      .orderBy(sql`${assets.capturedAt} desc nulls last`, desc(assets.uploadedAt))
      .limit(k);
    return rows.map((asset) => ({ asset, distance: null as number | null }));
  }

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
  return rows.map(({ distance: d, ...asset }) => ({ asset, distance: Number(d) }));
}
