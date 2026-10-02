import { readFileSync } from "node:fs";
import path from "node:path";
import { eq, inArray, isNull } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEMO_DATASET } from "../data/demo-dataset.config";
import { buildDemoDataset } from "@/lib/archive/build";
import type { Candidate } from "@/lib/archive/candidates";
import { verifyAllChains, verifyChain, verifySystem } from "@/lib/audit";
import { assets, auditLog, projects, spots } from "@/lib/db/schema";
import { demoProjectId } from "@/lib/demo/common";
import { importDemo, type DemoDeps } from "@/lib/demo/import";
import { pickPlantInputs, plantDemo } from "@/lib/demo/plant";
import { wipeDemo } from "@/lib/demo/reset";
import { decideReview, DEMO_VISITOR } from "@/lib/review";
import { createStageProject, STAGE_SPOT_SLUG } from "@/lib/demo/stage";
import { runPipeline } from "@/lib/pipeline/runner";
import { HandlerRegistry } from "@/lib/providers/queue";
import { InlineQueue } from "@/lib/providers/queue/mock";
import { createTestContext, synthScene, type TestContext } from "./helpers";

const IMAGES = ["scene-a.png", "scene-b.png", "litter-grass.png", "geotagged.jpg"].map((f) => readFileSync(path.join(__dirname, "fixtures", f)));

let nextId = 5000;
function cand(lat: number, lng: number, groups: string[], text: { title: string; description: string }, date: string): Candidate {
  const pageId = nextId++;
  return {
    pageId, externalId: `commons:${pageId}`, title: `File:${text.title} ${pageId}.jpg`, description: text.description,
    descriptionUrl: `https://commons.wikimedia.org/wiki/File:X_${pageId}.jpg`, thumbUrl: `https://thumb.example/${pageId}.jpg`,
    thumbWidth: 1920, thumbHeight: 1440, width: 4000, height: 3000, mime: "image/jpeg", sha1: "0".repeat(40),
    author: `Photographer ${pageId % 3}`, license: "CC BY-SA 4.0", licenseClass: "cc-by-sa",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0", attributionRequired: true,
    date: { local: date, precision: "second", source: "exif" }, lat, lng, gpsSource: "desc_page", make: "NIKON", model: "D7000", groups,
  };
}
/** n photos around a point in `spotsN` tight groups; `dates` cycle so some pairs meet the gap. */
const around = (n: number, lat: number, lng: number, spotsN: number, groups: string[], text: { title: string; description: string }, dates: string[]) =>
  Array.from({ length: n }, (_, i) => cand(lat + (i % spotsN) * 0.0011 + (i % 3) * 0.00002, lng + (i % 2) * 0.00002, groups, text, dates[i % dates.length]));

const river = { title: "Noyyal River bank", description: "River bank full of plastic garbage" };
const lake = { title: "Rubbish in the lake", description: "Rubbish dumped into the lake" };
const saplings = { title: "Planting saplings", description: "Saplings planted at the forest" };
const candidates: Candidate[] = [
  ...around(10, 11.1048, 77.3517, 1, ["litter"], river, ["2017-09-05T18:15:57", "2017-09-05T20:00:00"]), // A: an evening, before + after
  ...around(10, 26.2986, 89.4534, 1, ["tree-planting"], saplings, ["2025-06-01T10:00:00", "2025-07-01T10:00:00"]), // B: a month apart
  ...around(10, 17.4642, 78.3736, 2, ["lake-cleanup"], lake, ["2025-11-02T11:36:52"]), // C, ~700 km from A
  cand(28.61, 77.21, ["litter"], { title: "Garbage dump", description: "Plastic garbage dump" }, "2023-01-01T10:00:00"), // far, unused
  cand(11.0168, 76.9558, ["litter"], { title: "Plastic waste", description: "Plastic waste on a road" }, "2022-05-01T10:00:00"), // near A, unused
];

