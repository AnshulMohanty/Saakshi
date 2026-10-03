/**
 * India in the official Government of India boundary (Survey of India state map, dissolved to one
 * country outline by DataMeet: all of Jammu & Kashmir and Ladakh, Arunachal Pradesh, the Andaman &
 * Nicobar and Lakshadweep islands). Pure and browser-safe: the outline is simplified and turned
 * into a dot field by `pnpm map:india` (scripts/india-map.ts → public/geo/india.json); the
 * map component (components/map/india-map.tsx) loads that file and projects with these helpers.
 * Source and licence: docs/map-data.md.
 */
import { inPolygon, type Ring } from "../land";

export type { Ring };
export type Polygon = Ring[];

export interface Bounds {
  lng0: number;
  lng1: number;
  lat0: number;
  lat1: number;
}

/** The whole country with a margin: Indira Point (6.75 °N) to the top of Ladakh (37.1 °N). */
export const INDIA_BOUNDS: Bounds = { lng0: 67.6, lng1: 97.8, lat0: 6.2, lat1: 37.6 };
/** Longitude shrinks with latitude: one correction at the country's middle (≈ 22 °N) keeps the shape true. */
export const INDIA_COS = Math.cos((22 * Math.PI) / 180);

export interface IndiaMapData {
  source: string;
  licence: string;
  url: string;
  /** Dot spacing in degrees. */
  step: number;
  /** Douglas–Peucker tolerance the outline was simplified with, in degrees. */
  tolerance: number;
  /** Simplified outline: polygons (outer ring first, then holes), [lng, lat] with 3 decimals. */
  outline: Polygon[];
  /** [lng, lat] of every dot inside the outline; islands too small for the grid get one dot each. */
  dots: Array<[number, number]>;
}

/** Perpendicular distance from p to the segment a–b (planar degrees). */
function segDist(p: [number, number], a: [number, number], b: [number, number]): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len)) : 0;
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/** Douglas–Peucker on a closed ring (iterative). Keeps at least 4 points so the ring stays a ring. */
export function simplifyRing(ring: Ring, tolerance: number): Ring {
  const pts = ring.length > 1 && ring[0][0] === ring.at(-1)![0] && ring[0][1] === ring.at(-1)![1] ? ring.slice(0, -1) : ring.slice();
  if (pts.length <= 4) return [...pts, pts[0]];
  const keep = new Uint8Array(pts.length);
  // Split the closed ring at its two farthest-apart anchors (the first point and the farthest from it).
  let far = 0;
  for (let i = 1; i < pts.length; i++) if (Math.hypot(pts[i][0] - pts[0][0], pts[i][1] - pts[0][1]) > Math.hypot(pts[far][0] - pts[0][0], pts[far][1] - pts[0][1])) far = i;
  keep[0] = 1;
  keep[far] = 1;
  const stack: Array<[number, number]> = [
    [0, far],
    [far, pts.length],
  ];
  while (stack.length) {
    const [s, e] = stack.pop()!;
    const a = pts[s];
    const b = pts[e % pts.length];
    let best = -1;
    let bestD = tolerance;
    for (let i = s + 1; i < e; i++) {
      const d = segDist(pts[i], a, b);
      if (d > bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best > 0) {
      keep[best] = 1;
      stack.push([s, best], [best, e]);
    }
  }
  let out: Ring = pts.filter((_, i) => keep[i]);
  if (out.length < 4) out = [pts[0], pts[Math.floor(pts.length / 3)], pts[Math.floor((2 * pts.length) / 3)]];
  return [...out, out[0]];
}

/** Absolute planar area of a ring in degrees² (shoelace). */
export function ringArea(ring: Ring): number {
  let s = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) s += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
  return Math.abs(s) / 2;
}

/** Centroid of a ring's vertices (good enough for an island's one dot). */
export function ringCentre(ring: Ring): [number, number] {
  const n = ring.length > 1 && ring[0][0] === ring.at(-1)![0] && ring[0][1] === ring.at(-1)![1] ? ring.length - 1 : ring.length;
  let x = 0;
  let y = 0;
  for (let i = 0; i < n; i++) {
    x += ring[i][0];
    y += ring[i][1];
  }
  return [x / n, y / n];
}

