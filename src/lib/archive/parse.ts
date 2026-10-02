/**
 * Pure parsing of Wikimedia Commons API responses (action=query, prop=imageinfo with
 * extmetadata + commonmetadata). No network, no clock: tested with saved real responses.
 *
 * Note: thumbnails carry no EXIF. Everything here comes from the API ("commons_api"), and
 * callers must store it as such, never as if it were read from the file.
 */

export type LicenseClass = "cc0" | "pd" | "cc-by" | "cc-by-sa";
export const ALLOWED_LICENSES: ReadonlySet<LicenseClass> = new Set(["cc0", "pd", "cc-by", "cc-by-sa"]);
export const ALLOWED_MIME = new Set(["image/jpeg", "image/png"]);
export const MIN_WIDTH = 1024;

export interface CommonsDate {
  /** Wall-clock time as written, no offset: "2013-08-14T12:37:23" (missing parts zero-filled). */
  local: string;
  precision: "second" | "minute" | "day" | "month" | "year";
  source: "exif" | "description";
}

export interface CommonsFile {
  pageId: number;
  /** "commons:<pageid>": the import idempotency key. */
  externalId: string;
  title: string;
  descriptionUrl: string;
  url: string;
  thumbUrl: string | null;
  thumbWidth: number | null;
  thumbHeight: number | null;
  width: number;
  height: number;
  size: number;
  mime: string;
  sha1: string;
  author: string | null;
  license: string | null;
  licenseClass: LicenseClass | null;
  licenseUrl: string | null;
  attributionRequired: boolean;
  description: string | null;
  date: CommonsDate | null;
  lat: number | null;
  lng: number | null;
  /** desc_page = {{Location}} on the file page (curated); exif = GPS from the original file. */
  gpsSource: "desc_page" | "exif" | null;
  make: string | null;
  model: string | null;
  restrictions: string | null;
}

// ---------------------------------------------------------------------------------------------
// Helpers

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", copy: "©", reg: "®", deg: "°", hellip: "…",
  ndash: "–", mdash: "—", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", aacute: "á", eacute: "é", iacute: "í",
  oacute: "ó", uacute: "ú", agrave: "à", egrave: "è", auml: "ä", ouml: "ö", uuml: "ü", ntilde: "ñ", ccedil: "ç",
};

/** Strips tags and decodes common entities; collapses whitespace. */
export function stripHtml(html: string | null | undefined): string | null {
  if (html == null) return null;
  const text = String(html)
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
      if (e[0] === "#") {
        const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : m;
      }
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .replace(/\s+/g, " ")
    .trim();
  return text === "" ? null : text;
}

/** Maps a Commons LicenseShortName to an allowed class, or null (GFDL, "Attribution", NC/ND, …). */
export function classifyLicense(shortName: string | null | undefined): LicenseClass | null {
  if (!shortName) return null;
  const s = shortName.trim().toUpperCase().replace(/\s+/g, " ");
  if (/\b(NC|ND)\b/.test(s)) return null;
  if (/^CC0\b/.test(s) || /^CC ZERO/.test(s)) return "cc0";
  if (/^PUBLIC DOMAIN\b/.test(s) || /^PD(\b|-)/.test(s)) return "pd";
  if (/^CC[ -]BY[ -]SA\b/.test(s)) return "cc-by-sa";
  if (/^CC[ -]BY\b/.test(s)) return "cc-by";
  return null;
}

/**
 * Commons dates: EXIF "2013:08:14 12:37:23", "2021-09-18 15:14:19", "2013-08-14",
 * "<time datetime=\"2013-08-14\">14 August 2013</time>", "2013-08", "2013".
 */
export function parseCommonsDate(value: unknown, source: CommonsDate["source"]): CommonsDate | null {
  if (value == null) return null;
  let raw = String(value);
  const dt = /datetime="([^"]+)"/i.exec(raw);
  if (dt) raw = dt[1];
  raw = stripHtml(raw) ?? "";
  const full = /(\d{4})[-:](\d{2})[-:](\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(raw);
  const pad = (n: string | undefined) => (n ?? "00").padStart(2, "0");
  const ok = (y: number, m: number, d = 1) => y >= 1900 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31;
  if (full) {
    const [, y, mo, d, h, mi, s] = full;
    if (!ok(+y, +mo, +d) || (h !== undefined && (+h > 23 || +mi > 59 || +(s ?? 0) > 59))) return null;
    return {
      local: `${y}-${mo}-${d}T${pad(h)}:${pad(mi)}:${pad(s)}`,
      precision: h === undefined ? "day" : s === undefined ? "minute" : "second",
      source,
    };
  }
  const month = /\b(\d{4})-(\d{2})\b/.exec(raw);
  if (month && ok(+month[1], +month[2])) return { local: `${month[1]}-${month[2]}-01T00:00:00`, precision: "month", source };
  const year = /\b(19\d{2}|20\d{2})\b/.exec(raw);
  if (year) return { local: `${year[1]}-01-01T00:00:00`, precision: "year", source };
  return null;
}

