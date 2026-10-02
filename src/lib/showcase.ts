/**
 * What the public story pages feature. Chapters about one project use the hero (DEMO_HERO). The
 * measurement chapter uses the best measured pair across all projects, labelled with its own
 * project, because the hero's clean-up day may have no measurable pair.
 *
 * "Best" (pure `rankPairs`, tested): primary metrics only (litter or green cover), method
 * measured, |delta| ≥ 5 points, shown under the display policy (never a mock number in
 * production). Ranked by confidence (a measured value with no confidence recorded counts as
 * full confidence; a low-confidence reading counts as its number), then |delta|, then newest.
 */
import { and, eq, inArray } from "drizzle-orm";
import type { DB } from "./db/client";
import { assets, comparisons, projects, type Comparison } from "./db/schema";
import { heroProject } from "./demo/hero";
import { numberPolicy, type DisplayPolicy } from "./provenance";

export const MIN_SHOWCASE_DELTA = 5;
const PRIMARY = ["litter_cover", "green_cover"];

export type PairCandidate = Pick<Comparison, "id" | "metric" | "method" | "delta" | "confidence" | "providerMode" | "updatedAt">;

export function rankPairs<T extends PairCandidate>(cs: T[], policy: DisplayPolicy, { minAbsDelta = MIN_SHOWCASE_DELTA } = {}): T[] {
  const conf = (c: T) => c.confidence ?? 1;
  return cs
    .filter((c) => PRIMARY.includes(c.metric) && c.method === "measured" && c.delta !== null && Math.abs(c.delta) >= minAbsDelta)
    .filter((c) => numberPolicy(c.providerMode ?? "mock", policy) !== "hide")
    .sort((a, b) => conf(b) - conf(a) || Math.abs(b.delta!) - Math.abs(a.delta!) || (b.updatedAt?.getTime() ?? 0) - (a.updatedAt?.getTime() ?? 0));
}

export interface Showcase {
  hero: { slug: string; project: { id: string; name: string; slug: string | null } | null };
  /** The measurement chapter's pair, or null → the designed empty state. */
  measurement: {
    comparison: Comparison;
    project: { id: string; name: string; slug: string | null };
    isHero: boolean;
    before: { id: string; capturedAt: Date | null };
    after: { id: string; capturedAt: Date | null };
  } | null;
}

export async function showcase(db: DB, policy: DisplayPolicy): Promise<Showcase> {
  const hero = await heroProject(db);
  const cs = await db.select().from(comparisons).where(and(inArray(comparisons.metric, PRIMARY), eq(comparisons.method, "measured")));
  const best = rankPairs(cs, policy)[0];
  if (!best) return { hero, measurement: null };
  const [[project], photos] = await Promise.all([
    db.select({ id: projects.id, name: projects.name, slug: projects.slug }).from(projects).where(eq(projects.id, best.projectId)).limit(1),
    db.select({ id: assets.id, capturedAt: assets.capturedAt }).from(assets).where(inArray(assets.id, [best.beforeAssetId, best.afterAssetId])),
  ]);
  const photo = (id: string) => photos.find((p) => p.id === id) ?? { id, capturedAt: null };
  return {
    hero,
    measurement: project ? { comparison: best, project, isHero: project.id === hero.project?.id, before: photo(best.beforeAssetId), after: photo(best.afterAssetId) } : null,
  };
}
