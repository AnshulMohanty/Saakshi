import { readFileSync } from "node:fs";
import path from "node:path";
import { count, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { verifyAllChains } from "@/lib/audit";
import { assets, auditLog, projects, spots } from "@/lib/db/schema";
import { assign, cosine, type AssignProject, type AssignSpot } from "@/lib/pipeline/assign";
import { parseAssetMetadata } from "@/lib/pipeline/metadata";
import { runPipeline } from "@/lib/pipeline/runner";
import { STEP_ORDER } from "@/lib/pipeline/steps";
import { hashEmbedding } from "@/lib/providers/ai/mock";
import type { AnalysisProvider } from "@/lib/providers/analysis";
import { createTestContext, type TestContext } from "./helpers";

// ---------------------------------------------------------------------------------------------
// assign() rules (pure)

const P1: AssignProject = { id: "p1", center: { lat: 12.9716, lng: 77.5946 }, radiusM: 500, startDate: "2025-03-01", endDate: "2025-03-31", embedding: hashEmbedding("lake clean-up litter plastic garbage") };
const P2: AssignProject = { id: "p2", center: { lat: 12.975, lng: 77.5946 }, radiusM: 1000, startDate: "2025-01-01", endDate: "2025-12-31", embedding: hashEmbedding("tree planting saplings school") };
const S1: AssignSpot = { id: "s1", projectId: "p1", center: { lat: 12.9716, lng: 77.5946 }, radiusM: 40 };
const S2: AssignSpot = { id: "s2", projectId: "p1", center: { lat: 12.9726, lng: 77.5946 }, radiusM: 40 };
const S3: AssignSpot = { id: "s3", projectId: "p2", center: { lat: 12.975, lng: 77.5946 }, radiusM: 40 };
const base = { location: { lat: 12.97165, lng: 77.5946 }, capturedAt: "2025-03-14T04:00:00.000Z", embedding: null };
const opts = { threshold: 0.45 };

describe("assign", () => {
  it("never overrides a manual assignment", () => {
    expect(assign({ ...base, current: { projectId: "p2", spotId: null, method: "manual" } }, [P1, P2], [S1], opts)).toMatchObject({
      projectId: "p2",
      method: "manual",
    });
  });

  it("uses the capture hint first: a spot implies its project; a project gets its nearest spot", () => {
    expect(assign({ ...base, hint: { spotId: "s3" } }, [P1, P2], [S1, S3], opts)).toMatchObject({ projectId: "p2", spotId: "s3", method: "capture_hint" });
    expect(assign({ ...base, hint: { projectId: "p1" } }, [P1, P2], [S1, S2], opts)).toMatchObject({ projectId: "p1", spotId: "s1", method: "capture_hint" });
    expect(assign({ ...base, hint: { projectId: "unknown" } }, [P1], [], opts).method).toBe("geo_time"); // stale hint ignored
  });

  it("assigns by GPS inside radius AND date inside window, nearest centre first", () => {
    expect(assign(base, [P2, P1], [S1, S3], opts)).toMatchObject({ projectId: "p1", spotId: "s1", method: "geo_time" });
    // Outside P1's window (April) but inside P2's → P2
    expect(assign({ ...base, capturedAt: "2025-04-02T00:00:00Z" }, [P1, P2], [], opts)).toMatchObject({ projectId: "p2", method: "geo_time" });
    // Window ends are inclusive by day
    expect(assign({ ...base, capturedAt: "2025-03-31T23:00:00Z" }, [P1], [], opts).method).toBe("geo_time");
  });

  it("falls back to similarity above the threshold, else none", () => {
    const far = { lat: 20, lng: 80 };
    expect(assign({ location: far, capturedAt: base.capturedAt, embedding: hashEmbedding("plastic garbage by the lake, clean-up") }, [P1, P2], [], opts)).toMatchObject({
      projectId: "p1",
      method: "similarity",
    });
    expect(assign({ location: far, capturedAt: base.capturedAt, embedding: hashEmbedding("a cat on a sofa") }, [P1, P2], [], opts)).toMatchObject({
      projectId: null,
      method: "none",
    });
    // GPS without a date can't use geo_time
    expect(assign({ ...base, capturedAt: null, embedding: null }, [P1], [], opts).method).toBe("none");
  });

  it("only picks spots whose radius contains the photo", () => {
    const between = { ...base, location: { lat: 12.9721, lng: 77.5946 } }; // ~55 m from both spots
    expect(assign(between, [P1], [S1, S2], opts)).toMatchObject({ projectId: "p1", spotId: null });
  });

  it("computes cosine similarity", () => {
    expect(cosine([1, 0], [1, 0])).toBe(1);
    expect(cosine([1, 0], [0, 1])).toBe(0);
    expect(cosine([0, 0], [1, 1])).toBe(0);
  });
});

// ---------------------------------------------------------------------------------------------
// metadata (pure)

describe("parseAssetMetadata", () => {
  it("marks Commons dates as timezone-assumed and sources them from the API", () => {
    const m = parseAssetMetadata({
      source: "archive",
      ingest: { commons: { date: { local: "2017-09-05T18:15:57", precision: "second" }, lat: 11.1, lng: 77.35, make: "NIKON", model: "D7000" } },
      defaultOffset: "+05:30",
    });
    expect(m).toMatchObject({ exifSource: "commons_api", capturedAt: "2017-09-05T12:45:57.000Z", capturedAtTzAssumed: true, cameraMake: "NIKON" });
    expect(m.location).toEqual({ lat: 11.1, lng: 77.35, source: "commons" });
  });

  it("reads provider media metadata (file EXIF), respecting offsets", () => {
    const m = parseAssetMetadata({
      source: "upload",
      ingest: { mediaMetadata: { DateTimeOriginal: "2025:03:14 09:30:00", OffsetTimeOriginal: "+05:30", GPSLatitude: `12 deg 58' 18.00" N`, GPSLongitude: `77 deg 35' 40.56" E` } },
      defaultOffset: "+05:30",
    });
    expect(m).toMatchObject({ exifSource: "file", capturedAt: "2025-03-14T04:00:00.000Z", capturedAtTzAssumed: false });
    expect(m.location?.source).toBe("exif");
    expect(parseAssetMetadata({ source: "upload", ingest: { mediaMetadata: {} }, defaultOffset: "+05:30" }).exifSource).toBe("none");
  });

  it("prefers the witness device fix and client clock", () => {
    const m = parseAssetMetadata({
      source: "witness",
      ingest: { mediaMetadata: {} },
      capture: {
        tokenId: "t",
        clientCapturedAt: "2025-06-01T10:00:00+05:30",
        ticketIssuedAt: "2025-06-01T04:30:01Z",
        serverReceivedAt: "2025-06-01T04:30:05Z",
        deviceFix: { lat: 12.97, lng: 77.59, accuracyM: 8 },
        uploaderLocation: null,
        attested: true,
        reasons: [],
      },
      defaultOffset: "+05:30",
    });
    expect(m).toMatchObject({ capturedAt: "2025-06-01T04:30:00.000Z", capturedAtTzAssumed: false, location: { lat: 12.97, lng: 77.59, source: "device" } });
  });
});

// ---------------------------------------------------------------------------------------------
// pipeline (integration: in-memory PGlite + mock providers)

describe("evidence pipeline", () => {
  let ctx: TestContext;
  let projectId: string;
  let spotId: string;
  const fixture = readFileSync(path.join(__dirname, "fixtures", "geotagged.jpg"));

  beforeAll(async () => {
    ctx = await createTestContext();
    const [p] = await ctx.db
      .insert(projects)
      .values({ name: "Lake clean-up, Bengaluru", slug: "lake-cleanup-blr", type: "cleanup", description: "Volunteers removing plastic litter", centerLat: 12.9716, centerLng: 77.5946, radiusM: 500, startDate: "2025-03-01", endDate: "2025-03-31" })
      .returning();
    projectId = p.id;
    const [s] = await ctx.db.insert(spots).values({ projectId, name: "Gate", slug: "gate", lat: 12.97167, lng: 77.5946, radiusM: 40 }).returning();
    spotId = s.id;
  }, 60_000);
  afterAll(async () => {
    await ctx?.close();
  });

  async function ingest(context: Record<string, string>) {
    const up = await ctx.media.upload({ file: fixture, folder: "saakshi/test", context });
    const [row] = await ctx.db
      .insert(assets)
      .values({ source: "upload", cldPublicId: up.publicId, cldAssetId: up.assetId, etag: up.etag, phash: up.phash, width: up.width, height: up.height, pipeline: { ingest: { mediaMetadata: up.mediaMetadata }, steps: {} } })
      .returning();
    return row;
  }

  const auditCount = async () => (await ctx.db.select({ n: count() }).from(auditLog))[0].n;

  it("runs every step and leaves the asset ready, assigned and audited", async () => {
    const a = await ingest({ filename: "gate-plastic-litter-before.jpg" });
    const before = await auditCount();
    const outcomes = await runPipeline(ctx.deps, a.id);
    expect(outcomes.map((o) => o.step)).toEqual(STEP_ORDER);
    expect(outcomes.every((o) => !o.skipped)).toBe(true);

    const [done] = await ctx.db.select().from(assets).where(eq(assets.id, a.id));
    expect(done).toMatchObject({
      status: "ready",
      exifSource: "file",
      capturedAtTzAssumed: false,
      placeName: "Bengaluru, Karnataka, India",
      projectId,
      spotId,
      assignmentMethod: "geo_time",
    });
    expect(done.capturedAt?.toISOString()).toBe("2025-03-14T04:00:00.000Z");
    expect(done.cldTags).toContain("litter_or_waste");
    expect(done.ai).toMatchObject({ activity: "cleanup", method: "ai_estimated" });
    expect(done.caption).toBeTruthy();
    expect(done.embedding).toHaveLength(1536);
    expect(Object.keys(done.pipeline.steps).sort()).toEqual([...STEP_ORDER].sort()); // jsonb reorders keys
    expect(done.pipeline.completedAt).toBeTruthy();
    expect(Object.values(done.pipeline.steps).every((s) => s?.status === "done")).toBe(true);
    expect(done).toMatchObject({ trustBand: "VERIFIED" });
    expect(done.trustScore).toBeGreaterThanOrEqual(75);
    expect(done.trustReasons?.map((r) => r.code)).toEqual(expect.arrayContaining(["LOCATION_EXIF", "TIME_IN_WINDOW", "UNIQUE", "AUTH_CLEAR"]));
    const sidecar = await ctx.media.store.readSidecar(done.cldPublicId);
    expect(sidecar?.metadata).toMatchObject({ project_id: projectId, source: "upload", trust_band: "VERIFIED", trust_score: String(done.trustScore) });
    expect(sidecar?.tags).toContain("trust_verified");
    expect(sidecar?.tags).not.toContain("trust_flagged");

    expect((await auditCount()) - before).toBe(STEP_ORDER.length);
    expect((await verifyAllChains(ctx.db)).ok).toBe(true);
  });

  it("is idempotent: running again skips every step and changes nothing", async () => {
    const a = await ingest({ filename: "gate-litter.jpg" });
    await runPipeline(ctx.deps, a.id);
    const [first] = await ctx.db.select().from(assets).where(eq(assets.id, a.id));
    const audits = await auditCount();

    const again = await runPipeline(ctx.deps, a.id);
    expect(again.every((o) => o.skipped)).toBe(true);
    const [second] = await ctx.db.select().from(assets).where(eq(assets.id, a.id));
    expect(second).toEqual(first);
    expect(await auditCount()).toBe(audits);
  });

  it("records a failing step, then resumes from it on retry", async () => {
    let calls = 0;
    const flaky: AnalysisProvider = {
      kind: "mock",
      tag: async (id, t) => {
        calls++;
        if (calls === 1) throw new Error("analysis service down");
        return ctx.deps.analysis.tag(id, t);
      },
      moderate: (id, q) => ctx.deps.analysis.moderate(id, q),
      detectWatermark: (id) => ctx.deps.analysis.detectWatermark(id),
    };
    const deps = { ...ctx.deps, analysis: flaky };
    const a = await ingest({ filename: "retry.jpg" });

    await expect(runPipeline(deps, a.id)).rejects.toThrow(/analysis service down/);
    let [row] = await ctx.db.select().from(assets).where(eq(assets.id, a.id));
    expect(row.status).toBe("processing");
    expect(row.pipeline.steps.parseMetadata?.status).toBe("done");
    expect(row.pipeline.steps.analyze).toMatchObject({ status: "error", attempts: 1, error: "analysis service down" });

    const retry = await runPipeline(deps, a.id);
    expect(retry[0]).toMatchObject({ step: "parseMetadata", skipped: true });
    expect(retry[1]).toMatchObject({ step: "analyze", skipped: false });
    [row] = await ctx.db.select().from(assets).where(eq(assets.id, a.id));
    // The identical fixture is already in this project (earlier tests): a person should look.
    expect(row).toMatchObject({ status: "flagged", trustBand: "NEEDS_REVIEW" });
    expect(row.trustReasons?.find((r) => r.kind === "review")?.code).toBe("POSSIBLE_DUPLICATE");
    expect(row.pipeline.steps.analyze).toMatchObject({ status: "done", attempts: 2 });
    expect((await verifyAllChains(ctx.db)).ok).toBe(true);
  });

  it("respects a capture hint over location", async () => {
    const [other] = await ctx.db.insert(projects).values({ name: "Elsewhere", slug: "elsewhere", centerLat: 20, centerLng: 80, radiusM: 300 }).returning();
    const up = await ctx.media.upload({ file: fixture, folder: "saakshi/test", context: { filename: "hinted.jpg" } });
    const [row] = await ctx.db
      .insert(assets)
      .values({ source: "upload", cldPublicId: up.publicId, pipeline: { ingest: { mediaMetadata: up.mediaMetadata, hint: { projectId: other.id } }, steps: {} } })
      .returning();
    await runPipeline(ctx.deps, row.id);
    const [done] = await ctx.db.select().from(assets).where(eq(assets.id, row.id));
    expect(done).toMatchObject({ projectId: other.id, spotId: null, assignmentMethod: "capture_hint" });
  });

  it("embeds each project's description once", async () => {
    const ps = await ctx.db.select().from(projects);
    expect(ps.every((p) => p.embedding?.length === 1536)).toBe(true);
  });
});
