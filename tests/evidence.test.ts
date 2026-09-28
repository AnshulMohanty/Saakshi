import { eq } from "drizzle-orm";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assets, projects, spots } from "@/lib/db/schema";
import { ensureQr, evidenceView } from "@/lib/evidence";
import { describeStep, describeTransform } from "@/lib/media/describe";
import { proofStripTransform, qrPublicId } from "@/lib/media/proof";
import { compileTransform } from "@/lib/media/transform";
import { WATERMARK_TRANSFORM } from "@/lib/demo/plant";
import { runPipeline } from "@/lib/pipeline/runner";
import { createTestContext, synthScene, type TestContext } from "./helpers";

describe("proof strip", () => {
  it("compiles to a fixed layer chain (snapshot)", () => {
    const t = proofStripTransform({ assetId: "a1b2", place: "Tiruppur, Tamil Nadu", date: "5 Sep 2017", band: "VERIFIED" });
    expect(compileTransform(t)).toBe(
      "c_fill,g_auto,w_1200,h_900/e_blur_faces/c_pad,g_north,w_1200,h_1050,b_rgb:FFFFFF" +
        "/l_saakshi:qr:a1b2,c_fit,w_126,h_126/fl_layer_apply,g_south_west,x_12,y_12" +
        "/l_text:Arial_34_bold:Saakshi%20%C2%B7%20Verified,co_rgb:111111/fl_layer_apply,g_south_west,x_158,y_88" +
        "/l_text:Arial_28:Tiruppur%252C%20Tamil%20Nadu,co_rgb:333333/fl_layer_apply,g_south_west,x_158,y_50" +
        "/l_text:Arial_24:5%20Sep%202017%20%C2%B7%20scan%20to%20check%20this%20photo,co_rgb:555555/fl_layer_apply,g_south_west,x_158,y_16" +
        "/f_auto,q_auto",
    );
    expect(qrPublicId("a1b2")).toBe("saakshi/qr/a1b2");
  });

  it("says so when there is no place or band, and clips long places", () => {
    const t = compileTransform(proofStripTransform({ assetId: "x", place: "A".repeat(80), date: "1 Jan 2024", band: null }));
    expect(t).toContain("Not%20scored");
    expect(t).toContain(`${"A".repeat(59)}%E2%80%A6`);
  });
});

