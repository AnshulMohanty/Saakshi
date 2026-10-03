import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { verifyAllChains } from "@/lib/audit";
import { assets, comparisons, measurements, projects, spots, type CaptureInfo } from "@/lib/db/schema";
import { autoPairProject, CAVEAT, FRAME_KEY, manualPair, PairError, remeasure } from "@/lib/measure/measure";
import { runPipeline } from "@/lib/pipeline/runner";
import type { MediaProvider } from "@/lib/providers/media";
import { createTestContext, litterScene, type TestContext } from "./helpers";

const SITE = { lat: 11.1048, lng: 77.3517 };

describe("measurement against the database (mock masks)", () => {
  let ctx: TestContext;
  let projectId: string;
  let spotId: string;
  let maskCalls = 0;

  beforeAll(async () => {
    ctx = await createTestContext();
    // Count mask extractions to prove the cache.
    const media = ctx.deps.media as MediaProvider;
    const extract = media.extractMask.bind(media);
    media.extractMask = (...args) => {
      maskCalls++;
      return extract(...args);
    };
    [{ id: projectId }] = await ctx.db
      .insert(projects)
      .values({ name: "Noyyal cleanup", type: "cleanup", centerLat: SITE.lat, centerLng: SITE.lng, radiusM: 300, startDate: "2017-09-01", endDate: "2017-09-30", minPairGapHours: 0.5, locationApproximate: true })
      .returning();
    [{ id: spotId }] = await ctx.db.insert(spots).values({ projectId, name: "Bridge", slug: "noyyal-bridge", lat: SITE.lat, lng: SITE.lng, radiusM: 60 }).returning();
  }, 60_000);
  afterAll(async () => {
    await ctx?.close();
  });

  async function archive(bytes: Buffer, date: string, filename: string, dLat = 0) {
    const up = await ctx.media.upload({ file: bytes, folder: "saakshi/test", context: { filename } });
    const commons = { date: { local: date, precision: "second" }, lat: SITE.lat + dLat, lng: SITE.lng, make: "NIKON", model: "D7000" };
    const [row] = await ctx.db
      .insert(assets)
      .values({ source: "archive", cldPublicId: up.publicId, etag: up.etag, phash: up.phash, width: up.width, height: up.height, qualityScore: 0.8, pipeline: { ingest: { commons, mediaMetadata: {}, hint: { projectId, spotId } }, steps: {} } })
      .returning();
    await runPipeline(ctx.deps, row.id);
    return (await ctx.db.select().from(assets).where(eq(assets.id, row.id)))[0];
  }

  let before: Awaited<ReturnType<typeof archive>>;
  let during: Awaited<ReturnType<typeof archive>>;
  let after: Awaited<ReturnType<typeof archive>>;

  it("measures each spot photo once, on the shared frame, and sets the spot baseline to the best after photo", async () => {
    after = await archive(await litterScene(0.05, 3), "2017-09-05T20:00:00", "river-bank-after-cleanup.jpg");
    before = await archive(await litterScene(0.4, 1), "2017-09-05T08:00:00", "river-bank-garbage-before.jpg");
    during = await archive(await litterScene(0.2, 2), "2017-09-05T12:00:00", "river-bank-cleanup-drive.jpg");
    for (const a of [before, during, after]) {
      expect(a.trustBand, a.caption ?? "").toBe("VERIFIED");
      expect(a.pipeline.steps.measure?.status).toBe("done");
    }
    const rows = await ctx.db.select().from(measurements).where(eq(measurements.metric, "litter_cover"));
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.frame === FRAME_KEY && r.method === "measured" && r.maskUrl?.includes("e_extract:prompt_(litter;garbage;plastic-waste;floating-waste);multiple_true;mode_mask"))).toBe(true);
    const v = Object.fromEntries(rows.map((r) => [r.assetId, r.value]));
    expect(v[before.id]).toBeGreaterThan(v[during.id]);
    expect(v[during.id]).toBeGreaterThan(v[after.id]);
    const [spot] = await ctx.db.select().from(spots).where(eq(spots.id, spotId));
    expect(spot.baselineAssetId).toBe(after.id); // the best "after" photo (the AI read it as after)
    expect(maskCalls).toBe(3);
  });

  it("pairs by the rules and stores comparisons with composite, masks and the caveat", async () => {
    const r = await autoPairProject(ctx.deps, projectId);
    expect(r.result.pairs).toHaveLength(1);
    expect(r.result.candidates).toHaveLength(3);
    const [c] = await ctx.db.select().from(comparisons).where(and(eq(comparisons.projectId, projectId), eq(comparisons.metric, "litter_cover")));
    expect(c).toMatchObject({ origin: "auto", method: "measured", spotId });
    expect(c.delta).toBeLessThan(0);
    expect(c.delta).toBeCloseTo(c.afterValue! - c.beforeValue!, 1);
    expect(c.detail).toMatchObject({ caveat: CAVEAT, unit: "%" });
    expect(c.compositeUrl).toContain("l_authenticated:");
    expect(c.compositeTransforms?.at(-1)).toEqual({ format: "auto", quality: "auto" });
    expect(c.maskBeforeUrl && c.maskAfterUrl).toBeTruthy();
    expect(maskCalls).toBe(3); // cached forever: pairing reused the stored masks
  });

  it("is idempotent", async () => {
    const all = async () => (await ctx.db.select().from(comparisons)).map((c) => [c.id, c.beforeValue, c.afterValue]).sort();
    const first = await all();
    await autoPairProject(ctx.deps, projectId);
    expect(await all()).toEqual(first);
    expect(maskCalls).toBe(3);
  });

  it("a manual pair must still follow the rules", async () => {
    const far = await archive(await litterScene(0.1, 4), "2017-09-06T09:00:00", "river-bank-next-day.jpg", 0.004); // ~450 m north
    const err = await manualPair(ctx.deps, projectId, [before.id, far.id]).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PairError);
    expect((err as PairError).reasons).toEqual(expect.arrayContaining(["outside_spot"]));
    const rows = await manualPair(ctx.deps, projectId, [after.id, during.id], { chosenBy: "asha", note: "same angle" }); // any order
    expect(rows[0]).toMatchObject({ origin: "manual", beforeAssetId: during.id, afterAssetId: after.id, detail: { chosenBy: "asha", note: "same angle" } });
  });

  it("re-measure recomputes from fresh masks", async () => {
    const calls = maskCalls;
    const [c] = await ctx.db.select().from(comparisons).where(eq(comparisons.origin, "auto"));
    const out = await remeasure(ctx.deps, [c.id]);
    expect(out.find((x) => x.metric === "litter_cover")).toMatchObject({ beforeValue: c.beforeValue, afterValue: c.afterValue });
    expect(maskCalls).toBe(calls + 2);
  });

  it("a Witness check-in is compared with the spot's baseline", async () => {
    await ctx.db.update(spots).set({ baselineAssetId: before.id }).where(eq(spots.id, spotId));
    const up = await ctx.media.upload({ file: await litterScene(0.02, 5), folder: "saakshi/evidence", context: { filename: "checkin.jpg" } });
    const capture: CaptureInfo = {
      tokenId: null,
      clientCapturedAt: "2017-09-20T09:00:00+05:30",
      ticketIssuedAt: "2017-09-20T03:30:01Z",
      serverReceivedAt: "2017-09-20T03:30:05Z",
      deviceFix: { lat: SITE.lat + 0.0001, lng: SITE.lng, accuracyM: 6 },
      uploaderLocation: null,
      attested: true,
      reasons: [],
    };
    const [w] = await ctx.db
      .insert(assets)
      .values({ source: "witness", cldPublicId: up.publicId, etag: up.etag, phash: up.phash, capture, pipeline: { ingest: { mediaMetadata: up.mediaMetadata, hint: { projectId, spotId } }, steps: {} } })
      .returning();
    await runPipeline(ctx.deps, w.id);
    const [done] = await ctx.db.select().from(assets).where(eq(assets.id, w.id));
    expect(done.trustBand).toBe("VERIFIED");
    const rows = await ctx.db.select().from(comparisons).where(and(eq(comparisons.afterAssetId, w.id), eq(comparisons.origin, "checkin")));
    expect(rows.map((r) => [r.beforeAssetId, r.metric])).toContainEqual([before.id, "litter_cover"]);
    expect((await verifyAllChains(ctx.db)).ok).toBe(true);
  });

  it("read models: project cards per pair, spot trend per day (median), poster check-in path", async () => {
    const { projectView, spotView } = await import("@/lib/measure/views");
    const pv = (await projectView(ctx.db, ctx.media, projectId))!;
    expect(pv.kind).toBe("litter");
    const auto = pv.cards.find((c) => c.origin === "auto")!;
    expect(auto.metrics[0]).toMatchObject({ metric: "litter_cover", unit: "%", method: "measured" });
    expect(auto.before.maskUrl && auto.before.viewUrl).toBeTruthy();
    expect(auto.caveat).toBe(CAVEAT);
    const sv = (await spotView(ctx.db, ctx.media, "noyyal-bridge"))!;
    expect(sv.metric).toMatchObject({ id: "litter_cover", unit: "%" });
    // Every measured photo is a point, in capture order. The 2017-09-06 photo is ~450 m off-site:
    // FLAGGED (LOCATION_MISMATCH), so it is not on the trend.
    expect(sv.trend.map((t) => [t.label, t.source])).toEqual([
      ["5 Sep 2017", "archive"],
      ["5 Sep 2017", "archive"],
      ["5 Sep 2017", "archive"],
      ["20 Sep 2017", "witness"],
    ]);
    expect(sv.trend[0].value).toBeGreaterThan(sv.trend[2].value); // litter went down through the day
    expect(sv.checkinPath).toBe("/capture?spot=noyyal-bridge");
    expect(await spotView(ctx.db, ctx.media, "nope")).toBeNull();
  });

  it("spot page model: labels from stored facts, SQL counters, same-frame views with masks, framing (B5.13), mock numbers hidden in production", async () => {
    const { spotPageData, FRAMING_FALLBACK } = await import("@/lib/spot-page");
    const now = Date.parse("2017-09-22T09:00:00+05:30");
    const dev = (await spotPageData(ctx.db, ctx.media, "noyyal-bridge", { policy: { production: false, minConfidence: 0.5 }, now }))!;
    // The baseline is the morning photo here (set by the check-in test), so the rest of the day comes "Later".
    expect(dev.points.map((p) => p.label)).toEqual(["Baseline", "Later 1", "Later 2", "Check-in 1"]);
    expect(dev.points[0].date).toBe("5 Sep 2017, the baseline");
    expect(dev.points[3].when).toBe("20 Sep 2017, 09:00 IST, witness check-in");
    expect(dev.counters).toEqual({ checkins: "1", daysSince: "2", change: `${dev.points[0].v}% to ${dev.points[3].v}%` });
    expect(dev.points.every((p) => p.photo?.src.includes("s--") && p.mask)).toBe(true);
    expect(dev.mock).toBe(true);
    expect(dev.latestTitle).toBe("Latest check-ins");
    expect(dev.latest).toHaveLength(1);
    expect(dev.latest[0]).toMatchObject({ who: "Witness check-in", band: "VERIFIED", v: dev.points[3].v, href: `/e/${dev.points[3].key}` });
    expect(dev.framing).toMatchObject({ note: FRAMING_FALLBACK });
    expect(dev.framing?.thumb).toContain("s--");
    expect(dev.checkinHref).toBe("/capture?spot=noyyal-bridge");
    expect(dev.posterHref).toBe("/spots/noyyal-bridge/poster");

    await ctx.db.update(spots).set({ framingNote: "From the bridge rail, facing downstream" }).where(eq(spots.id, spotId));
    const prod = (await spotPageData(ctx.db, ctx.media, "noyyal-bridge", { policy: { production: true, minConfidence: 0.5 }, now }))!;
    expect(prod.framing).toEqual({ note: "From the bridge rail, facing downstream", thumb: null });
    expect(prod.points).toEqual([]);
    expect(prod.hidden).toBeTruthy();
    expect(prod.counters.change).toBe("–");
    expect(prod.latest[0].v).toBeNull();
    await ctx.db.update(spots).set({ framingNote: null }).where(eq(spots.id, spotId));
  });

  it("poster model: a level-Q QR of the short link, step 2 from the framing note or the baseline (B5.13)", async () => {
    const { posterData, POSTER_FALLBACK } = await import("@/lib/poster");
    const p = (await posterData(ctx.db, ctx.media, "noyyal-bridge", "https://saakshi.example/"))!;
    const code = spotId.replace(/-/g, "").slice(0, 8);
    expect(p.spot).toMatchObject({ name: "Bridge", short: `saakshi.example/s/${code}` });
    expect(p.project).toEqual({ name: "Noyyal cleanup", city: "" });
    expect(p.qrSvg).toMatch(/^<svg width="100%" height="100%" aria-hidden="true"/);
    expect(p.qrSvg).toContain("stroke:var(--foreground)");
    expect(p.steps.map((s) => s.title)).toEqual(["1. Scan", "2. Photograph the spot", "3. Watch it count"]);
    expect(p.steps[1].body.startsWith(`${POSTER_FALLBACK}, so every check-in matches.`)).toBe(true);
    expect(p.steps[1].thumb?.src).toContain("s--");
    expect(p.steps[2].body).toContain("stays clean");

    await ctx.db.update(spots).set({ framingNote: "From the bridge rail, facing downstream." }).where(eq(spots.id, spotId));
    const q = (await posterData(ctx.db, ctx.media, "noyyal-bridge", "https://saakshi.example"))!;
    expect(q.steps[1]).toMatchObject({ body: "From the bridge rail, facing downstream, so every check-in matches. उसी जगह से फ़ोटो लें।", thumb: null });
    await ctx.db.update(spots).set({ framingNote: null }).where(eq(spots.id, spotId));
    expect(await posterData(ctx.db, ctx.media, "nope", "https://saakshi.example")).toBeNull();
  });

  it("MEASURE_MAX_PER_PROJECT caps single-photo measurement (pairs still measure)", async () => {
    const deps = { ...ctx.deps, measureMax: 1 };
    const up = await ctx.media.upload({ file: await litterScene(0.3, 6), folder: "saakshi/test", context: { filename: "capped.jpg" } });
    const commons = { date: { local: "2017-09-07T09:00:00", precision: "second" }, lat: SITE.lat, lng: SITE.lng, make: "NIKON", model: "D7000" };
    const [row] = await ctx.db
      .insert(assets)
      .values({ source: "archive", cldPublicId: up.publicId, phash: up.phash, etag: up.etag, pipeline: { ingest: { commons, mediaMetadata: {}, hint: { projectId, spotId } }, steps: {} } })
      .returning();
    await runPipeline(deps, row.id);
    const [a] = await ctx.db.select().from(assets).where(eq(assets.id, row.id));
    expect(a.pipeline.steps.measure?.output).toMatchObject({ status: "capped" });
  });
});

