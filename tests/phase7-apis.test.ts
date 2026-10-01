import { eq } from "drizzle-orm";
import { unzipSync, strFromU8 } from "fflate";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assets, projects, spots, type CaptureInfo } from "@/lib/db/schema";
import { assetLayers, ensureSandbox, sandboxProjectId, startOfIstDay, stats, sweepSandbox, tryToFoolIt } from "@/lib/demo-apis";
import { buildEvidencePack } from "@/lib/evidence-pack";
import { liveSince, liveStream, type LiveEvent } from "@/lib/live";
import { runPipeline } from "@/lib/pipeline/runner";
import { createTestContext, litterScene, synthScene, type TestContext } from "./helpers";

const SITE = { lat: 12.9716, lng: 77.5946 };

describe("APIs for Phase 7", () => {
  let ctx: TestContext;
  let projectId: string;
  let spotId: string;

  beforeAll(async () => {
    ctx = await createTestContext();
    [{ id: projectId }] = await ctx.db
      .insert(projects)
      .values({ name: "Lake clean-up", slug: "lake", type: "cleanup", centerLat: SITE.lat, centerLng: SITE.lng, radiusM: 300, startDate: "2026-09-01", endDate: "2026-10-30", minPairGapHours: 0.5 })
      .returning();
    [{ id: spotId }] = await ctx.db.insert(spots).values({ projectId, name: "Ghat", slug: "ghat", lat: SITE.lat, lng: SITE.lng, radiusM: 30 }).returning();
  }, 60_000);
  afterAll(async () => {
    await ctx?.close();
  });

  async function witness(at: string) {
    const up = await ctx.media.upload({ file: await litterScene(0.1, 3), folder: "saakshi/evidence", context: { filename: "ghat-checkin.jpg" } });
    const capture: CaptureInfo = { tokenId: null, clientCapturedAt: at, ticketIssuedAt: at, serverReceivedAt: at, deviceFix: { lat: SITE.lat, lng: SITE.lng, accuracyM: 6 }, uploaderLocation: null, attested: true, reasons: [] };
    const [w] = await ctx.db
      .insert(assets)
      .values({ source: "witness", cldPublicId: up.publicId, etag: up.etag, phash: up.phash, capture, pipeline: { ingest: { mediaMetadata: up.mediaMetadata, hint: { projectId, spotId } }, steps: {} } })
      .returning();
    return w.id;
  }

  it("SSE: an arrival, then a status event once the witness photo is scored", async () => {
    const abort = new AbortController();
    const reader = liveStream(ctx.db, ctx.media, { since: new Date(Date.now() - 1000), pollMs: 40, signal: abort.signal }).getReader();
    const events: Array<{ event: string; data: LiveEvent }> = [];
    let buf = "";
    const read = (async () => {
      const dec = new TextDecoder();
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value);
        let i;
        while ((i = buf.indexOf("\n\n")) >= 0) {
          const block = buf.slice(0, i);
          buf = buf.slice(i + 2);
          const ev = /^event: (.+)$/m.exec(block)?.[1];
          const data = /^data: (.+)$/m.exec(block)?.[1];
          if (ev && data) events.push({ event: ev, data: JSON.parse(data) as LiveEvent });
        }
      }
    })();
    const id = await witness(new Date().toISOString());
    const deadline = Date.now() + 8000;
    while (!events.some((e) => e.data.id === id) && Date.now() < deadline) await new Promise((r) => setTimeout(r, 30));
    await runPipeline(ctx.deps, id);
    while (!events.some((e) => e.data.id === id && e.data.band) && Date.now() < deadline) await new Promise((r) => setTimeout(r, 30));
    abort.abort();
    await read;
    const mine = events.filter((e) => e.data.id === id);
    expect(mine[0]).toMatchObject({ event: "arrival", data: { status: "processing", band: null, attested: true } });
    const scored = mine.find((e) => e.data.band);
    expect(scored).toMatchObject({ event: "status", data: { band: "VERIFIED", status: "ready" } });
    expect(scored!.data.location).toEqual(SITE);
    // Pipeline steps touch updated_at many times; only real changes are sent.
    expect(mine.length).toBeLessThanOrEqual(3);
  });

  it("?since= fallback returns the latest state once per photo, with a cursor", async () => {
    const r = await liveSince(ctx.db, ctx.media, new Date(Date.now() - 60_000));
    expect(r.events.length).toBeGreaterThanOrEqual(1);
    expect(r.events.every((e) => e.thumbUrl.includes("e_blur_faces"))).toBe(true);
    expect(await liveSince(ctx.db, ctx.media, new Date(r.cursor))).toMatchObject({ events: [] });
  });

  it("live events carry the place and the arrival's first reason once scored", async () => {
    const r = await liveSince(ctx.db, ctx.media, new Date(Date.now() - 60_000));
    const e = r.events.find((x) => x.band);
    expect(e?.reason).toMatch(/\w/);
    expect(e && "place" in e).toBe(true);
  });

  it("Witness Wall: counters from SQL, latest arrivals, operator rehearsals only when allowed (B5.8)", async () => {
    const { wallCounters, wallView } = await import("@/lib/wall/view");
    expect(await wallCounters(ctx.db, { production: false, minConfidence: 0.5 })).toEqual({ total: 1, verified: 1, flagged: 0 });
    // Production: a mock-scored photo counts as a photo, never as verified.
    expect(await wallCounters(ctx.db, { production: true, minConfidence: 0.5 })).toEqual({ total: 1, verified: 0, flagged: 0 });
    // Yesterday's photos are not today's.
    expect(await wallCounters(ctx.db, { production: false, minConfidence: 0.5 }, new Date(Date.now() + 2 * 86_400_000))).toEqual({ total: 0, verified: 0, flagged: 0 });
    const w = await wallView(ctx.db, ctx.media, { appUrl: "https://s.example", policy: { production: false, minConfidence: 0.5 }, operator: false });
    expect(w.arrivals).toHaveLength(1);
    expect(w.arrivals[0]).toMatchObject({ place: "Ghat", band: "VERIFIED" });
    expect(w.arrivals[0].src).toContain("e_blur_faces");
    expect(w.qr.url).toBe("https://s.example/capture");
    expect(w).toMatchObject({ operator: false, rehearsals: [], counting: "db", live: true });
    const { operatorAllowed } = await import("@/lib/admin");
    expect(operatorAllowed(null)).toBe(false);
    expect(operatorAllowed("1")).toBe(true); // development
  });

  it("stats: counters from SQL", async () => {
    const s = await stats(ctx.db);
    expect(s).toMatchObject({ photos: 1, verified: 1, flagged: 0, spots: 1, witnessToday: 1, projects: 1 });
    expect(startOfIstDay(new Date("2026-09-28T20:00:00Z")).toISOString()).toBe("2026-09-28T18:30:00.000Z");
    // Production: counts that rest on provider output include real-provider rows only.
    expect(await stats(ctx.db, new Date(), { production: true, minConfidence: 0.5 })).toMatchObject({ photos: 1, verified: 0, flagged: 0, pairs: 0 });
    expect(s).toMatchObject({ mockDerived: { verified: 1 } });
  });

  it("layers: photo, capture, pHash bits, tags, mask, trust and proof strip", async () => {
    const [a] = await ctx.db.select().from(assets).where(eq(assets.source, "witness"));
    const l = (await assetLayers(ctx.db, ctx.media, a.id, "https://s.example"))!;
    expect(l.phash?.bits).toHaveLength(64);
    expect(l.phash?.bits?.every((b) => b === 0 || b === 1)).toBe(true);
    expect(l.capture.attestation).toMatchObject({ attested: true });
    expect(l.mask?.url).toContain("e_extract");
    expect(l.trust.band).toBe("VERIFIED");
    expect(l.trust.reasons[0].sentence.length).toBeGreaterThan(5);
    expect(l.proofStrip.url).toContain(`l_saakshi:qr:${a.id}`);
    expect(l.ai.regions).toEqual([]);
    expect(await assetLayers(ctx.db, ctx.media, "00000000-0000-4000-8000-000000000000", "x")).toBeNull();
  });

  it("Try to fool it: a sandbox upload returns its ledger; the sandbox empties after 24 h", async () => {
    const out = await tryToFoolIt(ctx.deps, await synthScene(42), "my-photo.jpg", "https://s.example");
    expect(out.band).toBeTruthy();
    expect(out.reasons.map((r) => r.code)).toEqual(expect.arrayContaining(["LOCATION_NONE", "UNIQUE"])); // no GPS in the file; nothing like it in the library
    expect(out.evidenceUrl).toBe(`https://s.example/e/${out.id}`);
    const [a] = await ctx.db.select().from(assets).where(eq(assets.id, out.id));
    expect(a.projectId).toBe(sandboxProjectId());
    expect(await ensureSandbox(ctx.db)).toBe(sandboxProjectId());
    expect(await sweepSandbox(ctx.db, ctx.media)).toBe(0);
    expect(await sweepSandbox(ctx.db, ctx.media, new Date(Date.now() + 25 * 3_600_000))).toBe(1);
    expect(await ctx.db.select().from(assets).where(eq(assets.id, out.id))).toHaveLength(0);
  });

  it("sandbox at the stage venue: a genuine photo with camera GPS reaches Verified; an internet image can't", async () => {
    const { readFile } = await import("node:fs/promises");
    const path = await import("node:path");
    // The fixture carries camera EXIF: GPS 12.971667, 77.5946 and 2025-03-14 09:30 IST.
    const venue = { lat: 12.9716, lng: 77.5946 };
    const now = new Date("2025-03-14T06:00:00Z");
    const genuine = await tryToFoolIt(ctx.deps, await readFile(path.join(__dirname, "fixtures", "geotagged.jpg")), "at-the-venue.jpg", "https://s.example", { venue, now });
    expect(genuine.band).toBe("VERIFIED");
    expect(genuine.reasons.map((r) => r.code)).toEqual(expect.arrayContaining(["LOCATION_EXIF", "TIME_IN_WINDOW"]));
    expect(genuine.site).toMatchObject({ radiusM: 300 });
    const web = await tryToFoolIt(ctx.deps, await synthScene(77), "downloaded-from-google.jpg", "https://s.example", { venue, now });
    expect(web.band).not.toBe("VERIFIED");
    expect(web.reasons.map((r) => r.code)).toContain("LOCATION_NONE");
    // Without a venue: no site, and the response says so.
    const nosite = await tryToFoolIt(ctx.deps, await synthScene(78), "another.jpg", "https://s.example");
    expect(nosite.note).toBe("No site set, so nothing here can be verified.");
    expect(nosite.band).not.toBe("VERIFIED");
  });

  it("evidence pack: manifest plus face-blurred photos, no originals", async () => {
    const pack = (await buildEvidencePack(ctx.db, ctx.media, projectId, "https://s.example"))!;
    const files = unzipSync(pack.zip);
    const manifest = JSON.parse(strFromU8(files["manifest.json"]));
    expect(manifest.count).toBe(1);
    expect(manifest.assets[0]).toMatchObject({ source: "witness", trust: { band: "VERIFIED" }, gps: { lat: SITE.lat, lng: SITE.lng } });
    expect(manifest.assets[0].phash).toMatch(/^[0-9a-f]{16}$/);
    expect(files[manifest.assets[0].file].subarray(0, 3)).toEqual(new Uint8Array([0xff, 0xd8, 0xff])); // JPEG
    expect(Object.keys(files).sort()).toEqual(["README.txt", "manifest.json", manifest.assets[0].file].sort());
  });
});
