/** Pure geographic helpers. Distances are in metres; coordinates are WGS84 decimal degrees. */

export interface LatLng {
  lat: number;
  lng: number;
}

/** Mean Earth radius (IUGG), metres. */
export const EARTH_RADIUS_M = 6_371_008.8;

const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance between two points, in metres. */
export function haversine(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** True when `point` lies within `radiusM` metres of `center` (inclusive). */
export function withinRadius(center: LatLng, point: LatLng, radiusM: number): boolean {
  return haversine(center, point) <= radiusM;
}

export type Hemisphere = "N" | "S" | "E" | "W";

/** Degrees/minutes/seconds to signed decimal degrees. S and W are negative. */
export function dmsToDecimal(degrees: number, minutes = 0, seconds = 0, ref?: Hemisphere): number {
  if (minutes < 0 || minutes >= 60 || seconds < 0 || seconds >= 60) {
    throw new RangeError(`Invalid DMS minutes/seconds: ${minutes}' ${seconds}"`);
  }
  const sign = degrees < 0 || Object.is(degrees, -0) || ref === "S" || ref === "W" ? -1 : 1;
  const value = Math.abs(degrees) + minutes / 60 + seconds / 3600;
  const max = ref === "E" || ref === "W" ? 180 : ref === "N" || ref === "S" ? 90 : 180;
  if (value > max) throw new RangeError(`DMS value ${value} exceeds ${max}°`);
  return sign * value;
}

const DMS_RE =
  /^\s*(-?\d+(?:\.\d+)?)\s*(?:°|deg\b|d\b|:|\s)?\s*(?:(\d+(?:\.\d+)?)\s*(?:['′m]|:|\s)\s*)?(?:(\d+(?:\.\d+)?)\s*(?:["″s]|'')?\s*)?([NSEW])?\s*$/i;

/** Parses `12°58'30.5"N`, `77 35 40 E`, `-12:58:30` or exiftool's `12 deg 58' 30.50" N`. */
export function parseDms(input: string): number {
  const m = DMS_RE.exec(input);
  if (!m) throw new SyntaxError(`Unrecognised DMS coordinate: "${input}"`);
  const [, d, min, sec, ref] = m;
  return dmsToDecimal(Number(d), min ? Number(min) : 0, sec ? Number(sec) : 0, ref?.toUpperCase() as Hemisphere | undefined);
}

export function isValidLatLng(p: Partial<LatLng> | null | undefined): p is LatLng {
  return (
    !!p &&
    typeof p.lat === "number" &&
    typeof p.lng === "number" &&
    Number.isFinite(p.lat) &&
    Number.isFinite(p.lng) &&
    Math.abs(p.lat) <= 90 &&
    Math.abs(p.lng) <= 180
  );
}

/** Stable cache key for a coordinate rounded to `dp` decimal places (3 dp ≈ 110 m). */
export function coordKey(lat: number, lng: number, dp = 3): string {
  const round = (v: number) => {
    const r = Number(v.toFixed(dp));
    return (Object.is(r, -0) ? 0 : r).toFixed(dp);
  };
  return `${round(lat)},${round(lng)}`;
}
