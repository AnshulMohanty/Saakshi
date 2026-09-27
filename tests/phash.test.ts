import { readFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { dctLowFrequencies, hamming, phash, phashFromPixels } from "@/lib/phash";

const fixture = (name: string) => readFileSync(path.join(__dirname, "fixtures", name));

describe("phash", () => {
  it("returns 16 hex chars and is deterministic", async () => {
    const h = await phash(fixture("scene-a.png"));
    expect(h).toMatch(/^[0-9a-f]{16}$/);
    expect(await phash(fixture("scene-a.png"))).toBe(h);
  });

  it("gives distance 0 for identical images, including a lossless re-encode", async () => {
    const a = await phash(fixture("scene-a.png"));
    const reencoded = await sharp(fixture("scene-a.png")).png({ compressionLevel: 0 }).toBuffer();
    expect(hamming(a, await phash(reencoded))).toBe(0);
  });

  it("keeps a resized + recompressed copy close", async () => {
    const d = hamming(await phash(fixture("scene-a.png")), await phash(fixture("scene-a-copy.jpg")));
    expect(d).toBeLessThanOrEqual(6);
  });

  it("keeps a copy with stripped/added EXIF close", async () => {
    const d = hamming(await phash(fixture("scene-a.png")), await phash(fixture("geotagged.jpg")));
    expect(d).toBeLessThanOrEqual(6);
  });

  it("separates unrelated images", async () => {
    const d = hamming(await phash(fixture("scene-a.png")), await phash(fixture("scene-b.png")));
    expect(d).toBeGreaterThanOrEqual(20);
  });

  it("separates a mirrored image from its original", async () => {
    const mirrored = await sharp(fixture("scene-a.png")).flop().toBuffer();
    const d = hamming(await phash(fixture("scene-a.png")), await phash(mirrored));
    expect(d).toBeGreaterThanOrEqual(10);
  });
});

describe("dct / phashFromPixels", () => {
  it("puts all energy of a flat image in the DC coefficient", () => {
    const c = dctLowFrequencies(new Array(32 * 32).fill(100));
    expect(c[0]).toBeCloseTo(100 * 32 * 32, 6);
    for (let i = 1; i < 64; i++) expect(Math.abs(c[i])).toBeLessThan(1e-6);
  });

  it("rejects the wrong pixel count", () => {
    expect(() => phashFromPixels(new Array(10).fill(0))).toThrow(RangeError);
  });

  it("differs between horizontal and vertical gradients", () => {
    const h = Array.from({ length: 1024 }, (_, i) => (i % 32) * 8);
    const v = Array.from({ length: 1024 }, (_, i) => Math.floor(i / 32) * 8);
    expect(hamming(phashFromPixels(h), phashFromPixels(v))).toBeGreaterThan(0);
  });
});

describe("hamming", () => {
  it("counts differing bits", () => {
    expect(hamming("0000000000000000", "0000000000000000")).toBe(0);
    expect(hamming("0000000000000000", "ffffffffffffffff")).toBe(64);
    expect(hamming("0000000000000001", "0000000000000003")).toBe(1);
    expect(hamming("ABCDEF0123456789", "abcdef0123456789")).toBe(0);
  });

  it("rejects malformed hashes", () => {
    expect(() => hamming("abc", "0000000000000000")).toThrow(TypeError);
    expect(() => hamming("zzzzzzzzzzzzzzzz", "0000000000000000")).toThrow(TypeError);
  });
});
