/**
 * The designed pages' data from the database: How it works (lib/how/view.ts), Demo entry
 * (lib/demo-entry/view.ts), the evidence page (lib/evidence-page.ts) and the QR poster
 * (lib/poster.ts). Each binds the design's sample values to our rows (B5.3, B5.4).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assets, projects, spots } from "@/lib/db/schema";
import { autoPairProject } from "@/lib/measure/measure";
import { runPipeline } from "@/lib/pipeline/runner";
import { createTestContext, litterScene, type TestContext } from "./helpers";

const SITE = { lat: 19.1351, lng: 72.8146 };
const DEV = { production: false, minConfidence: 0.5 };

describe("designed page views", () => {
  let ctx: TestContext;
  let projectId: string;
  const ids: string[] = [];

  beforeAll(async () => {
    ctx = await createTestContext();
    [{ id: projectId }] = await ctx.db.insert(projects).values({ name: "Beach clean-up, Mumbai", slug: "demo-hero-cleanup", type: "cleanup", centerLat: SITE.lat, centerLng: SITE.lng, radiusM: 300, startDate: "2018-10-01", endDate: "2018-10-31", minPairGapHours: 0.5, source: "demo_archive", locationApproximate: true }).returning();
    const [s] = await ctx.db.insert(spots).values({ projectId, name: "Versova north", slug: "demo-hero-cleanup-spot-1", lat: SITE.lat, lng: SITE.lng, radiusM: 30, framingNote: "Stand at the lifeguard tower, facing the sea." }).returning();
    for (const [fraction, seed, date, filename] of [
      [0.4, 1, "2018-10-02T08:00:00", "beach-garbage-before.jpg"],
      [0.05, 2, "2018-10-02T19:00:00", "beach-after-cleanup.jpg"],
    ] as const) {
      const up = await ctx.media.upload({ file: await litterScene(fraction, seed), folder: "saakshi/test", context: { filename } });
      const commons = { date: { local: date, precision: "second" }, lat: SITE.lat, lng: SITE.lng, make: "NIKON", model: "D7000" };
      const [row] = await ctx.db
        .insert(assets)
        .values({ source: "archive", cldPublicId: up.publicId, etag: up.etag, phash: up.phash, qualityScore: 0.8, attribution: { author: `Author ${seed}`, license: "CC BY-SA 4.0", license_url: null, source_url: `https://commons.wikimedia.org/wiki/File:${seed}.jpg`, title: `Versova ${seed}.jpg` }, pipeline: { ingest: { commons, mediaMetadata: {}, hint: { projectId, spotId: s.id } }, steps: {} } })
        .returning();
      await runPipeline(ctx.deps, row.id);
      ids.push(row.id);
    }
    await autoPairProject(ctx.deps, projectId);
  }, 120_000);
  afterAll(async () => {
    await ctx?.close();
  });

  it("How it works: the hero project's best verified photo, signed, credited, with the fixed threshold", async () => {
    const { howView } = await import("@/lib/how/view");
    const h = await howView(ctx.db, ctx.media);
    expect(h.photo?.src).toContain("s--");
    expect(h.photo?.credit).toMatch(/Photo: Author \d, CC BY-SA 4\.0, Wikimedia Commons\. Faces blurred\./);
    expect(h.photo?.threshold).toBeGreaterThan(0);
    expect(h.stages.map((s) => s.name)).toEqual(["Intake forensics", "Perception", "Measurement", "Privacy", "Provenance"]);
    // Stage codes are compiled by our transform code, not copied from the design.
    expect(h.stages[3].code).toMatch(/e_blur_faces/);
  });

  it("Demo entry: the volunteer phone shows a real verified photo, the funder card counts verified rows", async () => {
    const { demoEntryView } = await import("@/lib/demo-entry/view");
    const d = await demoEntryView(ctx.db, ctx.media, DEV);
    expect(d.volunteer.photo).toContain("s--");
    expect(d.volunteer.band).toBe("VERIFIED");
    expect(d.volunteer.score).toEqual(expect.any(Number));
    expect(d.funder.project).toBe("Beach clean-up, Mumbai");
    expect(Number(d.funder.verified)).toBe(2);
    expect(d.manager.tiles.every((t) => t.src.includes("s--"))).toBe(true);
    // Production never counts mock-derived rows.
    const prod = await demoEntryView(ctx.db, ctx.media, { production: true, minConfidence: 0.5 });
    expect(prod.funder.verified).toBe("0");
    expect(prod.volunteer.score).toBeNull();
  });

  it("Evidence page: code, place, layers, ledger and fingerprint from the asset's rows", async () => {
    const { evidencePageData } = await import("@/lib/evidence-page");
    const e = (await evidencePageData(ctx.db, ctx.media, ids[0], { appUrl: "https://saakshi.example", policy: DEV }))!;
    expect(e.code).toBe(ids[0].slice(0, 8));
    expect(e.trust.band).toBe("VERIFIED");
    expect(e.viewer.photo.src).toContain("s--");
    expect(e.viewer.layers.map((l) => l.name)).toEqual(["The photo", "Where and when", "Fingerprint", "What the AI sees", "What we measured"]);
    expect(e.ledger.length).toBeGreaterThan(2);
    expect(e.fingerprint?.bits).toMatch(/^[01]{64}$/);
    expect(await evidencePageData(ctx.db, ctx.media, "00000000-0000-4000-8000-000000000000", { appUrl: "https://saakshi.example", policy: DEV })).toBeNull();
  });

  it("QR poster: the spot's short link, its framing note as step 2, coordinates", async () => {
    const { posterData } = await import("@/lib/poster");
    const p = (await posterData(ctx.db, ctx.media, "demo-hero-cleanup-spot-1", "https://saakshi.example"))!;
    expect(p.spot.name).toBe("Versova north");
    expect(p.spot.short).toMatch(/^saakshi\.example\/s\/[0-9A-Za-z]+$/);
    expect(p.steps[1].body).toMatch(/^Stand at the lifeguard tower, facing the sea, so every check-in matches\./);
    expect(p.steps[1].thumb).toBeNull();
    expect(p.qrSvg).toMatch(/^<svg/);
    expect(p.spot.coords).toMatch(/N, .* E$/);
    expect(await posterData(ctx.db, ctx.media, "no-such-spot", "https://saakshi.example")).toBeNull();
  });
});
