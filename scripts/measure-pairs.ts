/**
 * `pnpm measure:pairs [project-slug]`: re-pairs every project (or one) by the rules, measures the
 * pairs, and prints every candidate pair with why each reject failed, then the comparisons.
 */
import "./_env";
import { eq } from "drizzle-orm";
import { getConfig } from "../src/lib/config";
import { closeDb, getDb } from "../src/lib/db/client";
import { DatabaseLockedError } from "../src/lib/db/lock";
import { assets, comparisons, projects } from "../src/lib/db/schema";
import { autoPairProject, METRIC_LABEL } from "../src/lib/measure/measure";
import { pairingLines } from "../src/lib/measure/report";
import { getMediaProvider } from "../src/lib/providers/media";

async function main() {
  const db = await getDb();
  const media = getMediaProvider();
  const only = process.argv[2];
  const ps = (await db.select().from(projects)).filter((p) => !only || p.slug === only);
  for (const p of ps) {
    const r = await autoPairProject({ db, media, measureMax: getConfig().env.MEASURE_MAX_PER_PROJECT }, p.id);
    const photos = await db.select({ id: assets.id, externalId: assets.externalId, capturedAt: assets.capturedAt, source: assets.source }).from(assets).where(eq(assets.projectId, p.id));
    const label = (id: string) => {
      const a = photos.find((x) => x.id === id);
      return `${a?.externalId ?? `${a?.source ?? "?"}:${id.slice(0, 8)}`} (${a?.capturedAt?.toISOString().slice(0, 16).replace("T", " ") ?? "no time"})`;
    };
    console.log(`\n${p.name} [${p.slug}] · ${p.type}, pair gap ${p.minPairGapHours} h, ${p.locationApproximate ? "approximate location: spot radius up to 150 m" : "spot radius up to 30 m"}`);
    if (!r.kind) console.log("  (this project type has no before/after measurement)");
    for (const line of pairingLines(r.result, label)) console.log(line);
    const cs = await db.select().from(comparisons).where(eq(comparisons.projectId, p.id));
    for (const c of cs) {
      console.log(`  = ${METRIC_LABEL[c.metric as keyof typeof METRIC_LABEL] ?? c.metric}: ${c.beforeValue} → ${c.afterValue} (${c.delta! > 0 ? "+" : ""}${c.delta}) ${c.method}${c.confidence !== null ? `, confidence ${c.confidence}` : ""} [${c.origin}]`);
    }
    console.log(`  ${r.result.pairs.length} pair(s), ${r.result.candidates.length} candidate(s), ${r.result.excluded.length} photo(s) left out, ${r.removed} stale pair(s) removed.`);
  }
}

main()
  .catch((err) => {
    console.error(err instanceof DatabaseLockedError ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
