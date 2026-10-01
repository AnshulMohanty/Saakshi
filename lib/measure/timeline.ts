/**
 * The spot page's timeline (pure): what each measured photo is called on the scrubber, and the
 * counters above it. Labels come only from facts we store (source, capture time, the spot's
 * baseline), never from the AI's stage guess: the baseline is the photo check-ins are compared
 * with, photos before it are "Earlier", Witness check-ins are numbered in time order.
 */

export interface TimelinePhoto {
  id: string;
  /** Capture time, epoch ms. */
  t: number;
  source: string;
}

export interface TimelineLabel {
  label: string;
  /** Appended to the date on the scrubber ("14 Sep 2026, the baseline"). */
  suffix: string;
  who: string;
}

export const SOURCE_WHO: Record<string, string> = {
  witness: "Witness check-in",
  upload: "Uploaded in the app",
  archive: "Demo archive photo",
  planted_test: "Planted test input",
};

const DAY = 86_400_000;

/** `photos` in time order. */
export function timelineLabels(photos: TimelinePhoto[], baselineId: string | null): TimelineLabel[] {
  const base = baselineId ? photos.find((p) => p.id === baselineId) ?? null : null;
  const kind = (p: TimelinePhoto) => (p.source === "witness" ? "checkin" : !base ? "photo" : p.id === base.id ? "baseline" : p.t < base.t || (p.t === base.t && p.id < base.id) ? "earlier" : "later");
  const kinds = photos.map(kind);
  const total = (k: string) => kinds.filter((x) => x === k).length;
  const seen: Record<string, number> = {};
  const NAME: Record<string, string> = { photo: "Photo", earlier: "Earlier", later: "Later" };
  return photos.map((p, i) => {
    const k = kinds[i];
    const n = (seen[k] = (seen[k] ?? 0) + 1);
    const who = SOURCE_WHO[p.source] ?? "Photo";
    if (k === "checkin") return { label: `Check-in ${n}`, suffix: "", who };
    if (k === "baseline") return { label: "Baseline", suffix: ", the baseline", who };
    return { label: total(k) > 1 ? `${NAME[k]} ${n}` : NAME[k], suffix: k === "earlier" ? ", before the baseline" : "", who };
  });
}

/** Whole days from the latest check-in to `now` (null without one; never negative). */
export function daysSince(checkins: Array<number | null>, now: number): number | null {
  const last = Math.max(...checkins.filter((t): t is number => t !== null));
  return Number.isFinite(last) ? Math.max(0, Math.floor((now - last) / DAY)) : null;
}

/** 10 → "10", 3.456 → "3.5" (the design shows whole percentages; measurements keep one decimal). */
export const pct = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));

/** "check-ins since the clean-up": the project's activity in words. */
export const EVENT_WORD: Record<string, string> = { cleanup: "clean-up", plantation: "planting", water: "clean-up", school: "event", other: "event" };
