import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { phash } from "@/lib/phash";
import type { MockMediaProvider } from "@/lib/providers/media/mock";

const fixture = (name: string) => readFile(path.join(__dirname, "fixtures", name));

let dir: string;
let media: MockMediaProvider;
let GET: (req: Request) => Promise<Response>;

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "saakshi-media-"));
  process.env.MEDIA_MOCK_DIR = dir;
  ({ GET } = await import("@/app/api/media/mock/[...path]/route"));
  const { getMediaProvider } = await import("@/lib/providers/media");
  media = getMediaProvider() as MockMediaProvider;
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

const get = (url: string, accept = "image/jpeg") => GET(new Request(new URL(url, "http://localhost:3000"), { headers: { accept } }));

describe("MockMediaProvider.upload", () => {
  it("stores the file and returns real pHash, EXIF and dimensions", async () => {
    const bytes = await fixture("geotagged.jpg");
    const asset = await media.upload({ file: bytes, folder: "saakshi/test", tags: ["cleanup"], context: { filename: "gate-litter-before.jpg" } });
    expect(media.kind).toBe("mock");
    expect(asset.publicId).toMatch(/^saakshi\/test\/[a-z0-9]{20}$/);
    expect(asset.assetId).toMatch(/^[0-9a-f]{32}$/);
    expect(asset.phash).toBe(await phash(bytes));
    expect(asset.etag).toBe(createHash("md5").update(bytes).digest("hex"));
    expect(asset).toMatchObject({ width: 240, height: 180, format: "jpg", bytes: bytes.length, facesCount: 0 });
    expect(asset.exif?.lat).toBeCloseTo(12.971667, 5);
    expect(asset.exif?.takenAt).toBe("2025-03-14T04:00:00.000Z");
    expect(asset.qualityScore).toBeGreaterThan(0);
    expect(asset.qualityScore).toBeLessThanOrEqual(1);

    const sidecar = await media.store.readSidecar(asset.publicId);
    expect(sidecar).toMatchObject({ tags: ["cleanup"], context: { filename: "gate-litter-before.jpg" }, moderation: "pending" });
  });

  it("derives a deterministic face count from people-related context", async () => {
    const file = await fixture("scene-a.png");
    const a = await media.upload({ file, folder: "saakshi/test", publicId: "saakshi/test/volunteers-a", tags: ["volunteers"] });
    const b = await media.upload({ file, folder: "saakshi/test", publicId: "saakshi/test/volunteers-a", tags: ["volunteers"] });
    expect(a.facesCount).toBeGreaterThan(0);
    expect(b.facesCount).toBe(a.facesCount);
    expect(a.format).toBe("png");
  });

  it("rejects bad input", async () => {
    await expect(media.upload({ folder: "saakshi/test" })).rejects.toThrow(/file or a url/);
    await expect(media.upload({ file: Buffer.from("nope"), folder: "saakshi/test" })).rejects.toThrow(/Unsupported/);
    await expect(media.upload({ file: await fixture("scene-a.png"), folder: "x", publicId: "../../etc" })).rejects.toThrow(/Invalid public id/);
  });

  it("keys the mocks on content only, not on bookkeeping tags or context", async () => {
    const { publicId } = await media.upload({
      file: await fixture("scene-a.png"),
      folder: "saakshi/planted",
      tags: ["saakshi", "planted_test", "stamp_mismatch", "lake"],
      context: { filename: "gps-camera-stamp.jpg", test_case: "stamp_mismatch", source: "planted_test", project_hint: "river-clean-up-x" },
    });
    const hay = await media.haystack(publicId);
    expect(hay).toContain("lake");
    expect(hay).toContain("gps camera stamp");
    expect(hay).not.toMatch(/planted|river|stamp mismatch/);
  });

  it("persists metadata and moderation", async () => {
    const { publicId } = await media.upload({ file: await fixture("scene-b.png"), folder: "saakshi/test" });
    await media.updateMetadata(publicId, { project: "p1" });
    await media.setModeration(publicId, "approved");
    expect(await media.store.readSidecar(publicId)).toMatchObject({ metadata: { project: "p1" }, moderation: "approved" });
  });
});

