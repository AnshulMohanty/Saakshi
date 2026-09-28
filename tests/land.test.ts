import { describe, expect, it } from "vitest";
import { inPolygon, inRing, landDots, type LandGeometry } from "@/lib/land";

const square = (x0: number, y0: number, x1: number, y1: number): Array<[number, number]> => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
  [x0, y0],
];

describe("land dots", () => {
  it("ray-casts rings", () => {
    const r = square(0, 0, 2, 2);
    expect(inRing(1, 1, r)).toBe(true);
    expect(inRing(3, 1, r)).toBe(false);
  });

  it("excludes holes", () => {
    const rings = [square(0, 0, 4, 4), square(1, 1, 3, 3)];
    expect(inPolygon(0.5, 0.5, rings)).toBe(true);
    expect(inPolygon(2, 2, rings)).toBe(false);
  });

  it("samples a grid over land only, west to east then south to north", () => {
    const island: LandGeometry = { type: "Polygon", coordinates: [square(70.05, 10.05, 70.45, 10.25)] };
    const far: LandGeometry = { type: "MultiPolygon", coordinates: [[square(150, 10, 151, 11)]] };
    const dots = landDots([island, far], { lng0: 70, lng1: 71, lat0: 10, lat1: 11 }, 0.2);
    expect(dots).toEqual([
      [70.2, 10.2],
      [70.4, 10.2],
    ]);
  });

  it("keeps grid points exact (no floating drift at 0.2°)", () => {
    const all: LandGeometry = { type: "Polygon", coordinates: [square(67, 5, 93, 31)] };
    const dots = landDots([all]);
    expect(dots[0]).toEqual([68, 6]);
    expect(dots.at(-1)).toEqual([92, 30]);
    expect(dots.length).toBe(121 * 121);
    const onGrid = (v: number) => Math.abs(v * 10 - Math.round(v * 10)) < 1e-9;
    expect(dots.every(([x, y]) => onGrid(x) && onGrid(y))).toBe(true);
  });
});