function num(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : Number.NaN;
  return Number.isFinite(n) ? n : null;
}

function validCoord(lat: number | null, lng: number | null): lat is number {
  return lat !== null && lng !== null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);
}

/** Removes tracking query params so cache keys and stored URLs are stable. */
export function cleanThumbUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    for (const k of [...u.searchParams.keys()]) if (k.startsWith("utm_")) u.searchParams.delete(k);
    return u.toString();
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------------------------
// Page → CommonsFile

type Ext = Record<string, { value?: unknown } | undefined>;
type Common = Array<{ name: string; value: unknown }>;

export interface RawPage {
  pageid?: number;
  title?: string;
  missing?: boolean;
  imageinfo?: Array<Record<string, unknown>>;
}

export function parsePage(page: RawPage): CommonsFile | null {
  const ii = page.imageinfo?.[0];
  if (!ii || page.pageid === undefined || !page.title) return null;
  const ext = (ii.extmetadata ?? {}) as Ext;
  const common = (Array.isArray(ii.commonmetadata) ? ii.commonmetadata : []) as Common;
  const cm = (name: string) => common.find((c) => c.name === name)?.value;
  const ev = (name: string) => ext[name]?.value;

  let lat = num(ev("GPSLatitude"));
  let lng = num(ev("GPSLongitude"));
  let gpsSource: CommonsFile["gpsSource"] = validCoord(lat, lng) ? "desc_page" : null;
  if (!gpsSource) {
    lat = num(cm("GPSLatitude"));
    lng = num(cm("GPSLongitude"));
    gpsSource = validCoord(lat, lng) ? "exif" : null;
  }
  if (!gpsSource) {
    lat = null;
    lng = null;
  }

  const licenseName = stripHtml(ev("LicenseShortName") as string);
  const text = (v: unknown) => (typeof v === "string" ? stripHtml(v) : null);

  return {
    pageId: page.pageid,
    externalId: `commons:${page.pageid}`,
    title: page.title,
    descriptionUrl: String(ii.descriptionurl ?? ""),
    url: String(ii.url ?? ""),
    thumbUrl: cleanThumbUrl(ii.thumburl as string | undefined),
    thumbWidth: num(ii.thumbwidth),
    thumbHeight: num(ii.thumbheight),
    width: num(ii.width) ?? 0,
    height: num(ii.height) ?? 0,
    size: num(ii.size) ?? 0,
    mime: String(ii.mime ?? ""),
    sha1: String(ii.sha1 ?? ""),
    author: text(ev("Artist")),
    license: licenseName,
    licenseClass: classifyLicense(licenseName),
    licenseUrl: text(ev("LicenseUrl")),
    attributionRequired: String(ev("AttributionRequired") ?? "").toLowerCase() === "true",
    description: text(ev("ImageDescription")),
    // EXIF from the original beats the free-form description-page date.
    date: parseCommonsDate(cm("DateTimeOriginal"), "exif") ?? parseCommonsDate(ev("DateTimeOriginal"), "description"),
    lat,
    lng,
    gpsSource,
    make: text(cm("Make")),
    model: text(cm("Model")),
    restrictions: text(ev("Restrictions")),
  };
}

/** Parses every page of a query response; skips pages without imageinfo. */
export function parseQueryResponse(json: { query?: { pages?: RawPage[] } }): CommonsFile[] {
  return (json.query?.pages ?? []).map(parsePage).filter((f): f is CommonsFile => f !== null);
}

// ---------------------------------------------------------------------------------------------
// Filtering

export type RejectReason = "mime" | "too_small" | "license" | "no_thumbnail";

export function rejectReasons(f: CommonsFile): RejectReason[] {
  const reasons: RejectReason[] = [];
  if (!ALLOWED_MIME.has(f.mime)) reasons.push("mime");
  if (f.width < MIN_WIDTH) reasons.push("too_small");
  if (!f.licenseClass || !ALLOWED_LICENSES.has(f.licenseClass)) reasons.push("license");
  if (!f.thumbUrl) reasons.push("no_thumbnail");
  return reasons;
}

export const isUsable = (f: CommonsFile) => rejectReasons(f).length === 0;
