import { describe, expect, it } from "vitest";
import { coverAt, litterScores, tintAbove } from "@/lib/measure/demo-mask";

const img = (W: number, H: number, px: (x: number, y: number) => [number, number, number]) => {
  const a = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) a.set([...px(x, y), 255], (y * W + x) * 4);
  return a;
};

describe("How it works threshold demo (SK.litterScores port)", () => {
  it("scores white and saturated pixels as litter, sand and grey water as not", () => {
    const W = 20, H = 20;
    const sand = img(W, H, () => [194, 160, 110]);
    const water = img(W, H, () => [90, 95, 100]);
    const white = img(W, H, () => [240, 240, 240]);
    const blueBag = img(W, H, () => [30, 80, 220]);
    expect(coverAt(litterScores(sand, W, H), 0.5)).toBe(0);
    expect(coverAt(litterScores(water, W, H), 0.5)).toBe(0);
    expect(coverAt(litterScores(white, W, H), 0.5)).toBe(1);
    expect(coverAt(litterScores(blueBag, W, H), 0.5)).toBe(1);
  });

  it("smooths over a 7×7 box, so the threshold moves the cover", () => {
    const W = 40, H = 40;
    const half = img(W, H, (x) => (x < 20 ? [240, 240, 240] : [194, 160, 110]));
    const s = litterScores(half, W, H);
    const loose = coverAt(s, 0.1);
    const strict = coverAt(s, 0.9);
    expect(loose).toBeGreaterThan(0.5);
    expect(strict).toBeLessThan(0.5);
    expect(coverAt(s, 0.5)).toBeCloseTo(0.5, 1);
  });

  it("honours an exclusion region and tints only what counts", () => {
    const W = 10, H = 10;
    const white = img(W, H, () => [255, 255, 255]);
    const s = litterScores(white, W, H, (x) => x >= 0.5);
    expect(coverAt(s, 0.99)).toBeLessThan(0.5);
    const px = img(W, H, () => [255, 255, 255]);
    expect(tintAbove(px, s, 0.5)).toBe(coverAt(s, 0.5) * W * H);
    expect(px[0]).toBe(Math.round(255 * 0.2 + 47 * 0.8));
  });
});
