import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Routes use the process-wide config/DB/providers: point them at temp dirs before importing.
let dir: string;
type Handler = (req: Request, ctx?: unknown) => Promise<Response>;
let routes: { token: Handler; ticket: Handler; mockUpload: Handler; confirm: Handler; status: (req: Request, ctx: unknown) => Promise<Response> };
let lib: {
  getDb: typeof import("@/lib/db/client").getDb;
  closeDb: typeof import("@/lib/db/client").closeDb;
  drainQueue: typeof import("@/lib/pipeline").drainQueue;
  schema: typeof import("@/lib/db/schema");
  verifyAllChains: typeof import("@/lib/audit").verifyAllChains;
};

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "saakshi-flow-"));
  process.env.PGLITE_DIR = path.join(dir, "pglite");
  process.env.MEDIA_MOCK_DIR = path.join(dir, "media");
  routes = {
    token: (await import("@/app/api/capture/token/route")).POST,
    ticket: (await import("@/app/api/uploads/ticket/route")).POST,
    mockUpload: (await import("@/app/api/uploads/mock/route")).POST,
    confirm: (await import("@/app/api/uploads/confirm/route")).POST,
    status: (await import("@/app/api/assets/[id]/status/route")).GET as never,
  };
  lib = {
    ...(await import("@/lib/db/client")),
    ...(await import("@/lib/pipeline")),
    schema: await import("@/lib/db/schema"),
    ...(await import("@/lib/audit")),
  };
  const db = await lib.getDb();
  const [p] = await db
    .insert(lib.schema.projects)
    .values({ name: "Lake clean-up", slug: "lake", type: "water", centerLat: 17.4642, centerLng: 78.3736, radiusM: 300, startDate: "2025-01-01", endDate: "2030-12-31" })
    .returning();
  await db.insert(lib.schema.spots).values({ projectId: p.id, name: "Shore", slug: "lake-shore", lat: 17.4642, lng: 78.3736, radiusM: 40 });
}, 60_000);

afterAll(async () => {
  await lib?.closeDb();
  await rm(dir, { recursive: true, force: true });
});

