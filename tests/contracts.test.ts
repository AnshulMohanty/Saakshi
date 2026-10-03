/**
 * Contract tests: the exact requests the real providers send, built offline against a recording
 * fetch, checked against the documented shapes (docs/external-apis.md), plus how each documented
 * response is read. No network, no keys.
 */
import cloudinary from "cloudinary";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { openPglite } from "@/lib/db/client";
import { providerUsage } from "@/lib/db/schema";
import { cloudinarySignature } from "@/lib/media/transform";
import { phash } from "@/lib/phash";
import { openAiCost } from "@/lib/pricing";
import { strictJsonSchema } from "@/lib/providers/ai/json-schema";
import { OpenAIProvider, OpenAIRefusalError, VISION_FALLBACK_PROMPT } from "@/lib/providers/ai/real";
import { ParsedSearch, PhotoAnalysisOutput } from "@/lib/providers/ai/schemas";
import { ExtractRefusedError } from "@/lib/media/extract-refusal";
import { isAiVisionQuotaError } from "@/lib/providers/analysis/fallback";
import { apiTagName, CloudinaryAnalysisProvider, readModeration, readTags, readWatermark } from "@/lib/providers/analysis/real";
import { CloudinaryClient, signUploadParams, stringToSign } from "@/lib/providers/cloudinary/client";
import { callWithRetry, ProviderHttpError, type FetchLike } from "@/lib/providers/http";
import { CloudinaryMediaProvider, mediaAssetFromUpload, type CloudinaryOptions } from "@/lib/providers/media/real";
import { flushUsage, recordUsage, type UsageEntry } from "@/lib/usage";

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  form: Record<string, string | string[]>;
  file: { size: number; type: string } | string | null;
  json: unknown;
  text: string | null;
}