describe("describeTransform: every step in plain words with its URL segment", () => {
  it("covers crops, effects, layers, masks and delivery", () => {
    expect(describeStep({ crop: "fill", gravity: "auto", width: 800, height: 600 })).toBe("Crop to fill 800×600 px, keeping the most important part");
    expect(describeStep({ width: 1280, crop: "limit" })).toBe("Scale down to at most 1280 px wide (never up)");
    expect(describeStep({ effect: "blur_faces" })).toBe("Blur every face");
    expect(describeStep({ effect: "extract", prompt: ["litter", "garbage"], multiple: true, mode: "mask" })).toBe("Find litter, garbage (every instance) and return a black-and-white mask of them");
    expect(describeStep({ overlay: { text: "Before · 5 Sep 2017", font: "Arial", size: 28 }, gravity: "south_west" })).toBe("Add the text “Before · 5 Sep 2017” at the bottom left");
    expect(describeStep({ overlay: { publicId: "saakshi/x", type: "authenticated", crop: "fill", width: 800, height: 600, effect: "blur_faces" }, gravity: "east" })).toBe(
      "Place the private photo saakshi/x on the right, with faces blurred, sized to 800×600 px",
    );
    expect(describeStep({ format: "auto", quality: "auto" })).toBe("Deliver in the best format for the viewer's browser and automatic quality");
    expect(describeStep({ raw: "e_vectorize" })).toMatch(/doesn't model/);
  });

  it("pairs each sentence with the step's own URL segment", () => {
    const d = describeTransform(WATERMARK_TRANSFORM);
    expect(d).toHaveLength(WATERMARK_TRANSFORM.length);
    expect(d.map((s) => s.segment).join("/")).toBe(compileTransform(WATERMARK_TRANSFORM));
    expect(d[1].words).toBe("Add the text “© STOCKIMAGES” at the top left");
  });
});

describe("evidence page read model", () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestContext();
  }, 60_000);
  afterAll(async () => {
    await ctx?.close();
  });

  it("uploads the QR once and assembles every section", async () => {
    const [p] = await ctx.db.insert(projects).values({ name: "Noyyal cleanup", slug: "noyyal", type: "cleanup", centerLat: 11.1048, centerLng: 77.3517, radiusM: 300, startDate: "2017-09-01", endDate: "2017-09-30", minPairGapHours: 0.5 }).returning();
    const [s] = await ctx.db.insert(spots).values({ projectId: p.id, name: "Bridge", slug: "noyyal-bridge", lat: 11.1048, lng: 77.3517, radiusM: 30 }).returning();
    const up = await ctx.media.upload({ file: await synthScene(3), folder: "saakshi/test", context: { filename: "river-bank-garbage-before.jpg" } });
    const commons = { date: { local: "2017-09-05T18:15:00", precision: "second" }, lat: 11.10485, lng: 77.3517, make: "NIKON", model: "D7000" };
    const [a] = await ctx.db
      .insert(assets)
      .values({
        source: "archive", cldPublicId: up.publicId, etag: up.etag, phash: up.phash, qualityScore: 0.8,
        attribution: { author: "A. Photographer", license: "CC BY-SA 4.0", license_url: null, source_url: "https://commons.wikimedia.org/wiki/File:X.jpg", title: "River bank" },
        transforms: [{ at: "2026-09-28T00:00:00Z", actor: "demo:plant", steps: WATERMARK_TRANSFORM, note: "watermark added" }],
        pipeline: { ingest: { commons, mediaMetadata: {}, hint: { projectId: p.id, spotId: s.id } }, steps: {} },
      })
      .returning();
    await runPipeline(ctx.deps, a.id);

    const v = (await evidenceView(ctx.db, ctx.media, a.id, { appUrl: "https://saakshi.example" }))!;
    expect(await ctx.media.exists(qrPublicId(a.id))).toBe(true);
    const qr = await ctx.media.store.readOriginal(qrPublicId(a.id));
    expect((await sharp(qr!.bytes).metadata()).format).toBe("png");
    await ensureQr(ctx.media, a.id, "https://saakshi.example"); // second call: no re-upload
    expect((await ctx.media.store.readOriginal(qrPublicId(a.id)))!.sidecar.asset.assetId).toBe(qr!.sidecar.asset.assetId);

    expect(v.imageUrl).toContain(`l_saakshi:qr:${a.id.replaceAll("-", "-")}`);
    expect(v.pageUrl).toBe(`https://saakshi.example/e/${a.id}`);
    expect(v.trust.band).toBe("VERIFIED");
    expect(v.trust.reasons.every((r) => r.sentence.length > 5)).toBe(true);
    expect(v.facts).toMatchObject({ device: "NIKON D7000", distanceToSpotM: 6, metadataSource: expect.stringContaining("Commons") });
    expect(v.facts.tzNote).toMatch(/assumed/);
    expect(v.history).toMatchObject({ intact: true, firstBrokenAt: null });
    expect(v.audit.length).toBe(v.history.entries);
    expect(v.edits.map((e) => e.title)).toEqual([
      "Edit recorded on this photo",
      "This page's image, with the proof strip",
      "Library and review preview",
      "Measured frame (what the before/after slider shows)",
      "Segmentation mask for Litter cover",
    ]);
    expect(v.edits[0]).toMatchObject({ who: "demo:plant", note: "watermark added" });
    expect(v.attribution?.author).toBe("A. Photographer");
    expect(await evidenceView(ctx.db, ctx.media, "00000000-0000-4000-8000-000000000000", { appUrl: "x" })).toBeNull();
    expect(v.trust).toMatchObject({ mock: true, providerMode: "mock" });
    // Production: a mock-derived trust score and ledger never render.
    const prodView = (await evidenceView(ctx.db, ctx.media, a.id, { appUrl: "https://saakshi.example", policy: { production: true, minConfidence: 0.5 } }))!;
    expect(prodView.trust).toMatchObject({ score: null, band: null, reasons: [], hiddenText: "Not available: computed with mock providers" });
    const [row] = await ctx.db.select().from(assets).where(eq(assets.id, a.id));
    expect(row.status).toBe("ready");
  });
});
