import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { exg, exgCover, maskCover } from "@/lib/measure/cover";

const W = 100;
const H = 80;
/** A one-channel mask with the left `fraction` of columns white. */
const halfMask = (fraction: number) => {
  const px = Buffer.alloc(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) px[y * W + x] = x < Math.round(W * fraction) ? 255 : 0;
  return sharp(px, { raw: { width: W, height: H, channels: 1 } }).png().toBuffer();
};
const solid = (r: number, g: number, b: number, w = W, h = H) => sharp({ create: { width: w, height: h, channels: 3, background: { r, g, b } } }).png().toBuffer();

describe("maskCover", () => {
  it("0%, 50% and 100%", async () => {
    expect(await maskCover(await halfMask(0))).toBe(0);
    expect(await maskCover(await halfMask(0.5))).toBe(50);
    expect(await maskCover(await halfMask(1))).toBe(100);
  });

  it("thresholds at 128: grey 128 is off, 129 is on", async () => {
    expect(await maskCover(await solid(128, 128, 128))).toBe(0);
    expect(await maskCover(await solid(129, 129, 129))).toBe(100);
  });

  it("uniform noise lands near 50%", async () => {
    let s = 7;
    const px = Buffer.alloc(W * H);
    for (let i = 0; i < px.length; i++) px[i] = (s = (s * 1103515245 + 12345) >>> 0) >>> 24;
    const v = await maskCover(await sharp(px, { raw: { width: W, height: H, channels: 1 } }).png().toBuffer());
    expect(v).toBeGreaterThan(45);
    expect(v).toBeLessThan(55);
  });

  it("works on RGBA masks (as e_extract PNGs can be)", async () => {
    const rgba = await sharp(await halfMask(0.25)).ensureAlpha().png().toBuffer();
    expect(await maskCover(rgba)).toBe(25);
  });
});

describe("ExG green cover", () => {
  it("ExG on chromatic coordinates", () => {
    expect(exg(0, 255, 0)).toBe(2);
    expect(exg(100, 100, 100)).toBe(0);
    expect(exg(0, 0, 0)).toBe(0);
    expect(exg(60, 90, 50)).toBeCloseTo(0.35, 2);
  });

  it("0% on grey and on red, 100% on leaf green", async () => {
    expect(await exgCover(await solid(128, 128, 128))).toBe(0);
    expect(await exgCover(await solid(200, 40, 40))).toBe(0);
    expect(await exgCover(await solid(60, 140, 50))).toBe(100);
  });

  it("half green, half soil: 50%", async () => {
    const img = await sharp(await solid(120, 90, 60, 200, 100))
      .composite([{ input: await solid(50, 150, 40, 100, 100), left: 0, top: 0 }])
      .png()
      .toBuffer();
    expect(await exgCover(img)).toBeCloseTo(50, 0); // the boundary column blends when resized to 256 px
  });

  it("is measured at 256 px, so resolution does not change the answer", async () => {
    const small = await sharp(await solid(120, 90, 60, 400, 300)).composite([{ input: await solid(50, 150, 40, 100, 300), left: 0, top: 0 }]).png().toBuffer();
    const large = await sharp(small).resize(1600, 1200, { kernel: "nearest" }).png().toBuffer();
    expect(await exgCover(large)).toBeCloseTo(await exgCover(small), 0);
  });
});