export interface RingBox {
  lng0: number;
  lng1: number;
  lat0: number;
  lat1: number;
}

export function boxOf(ring: Ring): RingBox {
  let lng0 = Infinity;
  let lng1 = -Infinity;
  let lat0 = Infinity;
  let lat1 = -Infinity;
  for (const [x, y] of ring) {
    if (x < lng0) lng0 = x;
    if (x > lng1) lng1 = x;
    if (y < lat0) lat0 = y;
    if (y > lat1) lat1 = y;
  }
  return { lng0, lng1, lat0, lat1 };
}

/** Is the point inside any polygon? Bounding boxes first, so a grid over the country stays cheap. */
export function insideOutline(lng: number, lat: number, polygons: Polygon[], boxes: RingBox[] = polygons.map((p) => boxOf(p[0]))): boolean {
  for (let i = 0; i < polygons.length; i++) {
    const b = boxes[i];
    if (lng < b.lng0 || lng > b.lng1 || lat < b.lat0 || lat > b.lat1) continue;
    if (inPolygon(lng, lat, polygons[i])) return true;
  }
  return false;
}

const round = (v: number, d: number) => Math.round(v * 10 ** d) / 10 ** d;

/**
 * Grid dots inside the outline at `step` degrees, aligned to multiples of the step (so a finer
 * grid in a zoomed view lines up with the overview), restricted to `within`. Every polygon that
 * no grid point falls in (Lakshadweep's atolls, small Andaman islands) gets one dot at its centre,
 * so no part of the country disappears at a coarse step.
 */
export function dotsInside(polygons: Polygon[], step: number, within: Bounds = INDIA_BOUNDS, islands = true): Array<[number, number]> {
  const boxes = polygons.map((p) => boxOf(p[0]));
  const out: Array<[number, number]> = [];
  const hit = new Uint8Array(polygons.length);
  const d = Math.max(0, Math.ceil(-Math.log10(step)) + 1);
  for (let lat = Math.ceil(within.lat0 / step) * step; lat <= within.lat1 + 1e-9; lat += step) {
    for (let lng = Math.ceil(within.lng0 / step) * step; lng <= within.lng1 + 1e-9; lng += step) {
      for (let i = 0; i < polygons.length; i++) {
        const b = boxes[i];
        if (lng < b.lng0 || lng > b.lng1 || lat < b.lat0 || lat > b.lat1) continue;
        if (inPolygon(lng, lat, polygons[i])) {
          out.push([round(lng, d), round(lat, d)]);
          hit[i] = 1;
          break;
        }
      }
    }
  }
  if (islands) {
    polygons.forEach((p, i) => {
      if (hit[i]) return;
      const c = ringCentre(p[0]);
      if (c[0] >= within.lng0 && c[0] <= within.lng1 && c[1] >= within.lat0 && c[1] <= within.lat1) out.push([round(c[0], 3), round(c[1], 3)]);
    });
  }
  return out;
}

/** The view a map shows (degrees). */
export type View = Bounds;

/**
 * Degrees → pixels for a W×H box, the view fitted inside it with its true shape (longitude scaled
 * by cos 22°) and centred. Returns the scale (pixels per degree of latitude) too.
 */
export function fitView(v: View, W: number, H: number, pad = 0): { x: (lng: number) => number; y: (lat: number) => number; k: number; ox: number; oy: number } {
  const wDeg = (v.lng1 - v.lng0) * INDIA_COS;
  const hDeg = v.lat1 - v.lat0;
  const k = Math.max(0.0001, Math.min((W - pad * 2) / wDeg, (H - pad * 2) / hDeg));
  const ox = (W - wDeg * k) / 2;
  const oy = (H - hDeg * k) / 2;
  return { x: (lng) => ox + (lng - v.lng0) * INDIA_COS * k, y: (lat) => oy + (v.lat1 - lat) * k, k, ox, oy };
}

