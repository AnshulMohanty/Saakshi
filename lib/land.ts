/**
 * Land dot field for the story maps (B5.10): a regular grid of points that fall on land, from
 * Natural Earth 50 m land polygons. Land only: never borders, never names, so the maps make no
 * claim about boundaries. Pure; `pnpm land:dots` runs it once and writes data/land-dots.json.
 */

export type Ring = Array<[number, number]>;
export interface LandGeometry {
  type: "Polygon" | "MultiPolygon";
  coordinates: Ring[] | Ring[][];
}

export interface Bounds {
  lng0: number;
  lng1: number;
  lat0: number;
  lat1: number;
}

/** B5.10: lat 6–30 °N, lng 68–92 °E at 0.2°, so every demo site and the North (Noida, 28.5 °N) are on it. */
export const LAND_BOUNDS: Bounds = { lng0: 68, lng1: 92, lat0: 6, lat1: 30 };
export const LAND_STEP = 0.2;

/** Even-odd ray cast. */
export function inRing(lng: number, lat: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Inside the outer ring and outside every hole. */
export function inPolygon(lng: number, lat: number, rings: Ring[]): boolean {
  if (!rings.length || !inRing(lng, lat, rings[0])) return false;
  for (let k = 1; k < rings.length; k++) if (inRing(lng, lat, rings[k])) return false;
  return true;
}

const polygonsOf = (g: LandGeometry): Ring[][] => (g.type === "Polygon" ? [g.coordinates as Ring[]] : (g.coordinates as Ring[][]));

function bboxOf(rings: Ring[]): Bounds {
  let lng0 = Infinity, lng1 = -Infinity, lat0 = Infinity, lat1 = -Infinity;
  for (const [x, y] of rings[0] ?? []) {
    if (x < lng0) lng0 = x;
    if (x > lng1) lng1 = x;
    if (y < lat0) lat0 = y;
    if (y > lat1) lat1 = y;
  }
  return { lng0, lng1, lat0, lat1 };
}

/** Grid points (rounded to 0.1 of the step) that fall on land, west to east, south to north. */
export function landDots(geometries: LandGeometry[], b: Bounds = LAND_BOUNDS, step = LAND_STEP): Array<[number, number]> {
  const polys = geometries
    .flatMap(polygonsOf)
    .map((rings) => ({ rings, box: bboxOf(rings) }))
    .filter(({ box }) => box.lng1 >= b.lng0 && box.lng0 <= b.lng1 && box.lat1 >= b.lat0 && box.lat0 <= b.lat1);
  const round = (v: number) => Math.round(v * 1e4) / 1e4;
  const out: Array<[number, number]> = [];
  const nLat = Math.round((b.lat1 - b.lat0) / step);
  const nLng = Math.round((b.lng1 - b.lng0) / step);
  for (let i = 0; i <= nLat; i++) {
    const lat = round(b.lat0 + i * step);
    for (let j = 0; j <= nLng; j++) {
      const lng = round(b.lng0 + j * step);
      if (polys.some(({ rings, box }) => lng >= box.lng0 && lng <= box.lng1 && lat >= box.lat0 && lat <= box.lat1 && inPolygon(lng, lat, rings))) out.push([lng, lat]);
    }
  }
  return out;
}
