/**
 * Library search chips (pure; AP:885-912). Enter or a comma turns the query into one chip: a band,
 * a project (by any word of its name or city), "no location", a year, else text. The query is
 * normalised first (lib/search/normalize.ts: Hinglish and typos, "kachra" → "garbage"), and the
 * chip says what it was understood as. Chips narrow the loaded photos together (AND).
 */
import { normaliseQuery } from "../search/normalize";

export type BandName = "Verified" | "Needs review" | "Flagged";

export type Chip =
  | { t: "band"; v: BandName; kind: "Band"; label: string }
  | { t: "project"; v: string; kind: "Project"; label: string }
  | { t: "noloc"; v: 1; kind: "Location"; label: "none recorded" }
  | { t: "year"; v: string; kind: "Taken in"; label: string }
  | { t: "text"; v: string; kind: "Text"; label: string; /** Matches from the hybrid search (lib/search runSearch), when the product asked it. */ ids?: string[] };

export interface ChipProject {
  key: string;
  name: string;
  city: string;
  /** Extra words that name it (the prototype: "versova", "juhu" for Mumbai). */
  aliases?: string[];
}

/** Words too generic to name one project ("beach" is in two of the prototype's three). */
const STOP = new Set(["the", "and", "of", "clean", "cleanup", "up", "beach", "drive", "project", "north", "south", "east", "west"]);
const words = (s: string) => s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 2 && !STOP.has(w));

/** AP:901-912, with project names from the data and the query normalised. */
export function parseChip(q: string, projects: ChipProject[]): Chip | null {
  const raw = q.trim();
  const s = normaliseQuery(raw).text;
  if (!s) return null;
  if (s === "verified") return { t: "band", v: "Verified", kind: "Band", label: "Verified" };
  if (s === "review" || s === "needs review") return { t: "band", v: "Needs review", kind: "Band", label: "Needs review" };
  if (["flagged", "fake", "fakes"].includes(s)) return { t: "band", v: "Flagged", kind: "Band", label: "Flagged" };
  const qw = new Set(s.split(/\s+/));
  for (const p of projects) {
    const names = [...words(p.name), ...words(p.city), ...(p.aliases ?? []).map((a) => a.toLowerCase())];
    if (names.some((w) => qw.has(w))) return { t: "project", v: p.key, kind: "Project", label: projectLabel(p) };
  }
  if (/\bno (location|gps)\b/.test(s)) return { t: "noloc", v: 1, kind: "Location", label: "none recorded" };
  if (/^(19|20)\d\d$/.test(s)) return { t: "year", v: s, kind: "Taken in", label: s };
  return { t: "text", v: s, kind: "Text", label: `"${raw}"` };
}

/** "Versova, Mumbai" from "Versova beach clean-up" and "Mumbai" (the prototype's chip labels). */
export function projectLabel(p: ChipProject): string {
  const head = p.name.split(/[\s,]+/).find((w) => w && !STOP.has(w.toLowerCase()) && !/^clean-?up$/i.test(w)) ?? p.name;
  return p.city ? `${head}, ${p.city}` : head;
}

export interface ChipPhoto {
  id: string;
  band: BandName;
  project: string | null;
  year: string;
  gps: boolean;
  title: string;
  reason: string;
}

/** AP:885-900: the band filter, the zoomed project and every chip, together. */
export function matches(p: ChipPhoto, o: { band: BandName | "all"; zoom: string | null; chips: Chip[] }): boolean {
  if (o.band !== "all" && p.band !== o.band) return false;
  if (o.zoom && p.project !== o.zoom) return false;
  for (const c of o.chips) {
    if (c.t === "band" && p.band !== c.v) return false;
    if (c.t === "project" && p.project !== c.v) return false;
    if (c.t === "year" && p.year !== c.v) return false;
    if (c.t === "noloc" && p.gps) return false;
    if (c.t === "text" && c.ids) {
      if (!c.ids.includes(p.id)) return false;
      continue;
    }
    if (c.t === "text") {
      const hay = normaliseQuery(`${p.title} ${p.reason}`).text;
      if (!c.v.split(/\s+/).every((w) => hay.includes(w))) return false;
    }
  }
  return true;
}
