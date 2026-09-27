/**
 * Demo orchestration shared by the CLI scripts and POST /api/demo/reset.
 * Scripts pass `inline: true` so the pipeline runs in this process (they hold the PGlite lock).
 */
import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { count, eq, inArray } from "drizzle-orm";
import type { ArchiveCandidates } from "../archive/candidates";
import { CommonsClient, packageRepoUrl } from "../archive/commons";
import { verifyAllChains } from "../audit";
import { getConfig } from "../config";
import { getDb } from "../db/client";
import { assets, projects, spots } from "../db/schema";
import { drainQueue, enqueueAsset, getPipelineDeps } from "../pipeline";
import { runPipeline } from "../pipeline/runner";
import { rescoreAll, rescoreProject, trustSummary, type TrustSummary } from "../pipeline/score";
import { autoPairProject, refreshBaseline } from "../measure/measure";
import { summarisePairing, type PairingSummary } from "../measure/report";
import { getGeocoder } from "../providers/geocoder";
import { getMediaProvider } from "../providers/media";
import { HandlerRegistry } from "../providers/queue";
import { InlineQueue } from "../providers/queue/mock";
import { buildDemoDataset } from "../archive/build";
import { DEMO_DATASET } from "../../data/demo-dataset.config";
import type { Logger } from "./common";
import { importDemo, type DemoDeps, type ImportReport } from "./import";
import { plantDemo, type PlantedAsset } from "./plant";
import { wipeDemo, type WipeReport } from "./reset";

export const CANDIDATES_PATH = path.join(process.cwd(), "data", "archive-candidates.json");

export async function loadCandidates(): Promise<ArchiveCandidates> {
  try {
    return JSON.parse(await readFile(CANDIDATES_PATH, "utf8")) as ArchiveCandidates;
  } catch {
    throw new Error("data/archive-candidates.json is missing: run `pnpm archive:discover` first.");
  }
}

export interface DemoRunOptions {
  /** Only use the archive cache (no network). */
  offline?: boolean;
  /** Run the pipeline in-process regardless of QUEUE (scripts). */
  inline?: boolean;
  /** Reset only: also delete witness photos in demo projects (full wipe). */
  includeWitness?: boolean;
  log?: Logger;
}

async function setup(opts: DemoRunOptions): Promise<DemoDeps & { drain: () => Promise<void> }> {
  const { env } = getConfig();
  const db = await getDb();
  const thumbs = new CommonsClient({
    cacheDir: path.resolve(env.ARCHIVE_CACHE_DIR),
    contactEmail: env.APP_CONTACT_EMAIL,
    repoUrl: env.APP_REPO_URL ?? packageRepoUrl(JSON.parse(await readFile(path.join(process.cwd(), "package.json"), "utf8"))),
    offline: opts.offline,
    log: opts.log,
  });
  const media = getMediaProvider();
  const base: Omit<DemoDeps, "enqueue"> = {
    db,
    media,
    geocoder: getGeocoder(),
    thumbs,
    log: opts.log,
    // A demo site that moved or changed dates re-scores the photos already in it.
    onSiteChanged: async (projectId) => {
      const r = await rescoreProject(db, media, projectId, "demo site changed");
      if (r.changed) opts.log?.(`Re-scored ${r.rescored} photo(s) in a changed demo project (${r.changed} changed).`);
    },
  };
  if (!opts.inline) return { ...base, enqueue: enqueueAsset, drain: drainQueue };

  const deps = await getPipelineDeps();
  const registry = new HandlerRegistry();
  registry.on("asset.uploaded", async ({ assetId }) => {
    await runPipeline(deps, assetId);
  });
  const queue = new InlineQueue(registry, { concurrency: 4 });
  return { ...base, enqueue: (assetId) => queue.send("asset.uploaded", { assetId }), drain: () => queue.drain() };
}

export interface DemoSummary {
  wipe?: WipeReport;
  import?: ImportReport;
  planted?: PlantedAsset[];
  statuses: Record<string, number>;
  trust: TrustSummary;
  pairing: PairingSummary[];
  audit: { ok: boolean; chains: number; entries: number; broken: Array<{ assetId: string | null; firstBrokenAt: number }> };
}

