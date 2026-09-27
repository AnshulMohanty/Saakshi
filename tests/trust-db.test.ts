import { and, count, eq, isNull } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { verifyAllChains } from "@/lib/audit";
import { assets, auditLog, duplicates, projects } from "@/lib/db/schema";
import { runPipeline } from "@/lib/pipeline/runner";
import { rescoreAsset, statusFor } from "@/lib/pipeline/score";
import { updateProject } from "@/lib/projects";
import { decideReview, listReviewQueue, ReviewError } from "@/lib/review";
import { createTestContext, synthScene, type TestContext } from "./helpers";

describe("Trust Engine against the database", () => {
  let ctx: TestContext;
  let p1: string;
  let p2: string;

  beforeAll(async () => {
    ctx = await createTestContext();
    const site = (name: string, lat: number, lng: number, startDate: string, endDate: string) =>
      ctx.db.insert(projects).values({ name, type: "cleanup", centerLat: lat, centerLng: lng, radiusM: 500, startDate, endDate, minPairGapHours: 0.5 }).returning();
    [{ id: p1 }] = await site("Noyyal cleanup", 11.1048, 77.3517, "2023-03-01", "2023-03-02");
    [{ id: p2 }] = await site("Lake cleanup", 17.4642, 78.3736, "2024-11-01", "2024-11-03");
  }, 60_000);
  afterAll(async () => {
    await ctx?.close();
  });

  /** An archive-style photo: Commons GPS and date, NIKON camera, assigned by hint. */
  async function ingest(bytes: Buffer, projectId: string, at: { lat: number; lng: number; date: string }, filename: string) {
    const up = await ctx.media.upload({ file: bytes, folder: "saakshi/test", context: { filename } });
    const commons = { date: { local: at.date, precision: "second" }, lat: at.lat, lng: at.lng, make: "NIKON", model: "D7000" };
    const [row] = await ctx.db
      .insert(assets)
      .values({
        source: "archive",
        cldPublicId: up.publicId,
        etag: up.etag,
        phash: up.phash,
        width: up.width,
        height: up.height,
        qualityScore: 0.8,
        pipeline: { ingest: { commons, mediaMetadata: {}, hint: { projectId } }, steps: {} },
      })
      .returning();
    await runPipeline(ctx.deps, row.id);
    const [done] = await ctx.db.select().from(assets).where(eq(assets.id, row.id));
    return done;
  }
  const load = async (id: string) => (await ctx.db.select().from(assets).where(eq(assets.id, id)))[0];
  const codes = (a: { trustReasons: { code: string }[] | null }) => (a.trustReasons ?? []).map((r) => r.code);
  const audits = async (id: string) => (await ctx.db.select({ n: count() }).from(auditLog).where(eq(auditLog.assetId, id)))[0].n;

  let original: Awaited<ReturnType<typeof ingest>>;
  let copy: Awaited<ReturnType<typeof ingest>>;

  it("scores an archive photo inside its site and dates as VERIFIED and writes it back", async () => {
    original = await ingest(await synthScene(1), p1, { lat: 11.1049, lng: 77.3518, date: "2023-03-01T10:00:00" }, "noyyal-river-bank.jpg");
    expect(original).toMatchObject({ trustBand: "VERIFIED", status: "ready" });
    expect(codes(original)).toEqual(expect.arrayContaining(["LOCATION_ARCHIVE", "TIME_IN_WINDOW", "UNIQUE", "AUTH_CLEAR", "QUALITY_OK", "PROVENANCE_CAMERA"]));
    expect(original.scoredAt).toBeTruthy();
    const side = await ctx.media.store.readSidecar(original.cldPublicId);
    expect(side?.tags).toContain("trust_verified");
    expect(side?.metadata).toMatchObject({ trust_band: "VERIFIED", trust_score: String(original.trustScore) });
  });

  it("a copy submitted later to another project is REUSED; the original only gets a note", async () => {
    const bytes = await synthScene(1);
    copy = await ingest(bytes, p2, { lat: 17.4643, lng: 78.3737, date: "2024-11-02T09:00:00" }, "lake-cleanup-drive.jpg");
    expect(copy).toMatchObject({ trustBand: "FLAGGED", status: "flagged", trustScore: 40 });
    expect(copy.trustReasons?.filter((r) => r.kind === "hard").map((r) => r.code)).toEqual(["REUSED"]);
    expect(copy.trustReasons?.find((r) => r.code === "REUSED")?.detail).toMatchObject({ otherAsset: original.id, otherProject: "Noyyal cleanup" });

    const o = await load(original.id);
    expect(o.trustBand).toBe("VERIFIED");
    expect(codes(o)).toContain("COPY_LATER_SUBMITTED");
    const rows = await ctx.db.select().from(duplicates);
    expect(rows.map((r) => [r.assetId === copy.id ? "copy" : "orig", r.matchIsLater, r.sameProject, r.exact]).sort()).toEqual([
      ["copy", false, false, true],
      ["orig", true, false, true],
    ]);
    expect((await verifyAllChains(ctx.db)).ok).toBe(true);
  });

  it("order-independent: when the later copy is scored first, the original's arrival flags it", async () => {
    const later = await ingest(await synthScene(2), p2, { lat: 17.4643, lng: 78.3737, date: "2024-11-02T12:00:00" }, "lake-shore.jpg");
    expect(later.trustBand).toBe("VERIFIED");
    const before = await audits(later.id);
    const earlier = await ingest(await synthScene(2), p1, { lat: 11.1049, lng: 77.3518, date: "2023-03-02T08:00:00" }, "noyyal-bridge.jpg");
    expect(earlier.trustBand).toBe("VERIFIED");
    const l = await load(later.id);
    expect(l).toMatchObject({ trustBand: "FLAGGED", status: "flagged" });
    expect(codes(l)).toContain("REUSED");
    expect(await audits(later.id)).toBe(before + 1); // one trust.rescore row
    const side = await ctx.media.store.readSidecar(l.cldPublicId);
    expect(side?.tags).toContain("trust_flagged");
    expect(side?.tags).not.toContain("trust_verified");

    // Re-scoring again changes nothing and writes nothing.
    expect(await rescoreAsset(ctx.db, ctx.media, later.id, "again")).toMatchObject({ changed: false });
    expect(await audits(later.id)).toBe(before + 1);
    expect((await verifyAllChains(ctx.db)).ok).toBe(true);
  });

  it("changing a project's dates re-scores its photos", async () => {
    const out = await updateProject(ctx.db, ctx.media, p1, { startDate: "2023-06-01", endDate: "2023-06-02" });
    expect(out?.changed).toEqual(["startDate", "endDate"]);
    expect(out?.rescore?.rescored).toBeGreaterThanOrEqual(2);
    const o = await load(original.id);
    expect(codes(o)).toContain("TIME_OUTSIDE");
    expect(o.trustScore).toBeLessThan(original.trustScore!);
    const sys = await ctx.db.select().from(auditLog).where(and(isNull(auditLog.assetId), eq(auditLog.action, "project.updated")));
    expect(sys).toHaveLength(1);
    // Put it back: scores return.
    await updateProject(ctx.db, ctx.media, p1, { startDate: "2023-03-01", endDate: "2023-03-02" });
    expect((await load(original.id)).trustScore).toBe(original.trustScore);
    await expect(updateProject(ctx.db, ctx.media, p1, { startDate: "2023-04-01", endDate: "2023-03-01" })).rejects.toThrow(RangeError);
    expect(await updateProject(ctx.db, ctx.media, p1, { name: "Noyyal cleanup" })).toMatchObject({ changed: [], rescore: null });
  });

  it("review: note required; a decision sets status but never the score or band", async () => {
    const q = await listReviewQueue(ctx.db, ctx.media);
    expect(q.items.map((i) => i.id)).toContain(copy.id);
    expect(q.counts.REUSED).toBeGreaterThanOrEqual(1);
    expect((await listReviewQueue(ctx.db, ctx.media, { reason: "REUSED" })).items.every((i) => i.flags.includes("REUSED"))).toBe(true);
    expect(q.items.find((i) => i.id === copy.id)?.reasons.find((r) => r.code === "REUSED")?.sentence).toMatch(/^A \d+% match of a photo already in Noyyal cleanup from 2023-03-01\.$/);

    await expect(decideReview(ctx.db, ctx.media, { assetId: copy.id, decision: "approve", note: "  " })).rejects.toThrow(ReviewError);
    const before = await audits(copy.id);
    const out = await decideReview(ctx.db, ctx.media, { assetId: copy.id, decision: "reject", note: "Same photo as the Noyyal drive", actor: "asha" });
    expect(out).toMatchObject({ status: "rejected", band: "FLAGGED", score: 40 });
    const c = await load(copy.id);
    expect(c).toMatchObject({ status: "rejected", trustBand: "FLAGGED", trustScore: 40, review: { decision: "reject", note: "Same photo as the Noyyal drive", actor: "asha" } });
    expect(c.moderation?.status).toBe("rejected");
    expect((await ctx.media.store.readSidecar(c.cldPublicId))?.moderation).toBe("rejected");
    expect(await audits(copy.id)).toBe(before + 1);
    const [row] = await ctx.db.select().from(auditLog).where(and(eq(auditLog.assetId, copy.id), eq(auditLog.action, "review.reject")));
    expect(row).toMatchObject({ actor: "reviewer:asha", detail: { note: "Same photo as the Noyyal drive", band: "FLAGGED" } });
    expect((await listReviewQueue(ctx.db, ctx.media)).items.map((i) => i.id)).not.toContain(copy.id);

    // A reviewer's decision survives re-scoring.
    await rescoreAsset(ctx.db, ctx.media, copy.id, "after review");
    expect((await load(copy.id)).status).toBe("rejected");
    expect((await verifyAllChains(ctx.db)).ok).toBe(true);
  });

  it("statusFor keeps reviewer decisions", () => {
    expect(statusFor("VERIFIED", "processing")).toBe("ready");
    expect(statusFor("NEEDS_REVIEW", "ready")).toBe("flagged");
    expect(statusFor("FLAGGED", "approved")).toBe("approved");
    expect(statusFor("VERIFIED", "rejected")).toBe("rejected");
  });
});