async function capture(url: string, init: RequestInit = {}): Promise<Call> {
  const c: Call = { url, method: init.method ?? "GET", headers: (init.headers ?? {}) as Record<string, string>, form: {}, file: null, json: null, text: null };
  if (init.body instanceof FormData) {
    for (const [k, v] of init.body.entries()) {
      if (k === "file") c.file = typeof v === "string" ? v : { size: v.size, type: v.type };
      else if (k.endsWith("[]")) ((c.form[k.slice(0, -2)] ??= []) as string[]).push(String(v));
      else c.form[k] = String(v);
    }
  } else if (init.body instanceof URLSearchParams) {
    c.form = Object.fromEntries(init.body.entries());
  } else if (typeof init.body === "string") {
    c.text = init.body;
    try {
      c.json = JSON.parse(init.body);
    } catch {
      // not JSON
    }
  }
  return c;
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

function recorder(respond: (c: Call, i: number) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const sleeps: number[] = [];
  const usage: UsageEntry[] = [];
  const fetch: FetchLike = async (url, init) => {
    const c = await capture(url, init);
    calls.push(c);
    return respond(c, calls.length - 1);
  };
  return { calls, sleeps, usage, deps: { fetch, sleep: async (ms: number) => void sleeps.push(ms), onUsage: (u: UsageEntry) => void usage.push(u) } };
}

/** A small real JPEG (the fingerprint needs pixels). */
const testJpeg = (seed = 1) =>
  sharp({ create: { width: 64, height: 48, channels: 3, background: { r: 40 * seed, g: 90, b: 160 } } })
    .composite([{ input: { create: { width: 20, height: 16, channels: 3, background: "#fff" } }, left: 4 * seed, top: 6 }])
    .jpeg()
    .toBuffer();

const CREDS = { cloudName: "demo", apiKey: "123456789012345", apiSecret: "abcd" };
const NOW = Date.UTC(2026, 8, 28, 6, 0, 0);
const cld = (deps: ReturnType<typeof recorder>["deps"], o: Partial<CloudinaryOptions> = {}) =>
  new CloudinaryMediaProvider({ ...CREDS, ...o }, { deps, now: () => NOW, exifDefaultOffset: "+05:30" });

/** Recomputes a form's signature the way Cloudinary checks it. */
const formSignature = (form: Record<string, string | string[]>) => {
  const { signature: _s, api_key: _k, ...rest } = form;
  void _s;
  void _k;
  return signUploadParams(rest, CREDS.apiSecret);
};

const UPLOAD_RESPONSE = {
  public_id: "saakshi/evidence/abc",
  asset_id: "3515c6000a548515f1134043f9785c2f",
  version: 1719304891,
  etag: "5ed2d5d45a5aa3a8b4b8a0a0b5e1b8d1",
  width: 4000,
  height: 3000,
  format: "jpg",
  bytes: 2345678,
  type: "authenticated",
  phash: "BA19C8AB5FA05A59",
  faces: [
    [10, 20, 30, 40],
    [50, 60, 70, 80],
  ],
  image_metadata: { DateTimeOriginal: "2025:03:14 09:30:00", GPSLatitude: "12 deg 58' 18.00\" N", GPSLatitudeRef: "North", GPSLongitude: "77 deg 35' 40.00\" E", GPSLongitudeRef: "East", Make: "Google" },
  quality_analysis: { focus: 0.83 },
};

describe("Cloudinary signing", () => {
  it("matches the official SDK's api_sign_request, arrays included", () => {
    const params = { timestamp: 1719304891, public_id: "saakshi/evidence/abc", tags: "saakshi,band-verified", public_ids: ["a", "b"], type: "authenticated", eager: "c_fill,w_480/e_blur_faces|w_1280" };
    expect(signUploadParams(params, "abcd")).toBe(cloudinary.v2.utils.api_sign_request(params, "abcd"));
    // Documented example (authentication_signatures): eager, public_id, timestamp → sorted k=v joined by &.
    expect(stringToSign({ timestamp: 1315060510, public_id: "sample_image", eager: "w_400,h_300,c_pad|w_260,h_200,c_crop", file: "x", api_key: "k" })).toBe(
      "eager=w_400,h_300,c_pad|w_260,h_200,c_crop&public_id=sample_image&timestamp=1315060510",
    );
  });
});

describe("CloudinaryMediaProvider contract", () => {
  it("upload: signed multipart POST to /image/upload with the documented parameters", async () => {
    const r = recorder(() => json(UPLOAD_RESPONSE));
    const photo = await testJpeg();
    const asset = await cld(r.deps).upload({ file: photo, folder: "saakshi/evidence", publicId: "saakshi/evidence/abc", tags: ["saakshi", "witness"], context: { filename: "a=b|c.jpg", source: "witness" } });
    const [c] = r.calls;
    expect(c.method).toBe("POST");
    expect(c.url).toBe("https://api.cloudinary.com/v1_1/demo/image/upload");
    expect(c.form).toMatchObject({
      public_id: "saakshi/evidence/abc",
      asset_folder: "saakshi/evidence",
      type: "authenticated",
      tags: "saakshi,witness",
      context: "filename=a\\=b\\|c.jpg|source=witness",
      media_metadata: "true",
      phash: "true",
      quality_analysis: "true",
      faces: "true",
      moderation: "manual",
      api_key: CREDS.apiKey,
      timestamp: String(NOW / 1000),
    });
    expect(c.form.eager).toBeUndefined();
    expect(c.form.signature).toBe(formSignature(c.form));
    expect(c.file).toMatchObject({ size: photo.length });
    // Response → MediaAsset (media_metadata=true returns image_metadata). The fingerprint is ours
    // (lib/phash.ts) from the uploaded bytes, not Cloudinary's phash; no extra request.
    expect(r.calls).toHaveLength(1);
    expect(asset).toMatchObject({ publicId: "saakshi/evidence/abc", phash: await phash(photo), facesCount: 2, qualityScore: 0.83, width: 4000, format: "jpg" });
    expect(asset.exif).toMatchObject({ takenAt: "2025-03-14T04:00:00.000Z", takenAtTzAssumed: true, make: "Google" });
    expect(asset.exif!.lat).toBeCloseTo(12.9717, 3);
    expect(r.usage[0]).toMatchObject({ provider: "cloudinary", operation: "upload", ok: true, attempts: 1, mode: "real" });
  });

  it("upload: QR codes are public (type upload, no moderation); CLD_EAGER adds the standard derivatives; URLs upload by reference", async () => {
    const r = recorder(() => json({ ...UPLOAD_RESPONSE, public_id: "saakshi/qr/x" }));
    await cld(r.deps).upload({ file: await testJpeg(), folder: "saakshi/qr", publicId: "saakshi/qr/x", access: "public" });
    expect(r.calls[0].form.type).toBe("upload");
    expect(r.calls[0].form.moderation).toBeUndefined();

    const stored = await testJpeg(7);
    const e = recorder((c) => (c.method === "GET" ? new Response(new Uint8Array(stored)) : json(UPLOAD_RESPONSE)));
    const byUrl = await cld(e.deps, { eager: true, deliveryType: "private" }).upload({ url: "https://upload.wikimedia.org/x.jpg", folder: "saakshi/archive" });
    // By reference we have no bytes: the fingerprint comes from the stored original (no transformation).
    expect(e.calls[1].url).toMatch(/^https:\/\/res\.cloudinary\.com\/demo\/image\/private\/s--[\w-]{8}--\/v1\/saakshi\/evidence\/abc$/);
    expect(byUrl.phash).toBe(await phash(stored));
    expect(e.usage[1].units).toEqual({ transformations: 0 });
    expect(e.calls[0].form.type).toBe("private");
    expect(String(e.calls[0].form.eager).split("|")).toEqual(["c_fill,g_auto,w_480,h_360/e_blur_faces/f_auto,q_auto", "c_limit,w_1280/e_blur_faces/f_auto,q_auto", "c_fill,g_auto,w_800,h_600/e_blur_faces/f_auto,q_auto"]);
    expect(e.calls[0].file).toBe("https://upload.wikimedia.org/x.jpg");
    expect(String(e.calls[0].form.public_id)).toMatch(/^saakshi\/archive\/[a-z0-9]{20}$/);
    expect(e.calls[0].form.signature).toBe(formSignature(e.calls[0].form));
  });

  it("exists: Admin API GET resource with Basic auth; 404 means no", async () => {
    const r = recorder((c) => (c.url.includes("missing") ? json({ error: { message: "Resource not found - missing" } }, 404) : json({ public_id: "x" })));
    const p = cld(r.deps);
    expect(await p.exists("saakshi/qr/present")).toBe(true);
    expect(await p.exists("saakshi/evidence/missing")).toBe(false);
    expect(r.calls.map((c) => c.url)).toEqual([
      "https://api.cloudinary.com/v1_1/demo/resources/image/upload/saakshi/qr/present",
      "https://api.cloudinary.com/v1_1/demo/resources/image/authenticated/saakshi/evidence/missing",
    ]);
    expect(r.calls[0].headers.authorization).toBe(`Basic ${Buffer.from(`${CREDS.apiKey}:${CREDS.apiSecret}`).toString("base64")}`);
    expect(r.calls).toHaveLength(2); // a 404 is an answer, not retried
  });

  it("resource: Admin API GET with media_metadata, phash, faces and quality_analysis; 404 means none", async () => {
    const stored = await testJpeg(3);
    const r = recorder((c) =>
      c.url.startsWith("https://res.cloudinary.com/")
        ? new Response(new Uint8Array(stored))
        : c.url.includes("missing")
          ? json({ error: { message: "Resource not found - missing" } }, 404)
          : json({ public_id: "saakshi/evidence/a", asset_id: "aid", etag: "e1", phash: "0123456789ABCDEF", width: 1600, height: 1200, format: "jpg", bytes: 10, faces: [[1, 2, 3, 4]], quality_analysis: { focus: 0.8 }, image_metadata: { Make: "NIKON" } }),
    );
    const p = cld(r.deps);
    const a = await p.resource("saakshi/evidence/a");
    // Our fingerprint of the stored original, not Cloudinary's phash field.
    expect(r.calls[1].url).toMatch(/\/image\/authenticated\/s--[\w-]{8}--\/v1\/saakshi\/evidence\/a$/);
    expect(a).toMatchObject({ phash: await phash(stored), width: 1600, facesCount: 1, qualityScore: 0.8, mediaMetadata: { Make: "NIKON" } });
    expect(await p.resource("saakshi/evidence/missing")).toBeNull();
    expect(r.calls[0].url).toBe("https://api.cloudinary.com/v1_1/demo/resources/image/authenticated/saakshi/evidence/a?media_metadata=true&phash=true&faces=true&quality_analysis=true");
  });

  it("destroy: signed Upload API POST image/destroy with the delivery type and CDN invalidation", async () => {
    const r = recorder(() => json({ result: "ok" }));
    await cld(r.deps).destroy("saakshi/sandbox/x");
    expect(r.calls[0].url).toBe("https://api.cloudinary.com/v1_1/demo/image/destroy");
    expect(r.calls[0].form).toMatchObject({ public_id: "saakshi/sandbox/x", type: "authenticated", invalidate: "true" });
    expect(r.calls[0].form.signature).toBe(formSignature(r.calls[0].form));
  });

  it("updateMetadata: structured metadata, merged context, tags added in one call, one remove per tag", async () => {
    const r = recorder(() => json({ public_ids: ["saakshi/evidence/abc"] }));
    await cld(r.deps).updateMetadata("saakshi/evidence/abc", { source: "witness", trust_score: "85", trust_band: "VERIFIED", project_id: "p1", captured_at: "2025-03-14T04:00:00.000Z" }, { tags: ["saakshi", "band-verified"], removeTags: ["band-needs-review", "band-flagged"] });
    expect(r.calls.map((c) => [c.url.split("/image/")[1], c.form.command ?? null, c.form.tag ?? null])).toEqual([
      ["metadata", null, null],
      ["context", "add", null],
      ["tags", "add", "saakshi,band-verified"],
      ["tags", "remove", "band-needs-review"],
      ["tags", "remove", "band-flagged"],
    ]);
    // Structured "date" fields take yyyy-mm-dd; context keeps the full timestamp.
    expect(r.calls[0].form).toMatchObject({ metadata: "trust_score=85|trust_band=VERIFIED|project_id=p1|captured_at=2025-03-14", public_ids: ["saakshi/evidence/abc"], type: "authenticated" });
    expect(r.calls[1].form.context).toBe("source=witness|trust_score=85|trust_band=VERIFIED|project_id=p1|captured_at=2025-03-14T04:00:00.000Z");
    for (const c of r.calls) expect(c.form.signature).toBe(formSignature(c.form));
  });

  it("setModeration: Admin API update with moderation_status", async () => {
    const r = recorder(() => json({ moderation: [{ status: "approved" }] }));
    await cld(r.deps).setModeration("saakshi/evidence/abc", "approved");
    expect(r.calls[0]).toMatchObject({ method: "POST", url: "https://api.cloudinary.com/v1_1/demo/resources/image/authenticated/saakshi/evidence/abc", form: { moderation_status: "approved" } });
  });

  it("raw PDFs: /raw/upload as authenticated; signed delivery URL, or the Download API URL as fallback", async () => {
    const r = recorder(() => json({ public_id: "saakshi/reports/r1.pdf", bytes: 999 }));
    const p = cld(r.deps);
    expect(await p.uploadRaw({ publicId: "saakshi/reports/r1.pdf", bytes: Buffer.from("%PDF"), contentType: "application/pdf" })).toEqual({ publicId: "saakshi/reports/r1.pdf", bytes: 999 });
    expect(r.calls[0].url).toBe("https://api.cloudinary.com/v1_1/demo/raw/upload");
    expect(r.calls[0].form).toMatchObject({ public_id: "saakshi/reports/r1.pdf", type: "authenticated", asset_folder: "saakshi/reports" });
    expect(p.rawUrl("saakshi/reports/r1.pdf")).toBe(`https://res.cloudinary.com/demo/raw/authenticated/${cloudinarySignature("", "saakshi/reports/r1.pdf", CREDS.apiSecret)}/v1/saakshi/reports/r1.pdf`);

    const d = new URL(cld(r.deps, { pdfDelivery: "download" }).rawUrl("saakshi/reports/r1.pdf"));
    expect(d.origin + d.pathname).toBe("https://api.cloudinary.com/v1_1/demo/raw/download");
    const q = Object.fromEntries(d.searchParams);
    expect(q).toMatchObject({ public_id: "saakshi/reports/r1.pdf", format: "pdf", type: "authenticated", timestamp: String(NOW / 1000), expires_at: String(NOW / 1000 + 3600), api_key: CREDS.apiKey });
    expect(q.signature).toBe(formSignature(q));
  });

  it("extractMask: one signed e_extract with every prompt; union mode fetches one per prompt and joins them", async () => {
    const left = await sharp({ create: { width: 8, height: 4, channels: 3, background: "#000" } }).composite([{ input: { create: { width: 4, height: 4, channels: 3, background: "#fff" } }, left: 0, top: 0 }]).png().toBuffer();
    const right = await sharp({ create: { width: 8, height: 4, channels: 3, background: "#000" } }).composite([{ input: { create: { width: 4, height: 4, channels: 3, background: "#fff" } }, left: 4, top: 0 }]).png().toBuffer();
    const r = recorder(() => new Response(new Uint8Array(left), { headers: { "content-type": "image/png" } }));
    const frame = [{ crop: "fill" as const, gravity: "auto" as const, width: 800, height: 600 }];
    const m = await cld(r.deps).extractMask("saakshi/evidence/abc", ["litter", "plastic waste"], { multiple: true, frame });
    expect(r.calls).toHaveLength(1);
    expect(m.maskUrl).toMatch(/^https:\/\/res\.cloudinary\.com\/demo\/image\/authenticated\/s--[\w-]{8}--\/c_fill,g_auto,w_800,h_600\/e_extract:prompt_\(litter;plastic%20waste\);multiple_true;mode_mask\/f_png\/v1\/saakshi\/evidence\/abc$/);
    expect(r.usage[0].units).toEqual({ transformations: 75 });

    let i = 0;
    const u = recorder(() => new Response(new Uint8Array(i++ === 0 ? left : right)));
    const union = await cld(u.deps, { extractMode: "union" }).extractMask("saakshi/evidence/abc", ["litter", "plastic waste"], { multiple: true, frame });
    expect(u.calls.map((c) => decodeURIComponent(c.url).match(/prompt_([^;/]+)/)?.[1])).toEqual(["litter", "plastic waste"]);
    const { data } = await sharp(union.buffer).greyscale().raw().toBuffer({ resolveWithObject: true });
    expect([...data].every((v) => v === 255)).toBe(true);
  });

  it("extractMask: when Cloudinary refuses the prompt list (400 'Invalid input for extract'), it asks prompt by prompt and joins what comes back", async () => {
    const left = await sharp({ create: { width: 8, height: 4, channels: 3, background: "#000" } }).composite([{ input: { create: { width: 4, height: 4, channels: 3, background: "#fff" } }, left: 0, top: 0 }]).png().toBuffer();
    const refused = () => new Response(null, { status: 400, headers: { "x-cld-error": "Invalid input for extract" } });
    const prompt = (c: Call) => {
      const u = decodeURIComponent(c.url);
      return u.match(/prompt_\(([^)]+)\)/)?.[1] ?? u.match(/prompt_([^;/]+)/)?.[1];
    };
    const frame = [{ crop: "fill" as const, gravity: "auto" as const, width: 800, height: 600 }];
    // The list and "plastic-waste" are refused; "litter" and "garbage" return masks.
    const r = recorder((c) => (["litter", "garbage"].includes(prompt(c) ?? "") ? new Response(new Uint8Array(left)) : refused()));
    const m = await cld(r.deps).extractMask("saakshi/evidence/abc", ["litter", "garbage", "plastic-waste"], { multiple: true, frame });
    expect(r.calls.map(prompt)).toEqual(["litter;garbage;plastic-waste", "litter", "garbage", "plastic-waste"]);
    expect(m).toMatchObject({ prompts: ["litter", "garbage"], refused: ["plastic-waste"] });
    expect(m.maskUrl).toContain("/e_extract:prompt_litter;multiple_true;mode_mask/");
    expect(r.calls.every((c) => r.calls.indexOf(c) === 0 || !c.url.includes("%3B"))).toBe(true);
    expect(r.sleeps).toEqual([]); // a 400 is not retried
    // Usage: the refused requests are recorded as failures with Cloudinary's reason; only masks count transformations.
    expect(r.usage.filter((u) => u.ok).map((u) => u.units.transformations)).toEqual([75, 75]);
    expect(r.usage.find((u) => !u.ok)?.error).toBe("cloudinary derived failed (HTTP 400): Invalid input for extract");

    // Every prompt refused: not measurable, no mask, no number.
    const none = recorder(() => refused());
    const err = await cld(none.deps).extractMask("saakshi/evidence/abc", ["litter", "garbage"], { multiple: true, frame }).catch((e) => e);
    expect(err).toBeInstanceOf(ExtractRefusedError);
    expect(err.message).toBe('Cloudinary refused the extraction for litter, garbage ("Invalid input for extract", HTTP 400)');
    expect(none.calls).toHaveLength(3);

    // Any other 400 is an error as before (no prompt-by-prompt retry).
    const other = recorder(() => new Response(null, { status: 400, headers: { "x-cld-error": "Invalid transformation" } }));
    await expect(cld(other.deps).extractMask("saakshi/evidence/abc", ["litter", "garbage"], { multiple: true, frame })).rejects.toThrow("cloudinary derived failed (HTTP 400): Invalid transformation");
    expect(other.calls).toHaveLength(1);
  });

  it("fetchDerived: 423 (derived asset being generated) is retried with backoff", async () => {
    const r = recorder((_c, n) => (n === 0 ? new Response("generating", { status: 423 }) : new Response(new Uint8Array([1, 2, 3]))));
    expect([...(await cld(r.deps).fetchDerived("saakshi/evidence/abc", [{ width: 100 }]))]).toEqual([1, 2, 3]);
    expect(r.calls).toHaveLength(2);
    expect(r.sleeps).toHaveLength(1);
    expect(r.usage[0]).toMatchObject({ ok: true, attempts: 2, operation: "derived" });
  });

  it("composite: layer mode signs one URL with an l_authenticated layer; server mode joins the halves and uploads with the labels as eager", async () => {
    const r = recorder(() => json({}));
    const layer = await cld(r.deps).composite({ publicId: "saakshi/a", label: "5 Sep 2017" }, { publicId: "saakshi/b", label: "9 Sep 2020" });
    expect(layer.mode).toBe("layer");
    expect(layer.url).toMatch(/\/image\/authenticated\/s--[\w-]{8}--\/.*l_authenticated:saakshi:b,c_fill,g_auto,w_800,h_600\/e_blur_faces\/fl_layer_apply,g_east\//);
    expect(r.calls).toHaveLength(0);

    const jpg = await sharp({ create: { width: 800, height: 600, channels: 3, background: "#468" } }).jpeg().toBuffer();
    const s = recorder((c) => (c.method === "GET" ? new Response(new Uint8Array(jpg)) : json({ public_id: "x" })));
    const server = await cld(s.deps, { compositeMode: "server" }).composite({ publicId: "saakshi/a", label: "5 Sep 2017" }, { publicId: "saakshi/b", label: "9 Sep 2020" });
    expect(s.calls.map((c) => c.method)).toEqual(["GET", "GET", "POST"]);
    expect(s.calls[0].url).toContain("/c_fill,g_auto,w_800,h_600/e_blur_faces/f_jpg,q_90/v1/saakshi/a");
    const up = s.calls[2];
    expect(up.form).toMatchObject({ type: "authenticated", asset_folder: "saakshi/composites" });
    expect(String(up.form.public_id)).toMatch(/^saakshi\/composites\/[0-9a-f]{24}$/);
    expect(String(up.form.eager)).toContain("l_text:Arial_28_bold:Before");
    expect(up.form.signature).toBe(formSignature(up.form));
    expect(server).toMatchObject({ mode: "server", publicId: up.form.public_id });
    expect(server.url).toContain(`/v1/${up.form.public_id}`);
  });

  it("mediaAssetFromUpload tolerates missing fields", () => {
    expect(mediaAssetFromUpload({ public_id: "x" })).toMatchObject({ publicId: "x", phash: "", facesCount: 0, qualityScore: null, exif: null });
  });
});

describe("CloudinaryAnalysisProvider contract (Analyze API)", () => {
  const url = (id: string) => `https://res.cloudinary.com/demo/image/authenticated/s--sig--/c_limit,w_1600,h_1600/f_jpg,q_auto/v1/${id}`;

  it("tagging: JSON POST to /v2/analysis/<cloud>/analyze/ai_vision_tagging, ≤ 10 definitions per request", async () => {
    const taxonomy = Array.from({ length: 12 }, (_, i) => ({ name: `t${i}`, description: `thing ${i}` }));
    const r = recorder((c) => json({ data: { entity: "x", analysis: { tags: (c.json as { tag_definitions: { name: string }[] }).tag_definitions.filter((_, i) => i % 5 === 0).map((t) => ({ name: t.name })) } } }));
    const p = new CloudinaryAnalysisProvider(new CloudinaryClient(CREDS, r.deps), url);
    expect(await p.tag("saakshi/a", taxonomy)).toEqual(["t0", "t5", "t10"]);
    expect(r.calls.map((c) => (c.json as { tag_definitions: unknown[] }).tag_definitions.length)).toEqual([10, 2]);
    expect(r.calls[0]).toMatchObject({ method: "POST", url: "https://api.cloudinary.com/v2/analysis/demo/analyze/ai_vision_tagging", headers: { "content-type": "application/json" } });
    expect((r.calls[0].json as { source: unknown }).source).toEqual({ uri: url("saakshi/a") });
  });

  it("moderation: rejection_questions → yes/no/unknown; watermark detections over the threshold", async () => {
    const questions = [
      { id: "children", text: "Are children visible?" },
      { id: "violence", text: "Is there violence?" },
      { id: "nsfw", text: "Is there nudity?" },
    ];
    const body = { data: { analysis: { responses: [{ prompt: "Are children visible?", value: "yes" }, { prompt: "Is there violence?", value: "no" }, { prompt: "Is there nudity?", value: "unknown" }] } } };
    expect(readModeration(body, questions)).toEqual({ children: true, violence: false, nsfw: false });
    const r = recorder(() => json(body));
    await new CloudinaryAnalysisProvider(new CloudinaryClient(CREDS, r.deps), url).moderate("saakshi/a", questions);
    expect(r.calls[0].url).toBe("https://api.cloudinary.com/v2/analysis/demo/analyze/ai_vision_moderation");
    expect((r.calls[0].json as { rejection_questions: string[] }).rejection_questions).toEqual(questions.map((q) => q.text));
    expect(readWatermark({ data: { analysis: { detections: [{ name: "watermark", confidence: 0.92 }] } } })).toBe(true);
    expect(readWatermark({ data: { analysis: { detections: [{ name: "banner", confidence: 0.2 }] } } })).toBe(false);
    expect(readWatermark({ data: { analysis: { detections: [] } } })).toBe(false);
  });

  it("logs AI Vision token use from limits.addons_quota", async () => {
    const r = recorder(() => json({ data: { analysis: { tags: [] } }, limits: { addons_quota: [{ type: "ai_vision", used_by_request: 3, remaining: 497 }] } }));
    await new CloudinaryAnalysisProvider(new CloudinaryClient(CREDS, r.deps), url).tag("saakshi/a", [{ name: "x", description: "y" }]);
    expect(r.usage[0].units).toEqual({ requests: 1, ai_vision_tokens: 3, ai_vision_remaining: 497 });
  });

  it("tag names go out hyphenated (MA_00003: lower-case letters, digits, hyphens) and map back to ours", async () => {
    expect(apiTagName("litter_or_waste")).toBe("litter-or-waste");
    expect(apiTagName("Saplings_Or_Young_Trees")).toBe("saplings-or-young-trees");
    const taxonomy = [
      { name: "litter_or_waste", description: "Visible litter" },
      { name: "saplings_or_young_trees", description: "Newly planted saplings" },
      { name: "water_body", description: "A lake or canal" },
    ];
    const r = recorder(() => json({ data: { analysis: { tags: [{ name: "litter-or-waste" }, { name: "water-body" }] } } }));
    expect(await new CloudinaryAnalysisProvider(new CloudinaryClient(CREDS, r.deps), url).tag("saakshi/a", taxonomy)).toEqual(["litter_or_waste", "water_body"]);
    const sent = (r.calls[0].json as { tag_definitions: { name: string }[] }).tag_definitions.map((t) => t.name);
    expect(sent).toEqual(["litter-or-waste", "saplings-or-young-trees", "water-body"]);
    for (const n of sent) expect(n).toMatch(/^[a-z0-9-]+$/);
    // A response that echoes our own names still maps.
    expect(readTags({ data: { analysis: { tags: ["saplings_or_young_trees"] } } }, taxonomy)).toEqual(["saplings_or_young_trees"]);
  });

  it("429 MA_00008 (the monthly AI Vision token quota) is not retried: the fallback takes over", async () => {
    const r = recorder(() => json({ error: { message: "Monthly AI Vision token quota exceeded", code: "MA_00008" } }, 429));
    const err = await new CloudinaryAnalysisProvider(new CloudinaryClient(CREDS, r.deps), url).tag("saakshi/a", [{ name: "x", description: "y" }]).catch((e) => e);
    expect(err).toBeInstanceOf(ProviderHttpError);
    expect(err).toMatchObject({ provider: "cloudinary", status: 429, retryable: false });
    expect(isAiVisionQuotaError(err)).toBe(true);
    expect(r.calls).toHaveLength(1);
    expect(r.sleeps).toEqual([]);
    // An ordinary Cloudinary 429 is still retried.
    let n = 0;
    const r2 = recorder(() => (n++ === 0 ? json({ error: { message: "Rate limit exceeded" } }, 429, { "retry-after": "1" }) : json({ data: { analysis: { tags: [] } } })));
    await new CloudinaryAnalysisProvider(new CloudinaryClient(CREDS, r2.deps), url).tag("saakshi/a", [{ name: "x", description: "y" }]);
    expect(r2.calls).toHaveLength(2);
  });
});

const ANALYSIS = { caption: "Volunteers clearing litter from a canal bank.", activity: "cleanup", stage: "during", visibleCounts: [{ label: "litter bags", count: 6, confidence: 0.7 }], visualSignals: ["gloves", "sacks"], sdgs: [11, 14], childrenVisible: false, textInImage: null, confidence: 0.8 };
const responsesBody = (text: string, extra: Record<string, unknown> = {}) => ({
  id: "resp_1",
  object: "response",
  status: "completed",
  model: "gpt-5.6-luna",
  output: [
    { type: "reasoning", id: "rs_1", summary: [] },
    { type: "message", id: "msg_1", role: "assistant", content: [{ type: "output_text", text, annotations: [] }] },
  ],
  usage: { input_tokens: 1000, input_tokens_details: { cached_tokens: 0 }, output_tokens: 100, output_tokens_details: { reasoning_tokens: 40 }, total_tokens: 1100 },
  ...extra,
});
const OPTIONS = { apiKey: "sk-test", modelFast: "gpt-5.6-luna", modelSmart: "gpt-5.6-terra", embedModel: "text-embedding-3-small", imageDetail: "high" as const, reasoningEffort: "low" };
const loadImage = async () => ({ bytes: Buffer.from("fakejpeg"), contentType: "image/jpeg" });

describe("OpenAIProvider contract", () => {
  it("describePhoto: Responses API, base64 input_image with detail high, strict json_schema, store false", async () => {
    const r = recorder(() => json(responsesBody(JSON.stringify(ANALYSIS))));
    const out = await new OpenAIProvider(OPTIONS, { ...r.deps, loadImage }).describePhoto("https://res.cloudinary.com/demo/image/authenticated/s--x--/v1/a");
    const [c] = r.calls;
    expect(c).toMatchObject({ method: "POST", url: "https://api.openai.com/v1/responses", headers: { authorization: "Bearer sk-test", "content-type": "application/json" } });
    const body = c.json as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- asserting a JSON request body
    expect(body).toMatchObject({ model: "gpt-5.6-luna", store: false, reasoning: { effort: "low" } });
    expect(body.input[1].content[1]).toEqual({ type: "input_image", image_url: `data:image/jpeg;base64,${Buffer.from("fakejpeg").toString("base64")}`, detail: "high" });
    expect(body.text.format).toMatchObject({ type: "json_schema", name: "photo_analysis", strict: true });
    expect(body.text.format.schema).toEqual(strictJsonSchema(PhotoAnalysisOutput));
    expect(out).toMatchObject({ ...ANALYSIS, method: "ai_estimated", model: "gpt-5.6-luna", providerMode: "real" });
    expect(r.usage[0]).toMatchObject({ provider: "openai", model: "gpt-5.6-luna", units: { input_tokens: 1000, output_tokens: 100, cached_tokens: 0 } });
    expect(r.usage[0].costUsd).toBeCloseTo((1000 * 0.2 + 100 * 1.2) / 1e6, 12);
  });

  it("visionLabels (the AI Vision fallback): one call, fast model, detail low, strict vision_labels schema, metered", async () => {
    const taxonomy = [
      { name: "litter_or_waste", description: "Visible litter" },
      { name: "water_body", description: "A lake or canal" },
    ];
    const questions = [
      { id: "watermark_or_stock", text: "Is there a visible watermark?" },
      { id: "unsafe_content", text: "Is there nudity, gore or violence?" },
    ];
    const answer = { tags: ["litter_or_waste", "litter_or_waste", "made_up"], answers: { watermark_or_stock: false, unsafe_content: false } };
    const r = recorder(() => json(responsesBody(JSON.stringify(answer), { usage: { input_tokens: 400, input_tokens_details: { cached_tokens: 0 }, output_tokens: 30, output_tokens_details: { reasoning_tokens: 0 }, total_tokens: 430 } })));
    const out = await new OpenAIProvider(OPTIONS, { ...r.deps, loadImage }).visionLabels("https://res.cloudinary.com/demo/image/authenticated/s--x--/c_limit,w_1600,h_1600/v1/a", taxonomy, questions, { assetId: null });
    expect(out).toEqual({ tags: ["litter_or_waste"], answers: answer.answers, model: "gpt-5.6-luna" }); // unknown names dropped, duplicates merged
    expect(r.calls).toHaveLength(1);
    const body = r.calls[0].json as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- asserting a JSON request body
    expect(r.calls[0].url).toBe("https://api.openai.com/v1/responses");
    expect(body).toMatchObject({ model: "gpt-5.6-luna", store: false, reasoning: { effort: "low" } });
    expect(body.input[0]).toEqual({ role: "developer", content: VISION_FALLBACK_PROMPT });
    expect(body.input[1].content[0].text).toBe("Tags:\n- litter_or_waste: Visible litter\n- water_body: A lake or canal\nQuestions:\n- watermark_or_stock: Is there a visible watermark?\n- unsafe_content: Is there nudity, gore or violence?");
    expect(body.input[1].content[1]).toEqual({ type: "input_image", image_url: `data:image/jpeg;base64,${Buffer.from("fakejpeg").toString("base64")}`, detail: "low" });
    expect(body.text.format).toMatchObject({ type: "json_schema", name: "vision_labels", strict: true });
    const schema = body.text.format.schema;
    expect(schema.required).toEqual(["tags", "answers"]);
    expect(schema.properties.tags.items.enum).toEqual(["litter_or_waste", "water_body"]);
    expect(schema.properties.answers).toMatchObject({ type: "object", additionalProperties: false, required: ["watermark_or_stock", "unsafe_content"] });
    expect(r.usage[0]).toMatchObject({ provider: "openai", operation: "vision_fallback", model: "gpt-5.6-luna", units: { input_tokens: 400, output_tokens: 30 } });
    expect(r.usage[0].costUsd).toBeCloseTo(openAiCost("gpt-5.6-luna", 400, 30)!, 12);
  });

  it("visionLabels: an answer missing a question id is an error; insufficient_quota is never retried", async () => {
    const q = [{ id: "unsafe_content", text: "Unsafe?" }];
    const r1 = recorder(() => json(responsesBody(JSON.stringify({ tags: [], answers: {} }))));
    await expect(new OpenAIProvider(OPTIONS, { ...r1.deps, loadImage }).visionLabels("data:image/png;base64,AA==", [], q)).rejects.toThrow();
    const r2 = recorder(() => json({ error: { code: "insufficient_quota", message: "You exceeded your current quota" } }, 429));
    await expect(new OpenAIProvider(OPTIONS, { ...r2.deps, loadImage }).visionLabels("data:image/png;base64,AA==", [], q)).rejects.toMatchObject({ status: 429, retryable: false });
    expect(r2.calls).toHaveLength(1);
    expect(r2.sleeps).toEqual([]);
  });

  it("reads output[] message → output_text (output_text on the root is SDK-only); refusals and incomplete responses throw", async () => {
    const refusal = responsesBody("", { output: [{ type: "message", content: [{ type: "refusal", refusal: "I can't help with that." }] }] });
    const r1 = recorder(() => json(refusal));
    await expect(new OpenAIProvider(OPTIONS, { ...r1.deps, loadImage }).describePhoto("data:image/png;base64,AA==")).rejects.toThrow(OpenAIRefusalError);
    const r2 = recorder(() => json(responsesBody("{", { status: "incomplete", incomplete_details: { reason: "max_output_tokens" } })));
    await expect(new OpenAIProvider(OPTIONS, { ...r2.deps, loadImage }).describePhoto("data:image/png;base64,AA==")).rejects.toThrow(/incomplete \(max_output_tokens\)/);
  });

  it("writeWithPlaceholders: uses the smart model, lists claim ids, and re-asks when a draft has digits", async () => {
    const drafts = ["We removed 42 bags of litter.", "Volunteers removed {{claim:bags_removed}} bags of litter."];
    const r = recorder((_c, i) => json(responsesBody(drafts[i])));
    const text = await new OpenAIProvider(OPTIONS, r.deps).writeWithPlaceholders("Summarise.", [{ id: "bags_removed", label: "Bags removed" }]);
    expect(text).toBe(drafts[1]);
    const second = r.calls[1].json as { model: string; input: Array<{ role: string; content: string }> };
    expect(second.model).toBe("gpt-5.6-terra");
    expect(second.input[0].content).toContain("- bags_removed: Bags removed");
    expect(second.input.at(-1)!.content).toContain(`"4" (digit)`);
    expect((r.calls[0].json as { text?: unknown }).text).toBeUndefined(); // plain text, no schema
  });

  it("parseSearch: the vocabulary goes in the developer prompt; strict ParsedSearch schema", async () => {
    const parsed = { semantic: "saplings", filters: { project: "demo-hero-cleanup", band: null, source: null, activity: null, from: null, to: null }, rewrites: [{ from: "paudhe", to: "saplings" }] };
    const r = recorder(() => json(responsesBody(JSON.stringify(parsed))));
    const out = await new OpenAIProvider(OPTIONS, r.deps).parseSearch("paudhe tiruppur", { projects: [{ slug: "demo-hero-cleanup", name: "Tiruppur cleanup" }], bands: ["VERIFIED"], sources: ["witness"], activities: ["cleanup"], today: "2026-09-28" });
    expect(out).toEqual(parsed);
    const body = r.calls[0].json as { input: Array<{ content: string }>; text: { format: { name: string; schema: unknown } } };
    expect(body.input[0].content).toContain("demo-hero-cleanup (Tiruppur cleanup)");
    expect(body.input[0].content).toContain("today is 2026-09-28");
    expect(body.text.format.name).toBe("parsed_search");
    expect(body.text.format.schema).toEqual(strictJsonSchema(ParsedSearch));
  });

  it("embed: /v1/embeddings with dimensions 1536; the vector comes back unit length", async () => {
    const vec = Array.from({ length: 1536 }, (_, i) => (i % 7) - 3);
    const r = recorder(() => json({ object: "list", data: [{ object: "embedding", index: 0, embedding: vec }], model: "text-embedding-3-small", usage: { prompt_tokens: 5, total_tokens: 5 } }));
    const v = await new OpenAIProvider(OPTIONS, r.deps).embed("");
    expect(r.calls[0]).toMatchObject({ url: "https://api.openai.com/v1/embeddings", json: { model: "text-embedding-3-small", input: "(no description)", dimensions: 1536, encoding_format: "float" } });
    expect(v).toHaveLength(1536);
    expect(Math.hypot(...v)).toBeCloseTo(1, 9);
    expect(r.usage[0].costUsd).toBeCloseTo(openAiCost("text-embedding-3-small", 5)!, 15);
  });
});

describe("strictJsonSchema (Structured Outputs, strict mode)", () => {
  it("every object requires all its properties and forbids others; nullable fields are null unions; no $schema", () => {
    const s = strictJsonSchema(PhotoAnalysisOutput);
    expect(s.$schema).toBeUndefined();
    const walk = (n: unknown): void => {
      if (!n || typeof n !== "object") return;
      const o = n as Record<string, unknown>;
      if (o.type === "object") {
        expect(o.additionalProperties).toBe(false);
        expect(o.required).toEqual(Object.keys(o.properties as object));
      }
      for (const k of ["allOf", "not", "if", "default"]) expect(o[k]).toBeUndefined();
      Object.values(o).forEach(walk);
    };
    walk(s);
    expect((s.properties as Record<string, unknown>).textInImage).toEqual({ type: ["string", "null"] }); // the docs' own optional-field form
  });
});

describe("callWithRetry", () => {
  const call = (fetch: FetchLike, sleeps: number[], usage: UsageEntry[] = []) =>
    callWithRetry({ provider: "openai", operation: "x", url: "https://api.openai.com/v1/x", init: { method: "POST" } }, { fetch, sleep: async (ms) => void sleeps.push(ms), onUsage: (u) => void usage.push(u) });

  it("honours Retry-After on 429 and never retries insufficient_quota", async () => {
    const sleeps: number[] = [];
    let n = 0;
    await call(async () => (n++ === 0 ? json({ error: { code: "rate_limit_exceeded" } }, 429, { "retry-after": "2" }) : json({ ok: true })), sleeps);
    expect(sleeps).toEqual([2000]);

    const s2: number[] = [];
    const usage: UsageEntry[] = [];
    let calls = 0;
    await expect(call(async () => (calls++, json({ error: { code: "insufficient_quota", message: "You exceeded your current quota" } }, 429)), s2, usage)).rejects.toMatchObject({ status: 429, retryable: false });
    expect(calls).toBe(1);
    expect(usage[0]).toMatchObject({ ok: false, status: 429, attempts: 1 });
  });

  it("a deadline bounds every attempt and wait together, then fails saying so", async () => {
    let clock = 0;
    let calls = 0;
    const err = await callWithRetry(
      { provider: "cloudinary", operation: "derived", url: "https://res.cloudinary.com/x", init: { method: "GET" }, retries: 50, deadlineMs: 60_000, as: "buffer" },
      {
        fetch: async () => (calls++, (clock += 5_000), new Response("generating", { status: 423, headers: { "x-cld-error": "Derived asset is being generated" } })),
        sleep: async (ms) => void (clock += ms),
        now: () => clock,
        onUsage: () => {},
      },
    ).catch((e) => e);
    expect(err).toBeInstanceOf(ProviderHttpError);
    expect(err).toMatchObject({ status: 423, retryable: false, reason: "Derived asset is being generated" });
    expect(err.message).toMatch(/^cloudinary derived failed \(HTTP 423\): Derived asset is being generated · generating \(gave up after \d+ s and \d+ attempt\(s\)\)$/);
    // A real fetch is aborted when the deadline passes; this fake one isn't, so allow its 5 s.
    expect(clock).toBeLessThanOrEqual(65_000);
    expect(calls).toBeLessThan(51);
    expect(calls).toBeGreaterThan(3);
  });

  it("Cloudinary's x-cld-error reason is part of the error when the body is empty", async () => {
    const err = await call(async () => new Response(null, { status: 400, headers: { "x-cld-error": "Invalid input for extract" } }), []).catch((e) => e);
    expect(err).toMatchObject({ status: 400, reason: "Invalid input for extract", body: "" });
    expect(err.message).toBe("openai x failed (HTTP 400): Invalid input for extract");
    const bare = await call(async () => new Response(null, { status: 400 }), []).catch((e) => e);
    expect(bare.message).toBe("openai x failed (HTTP 400): no reason given");
  });

  it("retries 5xx and network errors up to 3 times, not 4xx", async () => {
    const sleeps: number[] = [];
    let n = 0;
    await expect(call(async () => (n++, new Response("down", { status: 503 })), sleeps)).rejects.toBeInstanceOf(ProviderHttpError);
    expect(n).toBe(4);
    let m = 0;
    await call(async () => {
      if (m++ === 0) throw new TypeError("fetch failed");
      return json({ ok: true });
    }, []);
    expect(m).toBe(2);
    let k = 0;
    await expect(call(async () => (k++, new Response("bad", { status: 400 })), [])).rejects.toMatchObject({ status: 400 });
    expect(k).toBe(1);
  });
});

describe("usage log", () => {
  it("queued usage is written to provider_usage by flushUsage", async () => {
    const h = await openPglite();
    try {
      recordUsage({ provider: "openai", operation: "embed", model: "text-embedding-3-small", mode: "real", units: { input_tokens: 5 }, latencyMs: 120, costUsd: 1e-7, ok: true, status: 200, attempts: 1, assetId: null, error: null });
      expect(await flushUsage(h.db)).toBeGreaterThanOrEqual(1);
      const rows = await h.db.select().from(providerUsage);
      expect(rows.find((r) => r.operation === "embed")).toMatchObject({ provider: "openai", units: { input_tokens: 5 }, ok: true });
      expect(await flushUsage(h.db)).toBe(0);
    } finally {
      await h.close();
    }
  });
});