describe("live stage: photograph the littered table, clean it, photograph again", () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestContext();
  }, 60_000);
  afterAll(async () => {
    await ctx?.close();
  });

  it("the first check-in becomes the baseline; the second is measured against it minutes later", async () => {
    const { createStageProject } = await import("@/lib/demo/stage");
    const venue = { lat: 12.9716, lng: 77.5946 };
    const { projectId, spotId } = await createStageProject(ctx.db, { ...venue, now: new Date("2026-09-28T04:00:00Z") });
    const shot = async (fraction: number, at: string, dLatM: number, filename: string) => {
      const up = await ctx.media.upload({ file: await litterScene(fraction, 9), folder: "saakshi/evidence", context: { filename } });
      const capture: CaptureInfo = {
        tokenId: null,
        clientCapturedAt: at,
        ticketIssuedAt: at,
        serverReceivedAt: at,
        deviceFix: { lat: venue.lat + dLatM / 111_195, lng: venue.lng, accuracyM: 35 },
        uploaderLocation: null,
        attested: true,
        reasons: [],
      };
      const [w] = await ctx.db
        .insert(assets)
        .values({ source: "witness", cldPublicId: up.publicId, etag: up.etag, phash: up.phash, capture, pipeline: { ingest: { mediaMetadata: up.mediaMetadata, hint: { projectId, spotId } }, steps: {} } })
        .returning();
      await runPipeline(ctx.deps, w.id);
      return w.id;
    };
    // Indoor GPS drifts: the two fixes are 60 m apart, inside the approximate 150 m stage spot.
    const littered = await shot(0.35, "2026-09-28T04:10:00.000Z", 0, "littered-table.jpg");
    const clean = await shot(0.02, "2026-09-28T04:16:00.000Z", 60, "clean-table.jpg");
    const [spot] = await ctx.db.select().from(spots).where(eq(spots.id, spotId));
    expect(spot.baselineAssetId).toBe(littered);
    const [c] = await ctx.db.select().from(comparisons).where(and(eq(comparisons.afterAssetId, clean), eq(comparisons.metric, "litter_cover")));
    expect(c).toMatchObject({ origin: "checkin", beforeAssetId: littered, method: "measured" });
    expect(c.delta).toBeLessThan(-20);
    expect(c.gapHours).toBeCloseTo(0.1, 2);
  });
});
