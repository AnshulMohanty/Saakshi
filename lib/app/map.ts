/**
 * The library map's geometry (pure; AP:950-976, 1069-1085): a flat projected dot field with a mild
 * perspective (far rows narrower), project clusters with a card beside each pin, and when zoomed
 * into a project, one pin per photo. No boundaries are drawn (B5.10).
 */

export interface BBox {
  lng0: number;
  lng1: number;
  lat0: number;
  lat1: number;
}

/** AP:950: a project view is its centre ± 0.42° of longitude and ± 0.3° of latitude. */
export const ZOOM_SPAN = { lng: 0.42, lat: 0.3 } as const;
/** AP:954: insets of the projected area inside the map box. */
export const PAD = { x: 28, top: 52, bottom: 44 } as const;
/** AP:1070: the cluster card. */
export const CARD = { w: 180, h: 66, gap: 12, edge: 8 } as const;

/** The prototype's demo area (AP:950). */
export const DESIGN_AREA: BBox = { lng0: 69.5, lng1: 83.5, lat0: 11, lat1: 21 };

export const zoomBox = (c: { lat: number; lng: number }): BBox => ({ lng0: c.lng - ZOOM_SPAN.lng, lng1: c.lng + ZOOM_SPAN.lng, lat0: c.lat - ZOOM_SPAN.lat, lat1: c.lat + ZOOM_SPAN.lat });

/**
 * The overview area for a set of project centres: their bounds padded by 30% (at least 3°), with
 * the prototype's 1.4 : 1 shape (14° × 10°), so the dots keep the same density and look.
 */
export function areaFor(centres: Array<{ lat: number; lng: number }>): BBox {
  if (!centres.length) return DESIGN_AREA;
  const lats = centres.map((c) => c.lat);
  const lngs = centres.map((c) => c.lng);
  const cLat = (Math.min(...lats) + Math.max(...lats)) / 2;
  const cLng = (Math.min(...lngs) + Math.max(...lngs)) / 2;
  const h = Math.max(3, (Math.max(...lats) - Math.min(...lats)) * 1.3, ((Math.max(...lngs) - Math.min(...lngs)) * 1.3) / 1.4);
  const w = h * 1.4;
  return { lng0: cLng - w / 2, lng1: cLng + w / 2, lat0: cLat - h / 2, lat1: cLat + h / 2 };
}

/** AP:952-957: degrees → map pixels, rows nearer the bottom wider (s = 0.8 + 0.2·ny). */
export function project(v: BBox, W: number, H: number, lat: number, lng: number): { x: number; y: number; inside: boolean } {
  const nx = (lng - v.lng0) / (v.lng1 - v.lng0);
  const ny = 1 - (lat - v.lat0) / (v.lat1 - v.lat0);
  const s = 0.8 + 0.2 * ny;
  return { x: W / 2 + (nx - 0.5) * (W - PAD.x * 2) * s, y: PAD.top + ny * (H - PAD.top - PAD.bottom), inside: nx >= -0.02 && nx <= 1.02 && ny >= -0.02 && ny <= 1.02 };
}

/** AP:963: dot radius by zoom (span in degrees of longitude). */
export const dotRadius = (v: BBox) => Math.max(1.1, Math.min(3.2, ((2.2 * 10) / (v.lng1 - v.lng0)) * 0.12 + 1));

export const lerpBox = (a: BBox, b: BBox, t: number): BBox => ({ lng0: a.lng0 + (b.lng0 - a.lng0) * t, lng1: a.lng1 + (b.lng1 - a.lng1) * t, lat0: a.lat0 + (b.lat0 - a.lat0) * t, lat1: a.lat1 + (b.lat1 - a.lat1) * t });

export type CardSide = "left" | "right" | "up";

/** AP:1071: where a cluster's card sits relative to its pin, clamped inside the map. */
export function cardOffset(side: CardSide, g: { x: number; y: number }, W: number, H: number): [number, number] {
  const pref = side === "left" ? [g.x - CARD.gap - CARD.w, g.y + CARD.gap] : side === "up" ? [g.x + CARD.gap, g.y - CARD.gap - CARD.h] : [g.x + CARD.gap, g.y + CARD.gap];
  const cl = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
  return [cl(pref[0], CARD.edge, W - CARD.edge - CARD.w) - g.x, cl(pref[1], 48, H - 44 - CARD.h) - g.y];
}

/**
 * The prototype's card sides (Mumbai left, Pune below right, Chennai above right), generalised:
 * westmost project left, eastmost above, the rest below right.
 */
export function cardSides<T extends { key: string; lng: number }>(projects: T[]): Record<string, CardSide> {
  const byLng = [...projects].sort((a, b) => a.lng - b.lng || a.key.localeCompare(b.key));
  return Object.fromEntries(byLng.map((p, i) => [p.key, i === 0 ? "left" : i === byLng.length - 1 && byLng.length > 1 ? "up" : "right"]));
}

/** AP:1076: a stable pseudo-random 0–1 per id and salt (the prototype's hash01). */
export function hash01(id: string, salt: number): number {
  let n = 0;
  for (const ch of id) n = n * 131 + ch.charCodeAt(0);
  const v = Math.sin(n * 12.9898 + salt * 78.233) * 43758.5453;
  return v - Math.floor(v);
}

/**
 * AP:1078-1085: where a photo's pin goes in a project view. With GPS inside the view, its own
 * position; with GPS outside it, null (counted as "taken outside this view"); without GPS, a
 * stable scatter near the project centre ("Photos without GPS wait near the site").
 */
export function pinPosition(p: { id: string; gps: boolean; lat: number | null; lng: number | null }, c: { lat: number; lng: number }): { lat: number; lng: number } | null {
  const near = p.gps && p.lat !== null && p.lng !== null && Math.abs(p.lat - c.lat) < ZOOM_SPAN.lat && Math.abs(p.lng - c.lng) < ZOOM_SPAN.lng;
  if (p.gps && !near) return null;
  if (near) return { lat: p.lat!, lng: p.lng! };
  const a = hash01(p.id, 7) * Math.PI * 2;
  const rad = 0.05 + hash01(p.id, 13) * 0.2;
  return { lat: c.lat + Math.sin(a) * rad * 0.7, lng: c.lng + Math.cos(a) * rad };
}
