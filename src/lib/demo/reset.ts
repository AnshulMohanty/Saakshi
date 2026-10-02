/**
 * Demo reset. By default deletes only archive and planted_test assets and what derives from
 * them: their audit chains, duplicates and comparisons (FK cascades) and the demo projects'
 * reports. Demo projects and spots stay (stable ids), so witness photos keep their links.
 * `includeWitness` also deletes every other asset in demo projects, and the projects and spots.
 * No hash is recomputed: each deleted asset takes its own chain with it, every other chain stays
 * valid, and the reset is recorded as a "demo_reset" event on the system chain.
 */
import { eq, inArray, or, sql } from "drizzle-orm";
import { appendAudit } from "../audit";
import type { DB } from "../db/client";
import { assets, projects, reports, spots } from "../db/schema";
import type { MediaProvider } from "../providers/media";
import { MockMediaProvider } from "../providers/media/mock";

export interface WipeOptions {
  /** Also delete witness/upload photos in demo projects, and the projects and spots. */
  includeWitness?: boolean;
}

export interface WipeReport {
  assets: number;
  reports: number;
  projects: number;
  keptWitness: number;
  includeWitness: boolean;
}

export async function wipeDemo(db: DB, media?: MediaProvider, { includeWitness = false }: WipeOptions = {}): Promise<WipeReport> {
  const demoProjects = (await db.select({ id: projects.id }).from(projects).where(eq(projects.source, "demo_archive"))).map((p) => p.id);
  const inDemo = demoProjects.length ? inArray(assets.projectId, demoProjects) : sql`false`;
  const doomed = await db
    .select({ id: assets.id, publicId: assets.cldPublicId })
    .from(assets)
    .where(includeWitness ? or(inArray(assets.source, ["archive", "planted_test"]), inDemo) : inArray(assets.source, ["archive", "planted_test"]));
  const ids = doomed.map((a) => a.id);

  const result = await db.transaction(async (tx) => {
    const r = demoProjects.length ? (await tx.delete(reports).where(inArray(reports.projectId, demoProjects)).returning({ id: reports.id })).length : 0;
    // Cascades: each asset's audit chain, duplicates and comparisons; spot baselines → null.
    if (ids.length) await tx.delete(assets).where(inArray(assets.id, ids));
    let p = 0;
    if (includeWitness && demoProjects.length) {
      await tx.delete(spots).where(inArray(spots.projectId, demoProjects));
      p = (await tx.delete(projects).where(inArray(projects.id, demoProjects)).returning({ id: projects.id })).length;
    }
    const [{ n }] = demoProjects.length
      ? await tx.select({ n: sql<number>`count(*)::int` }).from(assets).where(inDemo)
      : [{ n: 0 }];
    return { assets: ids.length, reports: r, projects: p, keptWitness: n, includeWitness };
  });

  await appendAudit(db, { actor: "demo:reset", action: "demo_reset", detail: { ...result } });
  if (media instanceof MockMediaProvider) {
    for (const a of doomed) await media.store.remove(a.publicId);
    await media.store.removeFolder("saakshi/planted-source");
  }
  return result;
}
