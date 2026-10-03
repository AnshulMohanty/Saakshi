/** The library map's geometry (pure: lib/app/map.ts). */
import { describe, expect, it } from "vitest";
import { areaFor, cardOffset, cardSides, CARD, clusterPoints, DESIGN_AREA, dotRadius, fanOut, hash01, PAD, pinPosition, placeCards, project, zoomBox, ZOOM_SPAN } from "@/lib/app/map";

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

describe("clusters and cards on the India map", () => {
  it("merges points closer than r into one cluster at their weighted centre, heaviest first", () => {
    const pts = [
      { key: "pune", x: 100, y: 100, n: 20 },
      { key: "fool", x: 110, y: 104, n: 1 },
      { key: "hyd", x: 300, y: 120, n: 16 },
    ];
    const cs = clusterPoints(pts, 40);
    expect(cs).toHaveLength(2);
    const a = cs.find((c) => c.keys.includes("pune"))!;
    expect(a.keys).toEqual(["pune", "fool"]);
    expect(a.n).toBe(21);
    expect(a.x).toBeCloseTo((100 * 20 + 110) / 21, 6);
    expect(cs.find((c) => c.keys.includes("hyd"))!.keys).toEqual(["hyd"]);
    // Far apart (or a small radius): one cluster each, same order every time.
    expect(clusterPoints(pts, 5).map((c) => c.keys)).toEqual([["pune"], ["hyd"], ["fool"]]);
    expect(clusterPoints(pts, 5)).toEqual(clusterPoints(pts, 5));
    expect(clusterPoints([], 40)).toEqual([]);
  });

  it("places cards without overlapping each other or another anchor, inside the map", () => {
    const o = { w: 180, h: 66, gap: 12, edge: 8, top: 48, bottom: 40 };
    const W = 800;
    const H = 360;
    const anchors = [
      { key: "a", x: 300, y: 150 },
      { key: "b", x: 330, y: 170 },
      { key: "c", x: 780, y: 340 },
    ];
    const off = placeCards(anchors, W, H, o);
    const box = (k: string) => {
      const a = anchors.find((x) => x.key === k)!;
      return { x: a.x + off[k][0], y: a.y + off[k][1] };
    };
    const A = box("a");
    const B = box("b");
    const C = box("c");
    const apart = (p: { x: number; y: number }, q: { x: number; y: number }) => p.x + o.w <= q.x || q.x + o.w <= p.x || p.y + o.h <= q.y || q.y + o.h <= p.y;
    expect(apart(A, B)).toBe(true);
    for (const b of [A, B, C]) {
      expect(b.x).toBeGreaterThanOrEqual(o.edge);
      expect(b.x + o.w).toBeLessThanOrEqual(W - o.edge);
      expect(b.y).toBeGreaterThanOrEqual(o.top);
      expect(b.y + o.h).toBeLessThanOrEqual(H - o.bottom);
    }
    // A card never sits on another project's dot.
    const covers = (c: { x: number; y: number }, p: { x: number; y: number }) => p.x > c.x && p.x < c.x + o.w && p.y > c.y && p.y < c.y + o.h;
    expect(covers(A, anchors[1])).toBe(false);
    expect(covers(B, anchors[0])).toBe(false);
  });
});

describe("fanOut", () => {
  it("leaves a lone pin in place and spreads pins at the same spot apart", () => {
    const pts = [
      { id: "a", lat: 11, lng: 77 },
      { id: "b", lat: 11, lng: 77 },
      { id: "c", lat: 11, lng: 77 },
      { id: "d", lat: 12, lng: 77 },
    ];
    const o = fanOut(pts, 10);
    expect(o.a).toEqual([0, 0]);
    expect(o.d).toEqual([0, 0]);
    expect(Math.hypot(...o.b)).toBeCloseTo(10, 0);
    expect(Math.hypot(o.b[0] - o.c[0], o.b[1] - o.c[1])).toBeGreaterThan(8);
    expect(fanOut(pts, 10)).toEqual(o);
  });
});