const json = (body: unknown) => new Request("http://localhost:3000/x", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

async function upload(context: Record<string, string>) {
  const ticket = await (await routes.ticket(json({ context }))).json();
  const form = new FormData();
  for (const [k, v] of Object.entries(ticket.fields as Record<string, string>)) form.set(k, v);
  // What Witness Capture sends: a canvas-encoded JPEG, no EXIF.
  const jpeg = await sharp(await readFile(path.join(__dirname, "fixtures", "scene-a.png"))).jpeg({ quality: 90 }).toBuffer();
  form.set("file", new File([new Uint8Array(jpeg)], "shot.jpg", { type: "image/jpeg" }));
  const res = await routes.mockUpload(new Request(`http://localhost:3000${ticket.uploadUrl}`, { method: "POST", body: form }));
  return { ticket, res, response: await res.json() };
}

describe("capture → ticket → upload → confirm → pipeline (mock provider, HTTP handlers)", () => {
  let token: string;

  it("issues a capture token scoped to the project", async () => {
    const res = await routes.token(json({ project: "lake" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.project).toMatchObject({ slug: "lake" });
    expect(Date.parse(body.expiresAt) - Date.now()).toBeGreaterThan(14 * 60_000);
    token = body.token;
    expect((await routes.token(json({ project: "nope" }))).status).toBe(404);
  });

  it("attests a witness capture and assigns it by its capture hint", async () => {
    const { res, response } = await upload({
      source: "witness",
      token,
      client_captured_at: new Date().toISOString(),
      fix_timestamp: new Date(Date.now() - 5000).toISOString(),
      device_lat: "17.46421",
      device_lng: "78.37361",
      device_accuracy_m: "8",
      project: "lake",
    });
    expect(res.status).toBe(200);
    expect(response.public_id).toMatch(/^saakshi\/evidence\//);

    // The browser forwards the provider response; a forged context in it must not matter.
    // Nor do the analysis fields: only public_id and version are signed.
    const forged = { ...response, phash: "ffffffffffffffff", etag: "forged", width: 1, height: 1, media_metadata: { GPSLatitude: "0", DateTimeOriginal: "2001:01:01 00:00:00" }, context: { custom: { ...response.context.custom, device_accuracy_m: "1", project: "elsewhere" } } };
    const confirmed = await (await routes.confirm(json({ provider: "mock", response: forged }))).json();
    expect(confirmed).toMatchObject({ created: true, source: "witness", attested: true, reasons: [] });
    // Confirm is idempotent (the webhook may deliver the same upload again).
    expect(await (await routes.confirm(json({ provider: "mock", response }))).json()).toMatchObject({ assetId: confirmed.assetId, created: false });

    await lib.drainQueue();
    const status = await (await routes.status(new Request("http://x"), { params: Promise.resolve({ id: confirmed.assetId }) })).json();
    expect(status).toMatchObject({ status: "ready", source: "witness", attested: true, failed: false });
    const db = await lib.getDb();
    const [a] = await db.select().from(lib.schema.assets).where(eq(lib.schema.assets.id, confirmed.assetId));
    expect(a).toMatchObject({ assignmentMethod: "capture_hint", deviceAccuracyM: 8, exifSource: "none" });
    expect(a.phash).not.toBe("ffffffffffffffff");
    expect(a.etag).not.toBe("forged");
    expect(a.width).toBeGreaterThan(1);
    expect(a.spotId).toBeTruthy();
    expect(a.capture?.deviceFix).toMatchObject({ lat: 17.46421, lng: 78.37361, accuracyM: 8 }); // from the stored ticket
    // All three times are kept: device shutter, server ticket (the anchor), server confirm.
    expect(a.capture?.clientCapturedAt).toBeTruthy();
    expect(a.capture?.ticketIssuedAt).toBeTruthy();
    expect(Math.abs(Date.parse(a.capture!.ticketIssuedAt!) - Date.parse(a.capture!.clientCapturedAt!))).toBeLessThan(120_000);
    expect(Date.parse(a.capture!.serverReceivedAt)).toBeGreaterThanOrEqual(Date.parse(a.capture!.ticketIssuedAt!));
    const [t] = await db.select().from(lib.schema.captureTokens).where(eq(lib.schema.captureTokens.id, a.captureTokenId!));
    expect(t.usedAt).toBeTruthy();
    expect((await lib.verifyAllChains(db)).ok).toBe(true);
  });

  it("does not attest low-accuracy or tokenless captures, and marks gallery uploads as upload", async () => {
    const low = await upload({ source: "witness", token, client_captured_at: new Date().toISOString(), fix_timestamp: new Date().toISOString(), device_lat: "17.4642", device_lng: "78.3736", device_accuracy_m: "250", low_accuracy: "1" });
    expect(await (await routes.confirm(json({ provider: "mock", response: low.response }))).json()).toMatchObject({ attested: false, reasons: [{ code: "low_accuracy" }] });

    const gallery = await upload({ source: "upload", project: "lake", uploader_lat: "17.40", uploader_lng: "78.40", uploader_accuracy_m: "30" });
    const g = await (await routes.confirm(json({ provider: "mock", response: gallery.response }))).json();
    expect(g).toMatchObject({ source: "upload", attested: false });
    await lib.drainQueue();
    const db = await lib.getDb();
    const [a] = await db.select().from(lib.schema.assets).where(eq(lib.schema.assets.id, g.assetId));
    expect(a.capture?.uploaderLocation).toMatchObject({ lat: 17.4, lng: 78.4 });
    expect(a.capture?.deviceFix).toBeNull();
    expect(a.assignmentMethod).toBe("capture_hint"); // ?project= on the capture page
  });

  it("stores a photo queued offline as a witness capture that is never attested (B5.12)", async () => {
    const at = new Date().toISOString();
    const q = await upload({ source: "witness", token, client_captured_at: at, fix_timestamp: at, device_lat: "17.4642", device_lng: "78.3736", device_accuracy_m: "8", taken_offline: "1" });
    const r = await (await routes.confirm(json({ provider: "mock", response: q.response }))).json();
    expect(r).toMatchObject({ source: "witness", attested: false });
    expect(r.reasons[0]).toEqual({ code: "taken_offline", message: "Taken offline: time from your phone." });
  });

  it("rejects tampered tickets and forged upload responses", async () => {
    const ticket = await (await routes.ticket(json({ context: { source: "witness" } }))).json();
    const form = new FormData();
    for (const [k, v] of Object.entries(ticket.fields as Record<string, string>)) form.set(k, v);
    form.set("context", "source=witness|project=someone-else");
    form.set("file", new File([new Uint8Array(await readFile(path.join(__dirname, "fixtures", "scene-b.png")))], "x.png"));
    expect((await routes.mockUpload(new Request("http://localhost:3000/api/uploads/mock", { method: "POST", body: form }))).status).toBe(401);

    const { response } = await upload({ source: "witness" });
    expect((await routes.confirm(json({ provider: "mock", response: { ...response, public_id: "saakshi/evidence/forged" } }))).status).toBe(401);
    expect((await routes.confirm(json({ provider: "cloudinary", response }))).status).toBe(400);
  });

  it("rejects HEIC in mock mode with a clear message", async () => {
    const ticket = await (await routes.ticket(json({ context: { source: "upload" } }))).json();
    const form = new FormData();
    for (const [k, v] of Object.entries(ticket.fields as Record<string, string>)) form.set(k, v);
    const heic = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftypheic"), Buffer.alloc(64)]);
    form.set("file", new File([new Uint8Array(heic)], "IMG_0001.HEIC"));
    const res = await routes.mockUpload(new Request("http://localhost:3000/api/uploads/mock", { method: "POST", body: form }));
    expect(res.status).toBe(400);
    expect((await res.json()).error.message).toMatch(/HEIC photos aren't supported in mock mode/);
  });
});
