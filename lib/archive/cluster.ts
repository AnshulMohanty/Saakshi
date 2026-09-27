/**
 * DBSCAN-style clustering of geotagged items with haversine distance (pure, deterministic).
 * Used at ~1.5 km to find demo projects and at ~40 m to find spots. O(n²): fine for the few
 * thousand points discovery produces.
 */
import { haversine, type LatLng } from "../geo";

export interface GeoCluster<T> {
  members: T[];
  centroid: LatLng;
  /** Distance from the centroid covering all members (m). */
  maxRadiusM: number;
}

export interface ClusterOptions {
  epsM: number;
  /** Minimum neighbourhood size (including the point itself) for a core point. */
  minPts: number;
}

export function centroid(points: LatLng[]): LatLng {
  const n = points.length || 1;
  return { lat: points.reduce((s, p) => s + p.lat, 0) / n, lng: points.reduce((s, p) => s + p.lng, 0) / n };
}

/** Smallest distance from `center` that covers a `q` fraction of `points` (nearest-rank). */
export function radiusCovering(points: LatLng[], center: LatLng, q: number): number {
  if (points.length === 0) return 0;
  const d = points.map((p) => haversine(center, p)).sort((a, b) => a - b);
  return d[Math.min(d.length - 1, Math.max(0, Math.ceil(q * d.length) - 1))];
}

/**
 * Clusters items by location. Items without a location are ignored. Clusters are returned
 * largest first (ties: tighter first, then by first member index, so output is stable).
 */
export function dbscan<T>(items: T[], coord: (item: T) => LatLng | null, { epsM, minPts }: ClusterOptions): { clusters: GeoCluster<T>[]; noise: T[] } {
  const pts = items.map((item, i) => ({ item, i, p: coord(item) })).filter((x): x is { item: T; i: number; p: LatLng } => x.p !== null);
  const n = pts.length;
  const neighbours = pts.map((a) => pts.map((b, j) => (haversine(a.p, b.p) <= epsM ? j : -1)).filter((j) => j >= 0));
  const label = new Array<number>(n).fill(-2); // -2 unvisited, -1 noise, ≥0 cluster id
  let next = 0;

  for (let i = 0; i < n; i++) {
    if (label[i] !== -2) continue;
    if (neighbours[i].length < minPts) {
      label[i] = -1;
      continue;
    }
    const id = next++;
    label[i] = id;
    const queue = [...neighbours[i]];
    while (queue.length) {
      const j = queue.shift()!;
      if (label[j] === -1) label[j] = id; // border point
      if (label[j] !== -2) continue;
      label[j] = id;
      if (neighbours[j].length >= minPts) queue.push(...neighbours[j]);
    }
  }

  const groups = new Map<number, typeof pts>();
  pts.forEach((x, k) => {
    if (label[k] >= 0) groups.set(label[k], [...(groups.get(label[k]) ?? []), x]);
  });
  const clusters = [...groups.values()].map((g) => {
    const c = centroid(g.map((x) => x.p));
    return { members: g.map((x) => x.item), centroid: c, maxRadiusM: Math.max(...g.map((x) => haversine(c, x.p))), first: g[0].i };
  });
  clusters.sort((a, b) => b.members.length - a.members.length || a.maxRadiusM - b.maxRadiusM || a.first - b.first);
  return {
    clusters: clusters.map(({ members, centroid, maxRadiusM }) => ({ members, centroid, maxRadiusM })),
    noise: pts.filter((_, k) => label[k] === -1).map((x) => x.item),
  };
}
