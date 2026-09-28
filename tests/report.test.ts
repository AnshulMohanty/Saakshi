import { and, eq, isNull } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { findProseIssues, renderClaims, validateProse } from "@/lib/claims";
import { assets, auditLog, projects, reports, spots, type CaptureInfo } from "@/lib/db/schema";
import { autoPairProject } from "@/lib/measure/measure";
import { runPipeline } from "@/lib/pipeline/runner";
import { buildClaims } from "@/lib/report/claims";
import { generateReport } from "@/lib/report/generate";
import { pdfText } from "@/lib/report/pdf";
import { buildReportSections, type ReportData } from "@/lib/report/sections";
import { createTestContext, litterScene, type TestContext } from "./helpers";

const SITE = { lat: 11.1048, lng: 77.3517 };
const NOW = new Date("2026-09-28T06:00:00Z");

describe("claims ledger, prose and the Impact Report", () => {
  let ctx: TestContext;
  let archiveId: string;
  let userId: string;
  let userSpot: string;

  async function photo(projectId: string, spotId: string, fraction: number, seed: number, date: string, filename: string) {
    const up = await ctx.media.upload({ file: await litterScene(fraction, seed), folder: "saakshi/test", context: { filename } });
    const commons = { date: { local: date, precision: "second" }, lat: SITE.lat, lng: SITE.lng, make: "NIKON", model: "D7000" };
    const [row] = await ctx.db
      .insert(assets)
      .values({
        source: "archive", cldPublicId: up.publicId, etag: up.etag, phash: up.phash, qualityScore: 0.8,
        attribution: { author: `Author ${seed}`, license: "CC BY-SA 4.0", license_url: null, source_url: `https://commons.wikimedia.org/wiki/File:${seed}.jpg`, title: `River bank ${seed}` },
        pipeline: { ingest: { commons, mediaMetadata: {}, hint: { projectId, spotId } }, steps: {} },
      })
      .returning();
    await runPipeline(ctx.deps, row.id);
    return row.id;
  }

  beforeAll(async () => {
    ctx = await createTestContext();
    const site = { type: "cleanup" as const, centerLat: SITE.lat, centerLng: SITE.lng, radiusM: 300, minPairGapHours: 0.5 };
    [{ id: archiveId }] = await ctx.db.insert(projects).values({ ...site, name: "River clean-up, Tiruppur", slug: "tiruppur", startDate: "2017-09-01", endDate: "2017-09-30", source: "demo_archive", locationApproximate: true }).returning();
    const [s1] = await ctx.db.insert(spots).values({ projectId: archiveId, name: "Bridge", slug: "bridge", lat: SITE.lat, lng: SITE.lng, radiusM: 30 }).returning();
    await photo(archiveId, s1.id, 0.4, 1, "2017-09-05T08:00:00", "river-bank-garbage-before.jpg");
    await photo(archiveId, s1.id, 0.05, 2, "2017-09-05T20:00:00", "river-bank-after-cleanup.jpg");
    await autoPairProject(ctx.deps, archiveId);
    // A planted test input, flagged.
    await ctx.db.insert(assets).values({
      source: "planted_test", testCase: "stock", projectId: archiveId, cldPublicId: "saakshi/test/stock", status: "flagged", trustBand: "FLAGGED", trustScore: 35,
      trustReasons: [{ code: "STOCK_SUSPECTED", signal: "authenticity", kind: "hard", points: 0, detail: { watermark: true, branding: false } }],
      attribution: { author: "Stock source", license: "CC BY 4.0", license_url: null, source_url: "https://commons.wikimedia.org/wiki/File:S.jpg", title: "Stock source" },
    });

    // A live project with a recent Witness check-in.
    [{ id: userId }] = await ctx.db.insert(projects).values({ ...site, name: "Lake clean-up", slug: "lake", startDate: "2026-09-01", endDate: "2026-09-10" }).returning();
    [{ id: userSpot }] = await ctx.db.insert(spots).values({ projectId: userId, name: "Ghat", slug: "ghat", lat: SITE.lat, lng: SITE.lng, radiusM: 30 }).returning();
    const up = await ctx.media.upload({ file: await litterScene(0.02, 7), folder: "saakshi/evidence", context: { filename: "checkin.jpg" } });
    const capture: CaptureInfo = { tokenId: null, clientCapturedAt: "2026-09-20T04:00:00Z", ticketIssuedAt: "2026-09-20T04:00:00Z", serverReceivedAt: "2026-09-20T04:00:05Z", deviceFix: { lat: SITE.lat, lng: SITE.lng, accuracyM: 5 }, uploaderLocation: null, attested: true, reasons: [] };
    await ctx.db.insert(assets).values({ source: "witness", projectId: userId, spotId: userSpot, cldPublicId: up.publicId, capture, capturedAt: new Date("2026-09-20T04:00:00Z"), trustBand: "VERIFIED", trustScore: 95, status: "ready" });
  }, 120_000);
  afterAll(async () => {
    await ctx?.close();
  });

  it("builds claims only from stored rows, each with its asset ids", async () => {
    const r = await buildClaims(ctx.db, archiveId, { now: NOW });
    expect(r.period).toEqual({ from: "2017-09-01", to: "2017-09-30" });
    const by = Object.fromEntries(r.claims.map((c) => [c.id, c]));
    expect(Object.keys(by)).toEqual(["photos_verified", "photos_flagged", "spots_monitored", "litter_cover_change", "items_visible_change"]);
    expect(by.photos_verified).toMatchObject({ value: 2, unit: "photos", method: "measured" });
    expect(by.photos_verified.asset_ids).toHaveLength(2);
    expect(by.photos_flagged).toMatchObject({ value: 1, detail: { topReasons: [{ code: "STOCK_SUSPECTED", n: 1 }], testInputs: ["stock"] } });
    expect(by.spots_monitored.value).toBe(1);
    expect(by.litter_cover_change).toMatchObject({ unit: "points", method: "measured", detail: { pairs: 1 } });
    expect(by.litter_cover_change.value).toBeLessThan(0);
    expect(by.litter_cover_change.asset_ids).toHaveLength(2);
    expect(by.items_visible_change).toMatchObject({ method: "ai_estimated", unit: "items" });
    expect(by.items_visible_change.confidence).toBeGreaterThan(0);
  });

  it("archive projects get a note instead of check-in numbers", async () => {
    const r = await buildClaims(ctx.db, archiveId, { now: NOW });
    expect(r.claims.some((c) => c.id.includes("checkin"))).toBe(false);
    expect(r.notes).toEqual(["Archive project: no recent check-ins."]);
  });

  it("projects with check-ins in the last 90 days report them", async () => {
    const r = await buildClaims(ctx.db, userId, { now: NOW });
    const by = Object.fromEntries(r.claims.map((c) => [c.id, c]));
    expect(by.checkins_after_cleanup).toMatchObject({ value: 1, unit: "check-ins" });
    expect(by.days_since_last_checkin).toMatchObject({ value: 8, unit: "days" });
    expect(r.notes).toEqual([]);
    // 100 days later the check-in is no longer recent: no numbers, a note.
    const later = await buildClaims(ctx.db, userId, { now: new Date("2027-01-05T00:00:00Z") });
    expect(later.claims.some((c) => c.id.includes("checkin"))).toBe(false);
    expect(later.notes).toEqual(["No check-ins in the last three months."]);
  });

  it("generated prose passes validateProse; a number written by the model would not", async () => {
    const { claims } = await buildClaims(ctx.db, archiveId, { now: NOW });
    const text = await ctx.deps.ai.writeWithPlaceholders("Summarise", claims.map((c) => ({ id: c.id, label: c.label })));
    expect(() => validateProse(text, { claimIds: claims.map((c) => c.id) })).not.toThrow();
    expect(renderClaims(text, claims)).toMatch(/Photos verified: 2 photos/);
    expect(findProseIssues(`${text} Volunteers removed 40 bags.`).map((i) => i.kind)).toContain("digit");
  });

  it("the section builder: six sections in order, numbers link to their claim, pairs or the trend", () => {
    const base: ReportData = {
      reportId: "r1", reportUrl: "https://x/r/r1", appUrl: "https://x", generatedAt: "2026-09-28T00:00:00Z", policy: { production: false, minConfidence: 0.5 },
      project: { name: "P", type: "cleanup", description: null, place: null, locationApproximate: true },
      period: { from: "2017-09-01", to: "2017-09-30" },
      claims: [{ id: "photos_verified", label: "Photos verified", value: 2, unit: "photos", method: "measured", asset_ids: ["a", "b"], provider_mode: "real" }],
      prose: "Text.", notes: ["Archive project: no recent check-ins."],
      pairs: [], trend: { spot: "Bridge", metric: "Litter cover", unit: "%", points: [{ t: 1, value: 4 }, { t: 2, value: 2 }] },
      gallery: [{ id: "a", image: "thumb:a", band: "VERIFIED", caption: null, date: "5 Sep 2017" }],
      excluded: [{ id: "s", band: "FLAGGED", status: "flagged", testCase: "stock", reasons: ["Shows a watermark or stock-photo branding."], date: "28 Sep 2026" }],
      credits: [{ id: "a", title: "River bank", author: "A", license: "CC BY-SA 4.0", url: "https://commons.wikimedia.org/x", testCase: null }],
    };
    const s = buildReportSections(base);
    expect(s.map((x) => x.kind)).toEqual(["cover", "numbers", "trend", "gallery", "excluded", "method"]);
    const numbers = s[1] as Extract<(typeof s)[number], { kind: "numbers" }>;
    expect(numbers.items[0]).toMatchObject({ value: "2 photos", method: "Counted from records", photos: 2, url: "https://x/r/r1#claim-photos_verified" });
    expect(numbers.notes).toEqual(["Archive project: no recent check-ins."]);
    expect((s[3] as Extract<(typeof s)[number], { kind: "gallery" }>).items[0].url).toBe("https://x/e/a");
    expect((s[4] as Extract<(typeof s)[number], { kind: "excluded" }>).items[0]).toMatchObject({ testCase: "stock", url: "https://x/e/s" });
    const withPairs = buildReportSections({ ...base, pairs: [{ key: "k", spot: "Bridge", before: { id: "a", date: "d" }, after: { id: "b", date: "e" }, image: "pair:k", metrics: [], lowConfidence: false }] });
    expect(withPairs[2].kind).toBe("pairs");
    expect(s[0]).toMatchObject({ kind: "cover", period: "1 September 2017 to 30 September 2017" });
  });

  it("production mode: no mock-derived number renders in the report, its PDF sections, prose or campaign kit", async () => {
    const prod = { production: true, minConfidence: 0.5 };
    const out = await generateReport({ db: ctx.db, media: ctx.media, ai: ctx.deps.ai, appUrl: "https://saakshi.example", policy: prod }, archiveId, { now: NOW });
    const numbers = out.sections.find((x) => x.kind === "numbers") as Extract<(typeof out.sections)[number], { kind: "numbers" }>;
    expect(numbers.items.every((i) => i.hidden && !/\d/.test(i.value))).toBe(true);
    expect(numbers.prose).not.toMatch(/\d/);
    const pairs = out.sections.find((x) => x.kind === "pairs") as Extract<(typeof out.sections)[number], { kind: "pairs" }>;
    expect(pairs.items.flatMap((p) => p.metrics).every((m) => m.hidden)).toBe(true);
    expect(out.sections[0]).toMatchObject({ banner: null });
    const { reportView } = await import("@/lib/report/view");
    const v = (await reportView(ctx.db, ctx.media, out.report.id, prod))!;
    expect(v.claims.every((c) => c.hidden && !/\d/.test(c.formatted))).toBe(true);
    expect(v.prose.filter((p) => typeof p !== "string").every((p) => typeof p !== "string" && !/\d/.test(p.formatted))).toBe(true);
    expect(v.campaign?.templates.map((t) => t.id)).not.toContain("stat"); // a stat card is a number
    expect(v.campaign?.caption).not.toMatch(/\d/);
    // Development: the same report shows the numbers, tagged, with the banner.
    const d = (await reportView(ctx.db, ctx.media, out.report.id, { production: false, minConfidence: 0.5 }))!;
    expect(d.mockShown).toBe(true);
    expect(d.claims.find((c) => c.id === "photos_verified")).toMatchObject({ hidden: false, mock: true, formatted: "2 photos" });
    // The 38%-style weak estimate stays hidden even in development.
    const items = d.claims.find((c) => c.id === "items_visible_change");
    if (items && (items.confidence ?? 0) < 0.5) expect(items).toMatchObject({ hidden: true, formatted: "Not enough confidence to estimate" });
  });

  it("maps glyphs the PDF fonts can't draw", () => {
    expect(pdfText("0.1% → 6.0% (≈12, −5.9) साक्षी")).toBe("0.1% -> 6.0% (~12, −5.9) साक्षी"); // Devanagari now prints (bundled Noto)
  });

  it("generates the report: PDF uploaded raw + authenticated, campaign kit, audit row", async () => {
    const out = await generateReport({ db: ctx.db, media: ctx.media, ai: ctx.deps.ai, appUrl: "https://saakshi.example" }, archiveId, { now: NOW });
    const [row] = await ctx.db.select().from(reports).where(eq(reports.id, out.report.id));
    expect(row).toMatchObject({ kind: "impact", periodFrom: "2017-09-01", periodTo: "2017-09-30", pdfPublicId: `saakshi/reports/${row.id}.pdf`, notes: ["Archive project: no recent check-ins."] });
    expect(row.prose).toMatch(/\{\{claim:photos_verified\}\}/); // stored with placeholders
    const raw = await ctx.media.store.readRaw(row.pdfPublicId!);
    expect(raw?.contentType).toBe("application/pdf");
    expect(raw!.bytes.subarray(0, 5).toString()).toBe("%PDF-");
    expect(out.sections.map((s) => s.kind)).toEqual(["cover", "numbers", "pairs", "gallery", "excluded", "method"]);
    expect(row.campaign).toMatchObject({ statClaimId: "litter_cover_change", pair: expect.any(Object), photoAssetId: expect.any(String) });
    expect(row.campaign!.alts.stat).toMatch(/Median change in litter cover: -\d+(\.\d+)? points \(Measured on photo pixels\)/);
    expect(() => validateProse(row.campaign!.caption)).not.toThrow();
    const audit = await ctx.db.select().from(auditLog).where(and(isNull(auditLog.assetId), eq(auditLog.action, "report.generated")));
    expect(audit.filter((a) => (a.detail as { reportId?: string }).reportId === row.id)).toHaveLength(1);
    // The signed raw URL is served; any change to it is refused.
    expect(out.pdfUrl).toMatch(/\/api\/media\/mock\/raw\/authenticated\/s--[A-Za-z0-9_-]{32}--\/v1\/saakshi\/reports\/.+\.pdf$/);
    const path = out.pdfUrl.slice(out.pdfUrl.indexOf("raw/"));
    expect(await ctx.media.renderRaw(path)).toMatchObject({ status: 200, contentType: "application/pdf" });
    expect((await ctx.media.renderRaw(path.replace(/s--(.)/, (_m, c) => `s--${c === "A" ? "B" : "A"}`))).status).toBe(401);
    expect((await ctx.media.renderRaw(path.replace(".pdf", "x.pdf"))).status).toBe(401);
  });
});
