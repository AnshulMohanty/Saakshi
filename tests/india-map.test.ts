/** lib/map/india.ts (pure) and the generated public/geo/india.json: the official outline of India. */
import { readFileSync } from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { clampView, dotsInside, fitView, gridStep, INDIA_BOUNDS, insideOutline, panView, ringArea, simplifyRing, unfit, viewAround, labelSides, viewFor, visibleBounds, zoomView, type IndiaMapData, type Polygon, type Ring } from "@/lib/map/india";

const square = (x0: number, y0: number, s: number): Ring => [
  [x0, y0],
  [x0 + s, y0],
  [x0 + s, y0 + s],
  [x0, y0 + s],
  [x0, y0],
];

describe("simplifyRing (Douglas–Peucker on a closed ring)", () => {
  it("drops points closer than the tolerance and keeps the ring closed", () => {
    // A square with 40 near-collinear points along each side.
    const ring: Ring = [];
    for (let i = 0; i < 40; i++) ring.push([i / 40, Math.sin(i) * 0.001]);
    for (let i = 0; i < 40; i++) ring.push([1 + Math.sin(i) * 0.001, i / 40]);
    for (let i = 0; i < 40; i++) ring.push([1 - i / 40, 1]);
    for (let i = 0; i < 40; i++) ring.push([0, 1 - i / 40]);
    ring.push(ring[0]);
    const s = simplifyRing(ring, 0.01);
    expect(s.length).toBeLessThanOrEqual(8);
    expect(s[0]).toEqual(s.at(-1));
    expect(ringArea(s)).toBeCloseTo(1, 1);
  });

  it("keeps a tiny ring a ring", () => {
    expect(simplifyRing(square(0, 0, 0.001), 0.01).length).toBeGreaterThanOrEqual(4);
  });
});

describe("insideOutline and dotsInside", () => {
  const withHole: Polygon = [square(0, 0, 4), square(1.5, 1.5, 1)];
  const islet: Polygon = [square(10.02, 10.02, 0.01)];
  it("honours holes and bounding boxes", () => {
    expect(insideOutline(0.5, 0.5, [withHole])).toBe(true);
    expect(insideOutline(1, 1, [withHole])).toBe(true);
    expect(insideOutline(2, 2, [withHole])).toBe(false);
    expect(insideOutline(5, 5, [withHole])).toBe(false);
  });
  it("puts dots on the grid inside, and one dot on an island the grid misses", () => {
    const dots = dotsInside([withHole, islet], 1, { lng0: 0, lng1: 12, lat0: 0, lat1: 12 });
    expect(dots).toContainEqual([1, 1]);
    expect(dots.some(([x, y]) => x === 2 && y === 2)).toBe(false);
    expect(dots.some(([x, y]) => x > 10 && x < 10.1 && y > 10 && y < 10.1)).toBe(true);
  });
});

describe("views: fit, unfit, zoom, pan", () => {
  it("fits a view with its true shape and inverts exactly", () => {
    const f = fitView(INDIA_BOUNDS, 800, 600, 10);
    const p = { lng: 77.2, lat: 28.6 };
    const back = unfit(INDIA_BOUNDS, 800, 600, f.x(p.lng), f.y(p.lat), 10);
    expect(back.lng).toBeCloseTo(p.lng, 9);
    expect(back.lat).toBeCloseTo(p.lat, 9);
    // Latitude 37.6 at the top edge of the fitted area, 6.2 at the bottom.
    expect(f.y(37.6)).toBeCloseTo(f.oy, 6);
  });

  it("zooms around the pointer, within limits, and pans inside the country", () => {
    const at = { lng: 77.35, lat: 11.1 };
    const z = zoomView(INDIA_BOUNDS, 0.25, at);
    const f0 = fitView(INDIA_BOUNDS, 800, 600);
    const f1 = fitView(z, 800, 600);
    expect(f1.x(at.lng)).toBeCloseTo(f0.x(at.lng), 6);
    expect(f1.y(at.lat)).toBeCloseTo(f0.y(at.lat), 6);
    expect(z.lat1 - z.lat0).toBeCloseTo((INDIA_BOUNDS.lat1 - INDIA_BOUNDS.lat0) * 0.25, 6);
    const tiny = zoomView(z, 0.0001, at);
    expect(tiny.lat1 - tiny.lat0).toBeCloseTo(0.25, 6);
    const far = panView(z, 100, 100);
    expect((far.lng0 + far.lng1) / 2).toBeLessThanOrEqual(INDIA_BOUNDS.lng1 + 1e-9);
    expect(clampView({ lng0: 0, lng1: 2, lat0: 0, lat1: 2 }, INDIA_BOUNDS).lng0).toBeCloseTo(INDIA_BOUNDS.lng0 - 1, 6);
  });

  it("frames a set of sites with padding", () => {
    const v = viewFor([{ lat: 11.1, lng: 77.35 }, { lat: 18.6, lng: 73.8 }, { lat: 17.4, lng: 78.5 }], 1.4);
    expect(v.lat0).toBeLessThan(11.1);
    expect(v.lat1).toBeGreaterThan(18.6);
    expect(viewAround({ lat: 20, lng: 80 }, 2, 1).lat1 - 20).toBeCloseTo(1, 9);
  });
});

