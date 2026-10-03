/** The app's data from the database (lib/app/view.ts): bands, queue, projects, the overview and Studio. */
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assets, projects, spots } from "@/lib/db/schema";
import { autoPairProject } from "@/lib/measure/measure";
import { runPipeline } from "@/lib/pipeline/runner";
import { generateReport } from "@/lib/report/generate";
import { requestReview } from "@/lib/review";
import { createTestContext, litterScene, type TestContext } from "./helpers";

const SITE = { lat: 11.1048, lng: 77.3517 };
const DEV = { production: false, minConfidence: 0.5 };

describe("appView", () => {
  let ctx: TestContext;
  let projectId: string;
  const ids: string[] = [];

  beforeAll(async () => {
    ctx = await createTestContext();
    [{ id: projectId }] = await ctx.db.insert(projects).values({ name: "River clean-up, Tiruppur", slug: "tiruppur", type: "cleanup", centerLat: SITE.lat, centerLng: SITE.lng, radiusM: 300, startDate: "2017-09-01", endDate: "2017-09-30", minPairGapHours: 0.5, source: "demo_archive", locationApproximate: true }).returning();
    const [s] = await ctx.db.insert(spots).values({ projectId, name: "Bridge", slug: "bridge", lat: SITE.lat, lng: SITE.lng, radiusM: 30 }).returning();
    for (const [fraction, seed, date, filename] of [
      [0.4, 1, "2017-09-05T08:00:00", "river-bank-garbage-before.jpg"],
      [0.05, 2, "2017-09-05T20:00:00", "river-bank-after-cleanup.jpg"],
    ] as const) {
      const up = await ctx.media.upload({ file: await litterScene(fraction, seed), folder: "saakshi/test", context: { filename } });
      const commons = { date: { local: date, precision: "second" }, lat: SITE.lat, lng: SITE.lng, make: "NIKON", model: "D7000" };
      const [row] = await ctx.db
        .insert(assets)
        .values({ source: "archive", cldPublicId: up.publicId, etag: up.etag, phash: up.phash, qualityScore: 0.8, attribution: { author: `Author ${seed}`, license: "CC BY-SA 4.0", license_url: null, source_url: `https://commons.wikimedia.org/wiki/File:${seed}.jpg`, title: `River bank ${seed}.jpg` }, pipeline: { ingest: { commons, mediaMetadata: {}, hint: { projectId, spotId: s.id } }, steps: {} } })
        .returning();
      await runPipeline(ctx.deps, row.id);
      ids.push(row.id);
    }
    await autoPairProject(ctx.deps, projectId);
    await ctx.db.insert(assets).values({ source: "planted_test", testCase: "stock", projectId, cldPublicId: "saakshi/test/stock", status: "flagged", trustBand: "FLAGGED", trustScore: 35, trustReasons: [{ code: "STOCK_SUSPECTED", signal: "authenticity", kind: "hard", points: 0, detail: { watermark: true, branding: false } }] });
  }, 120_000);
  afterAll(async () => {
    await ctx?.close();
  });

  it("lists scored photos with their real ledger, fingerprint, history and the queue flag", async () => {
    const { appView } = await import("@/lib/app/view");
    const d = await appView(ctx.db, ctx.media, { policy: DEV });
    expect(d.photos).toHaveLength(3);
    const planted = d.photos.find((p) => p.planted)!;
    expect(planted).toMatchObject({ band: "Flagged", score: 35, reason: "Stock-site watermark", queue: true, project: "tiruppur", source: "planted_test" });
    expect(planted.hard).toEqual(["Stock-site watermark"]);
    const before = d.photos.find((p) => p.id === ids[0])!;
    expect(before.band).toBe("Verified");
    expect(before.queue).toBe(false);
    expect(before.hash).toMatch(/^[01]{64}$/);
    expect(before.rows.map((r) => r.label).length).toBeGreaterThan(2);
    expect(before.history.length).toBeGreaterThan(3);
    expect(before.src).toContain("s--");
    expect(before.nearest?.cells).toBeGreaterThanOrEqual(0);
    expect(before.layer?.mask).toBeTruthy();
    expect(before.credit).toMatchObject({ author: "Author 1", license: "CC BY-SA 4.0" });

    // "Send to review" puts a verified photo in the queue.
    await requestReview(ctx.db, [ids[0]]);
    expect((await appView(ctx.db, ctx.media, { policy: DEV })).photos.find((p) => p.id === ids[0])!.queue).toBe(true);
  });

  it("places projects, and builds the overview from SQL counts and the best measured pair", async () => {
    const { appView } = await import("@/lib/app/view");
    const d = await appView(ctx.db, ctx.media, { policy: DEV });
    expect(d.projects).toEqual([expect.objectContaining({ key: "tiruppur", name: "River clean-up", city: "Tiruppur", card: "left", href: "/projects/tiruppur" })]);
    expect(d.projectIds).toEqual({ tiruppur: projectId });
    const o = d.projectScreens.tiruppur;
    const k = Object.fromEntries(o.kpis.map((x) => [x.k, x]));
    expect(k.verified.value).toBe("2");
    expect(k.flagged.value).toBe("1");
    expect(k.spots).toMatchObject({ value: "1", label: "spot monitored" });
    expect(k.before.value).toMatch(/^\d+(\.\d)?%$/);
    expect(k.before.tag).toBe("Mock output");
    expect(o.before?.src).toContain("s--");
    expect(o.after?.label).toMatch(/^After /);
    expect(o.tiles.find((t) => t.id === ids[0])?.keys).toEqual(expect.arrayContaining(["verified", "spots", "before"]));
    expect(o.flags).toEqual([expect.objectContaining({ reason: "Stock-site watermark" })]);
    expect(o.spots[0]).toMatchObject({ name: "Bridge", photos: 2 });
    expect(o.samplesNote).toBeNull();
  });

  it("Studio shows the latest report's claims and threads, and production hides mock numbers", async () => {
    const { appView } = await import("@/lib/app/view");
    expect((await appView(ctx.db, ctx.media, { policy: DEV })).studio?.report).toBeNull();
    await generateReport({ db: ctx.db, media: ctx.media, ai: ctx.deps.ai, appUrl: "https://saakshi.example" }, projectId, { now: new Date("2026-09-28T06:00:00Z") });
    const s = (await appView(ctx.db, ctx.media, { policy: DEV })).studio!;
    expect(s.report?.numbers.map((n) => n.key)).toEqual(expect.arrayContaining(["v", "f"]));
    expect(s.report?.tiles.some((t) => t.k === "v")).toBe(true);
    expect(s.report?.href).toMatch(/^\/r\//);
    expect(s.exports.stat).toMatch(/^\/api\/campaign\//);
    const prod = await appView(ctx.db, ctx.media, { policy: { production: true, minConfidence: 0.5 } });
    expect(prod.photos.every((p) => p.score === null && p.scoreHidden)).toBe(true);
    expect(prod.studio?.posts.stat).toBeNull();
    expect(prod.projectScreens.tiruppur.kpis.find((x) => x.k === "before")?.value).toBe("no data");
    const [row] = await ctx.db.select().from(assets).where(eq(assets.id, ids[0]));
    expect(row.trustScore).not.toBeNull();
  });

  it("the preview (DEMO_PREVIEW=1) shows computed values as prototype measurements and no mock AI readings", async () => {
    const { appView } = await import("@/lib/app/view");
    const d = await appView(ctx.db, ctx.media, { policy: { production: true, minConfidence: 0.5, preview: true } });
    const before = d.photos.find((p) => p.id === ids[0])!;
    expect(before.score).toEqual(expect.any(Number));
    expect(before.layer?.input.aiTags).toEqual(["AI reading pending"]);
    // Titles come from Commons, never from a mock caption.
    expect(before.title).toBe("River bank 1");
    expect(d.projectScreens.tiruppur.kpis.find((x) => x.k === "before")?.tag).toBe("Prototype measurement");
  });

  it("builds only what a route shows: the library and review skip the project screens and Studio", async () => {
    const { appView } = await import("@/lib/app/view");
    const all = await appView(ctx.db, ctx.media, { policy: DEV });
    const lib = await appView(ctx.db, ctx.media, { policy: DEV, include: { projects: false, studio: false } });
    expect(lib.photos).toEqual(all.photos);
    expect(lib.projects).toEqual(all.projects);
    expect(lib.projectIds).toEqual(all.projectIds);
    expect(lib.projectScreens).toEqual({});
    expect(lib.studio).toBeNull();
    const proj = await appView(ctx.db, ctx.media, { policy: DEV, include: { projects: true, studio: false } });
    expect(proj.projectScreens).toEqual(all.projectScreens);
    expect(proj.studio).toBeNull();
    // Studio builds its own project's screen: the same Studio as the full view.
    const studio = await appView(ctx.db, ctx.media, { policy: DEV, include: { projects: false, studio: true } });
    expect(studio.studio).toEqual(all.studio);
    expect(studio.projectScreens).toEqual({});
  });

  it("preloads exactly the first tiles the library draws (same order, same signed URL)", async () => {
    const { appView, firstTileSrcs } = await import("@/lib/app/view");
    const d = await appView(ctx.db, ctx.media, { policy: DEV, include: { projects: false, studio: false } });
    expect(await firstTileSrcs(ctx.db, ctx.media, 2)).toEqual(d.photos.slice(0, 2).map((p) => p.src));
  });
});