describe("demo import → plant → reset (mock providers, in-memory DB)", () => {
  let ctx: TestContext;
  let deps: DemoDeps;
  let queue: InlineQueue;

  beforeAll(async () => {
    ctx = await createTestContext();
    const registry = new HandlerRegistry();
    registry.on("asset.uploaded", async ({ assetId }) => {
      await runPipeline(ctx.deps, assetId);
    });
    queue = new InlineQueue(registry, {
      concurrency: 4,
      onError: (_e, err) => {
        throw err;
      },
    });
    deps = {
      db: ctx.db,
      media: ctx.media,
      geocoder: ctx.deps.geocoder,
      // A distinct scene per Commons file, so near-duplicates are only the ones we plant.
      thumbs: { downloadThumb: async (f) => synthScene(f.pageId, 320, 240) },
      enqueue: (assetId) => queue.send("asset.uploaded", { assetId }),
    };
  }, 60_000);
  afterAll(async () => {
    await ctx?.close();
  });

  const cfg = { ...DEMO_DATASET, projects: DEMO_DATASET.projects.map((p) => ({ ...p, target: 8 })) };
  const ids = { A: demoProjectId("demo-hero-cleanup"), B: demoProjectId("demo-tree-planting"), C: demoProjectId("demo-second-cleanup") };

  async function addWitness(projectId: string, spotId: string | null) {
    const up = await ctx.media.upload({ file: IMAGES[3], folder: "saakshi/evidence" });
    const [w] = await ctx.db
      .insert(assets)
      .values({ source: "witness", cldPublicId: up.publicId, pipeline: { ingest: { mediaMetadata: up.mediaMetadata, hint: { projectId, spotId } }, steps: {} } })
      .returning();
    await runPipeline(ctx.deps, w.id);
    return w.id;
  }

  it("imports three auto-built projects with stable ids; every asset is scored with project, spot, place, caption and tags", async () => {
    const report = await importDemo(deps, candidates, cfg);
    await queue.drain();
    expect(report.projects.map((p) => [p.key, p.id, p.slug, p.type])).toEqual([
      ["A", ids.A, "demo-hero-cleanup", "cleanup"],
      ["B", ids.B, "demo-tree-planting", "plantation"],
      ["C", ids.C, "demo-second-cleanup", "water"],
    ]);
    expect(report.plan.projects.map((p) => p.pairability.selected.pairs > 0)).toEqual([true, true, false]);

    const ps = await ctx.db.select().from(projects).where(eq(projects.source, "demo_archive"));
    expect(Object.fromEntries(ps.map((p) => [p.slug, p.minPairGapHours]))).toEqual({ "demo-hero-cleanup": 0.5, "demo-tree-planting": 336, "demo-second-cleanup": 0.5 });
    for (const p of ps) expect(p.embedding).toHaveLength(1536);
    const ss = await ctx.db.select().from(spots);
    expect(ss.every((s) => s.createdFrom === "auto_cluster" && s.slug?.startsWith("demo-"))).toBe(true);

    const rows = await ctx.db.select().from(assets).where(eq(assets.source, "archive"));
    expect(rows).toHaveLength(report.imported);
    for (const a of rows) {
      // Archive photos inside their site and dates, no copies: never a hard flag.
      const hard = a.trustReasons?.filter((r) => r.kind === "hard").map((r) => r.code);
      expect(hard, a.externalId!).toEqual([]);
      expect(a.status, a.externalId!).toBe(a.trustBand === "VERIFIED" ? "ready" : "flagged");
      expect(a.trustReasons?.reduce((s, r) => s + r.points, 0)).toBe(a.trustScore);
      expect(a).toMatchObject({ exifSource: "commons_api", capturedAtTzAssumed: true, assignmentMethod: "geo_time" });
      expect(a.projectId).toBeTruthy();
      expect(a.spotId).toBeTruthy();
      expect(a.placeName).toBeTruthy();
      expect(a.caption).toBeTruthy();
      expect(a.cldTags.length).toBeGreaterThan(0);
      expect(a.attribution).toMatchObject({ license: "CC BY-SA 4.0", source_url: expect.stringContaining("commons.wikimedia.org") });
    }
    expect((await verifyAllChains(ctx.db)).ok).toBe(true);
  });

  it("is idempotent on external_id", async () => {
    const again = await importDemo(deps, candidates, cfg);
    await queue.drain();
    expect(again.imported).toBe(0);
    expect(again.skipped).toBeGreaterThan(0);
  });

  it("plants the four labelled test inputs into the right projects", async () => {
    const plan = buildDemoDataset(candidates, cfg);
    const picks = pickPlantInputs(plan, candidates);
    expect(picks.reused.pageId).toBe(plan.projects[0].files[0].pageId);

    const planted = await plantDemo(deps, plan, candidates);
    await queue.drain();
    expect(planted.map((p) => p.testCase)).toEqual(["reused", "stock", "location_mismatch", "stamp_mismatch"]);

    const rows = await ctx.db.select().from(assets).where(eq(assets.source, "planted_test"));
    const by = Object.fromEntries(rows.map((r) => [r.testCase!, r]));
    expect(by.reused).toMatchObject({ projectId: ids.C, assignmentMethod: "capture_hint", exifSource: "none" });
    expect(by.stock).toMatchObject({ projectId: ids.A, watermark: true });
    expect(by.location_mismatch).toMatchObject({ projectId: ids.A, exifSource: "commons_api" });
    expect(by.stamp_mismatch.ai?.textInImage).toMatch(/GPS Map Camera[\s\S]*Lat/);
    for (const r of rows) expect(r.attribution?.source_url).toContain("commons.wikimedia.org");

    // Trust Engine: each planted input is FLAGGED for its own reason, capped at 40.
    const expected = { reused: "REUSED", stock: "STOCK_SUSPECTED", location_mismatch: "LOCATION_MISMATCH", stamp_mismatch: "STAMP_MISMATCH" } as const;
    for (const [testCase, code] of Object.entries(expected)) {
      const r = by[testCase];
      expect(r, testCase).toMatchObject({ trustBand: "FLAGGED", status: "flagged" });
      expect(r.trustScore!, testCase).toBeLessThanOrEqual(40);
      expect(r.trustReasons?.filter((x) => x.kind === "hard").map((x) => x.code), testCase).toEqual([code]);
    }
    // REUSED lands on the later copy only; the original in A just learns it was copied.
    const original = rows.length && (await ctx.db.select().from(assets).where(eq(assets.externalId, picks.reused.externalId)))[0];
    expect(original && original.trustReasons?.map((x) => x.code)).toContain("COPY_LATER_SUBMITTED");
    expect(original && original.trustBand).not.toBe("FLAGGED");
    const sidecar = await ctx.media.store.readSidecar(by.stock.cldPublicId);
    expect(sidecar?.metadata).toMatchObject({ trust_band: "FLAGGED" });
    expect(sidecar?.tags).toContain("trust_flagged");

    const again = await plantDemo(deps, plan, candidates);
    expect(again.every((p) => !p.created)).toBe(true);
    expect((await verifyAllChains(ctx.db)).ok).toBe(true);
  });

  it("binds every landing chapter to the demo data, never the design's samples (B5.3, B5.4)", async () => {
    const { landingView } = await import("@/lib/landing/view");
    const dev = await landingView(ctx.db, ctx.media, { appUrl: "http://localhost:3000", policy: { production: false, minConfidence: 0.5 } });
    // The hero: a verified, located, fingerprinted photo of the hero project, with its real ledger.
    expect(dev.hero).not.toBeNull();
    const [heroRow] = await ctx.db.select().from(assets).where(eq(assets.id, dev.hero!.assetId!));
    expect(heroRow).toMatchObject({ projectId: ids.A, trustBand: "VERIFIED" });
    expect(dev.hero!.hex).toBe(heroRow.phash);
    expect(dev.hero!.trust?.score).toBe(heroRow.trustScore);
    expect(dev.hero!.trust?.chips.length).toBeGreaterThan(2);
    expect(dev.projects.find((p) => p.isHero)).toMatchObject({ stackDir: -1, labelBelow: true });
    expect(dev.stormCount).toBe(dev.storm.length + 1);
    // Chapter 3: the four planted fakes, each titled by the rule that caught it.
    expect(dev.flags.map((f) => f.reason)).toEqual([expect.stringMatching(/^Same photo already used in /), "Stock-site watermark", expect.stringMatching(/^Taken [\d,.]+ km from the site$/), expect.stringMatching(/^The stamp /)]);
    expect(dev.flags[0].diff?.text).toMatch(/^\d+ of 64 cells differ\. Same photo\.$/);
    expect(dev.grid.filter((t) => t.hole !== "")).toHaveLength(4);
    // Chapter 6: the real signed link, as chips.
    expect(dev.tamper?.chips.map((c) => c.k)).toEqual(["sig", "crop", "blur", "fmt", "asset"]);
    // Credits for every demo photo on the page (C17), and no sample name anywhere.
    const credited = new Set(dev.credits.map((c) => c.page));
    for (const a of await ctx.db.select().from(assets).where(inArray(assets.id, dev.storm.map((s) => s.id)))) if (a.attribution) expect(credited.has(a.attribution.source_url), a.id).toBe(true);
    expect(dev.credits.every((c) => !/\.(jpe?g|png)$/i.test(c.title))).toBe(true);
    const text = JSON.stringify(dev);
    for (const sample of ["Versova", "Mumbai", "Pashan", "Shishirdasika", "saakshi.app/witness", "/dev/parity"]) expect(text, sample).not.toContain(sample);
    expect(dev.mock).toBe(true);

    // Production: every mock-derived number is withheld (the trust score and cover rest on mock providers).
    const prod = await landingView(ctx.db, ctx.media, { appUrl: "http://localhost:3000", policy: { production: true, minConfidence: 0.5 } });
    expect(prod.hero?.trust).toBeNull();
    expect(prod.hero?.cover?.value ?? null).toBeNull();
    expect(prod.report?.verified.value).toBe(0);
    expect(prod.mock).toBe(false);
    // The preview video's display shows them, badged.
    const preview = await landingView(ctx.db, ctx.media, { appUrl: "http://localhost:3000", policy: { production: true, minConfidence: 0.5 }, preview: true });
    expect(preview.mockTag).toBe("Prototype measurement");
    expect(preview.hero?.trust?.score).toBe(heroRow.trustScore);
  });

  it("prefers a spare photo from another demo project for the location mismatch", () => {
    const cfg2 = { ...DEMO_DATASET, projects: DEMO_DATASET.projects.map((p) => ({ ...p, target: p.key === "C" ? 4 : 8 })) };
    const picks = pickPlantInputs(buildDemoDataset(candidates, cfg2), candidates);
    expect(picks.locationMismatch.title).toMatch(/Rubbish in the lake/); // C's reserve, ~700 km from A
  });

  it("reset keeps witness photos and their links, and leaves every other chain intact", async () => {
    const [spotA] = await ctx.db.select().from(spots).where(eq(spots.projectId, ids.A));
    const witness = await addWitness(ids.A, spotA.id);
    // Demo reviews: one on an archive photo, one on the witness photo.
    const [archivePhoto] = await ctx.db.select().from(assets).where(eq(assets.source, "archive")).limit(1);
    await decideReview(ctx.db, ctx.media, { assetId: archivePhoto.id, decision: "reject", note: "demo visitor test", actor: DEMO_VISITOR });
    await decideReview(ctx.db, ctx.media, { assetId: witness, decision: "approve", note: "demo visitor test", actor: DEMO_VISITOR });
    const witnessChain = await verifyChain(ctx.db, witness);
    expect(witnessChain.intact).toBe(true);

    const wipe = await wipeDemo(ctx.db, ctx.media);
    expect(wipe).toMatchObject({ includeWitness: false, projects: 0, keptWitness: 1 });
    expect(wipe.assets).toBeGreaterThan(0);
    expect(await ctx.db.select().from(assets).where(inArray(assets.source, ["archive", "planted_test"]))).toHaveLength(0);
    // Deleted assets took their chains with them; nothing else was rewritten.
    expect(await ctx.db.select().from(auditLog).where(inArray(auditLog.action, ["archive.imported", "demo.planted"]))).toHaveLength(0);
    expect(await verifyChain(ctx.db, witness)).toEqual(witnessChain);
    expect((await verifySystem(ctx.db)).intact).toBe(true);
    const sysActions = (await ctx.db.select({ action: auditLog.action }).from(auditLog).where(isNull(auditLog.assetId))).map((r) => r.action);
    expect(sysActions).toContain("demo_reset");
    expect((await verifyAllChains(ctx.db)).ok).toBe(true);

    // Re-import recreates the same ids, so the witness photo is still in project A at its spot.
    const again = await importDemo(deps, candidates, cfg);
    await queue.drain();
    expect(again.imported).toBeGreaterThan(0);
    const [w] = await ctx.db.select().from(assets).where(eq(assets.id, witness));
    expect(w).toMatchObject({ projectId: ids.A, spotId: spotA.id, status: "approved", review: { actor: DEMO_VISITOR } });
    // The archive photo's demo decision is gone: it was re-imported fresh.
    const [again1] = await ctx.db.select().from(assets).where(eq(assets.externalId, archivePhoto.externalId!));
    expect(again1.review).toBeNull();
    expect(again1.status).not.toBe("rejected");
    expect((await verifyAllChains(ctx.db)).ok).toBe(true);
  });

  it("includeWitness does a full wipe: witness photos, projects and spots too", async () => {
    const witness = await addWitness(ids.A, null);
    const wipe = await wipeDemo(ctx.db, ctx.media, { includeWitness: true });
    expect(wipe).toMatchObject({ includeWitness: true, projects: 3, keptWitness: 0 });
    expect(await ctx.db.select().from(assets).where(eq(assets.id, witness))).toHaveLength(0);
    expect(await ctx.db.select().from(projects).where(eq(projects.source, "demo_archive"))).toHaveLength(0);
    expect((await verifyAllChains(ctx.db)).ok).toBe(true);
  });

  it("demo:stage creates a live-stage project with a 0 h pair gap and one 150 m spot", async () => {
    const r = await createStageProject(ctx.db, { lat: 12.9716, lng: 77.5946, now: new Date("2026-09-28T00:00:00Z") });
    const [p] = await ctx.db.select().from(projects).where(eq(projects.id, r.projectId));
    expect(p).toMatchObject({ name: "Live stage demo", type: "cleanup", minPairGapHours: 0, source: "user", radiusM: 150, startDate: "2026-09-27" });
    expect(p.description).toMatch(/Live demonstration/);
    const [s] = await ctx.db.select().from(spots).where(eq(spots.id, r.spotId));
    expect(s).toMatchObject({ slug: STAGE_SPOT_SLUG, radiusM: 150, createdFrom: "manual" });
    expect(r.captureUrl).toBe(`/capture?spot=${STAGE_SPOT_SLUG}`);
    expect((await createStageProject(ctx.db, { lat: 12.9716, lng: 77.5946 })).projectId).toBe(r.projectId); // idempotent
    await expect(createStageProject(ctx.db, { lat: 123, lng: 0 })).rejects.toThrow(/valid/);
  });
});
