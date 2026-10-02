/**
 * EXIF summary (GPS, capture time, camera).
 *
 * `summarizeExif` is pure and accepts either exifr's raw values or Cloudinary-style
 * media_metadata strings ("12 deg 58' 18.00\" N", "2025:03:14 09:30:00"), so mock and real
 * uploads go through the same code.
 *
 * Capture time: EXIF DateTimeOriginal has no timezone unless OffsetTimeOriginal is present, and
 * exifr would otherwise interpret it in the *server's* local zone. We resolve it explicitly:
 *   1. DateTimeOriginal + OffsetTimeOriginal/OffsetTime         (tz known)
 *   2. GPSDateStamp + GPSTimeStamp, always UTC                  (tz known)
 *   3. DateTimeOriginal + the default offset (EXIF_DEFAULT_UTC_OFFSET) → takenAtTzAssumed = true
 */
import exifr from "exifr";
import { dmsToDecimal, isValidLatLng, parseDms, type Hemisphere } from "../geo";

export interface ExifSummary {
  lat: number | null;
  lng: number | null;
  /** ISO 8601 UTC. */
  takenAt: string | null;
  /** takenAt had no offset in the file; the default offset was assumed. */
  takenAtTzAssumed: boolean;
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
  if (typeof dateStamp !== "string") return null;
  const parts = Array.isArray(timeStamp) ? timeStamp.map(Number) : typeof timeStamp === "string" ? timeStamp.split(":").map(Number) : null;
  if (!parts || parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return null;
  const pad = (n: number) => String(Math.floor(n)).padStart(2, "0");
  return parseExifDateTime(`${dateStamp.replace(/-/g, ":")} ${pad(parts[0])}:${pad(parts[1])}:${pad(parts[2])}`, "+00:00");
}

function coordinate(value: unknown, ref: unknown): number | null {
  const hemi = typeof ref === "string" && /^[NSEW]/i.test(ref.trim()) ? (ref.trim()[0].toUpperCase() as Hemisphere) : undefined;
  try {
    if (typeof value === "number") return hemi === "S" || hemi === "W" ? -Math.abs(value) : value;
    if (typeof value === "string" && value.trim() !== "") {
      const v = parseDms(value);
      return hemi === "S" || hemi === "W" ? -Math.abs(v) : v;
    }
    if (Array.isArray(value) && value.length > 0) {
      const [d, m = 0, s = 0] = value.map(Number);
      return dmsToDecimal(d, m, s, hemi);
    }
  } catch {
    // unparseable coordinate
  }
  return null;
}

const text = (v: unknown) => (typeof v === "string" && v.trim() !== "" ? v.trim().replace(/\0+$/, "") : null);

/** Pure: raw EXIF-like tags (exifr raw values or Cloudinary media_metadata strings) → summary. */
export function summarizeExif(tags: Record<string, unknown> | null | undefined, { defaultOffset = "+05:30" } = {}): ExifSummary | null {
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
  const known = (offset ? parseExifDateTime(original, offset) : null) ?? gpsTimestamp(tags.GPSDateStamp, tags.GPSTimeStamp);
  const assumed = known ? null : parseExifDateTime(original, null, defaultOffset);

  const summary: ExifSummary = {
    lat,
    lng,
    takenAt: known ?? assumed,
    takenAtTzAssumed: !known && assumed !== null,
    make: text(tags.Make),
    model: text(tags.Model),
  };
  const { takenAtTzAssumed: _flag, ...values } = summary;
  void _flag;
  return Object.values(values).every((v) => v === null) ? null : summary;
}

/** Raw EXIF tags from an image (exifr, values not revived). Null when there are none. */
export async function readExifTags(input: Buffer): Promise<Record<string, unknown> | null> {
  try {
    const tags = await exifr.parse(input, {
      tiff: true, exif: true, gps: true, ifd1: false, interop: false, xmp: false, icc: false, iptc: false, jfif: false,
      reviveValues: false, translateValues: false,
    });
    return tags ?? null;
  } catch {
    return null; // not an image exifr understands, or corrupt metadata
  }
}

export async function extractExif(input: Buffer, opts: { defaultOffset?: string } = {}): Promise<ExifSummary | null> {
  return summarizeExif(await readExifTags(input), opts);
}

const MEDIA_METADATA_TAGS = [
  "Make", "Model", "DateTimeOriginal", "CreateDate", "OffsetTimeOriginal", "OffsetTime", "GPSDateStamp", "Orientation", "Software",
];

function dmsString(v: unknown, ref: unknown): string | null {
  if (!Array.isArray(v) || v.length !== 3) return null;
  const [d, m, s] = v.map(Number);
  return `${d} deg ${m}' ${s.toFixed(2)}"${typeof ref === "string" ? ` ${ref}` : ""}`;
}

/** Cloudinary-style media_metadata (string values) from raw exifr tags, as the mock returns. */
export function toMediaMetadata(tags: Record<string, unknown> | null): Record<string, string> {
  if (!tags) return {};
  const out: Record<string, string> = {};
  for (const k of MEDIA_METADATA_TAGS) {
    const v = text(typeof tags[k] === "number" ? String(tags[k]) : tags[k]);
    if (v) out[k] = v;
  }
  const lat = dmsString(tags.GPSLatitude, tags.GPSLatitudeRef);
  const lng = dmsString(tags.GPSLongitude, tags.GPSLongitudeRef);
  if (lat) out.GPSLatitude = lat;
  if (lng) out.GPSLongitude = lng;
  if (Array.isArray(tags.GPSTimeStamp)) out.GPSTimeStamp = (tags.GPSTimeStamp as number[]).map((n) => String(Math.floor(n)).padStart(2, "0")).join(":");
  return out;
}