describe("public/geo/india.json: the official outline of India", () => {
  const raw = readFileSync(path.join(__dirname, "..", "public", "geo", "india.json"), "utf8");
  const d = JSON.parse(raw) as IndiaMapData;
  const inside = (lat: number, lng: number) => insideOutline(lng, lat, d.outline);

  it("records its source and licence, and stays small", () => {
    expect(d.source).toMatch(/Survey of India/);
    expect(d.licence).toMatch(/CC BY-SA 2\.5/);
    expect(d.url).toMatch(/datameet\/maps\/master\/Country\/india-soi\.geojson$/);
    expect(gzipSync(raw).length).toBeLessThan(150 * 1024);
    expect(d.dots.length).toBeGreaterThan(5000);
  });

  it("includes all of Jammu & Kashmir and Ladakh, Arunachal Pradesh, the Andaman & Nicobar and Lakshadweep islands", () => {
    for (const [name, lat, lng] of [
      ["Leh, Ladakh", 34.16, 77.58],
      ["Gilgit (Gilgit-Baltistan, Ladakh)", 35.92, 74.31],
      ["Muzaffarabad (J&K)", 34.37, 73.47],
      ["Aksai Chin (Ladakh)", 35.2, 79.3],
      ["Tawang (Arunachal Pradesh)", 27.59, 91.86],
      ["Kanyakumari", 8.09, 77.54],
      ["New Delhi", 28.61, 77.21],
    ] as const)
      expect(inside(lat, lng), name).toBe(true);
    // Islands: a dot near each group (the grid or the island's own centre dot).
    const near = (lat: number, lng: number, r: number) => d.dots.some(([x, y]) => Math.hypot(x - lng, y - lat) < r);
    expect(near(11.62, 92.73, 0.4), "Andaman Islands (Port Blair)").toBe(true);
    expect(near(7.0, 93.85, 0.5), "Great Nicobar").toBe(true);
    expect(near(10.57, 72.64, 0.3), "Lakshadweep (Kavaratti)").toBe(true);
  });

  it("leaves out the neighbours", () => {
    for (const [name, lat, lng] of [
      ["Lahore", 31.55, 74.34],
      ["Kathmandu", 27.72, 85.32],
      ["Dhaka", 23.81, 90.41],
      ["Colombo", 6.93, 79.85],
      ["Thimphu", 27.47, 89.64],
    ] as const)
      expect(inside(lat, lng), name).toBe(false);
  });
});

describe("zoom grid and visible window", () => {
  it("keeps the file's step while cells are small, then halves it so fine grids contain the coarse dots", () => {
    expect(gridStep(0.18, 20, 12)).toBe(0.18);
    expect(gridStep(0.18, 100, 12)).toBe(0.09);
    const fine = gridStep(0.18, 2000, 12);
    expect(fine * 2000).toBeLessThanOrEqual(12);
    expect(Number.isInteger(Math.round((0.18 / fine) * 1e9) / 1e9)).toBe(true);
    expect(gridStep(0.18, 1e7, 12)).toBeGreaterThanOrEqual(0.004);
  });

  it("reports what a letterboxed box really shows: at least the view, centred on it", () => {
    const v = { lng0: 76, lng1: 78, lat0: 10, lat1: 12 };
    const vb = visibleBounds(v, 1200, 300);
    expect(vb.lat0).toBeCloseTo(10, 6);
    expect(vb.lat1).toBeCloseTo(12, 6);
    expect(vb.lng0).toBeLessThan(76);
    expect(vb.lng1).toBeGreaterThan(78);
    expect((vb.lng0 + vb.lng1) / 2).toBeCloseTo(77, 6);
  });
});

describe("labelSides", () => {
  it("puts a label right of its pin, left when the right is taken and the left is free, else above", () => {
    const sides = labelSides(
      [
        { key: "pune", x: 80, y: 437, w: 150 },
        { key: "hyd", x: 118, y: 447, w: 100 },
        { key: "tir", x: 108, y: 500, w: 100 },
        { key: "edge", x: 330, y: 200, w: 100 },
      ],
      350,
    );
    // Pune can't go right (Hyderabad's pin) or left (off the map): above.
    expect(sides).toEqual({ pune: "above", hyd: "right", tir: "right", edge: "left" });
    expect(labelSides([{ key: "a", x: 10, y: 10, w: 50 }], 400)).toEqual({ a: "right" });
  });
});
