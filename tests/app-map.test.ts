/** The library map's geometry (pure: lib/app/map.ts). */
import { describe, expect, it } from "vitest";
import { areaFor, cardOffset, cardSides, CARD, DESIGN_AREA, dotRadius, hash01, PAD, pinPosition, project, zoomBox, ZOOM_SPAN } from "@/lib/app/map";

describe("project", () => {
  it("maps the area's corners inside the padded box, far rows narrower (s = 0.8 + 0.2·ny)", () => {
    const W = 1000;
    const H = 400;
    const top = project(DESIGN_AREA, W, H, DESIGN_AREA.lat1, DESIGN_AREA.lng0);
    const bottom = project(DESIGN_AREA, W, H, DESIGN_AREA.lat0, DESIGN_AREA.lng0);
    expect(top.y).toBe(PAD.top);
    expect(bottom.y).toBe(H - PAD.bottom);
    // The far (top) row spans 80% of the near (bottom) row.
    expect(W / 2 - top.x).toBeCloseTo((W / 2 - bottom.x) * 0.8, 6);
    expect(top.inside && bottom.inside).toBe(true);
    expect(project(DESIGN_AREA, W, H, 30, 90).inside).toBe(false);
  });

  it("zooms to a project's ± 0.42° / ± 0.3° box, with bigger dots", () => {
    const z = zoomBox({ lat: 19, lng: 73 });
    expect(z).toEqual({ lng0: 73 - ZOOM_SPAN.lng, lng1: 73 + ZOOM_SPAN.lng, lat0: 19 - ZOOM_SPAN.lat, lat1: 19 + ZOOM_SPAN.lat });
    expect(dotRadius(z)).toBeGreaterThan(dotRadius(DESIGN_AREA));
    expect(dotRadius(z)).toBeLessThanOrEqual(3.2);
  });
});

describe("areaFor", () => {
  it("frames the projects with the prototype's 1.4 : 1 shape and at least 3° of height", () => {
    const a = areaFor([
      { lat: 11.1, lng: 77.35 },
      { lat: 18.6, lng: 73.8 },
      { lat: 17.4, lng: 78.5 },
    ]);
    expect((a.lng1 - a.lng0) / (a.lat1 - a.lat0)).toBeCloseTo(1.4, 6);
    expect(a.lat0).toBeLessThan(11.1);
    expect(a.lat1).toBeGreaterThan(18.6);
    expect(a.lng0).toBeLessThan(73.8);
    expect(a.lng1).toBeGreaterThan(78.5);
    const one = areaFor([{ lat: 10, lng: 76 }]);
    expect(one.lat1 - one.lat0).toBe(3);
    expect(areaFor([])).toBe(DESIGN_AREA);
  });
});

describe("cards and pins", () => {
  it("puts the westmost card left, the eastmost above, the rest below right (the prototype's layout)", () => {
    expect(cardSides([{ key: "chennai", lng: 80.28 }, { key: "mumbai", lng: 72.8 }, { key: "pune", lng: 73.86 }])).toEqual({ mumbai: "left", pune: "right", chennai: "up" });
    expect(cardSides([{ key: "only", lng: 75 }])).toEqual({ only: "left" });
  });

  it("clamps a card inside the map", () => {
    const [dx, dy] = cardOffset("left", { x: 30, y: 60 }, 800, 300);
    expect(30 + dx).toBe(CARD.edge);
    expect(60 + dy).toBe(60 + CARD.gap);
    const [, upY] = cardOffset("up", { x: 400, y: 50 }, 800, 300);
    expect(50 + upY).toBe(48);
  });

  it("scatters photos without GPS stably near the site, keeps GPS inside the view, drops GPS outside it", () => {
    expect(hash01("p12", 7)).toBe(hash01("p12", 7));
    expect(hash01("p12", 7)).not.toBe(hash01("p13", 7));
    const c = { lat: 19.1265, lng: 72.8156 };
    const a = pinPosition({ id: "p12", gps: false, lat: null, lng: null }, c)!;
    expect(Math.abs(a.lat - c.lat)).toBeLessThan(0.2);
    expect(Math.abs(a.lng - c.lng)).toBeLessThan(0.26);
    expect(pinPosition({ id: "p12", gps: false, lat: null, lng: null }, c)).toEqual(a);
    expect(pinPosition({ id: "x", gps: true, lat: 19.13, lng: 72.82 }, c)).toEqual({ lat: 19.13, lng: 72.82 });
    expect(pinPosition({ id: "x", gps: true, lat: 28.6, lng: 77.2 }, c)).toBeNull();
  });
});
