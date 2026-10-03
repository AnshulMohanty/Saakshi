/**
 * Pure helpers behind the landing's words and layout (tested): the design's sentences filled
 * from our data (B5.4) instead of its samples.
 */
import { describeReason } from "../trust/reasons";
import type { TrustReason } from "../trust/types";

/** "Palayakkadu, TiruppurNorth, Tamil Nadu, India" → "Palayakkadu, TiruppurNorth". */
export function placeShort(place: string | null | undefined, parts = 2): string | null {
  if (!place) return null;
  return place
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, parts)
    .join(", ");
}

/** "River clean-up, Tiruppur North" → { name: "River clean-up", city: "Tiruppur North" }. */
export function splitProjectName(name: string): { name: string; city: string } {
  const i = name.lastIndexOf(", ");
  return i > 0 ? { name: name.slice(0, i), city: name.slice(i + 2) } : { name, city: "" };
}

/** "2017 to 2020", "2017", or "" (years of the dates given). */
export function yearRange(dates: Array<Date | null | undefined>): string {
  const ys = dates.filter((d): d is Date => !!d && !Number.isNaN(d.getTime())).map((d) => d.getUTCFullYear());
  if (!ys.length) return "";
  const a = Math.min(...ys);
  const b = Math.max(...ys);
  return a === b ? String(a) : `${a} to ${b}`;
}

const km = (v: unknown) => (typeof v === "number" ? (v >= 10 ? Math.round(v).toLocaleString("en-IN") : String(v)) : "?");

/** The headline for a flagged photo (chapter 3), from the reason that flagged it. */
export function flagTitle(r: Pick<TrustReason, "code" | "detail">): string {
  const d = r.detail;
  switch (r.code) {
    case "REUSED":
      return `Same photo already used in ${d.otherProject ?? "another project"}`;
    case "STOCK_SUSPECTED":
      return "Stock-site watermark";
    case "WATERMARK_UNCONFIRMED":
      return "A possible watermark, for a person to check";
    case "LOCATION_MISMATCH":
      return `Taken ${km(d.distanceKm)} km from the site`;
    case "STAMP_MISMATCH":
      return d.distanceKm !== null && Number(d.distanceKm) > 1 ? `The stamp says ${km(d.distanceKm)} km away. The camera says here.` : "The stamp's date doesn't match the camera's.";
    case "SCREEN_OR_PRINT":
      return "A photo of a screen";
    case "COMPOSITED":
      return "May be composited";
    case "TIME_OUTSIDE":
      return "Taken outside the event dates";
    case "POSSIBLE_DUPLICATE":
      return "The same file, submitted twice";
    default:
      return "Flagged for a person to check";
  }
}

/** The reason that decides a flagged photo's headline: a hard flag first, then a review flag. */
export function decisiveReason<T extends Pick<TrustReason, "kind">>(reasons: T[]): T | null {
  return reasons.find((r) => r.kind === "hard") ?? reasons.find((r) => r.kind === "review") ?? null;
}

/**
 * Stack layout on the chapter 2 map (generalising the prototype's Mumbai-left, Pune-below): the
 * hero project stacks left of its pin with its label below; the others stack right, and a
 * project whose pin is within `nearDeg` of an earlier one stacks below its pin so the stacks
 * don't collide.
 */
export function stackLayout<P extends { key: string; lat: number; lng: number; isHero: boolean }>(projects: P[], nearDeg = 3): Array<P & { stackDir: -1 | 1; stackBelow: boolean; labelBelow: boolean }> {
  const placed: P[] = [];
  return projects.map((p) => {
    const near = placed.some((q) => Math.abs(q.lat - p.lat) < nearDeg && Math.abs(q.lng - p.lng) < nearDeg);
    placed.push(p);
    return { ...p, stackDir: p.isHero ? -1 : 1, stackBelow: !p.isHero && near, labelBelow: p.isHero };
  });
}

/** "Covid 19 Tiruppur Tamil Nadu IMG 20200330 092215663.jpg" → without the extension. */
export const creditTitle = (t: string | null | undefined) => (t ?? "Untitled").replace(/\.(jpe?g|png|webp|tiff?)$/i, "");

/** Label 4 of the hero: "Plastic bottles, bags, people." from the AI's visible counts or tags. */
export function aiSentence(labels: string[]): string {
  const uniq = [...new Set(labels.map((l) => l.trim()).filter(Boolean))].slice(0, 6);
  if (!uniq.length) return "Nothing tagged yet.";
  const s = uniq.join(", ");
  return `${s[0].toUpperCase()}${s.slice(1)}.`;
}

/** The line under a Witness arrival: its flag if it has one, else its first scoring reason. */
export function arrivalReason(reasons: TrustReason[] | null | undefined): string {
  const rs = reasons ?? [];
  const r = decisiveReason(rs) ?? rs.find((x) => x.kind === "points" && x.points > 0) ?? rs[0];
  return r ? describeReason(r) : "Checking";
}
