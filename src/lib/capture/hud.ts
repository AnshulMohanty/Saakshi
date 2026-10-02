/**
 * The capture screen's HUD in numbers and words (pure; CA:337-377, 439-512). Sizes and thresholds
 * are the design's: the GPS ring grows with the accuracy radius, the spot mini-map draws the
 * site radius as a 60 px circle in a 96 px box, the horizon goes green within 1° of level. The
 * live screen feeds them real readings (watchPosition, DeviceOrientation); the parity fixture
 * and the dev states feed them the prototype's simulation.
 */
import { EARTH_RADIUS_M, haversine, type LatLng } from "../geo";

export type AccTone = "good" | "fair" | "poor" | "none";

/** CA:491: ≤ 10 m good, ≤ 25 m fair, else poor. */
export const accTone = (acc: number | null): AccTone => (acc === null ? "none" : acc <= 10 ? "good" : acc <= 25 ? "fair" : "poor");

/** CA:502: "±15 m", "±6 m, good fix", "Location off". */
export const accText = (acc: number | null): string => (acc === null ? "Location off" : `±${Math.round(acc)} m${acc <= 10 ? ", good fix" : ""}`);

/** CA:447: ring diameter 40 + acc · 1.6 px (capped so a 2 km fix doesn't fill the screen). */
export const ringPx = (acc: number | null): number => 40 + Math.min(acc ?? 0, 120) * 1.6;

/** CA:504: level within 1°. */
export const isLevel = (deg: number | null): boolean => deg !== null && Math.abs(deg) <= 1;
export const levelText = (deg: number | null): string => (deg === null ? "" : isLevel(deg) ? "Level" : "Tilt to level");

/** The horizon's roll in whole degrees from DeviceOrientation, for the screen's rotation. */
export function rollDeg(beta: number | null, gamma: number | null, screenAngle = 0): number | null {
  if (beta === null || gamma === null) return null;
  const a = ((screenAngle % 360) + 360) % 360;
  const r = a === 90 ? -beta : a === 180 ? -gamma : a === 270 ? beta : gamma;
  return Math.round(-r) || 0;
}

/** Mini-map geometry (CA:343-347): a 96 px box, the site radius as a 60 px circle centred on it. */
export const MAP = { box: 96, center: 48, radiusPx: 30, dot: 10 } as const;

export interface MiniMapDot {
  x: number;
  y: number;
  text: string;
  inside: boolean | null;
}

/**
 * Where "me" sits on the mini-map: east and north of the spot centre in metres, scaled so the
 * site radius is 30 px, clamped into the box. "Inside the spot" within 80% of the radius, "Near the
 * edge" up to it, "Outside the spot" beyond.
 */
export function miniMapDot(spot: { lat: number; lng: number; radiusM: number } | null, fix: LatLng | null): MiniMapDot | null {
  if (!fix) return null;
  if (!spot) return { x: MAP.center, y: MAP.center, text: "No spot chosen", inside: null };
  const d = haversine(spot, fix);
  const north = ((fix.lat - spot.lat) * Math.PI * EARTH_RADIUS_M) / 180;
  const east = ((fix.lng - spot.lng) * Math.PI * EARTH_RADIUS_M * Math.cos((spot.lat * Math.PI) / 180)) / 180;
  const k = MAP.radiusPx / Math.max(spot.radiusM, 1);
  const clamp = (v: number) => Math.round(Math.min(MAP.box - MAP.dot / 2 - 1, Math.max(MAP.dot / 2 + 1, v)));
  const inside = d <= spot.radiusM;
  return { x: clamp(MAP.center + east * k), y: clamp(MAP.center - north * k), text: d <= spot.radiusM * 0.8 ? "Inside the spot" : inside ? "Near the edge" : "Outside the spot", inside };
}

/** "Versova beach, pole 3" → "Pole 3"; "Tiruppur North · spot 1" → "Spot 1" (the bottom bar, CA:376). */
export function spotShort(name: string | null): string {
  if (!name) return "";
  const last = name.split(/\s+·\s+|,\s+/).at(-1)!.trim();
  const s = last.length > 12 ? `${last.slice(0, 11)}…` : last;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** "19.12650° N, 72.81560° E" (CA:501). */
export const coordsText = (fix: LatLng | null): string =>
  fix ? `${Math.abs(fix.lat).toFixed(5)}° ${fix.lat >= 0 ? "N" : "S"}, ${Math.abs(fix.lng).toFixed(5)}° ${fix.lng >= 0 ? "E" : "W"}` : "No location";

/** Sheet steps (CA:492): Uploading, Reading, Checking, Scored; offline the first is Queued. */
export const stepLabels = (offline: boolean) => [offline ? "Queued" : "Uploading", "Reading", "Checking", "Scored"];

const READING = new Set(["parseMetadata", "analyze"]);

/**
 * Which sheet step a real upload is on: 0 while uploading, 1 while the pipeline reads the file
 * (metadata, analysis), 2 while it checks (understanding to scoring), 3 once a score exists.
 */
export function stepOf(s: { uploaded: boolean; scored: boolean; steps: Array<{ name: string; status: string }> }): number {
  if (!s.uploaded) return 0;
  if (s.scored) return 3;
  const done = new Set(s.steps.filter((x) => x.status === "done").map((x) => x.name));
  return [...READING].every((n) => done.has(n)) ? 2 : 1;
}
