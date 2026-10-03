/**
 * The evidence drawer in plain words (components/app/evidence-drawer.tsx; pure, tested): a
 * one-line verdict, the trust rows grouped by the question each answers (Where? When? Is it
 * original? Is it clear?), a why-line for every row short of its points, and a breakdown of the
 * score that always adds up: the rows' points, plus the cap a hard flag applies, equal the score.
 * Nothing here scores: the numbers are the Trust Engine's (lib/trust), only arranged.
 */
import type { BandName } from "./chips";

export type QuestionKey = "where" | "when" | "original" | "clear" | "other";

export interface DrawerRow {
  /** The Trust Engine signal (location, time, uniqueness, authenticity, quality, provenance). */
  signal?: string;
  label: string;
  note: string;
  pts: number;
  max: number;
  tone: "good" | "warn" | "bad" | "neutral";
}

export const QUESTIONS: Array<{ key: QuestionKey; ask: string; short: string }> = [
  { key: "where", ask: "Where was it taken?", short: "Where" },
  { key: "when", ask: "When was it taken?", short: "When" },
  { key: "original", ask: "Is it original?", short: "Original" },
  { key: "clear", ask: "Is it clear enough to measure?", short: "Clear" },
  { key: "other", ask: "Other checks", short: "Other" },
];

const BY_SIGNAL: Record<string, QuestionKey> = { location: "where", time: "when", uniqueness: "original", authenticity: "original", provenance: "original", quality: "clear" };

/** Which question a row answers: by its signal, else by the words of its label. */
export function questionOf(r: Pick<DrawerRow, "signal" | "label">): QuestionKey {
  if (r.signal && BY_SIGNAL[r.signal]) return BY_SIGNAL[r.signal];
  const l = r.label.toLowerCase();
  if (/locat|gps|site|place|where/.test(l)) return "where";
  if (/time|date|when|window/.test(l)) return "when";
  if (/sharp|blur|expos|quality|clear|measure/.test(l)) return "clear";
  if (/fingerprint|copy|watermark|edit|stock|screen|camera|app|original|reuse/.test(l)) return "original";
  return "other";
}

export interface QuestionGroup {
  key: QuestionKey;
  ask: string;
  short: string;
  rows: Array<DrawerRow & { why: string | null }>;
  pts: number;
  max: number;
  /** good: every row at full points; warn: short somewhere; bad: a row the engine marked bad. */
  tone: "good" | "warn" | "bad";
  /** The question answered: yes (full points), no (a bad row, or no points at all), partly. */
  answer: "Yes" | "Partly" | "No";
}

const trimDot = (s: string) => s.trim().replace(/[.\s]+$/, "");
/** Lowers the first letter only: later sentences keep their capitals. */
const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** Why a row is short of its points, in a line ("15 points short: no capture time…"); null at full points. */
export function whyLine(r: DrawerRow): string | null {
  if (r.pts >= r.max) return null;
  const short = r.max - r.pts;
  const note = trimDot(r.note || r.label);
  return `${short} ${short === 1 ? "point" : "points"} short: ${lowerFirst(note)}.`;
}

export function groupRows(rows: DrawerRow[]): QuestionGroup[] {
  return QUESTIONS.flatMap((q) => {
    const rs = rows.filter((r) => questionOf(r) === q.key);
    if (!rs.length) return [];
    const tone: QuestionGroup["tone"] = rs.some((r) => r.tone === "bad") ? "bad" : rs.every((r) => r.pts >= r.max) ? "good" : "warn";
    const pts = rs.reduce((n, r) => n + r.pts, 0);
    const answer = tone === "good" ? "Yes" : tone === "bad" || pts <= 0 ? "No" : "Partly";
    return [{ ...q, rows: rs.map((r) => ({ ...r, why: whyLine(r) })), pts, max: rs.reduce((n, r) => n + r.max, 0), tone, answer }];
  });
}

export interface Breakdown {
  parts: Array<{ key: QuestionKey; short: string; pts: number; max: number }>;
  /** Σ of the rows' points. */
  sum: number;
  /** What brings the sum to the score (a hard flag's cap, or the 0–100 clamp); null when the sum is the score. */
  adjust: { pts: number; why: string } | null;
  score: number;
}

/** The score as a sum: each question's points, then the adjustment, = score. Null when the score is hidden or missing. */
export function pointsBreakdown(rows: DrawerRow[], score: number | null, hard: string[]): Breakdown | null {
  if (score === null) return null;
  const parts = groupRows(rows).map((g) => ({ key: g.key, short: g.short, pts: g.pts, max: g.max }));
  const sum = parts.reduce((n, p) => n + p.pts, 0);
  const d = score - sum;
  const why = hard.length ? `capped by a hard flag: ${lowerFirst(trimDot(hard[0]))}` : sum > 100 || sum < 0 ? "kept between 0 and 100" : "adjusted by the rules";
  return { parts, sum, adjust: d === 0 ? null : { pts: d, why }, score };
}

/** One line a non-expert can act on: what the band means for this photo, and the deciding reason. */
export function plainVerdict(band: BandName, reason: string, hard: string[]): string {
  const lower = lowerFirst(trimDot(hard[0] ?? reason));
  if (band === "Verified") return `Good to use as proof: ${lower}.`;
  if (band === "Needs review") return `Not proven yet: ${lower}. A person should check it before it counts.`;
  return `Don't count this photo: ${lower}.`;
}