describe("mock delivery route", () => {
  let publicId: string;
  beforeAll(async () => {
    ({ publicId } = await media.upload({ file: await fixture("scene-a.png"), folder: "saakshi/test" }));
  });

  it("serves a signed, transformed image", async () => {
    const res = await get(media.url(publicId, [{ width: 120, crop: "scale" }, { effect: "blur", strength: 300 }], { signed: true }));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    const meta = await sharp(Buffer.from(await res.arrayBuffer())).metadata();
    expect(meta).toMatchObject({ width: 120, height: 90 });
  });

  it("refuses unsigned URLs, including the original", async () => {
    expect((await get(media.url(publicId, []))).status).toBe(401);
    expect((await get(media.url(publicId, [{ width: 120 }]))).status).toBe(401);
  });

  it("returns 401 for any tampering with a signed URL", async () => {
    const signed = media.url(publicId, [{ width: 120 }, { effect: "blur_faces" }], { signed: true });
    expect((await get(signed)).status).toBe(200);
    const tampered = [
      signed.replace("/e_blur_faces", ""),
      signed.replace("w_120", "w_1200"),
      signed.replace("/v1/", "/v2/"),
      signed.replace(publicId, `${publicId.slice(0, -1)}x`),
      signed.replace(/s--(.)/, (_m, c: string) => `s--${c === "A" ? "B" : "A"}`),
    ];
    for (const url of tampered) expect((await get(url)).status, url).toBe(401);
  });

  it("returns 404 for unknown assets and non-delivery paths", async () => {
    expect((await get(media.url("saakshi/test/missing", [], { signed: true }))).status).toBe(404);
    expect((await get("http://localhost:3000/api/media/mock/image/upload/w_100/abc")).status).toBe(404);
  });

  it("renders the spec chain: fill, blur_faces, text overlay, f_auto/q_auto", async () => {
    const url = media.url(
      publicId,
      [
        { crop: "fill", gravity: "auto", width: 800, height: 600 },
        { effect: "blur_faces" },
        { overlay: { text: "Saakshi, verified", font: "Arial", size: 24, color: "#FFFFFF", background: "#00000080" }, gravity: "north_west", x: 24, y: 24 },
        { format: "auto", quality: "auto" },
      ],
      { signed: true },
    );
    const webp = await get(url, "image/avif,image/webp,*/*");
    expect(webp.status).toBe(200);
    expect(webp.headers.get("content-type")).toBe("image/webp");
    expect(await sharp(Buffer.from(await webp.arrayBuffer())).metadata()).toMatchObject({ width: 800, height: 600 });
    const jpeg = await get(url, "image/jpeg");
    expect(jpeg.headers.get("content-type")).toBe("image/jpeg");
  });

  it("composites image layers (before | after side by side)", async () => {
    const { publicId: after } = await media.upload({ file: await fixture("scene-b.png"), folder: "saakshi/test" });
    const url = media.url(
      publicId,
      [
        { crop: "pad", width: 480, height: 180, gravity: "west", background: "#FFFFFF" },
        { overlay: { publicId: after, crop: "fill", width: 240, height: 180 }, gravity: "east" },
      ],
      { signed: true },
    );
    const res = await get(url);
    expect(res.status).toBe(200);
    const img = sharp(Buffer.from(await res.arrayBuffer()));
    expect(await img.metadata()).toMatchObject({ width: 480, height: 180 });
    // Right half is the street scene (dark), left half the park (light sky at the top).
    const { data } = await img.removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const px = (x: number, y: number) => data[(y * 480 + x) * 3];
    expect(px(10, 10)).toBeGreaterThan(100);
    expect(px(470, 170)).toBeLessThan(100);
  });

  it("ignores unknown steps instead of failing", async () => {
    const res = await get(media.url(publicId, [{ raw: "e_vectorize:colors:5" }, { width: 50 }], { signed: true }));
    expect(res.status).toBe(200);
  });

  it("extracts a mask that matches what the mask URL serves", async () => {
    const { publicId: litter } = await media.upload({ file: await fixture("litter-grass.png"), folder: "saakshi/test" });
    const { maskUrl, buffer } = await media.extractMask(litter, "litter");
    expect(maskUrl).toContain("e_extract:prompt_litter;mode_mask");
    const served = await get(maskUrl);
    expect(served.status).toBe(200);
    expect(served.headers.get("content-type")).toBe("image/png");
    const [a, b] = await Promise.all([
      sharp(buffer).extractChannel(0).raw().toBuffer(),
      sharp(Buffer.from(await served.arrayBuffer())).extractChannel(0).raw().toBuffer(),
    ]);
    expect(b.equals(a)).toBe(true);
  });
});
