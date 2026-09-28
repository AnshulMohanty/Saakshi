import { describe, expect, it } from "vitest";
import { deltaE, hex, JND, oklchCssToHex, oklchToRgb, parseHex, reconcile, rgbToOklch } from "@/lib/color/oklch";

const tokens = [
  { token: "light.background", rgb: parseHex(oklchCssToHex("oklch(0.962 0.007 250)")!)! },
  { token: "light.verified", rgb: parseHex(oklchCssToHex("oklch(0.5 0.11 155)")!)! },
  { token: "light.primary", rgb: parseHex(oklchCssToHex("oklch(0.395 0.148 293)")!)! },
];

describe("oklch ↔ sRGB", () => {
  it("maps the ends of the scale exactly", () => {
    expect(oklchCssToHex("oklch(1 0 0)")).toBe("#FFFFFF");
    expect(oklchCssToHex("oklch(0 0 0)")).toBe("#000000");
  });

  it("converts handoff tokens to their nearest sRGB", () => {
    // The nearest sRGB of three handoff tokens (the same values as design/tokens.extracted.json).
    expect(oklchCssToHex("oklch(0.395 0.148 293)")).toBe("#4C2E8D");
    expect(oklchCssToHex("oklch(0.5 0.11 155)")).toBe("#1E7546");
    expect(oklchCssToHex("oklch(0.155 0.035 292)")).toBe("#0D091A");
  });

  it("round-trips sRGB through OKLCH within one step per channel", () => {
    for (const s of ["#465062", "#E8F3EC", "#2F6BEA", "#FF6F61", "#0E0B1A"]) {
      const o = rgbToOklch(parseHex(s)!);
      const back = oklchToRgb(o.l, o.c, o.h);
      const orig = parseHex(s)!;
      expect(Math.abs(back.r - orig.r)).toBeLessThanOrEqual(1);
      expect(Math.abs(back.g - orig.g)).toBeLessThanOrEqual(1);
      expect(Math.abs(back.b - orig.b)).toBeLessThanOrEqual(1);
    }
  });

  it("clips out-of-gamut colours instead of wrapping", () => {
    const rgb = oklchToRgb(0.7, 0.4, 145);
    for (const v of [rgb.r, rgb.g, rgb.b]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(255);
    }
  });

  it("parses 3- and 6-digit hex and rejects the rest", () => {
    expect(parseHex("#fff")).toEqual({ r: 255, g: 255, b: 255 });
    expect(hex(parseHex("14583a")!)).toBe("#14583A");
    expect(parseHex("rgba(0,0,0,0.5)")).toBeNull();
    expect(parseHex("#12345")).toBeNull();
    expect(oklchCssToHex("var(--primary)")).toBeNull();
  });
});

describe("deltaE", () => {
  it("is zero for the same colour and symmetric", () => {
    const a = parseHex("#465062")!;
    const b = parseHex("#4C5463")!;
    expect(deltaE(a, a)).toBe(0);
    expect(deltaE(a, b)).toBeCloseTo(deltaE(b, a), 10);
  });

  it("ranks a near miss below the JND and a different hue far above it", () => {
    expect(deltaE(parseHex("#1B7A4B")!, tokens[1].rgb)).toBeLessThan(JND);
    expect(deltaE(parseHex("#14583A")!, tokens[1].rgb)).toBeGreaterThan(JND);
  });
});

describe("reconcile", () => {
  it("lets the handoff token win under the JND", () => {
    const r = reconcile(parseHex("#EEF2F6")!, tokens);
    expect(r).toMatchObject({ token: "light.background", useToken: true });
    expect(r.reason).toMatch(/handoff token wins/);
  });

  it("keeps a tint the token would shift in hue, even under the JND", () => {
    // The verified chip background is pale green; the page background is blue-grey.
    const r = reconcile(parseHex("#E8F3EC")!, tokens);
    expect(r.deltaE).toBeLessThan(JND);
    expect(r.hueShift).toBeGreaterThan(45);
    expect(r.useToken).toBe(false);
    expect(r.reason).toMatch(/tint/);
  });

  it("keeps a colour at or above the JND exactly", () => {
    const r = reconcile(parseHex("#14583A")!, tokens);
    expect(r).toMatchObject({ token: "light.verified", useToken: false });
    expect(r.reason).toMatch(/≥ 2.3/);
  });

  it("ignores hue for near-greys (a hue on a grey is noise)", () => {
    const r = reconcile(parseHex("#F1F3F6")!, tokens);
    expect(r.useToken).toBe(true);
  });
});
