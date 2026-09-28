/** design:capture scroll plan (pure): half-viewport steps plus the key points of pinned sections. */
import { describe, expect, it } from "vitest";
import { pageSlug, planSteps } from "../scripts/_capture";

describe("planSteps", () => {
  it("steps every half viewport and always ends at the bottom", () => {
    const s = planSteps(2000, 900, []);
    expect(s.map((x) => x.y)).toEqual([0, 450, 900, 1100]);
    expect(s.every((x) => x.kind === "step")).toBe(true);
  });

  it("adds start/¼/½/¾/end of a pinned section and merges near-duplicates, keeping the pin label", () => {
    const s = planSteps(5000, 900, [{ top: 900, height: 2700, label: "pin .hero" }]);
    const pinned = s.filter((x) => x.kind === "pinned");
    expect(pinned.map((x) => x.y)).toEqual([900, 1350, 1800, 2250, 2700]);
    expect(pinned[0].label).toBe("pin .hero 0%");
    // 900 was also a half-viewport step: one entry, and it is the pinned one.
    expect(s.filter((x) => x.y === 900)).toHaveLength(1);
    const ys = s.map((x) => x.y);
    expect([...ys].sort((a, b) => a - b)).toEqual(ys);
    expect(new Set(ys).size).toBe(ys.length);
  });

  it("a page shorter than the viewport is one step; long pages are capped", () => {
    expect(planSteps(600, 900, [])).toEqual([{ y: 0, kind: "step" }]);
    expect(planSteps(200_000, 900, [], 80)).toHaveLength(80);
  });

  it("page names come from export file names", () => {
    expect(pageSlug("Saakshi Landing.html")).toBe("saakshi-landing");
    expect(pageSlug("QR Poster.html")).toBe("qr-poster");
    expect(pageSlug("")).toBe("index");
  });
});
