/**
 * Parses burned-in GPS-camera stamps from OCR'd image text (ai.textInImage), e.g.
 *   "GPS Map Camera · Andheri East, Mumbai · Lat 19.0988° Long 72.8267° · 14/03/2025 10:42 AM GMT +05:30"
 * Pure; returns only what it can read unambiguously. Out-of-range values are rejected, not guessed.
 */

export interface ParsedStamp {
  lat: number | null;
  lng: number | null;
  /** Calendar date as written (YYYY-MM-DD). */
  date: string | null;
  /** 24 h "HH:MM" if a time was found. */
  time: string | null;
  /** "+05:30" if an offset was found. */
  offset: string | null;
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

const pad = (n: number) => String(n).padStart(2, "0");
const validLat = (v: number) => Number.isFinite(v) && Math.abs(v) <= 90;
const validLng = (v: number) => Number.isFinite(v) && Math.abs(v) <= 180;
const hemi = (v: number, h: string | undefined) => (h && /[SW]/i.test(h) ? -Math.abs(v) : v);

function coordinates(t: string): { lat: number; lng: number } | null {
  const tries: Array<() => [number, number] | null> = [
    // "Lat 19.0988° Long 72.8267°", "Latitude: -33.86 Longitude: 151.21", "Lat 19.1 N Lng 72.8 E"
    () => {
      const m = /\blat(?:itude)?\s*[:=]?\s*(-?\d{1,2}(?:\.\d+)?)\s*°?\s*([NS])?\b[\s,;|]*\b(?:long|lon|lng)(?:itude)?\s*[:=]?\s*(-?\d{1,3}(?:\.\d+)?)\s*°?\s*([EW])?/i.exec(t);
      return m ? [hemi(+m[1], m[2]), hemi(+m[3], m[4])] : null;
    },
    // DMS: 19°05'55.7"N 72°49'36.1"E
    () => {
      const m = /(\d{1,2})\s*°\s*(\d{1,2})\s*'\s*(\d{1,2}(?:\.\d+)?)\s*"?\s*([NS])[\s,;]+(\d{1,3})\s*°\s*(\d{1,2})\s*'\s*(\d{1,2}(?:\.\d+)?)\s*"?\s*([EW])/i.exec(t);
      if (!m) return null;
      const dms = (d: string, mi: string, s: string) => +d + +mi / 60 + +s / 3600;
      if (+m[2] >= 60 || +m[3] >= 60 || +m[6] >= 60 || +m[7] >= 60) return null;
      return [hemi(dms(m[1], m[2], m[3]), m[4]), hemi(dms(m[5], m[6], m[7]), m[8])];
    },
    // 19.0988°N 72.8267°E  /  19.0988 N, 72.8267 E
    () => {
      const m = /(\d{1,2}(?:\.\d+)?)\s*°?\s*([NS])\b[\s,;]+(\d{1,3}(?:\.\d+)?)\s*°?\s*([EW])\b/i.exec(t);
      return m ? [hemi(+m[1], m[2]), hemi(+m[3], m[4])] : null;
    },
    // "GPS: 12.9716, 77.5946" or a bare pair with ≥ 3 decimals
    () => {
      const m = /(-?\d{1,2}\.\d{3,})\s*[,;]\s*(-?\d{1,3}\.\d{3,})/.exec(t);
      return m ? [+m[1], +m[2]] : null;
    },
  ];
  for (const attempt of tries) {
    const r = attempt();
    if (r) return validLat(r[0]) && validLng(r[1]) && !(r[0] === 0 && r[1] === 0) ? { lat: r[0], lng: r[1] } : null;
  }
  return null;
}

function calendar(t: string): string | null {
  const ok = (y: number, m: number, d: number) => {
    if (y < 1990 || y > 2100 || m < 1 || m > 12 || d < 1) return null;
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? `${y}-${pad(m)}-${pad(d)}` : null;
  };
  let m = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(t);
  if (m) return ok(+m[1], +m[2], +m[3]);
  m = /\b(\d{1,2})[\s-]+([A-Za-z]{3,9})\.?[\s,-]+(\d{4})\b/.exec(t);
  if (m) {
    const name = m[2].toLowerCase();
    const month = MONTHS[name.slice(0, 4)] ?? MONTHS[name.slice(0, 3)];
    if (month) return ok(+m[3], month, +m[1]);
  }
  m = /\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\b/.exec(t);
  if (m) {
    const [a, b] = [+m[1], +m[2]];
    // GPS-camera apps in India write day first; fall back to month-first only when unambiguous.
    return b > 12 && a <= 12 ? ok(+m[3], a, b) : ok(+m[3], b, a);
  }
  return null;
}

function clock(t: string): string | null {
  const m = /\b(\d{1,2}):(\d{2})(?::\d{2})?\s*([AaPp][Mm])?(?![\d:])/.exec(t);
  if (!m) return null;
  let h = +m[1];
  const min = +m[2];
  if (min > 59) return null;
  if (m[3]) {
    if (h < 1 || h > 12) return null;
    h = (h % 12) + (/p/i.test(m[3]) ? 12 : 0);
  } else if (h > 23) return null;
  return `${pad(h)}:${pad(min)}`;
}

function offsetOf(t: string): string | null {
  const m = /\b(?:GMT|UTC)\s*([+-])\s*(\d{1,2}):?(\d{2})\b/i.exec(t);
  return m && +m[2] <= 14 && +m[3] < 60 ? `${m[1]}${pad(+m[2])}:${m[3]}` : null;
}

/** Null when the text has neither coordinates nor a date. */
export function parseStamp(text: string | null | undefined): ParsedStamp | null {
  if (!text) return null;
  const t = text.replace(/[′’‘]/g, "'").replace(/[″“”]/g, '"').replace(/\s+/g, " ");
  const c = coordinates(t);
  const date = calendar(t);
  if (!c && !date) return null;
  return { lat: c?.lat ?? null, lng: c?.lng ?? null, date, time: date ? clock(t) : null, offset: offsetOf(t) };
}

/**
 * Days between the stamp's calendar date and a capture instant. Without an offset on the stamp,
 * the capture's date is taken in whichever timezone (UTC−12…+14) brings it closest.
 */
export function stampDayDifference(stamp: ParsedStamp, capturedAtIso: string): number | null {
  if (!stamp.date) return null;
  const cap = Date.parse(capturedAtIso);
  if (Number.isNaN(cap)) return null;
  const stampDay = Date.parse(`${stamp.date}T00:00:00Z`) / 86_400_000;
  const dayAt = (offsetMin: number) => Math.floor((cap + offsetMin * 60_000) / 86_400_000);
  if (stamp.offset) {
    const [, s, h, m] = /([+-])(\d{2}):(\d{2})/.exec(stamp.offset)!;
    return Math.abs(stampDay - dayAt((s === "-" ? -1 : 1) * (+h * 60 + +m)));
  }
  const lo = dayAt(-12 * 60);
  const hi = dayAt(14 * 60);
  return stampDay < lo ? lo - stampDay : stampDay > hi ? stampDay - hi : 0;
}
