/**
 * EXIF summary (GPS, capture time, camera) via exifr.
 *
 * Capture time: EXIF DateTimeOriginal has no timezone unless OffsetTimeOriginal is present, and
 * exifr would otherwise interpret it in the *server's* local zone. We resolve it explicitly:
 *   1. DateTimeOriginal + OffsetTimeOriginal/OffsetTime
 *   2. GPSDateStamp + GPSTimeStamp (always UTC)
 *   3. DateTimeOriginal + the configured default offset (EXIF_DEFAULT_UTC_OFFSET)
 */
import exifr from "exifr";
import { dmsToDecimal, isValidLatLng, type Hemisphere } from "../geo";

export interface ExifSummary {
  lat: number | null;
  lng: number | null;
  /** ISO 8601 UTC. */
  takenAt: string | null;
  make: string | null;
  model: string | null;
}

const OFFSET_RE = /^([+-])(\d{2}):?(\d{2})$/;

/** "2025:03:14 09:30:00" + "+05:30" → "2025-03-14T04:00:00.000Z". Null if unparseable. */
export function parseExifDateTime(raw: unknown, offset?: string | null, defaultOffset = "+00:00"): string | null {
  if (typeof raw !== "string") return null;
  const m = /^(\d{4})[:-](\d{2})[:-](\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?/.exec(raw.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi, s, frac] = m;
  const off = OFFSET_RE.exec((offset ?? defaultOffset).trim()) ?? OFFSET_RE.exec(defaultOffset);
  if (!off) return null;
  const sign = off[1] === "-" ? -1 : 1;
  const offsetMin = sign * (Number(off[2]) * 60 + Number(off[3]));
  const ms = frac ? Math.round(Number(`0.${frac}`) * 1000) : 0;
  const utc = Date.UTC(+y, +mo - 1, +d, +h, +mi, +s, ms) - offsetMin * 60_000;
  // Reject impossible dates ("0000:00:00 00:00:00", Feb 31, 25:00, ...), which Date.UTC would roll over.
  const wall = new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s));
  if (+y < 1900 || wall.getUTCMonth() !== +mo - 1 || wall.getUTCDate() !== +d || wall.getUTCHours() !== +h) return null;
  return new Date(utc).toISOString();
}

function gpsTimestamp(dateStamp: unknown, timeStamp: unknown): string | null {
  if (typeof dateStamp !== "string" || !Array.isArray(timeStamp) || timeStamp.length !== 3) return null;
  const [h, m, s] = timeStamp.map(Number);
  const whole = Math.floor(s);
  const pad = (n: number) => String(n).padStart(2, "0");
  return parseExifDateTime(`${dateStamp} ${pad(h)}:${pad(m)}:${pad(whole)}`, "+00:00");
}

function coordinate(value: unknown, ref: unknown): number | null {
  if (typeof value === "number") return value;
  if (!Array.isArray(value) || value.length === 0) return null;
  const [d, m = 0, s = 0] = value.map(Number);
  try {
    return dmsToDecimal(d, m, s, typeof ref === "string" ? (ref.toUpperCase() as Hemisphere) : undefined);
  } catch {
    return null;
  }
}

const text = (v: unknown) => (typeof v === "string" && v.trim() !== "" ? v.trim().replace(/\0+$/, "") : null);

export async function extractExif(input: Buffer, { defaultOffset = "+05:30" } = {}): Promise<ExifSummary | null> {
  let tags: Record<string, unknown> | undefined;
  try {
    tags = await exifr.parse(input, {
      tiff: true,
      exif: true,
      gps: true,
      ifd1: false,
      interop: false,
      xmp: false,
      icc: false,
      iptc: false,
      jfif: false,
      reviveValues: false,
      translateValues: false,
    });
  } catch {
    return null; // not an image exifr understands, or corrupt metadata
  }
  if (!tags) return null;

  let lat = coordinate(tags.GPSLatitude, tags.GPSLatitudeRef);
  let lng = coordinate(tags.GPSLongitude, tags.GPSLongitudeRef);
  // (0, 0) is almost always a device writing zeros, not a photo in the Gulf of Guinea.
  if (!isValidLatLng({ lat: lat ?? undefined, lng: lng ?? undefined }) || (lat === 0 && lng === 0)) {
    lat = null;
    lng = null;
  }

  const offset = text(tags.OffsetTimeOriginal) ?? text(tags.OffsetTime);
  const original = tags.DateTimeOriginal ?? tags.CreateDate ?? tags.DateTime;
  const takenAt =
    (offset ? parseExifDateTime(original, offset) : null) ??
    gpsTimestamp(tags.GPSDateStamp, tags.GPSTimeStamp) ??
    parseExifDateTime(original, null, defaultOffset);

  const summary: ExifSummary = { lat, lng, takenAt, make: text(tags.Make), model: text(tags.Model) };
  return Object.values(summary).every((v) => v === null) ? null : summary;
}