async function summarise(deps: DemoDeps): Promise<Pick<DemoSummary, "statuses" | "audit" | "trust" | "pairing">> {
  // Photos scored concurrently can miss each other for a moment; one ordered pass settles them.
  const settled = await rescoreAll(deps.db, deps.media, "settle after demo run");
  if (settled.changed) deps.log?.(`Settled trust scores: ${settled.changed} of ${settled.rescored} changed.`);
  // Baselines: each demo spot's earliest eligible photo (archive photos arrive in any order). Then pairs.
  const demo = await deps.db.select({ id: projects.id, name: projects.name }).from(projects).where(eq(projects.source, "demo_archive"));
  const pairing: PairingSummary[] = [];
  for (const p of demo) {
    for (const s of await deps.db.select({ id: spots.id }).from(spots).where(eq(spots.projectId, p.id))) await refreshBaseline(deps.db, s.id, { force: true });
    const r = await autoPairProject({ db: deps.db, media: deps.media, measureMax: getConfig().env.MEASURE_MAX_PER_PROJECT }, p.id);
    pairing.push(summarisePairing(p.name, r.result));
  }
  const rows = await deps.db
    .select({ status: assets.status, n: count() })
    .from(assets)
    .where(inArray(assets.source, ["archive", "planted_test"]))
    .groupBy(assets.status);
  const audit = await verifyAllChains(deps.db);
  return { statuses: Object.fromEntries(rows.map((r) => [r.status, r.n])), trust: await trustSummary(deps.db), pairing, audit: { ok: audit.ok, chains: audit.chains, entries: audit.entries, broken: audit.broken } };
}

export async function runDemoImport(opts: DemoRunOptions = {}): Promise<DemoSummary> {
  return withDeps(opts, async (deps) => {
    const { files } = await loadCandidates();
    const report = await importDemo(deps, files);
    opts.log?.(`Waiting for the pipeline (${report.imported + report.requeued} asset(s))…`);
    await deps.drain();
    return { import: report, ...(await summarise(deps)) };
  });
}

export async function runDemoPlant(opts: DemoRunOptions = {}): Promise<DemoSummary> {
  return withDeps(opts, async (deps) => {
    const { files } = await loadCandidates();
    const plan = buildDemoDataset(files, DEMO_DATASET);
    const planted = await plantDemo(deps, plan, files, opts.log);
    await deps.drain();
    return { planted, ...(await summarise(deps)) };
  });
}

export async function runDemoReset(opts: DemoRunOptions = {}): Promise<DemoSummary> {
  return withDeps(opts, async (deps) => {
    const wipe = await wipeDemo(deps.db, deps.media, { includeWitness: opts.includeWitness });
    opts.log?.(
      `Deleted ${wipe.assets} demo asset(s) with their audit chains and ${wipe.reports} report(s)` +
        (wipe.includeWitness ? ` and ${wipe.projects} project(s) (full wipe).` : `; kept ${wipe.keptWitness} witness/upload photo(s) in demo projects.`),
    );
    const { files } = await loadCandidates();
    const report = await importDemo(deps, files);
    await deps.drain();
    const planted = await plantDemo(deps, report.plan, files, opts.log);
    await deps.drain();
    return { wipe, import: report, planted, ...(await summarise(deps)) };
  });
}

/** Runs `fn` and always waits for queued pipeline work, even on failure (callers close the DB next). */
async function withDeps<T>(opts: DemoRunOptions, fn: (deps: Awaited<ReturnType<typeof setup>>) => Promise<T>): Promise<T> {
  const deps = await setup(opts);
  try {
    return await fn(deps);
  } finally {
    await deps.drain();
  }
}

/** Human-readable project table for CLI output. */
export async function projectTable(): Promise<string[]> {
  const db = await getDb();
  const ps = await db.select().from(projects).where(eq(projects.source, "demo_archive"));
  const lines: string[] = [];
  for (const p of ps) {
    const [{ n }] = await db.select({ n: count() }).from(assets).where(eq(assets.projectId, p.id));
    lines.push(`${p.name.padEnd(36)} ${p.type.padEnd(10)} ${String(n).padStart(3)} photos  r=${p.radiusM} m  ${p.startDate} → ${p.endDate}  /capture?project=${p.slug}`);
  }
  return lines;
}