/** Pixels → degrees for the same fit (pan and zoom around the pointer). */
export function unfit(v: View, W: number, H: number, px: number, py: number, pad = 0): { lng: number; lat: number } {
  const f = fitView(v, W, H, pad);
  return { lng: v.lng0 + (px - f.ox) / (INDIA_COS * f.k), lat: v.lat1 - (py - f.oy) / f.k };
}

/** A view of `span` degrees of latitude centred on a point, with the box's aspect. */
export function viewAround(c: { lat: number; lng: number }, spanLat: number, aspect: number): View {
  const spanLng = (spanLat * aspect) / INDIA_COS;
  return { lng0: c.lng - spanLng / 2, lng1: c.lng + spanLng / 2, lat0: c.lat - spanLat / 2, lat1: c.lat + spanLat / 2 };
}

/** Zoom a view by `f` (< 1 zooms in) keeping the point (lng, lat) fixed on screen. */
export function zoomView(v: View, f: number, at: { lng: number; lat: number }, limits: { minSpan: number; maxView: Bounds } = { minSpan: 0.25, maxView: INDIA_BOUNDS }): View {
  const span = v.lat1 - v.lat0;
  const maxSpan = limits.maxView.lat1 - limits.maxView.lat0;
  const g = Math.max(limits.minSpan / span, Math.min(maxSpan / span, f));
  const nv = { lng0: at.lng - (at.lng - v.lng0) * g, lng1: at.lng + (v.lng1 - at.lng) * g, lat0: at.lat - (at.lat - v.lat0) * g, lat1: at.lat + (v.lat1 - at.lat) * g };
  return clampView(nv, limits.maxView);
}

/** Pan a view by degrees, kept over the country. */
export function panView(v: View, dLng: number, dLat: number, maxView: Bounds = INDIA_BOUNDS): View {
  return clampView({ lng0: v.lng0 + dLng, lng1: v.lng1 + dLng, lat0: v.lat0 + dLat, lat1: v.lat1 + dLat }, maxView);
}

/** Keep the view's centre inside `max` (the view may be larger than `max` when fully zoomed out). */
export function clampView(v: View, max: Bounds): View {
  const cx = (v.lng0 + v.lng1) / 2;
  const cy = (v.lat0 + v.lat1) / 2;
  const nx = Math.max(max.lng0, Math.min(max.lng1, cx));
  const ny = Math.max(max.lat0, Math.min(max.lat1, cy));
  return { lng0: v.lng0 + nx - cx, lng1: v.lng1 + nx - cx, lat0: v.lat0 + ny - cy, lat1: v.lat1 + ny - cy };
}

/**
 * The dot grid for a zoom: the file's own step while its cells stay under `maxCellPx` (k is pixels
 * per degree of latitude), else the base step halved until they do, so finer grids always contain
 * the coarser one's dots and the dotted look holds at a city zoom.
 */
export function gridStep(base: number, k: number, maxCellPx: number, minStep = 0.004): number {
  let step = base;
  while (step * k > maxCellPx && step / 2 >= minStep) step /= 2;
  return step;
}

/** What a W×H box actually shows for a view (fitView letterboxes, so it can be more than the view). */
export function visibleBounds(v: View, W: number, H: number, pad = 0): Bounds {
  const a = unfit(v, W, H, 0, 0, pad);
  const b = unfit(v, W, H, W, H, pad);
  return { lng0: a.lng, lng1: b.lng, lat0: b.lat, lat1: a.lat };
}

/** Bounds around a set of points, padded, at least `minSpan` degrees of latitude tall. */
export function viewFor(points: Array<{ lat: number; lng: number }>, aspect: number, o: { pad?: number; minSpan?: number } = {}): View {
  if (!points.length) return INDIA_BOUNDS;
  const pad = o.pad ?? 0.25;
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  const c = { lat: (Math.min(...lats) + Math.max(...lats)) / 2, lng: (Math.min(...lngs) + Math.max(...lngs)) / 2 };
  const spanLat = Math.max(o.minSpan ?? 0.4, (Math.max(...lats) - Math.min(...lats)) * (1 + pad * 2), ((Math.max(...lngs) - Math.min(...lngs)) * INDIA_COS * (1 + pad * 2)) / aspect);
  return viewAround(c, spanLat, aspect);
}
