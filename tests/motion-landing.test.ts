import { describe, expect, it } from "vitest";
import { resolveMotion } from "@/lib/motion/mode";
import * as L from "@/lib/motion/scenes/landing";
import { eio, eo, rng } from "@/lib/scenes/landing-stage";

describe("motion mode (design rule L:1239-1244, B5.11)", () => {
  const base = { prefersReduced: false, webgl2: true, deviceMemory: 8, saveData: false };
  it("is full on a capable device", () => expect(resolveMotion(base)).toBe("full"));
  it("is reduced when the visitor asks, or without the animation library", () => {
    expect(resolveMotion({ ...base, prefersReduced: true })).toBe("reduced");
    expect(resolveMotion({ ...base, animation: false })).toBe("reduced");
  });
  it("is low power without WebGL2, at 4 GB or less, or with Save-Data", () => {
    expect(resolveMotion({ ...base, webgl2: false })).toBe("low");
    expect(resolveMotion({ ...base, deviceMemory: 4 })).toBe("low");
    expect(resolveMotion({ ...base, deviceMemory: undefined })).toBe("full");
    expect(resolveMotion({ ...base, saveData: true })).toBe("low");
  });
  it("honours ?motion= only where allowed (development)", () => {
    expect(resolveMotion({ ...base, override: "reduced" })).toBe("full");
    expect(resolveMotion({ ...base, override: "reduced", allowOverride: true })).toBe("reduced");
    expect(resolveMotion({ ...base, override: "low-power", allowOverride: true })).toBe("low");
    expect(resolveMotion({ ...base, prefersReduced: true, override: "full", allowOverride: true })).toBe("full");
  });
});

describe("landing motion constants match the design source", () => {
  it("scroll: Lenis lerp 0.12, scrub 1:1 (D-0017, D-0018)", () => {
    expect(L.LENIS.lerp).toBe(0.12);
    expect(L.SCRUB).toBe(true);
  });
  it("camera and card (D-0033, D-0034)", () => {
    expect(L.CAMERA).toEqual({ z: 10, fov: 30, near: 0.1, far: 400 });
    expect(L.MOBILE_BELOW).toBe(1100);
    expect(L.CARD.desktop).toMatchObject({ heightOfView: 0.36, maxWidthOfView: 0.3, x: 0.03 });
    expect(L.CARD.mobile).toMatchObject({ heightOfView: 0.24, maxWidthOfView: 0.6, y: -0.06 });
  });
  it("tilt, spin, gap and windows (D-0035 to D-0037): radians, not degrees", () => {
    expect(L.TILT).toBe(1.02);
    expect(L.SPIN).toBe(0.62);
    expect(L.GAP).toEqual({ desktop: 0.42, mobile: 0.36 });
    // UI polish (ENGINEERING.md, UI/UX polish): chapter 1 is shorter, so the seal builds sooner.
    expect(L.CH1).toEqual({ a: [0.03, 0.24], b: [0.18, 0.42], c: [0.48, 0.58] });
  });
  it("chapter timelines (D-0039, D-0050, D-0057, D-0064, D-0069)", () => {
    // UI polish: the seal comes together earlier and its points count up over a longer stretch.
    expect(L.T1.sealStretch).toEqual({ at: 0.5, dur: 0.1, from: "125%", to: "78%" });
    expect(L.T1.score).toEqual({ at: 0.62, dur: 0.3 });
    expect(L.T2.dusk.at).toBe(0.5);
    // UI polish: four fakes, then the ledger enters with room to read it.
    expect(L.T3.fake.first + 3 * L.T3.fake.every).toBeCloseTo(0.46, 10);
    expect(L.T4.before).toEqual({ at: 0.12, dur: 0.28, scanOffAt: 0.41 });
    expect(L.T4.maskOpacity).toBe(0.78);
    // UI polish: the threads chapter is shorter (340vh); the last number lands by 0.56.
    expect(L.T5.numbers.first + 3 * L.T5.numbers.every).toBeCloseTo(0.56, 10);
  });
  it("frames: the product's B5.10 frame and the prototype's (D-0052)", () => {
    expect(L.FRAME).toEqual({ lng0: 68, lng1: 92, lat0: 6, lat1: 30 });
    expect(L.DESIGN_FRAME).toEqual({ lng0: 68, lng1: 89, lat0: 7, lat1: 23 });
  });
});

describe("stage easing and seeded storm (GL:7-9)", () => {
  it("cubic in-out and expo out hit their ends and midpoints", () => {
    expect(eio(0)).toBe(0);
    expect(eio(0.5)).toBe(0.5);
    expect(eio(1)).toBe(1);
    expect(eo(0)).toBe(0);
    expect(eo(1)).toBe(1);
    expect(eo(0.5)).toBeCloseTo(1 - 2 ** -5, 10);
  });
  it("Park–Miller from seed 11 gives the prototype's sequence", () => {
    const r = rng(11);
    expect(r()).toBeCloseTo((11 * 16807) / 2147483647, 12);
    const r2 = rng(11);
    const first = [r2(), r2(), r2()];
    const r3 = rng(11);
    expect([r3(), r3(), r3()]).toEqual(first);
  });
});
