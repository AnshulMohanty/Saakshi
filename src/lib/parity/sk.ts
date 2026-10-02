/**
 * The prototype's placeholder trust rules (saakshi-kit.js SK.score, SK.band: weights
 * 10/25/25/25/15, bands 80/40, a screen photo a hard fail), for the /dev/parity fixtures only.
 * B5.1: the product scores with lib/trust; tests/design-boundary.test.ts keeps this out of it.
 */
import type { SimView } from "@/components/how/how-it-works";
import type { SimFacts } from "../trust/simulate";
import type { TrustBand } from "../trust/types";

export function skScore(s: SimFacts): SimView {
  const rows: Array<{ label: string; pts: number; max: number; note: string; warn?: boolean; bad?: boolean }> = [];
  const hard: string[] = [];
  const app = s.loc === "witness" ? 10 : 0;
  rows.push({ label: "Taken in the Saakshi app", pts: app, max: 10, note: app ? "Witness camera, not the gallery" : "Imported from a gallery or the web" });
  const locPts = { witness: 25, camera: 25, archive: 10, none: 0 }[s.loc];
  const locNote = { witness: "GPS recorded at capture", camera: "From the camera file", archive: "Project site used, not a real fix", none: "No location recorded" }[s.loc];
  rows.push({ label: "Location recorded", pts: locPts, max: 25, note: locNote, warn: s.loc === "none" || s.loc === "archive" });
  if (s.loc !== "none" && s.loc !== "archive" && !s.inside) hard.push("Taken outside the site boundary");
  rows.push({ label: "Time recorded", pts: s.inWindow ? 25 : 10, max: 25, note: s.inWindow ? "Inside the clean-up window" : "Outside the window, or file date only", warn: !s.inWindow });
  const dupNote = { none: "No match in any project", burst: "Part of a burst, counted once", revisit: "Same spot on a later day: a check-in", other: "Same photo already used in another project" }[s.dup];
  if (s.dup === "other") hard.push("Same photo already used in another project");
  rows.push({ label: "Fingerprint is new", pts: s.dup === "other" ? 0 : 25, max: 25, note: dupNote, bad: s.dup === "other" });
  let integ = 15;
  const notes: string[] = [];
  if (s.watermark) {
    integ = 0;
    hard.push("Stock-site watermark");
    notes.push("Watermark found");
  }
  if (s.screen) {
    integ = 0;
    hard.push("Photo of a screen");
    notes.push("Screen pattern found");
  }
  if (s.quality === "poor") {
    integ = Math.max(0, integ - 5);
    notes.push("Too blurry to measure");
  }
  if (!s.camera) notes.push("No camera info to cross-check");
  rows.push({ label: "No watermark or edits", pts: integ, max: 15, note: notes.join(". ") || "Nothing found", bad: s.watermark || s.screen, warn: s.quality === "poor" });
  const score = rows.reduce((n, r) => n + r.pts, 0);
  const band: TrustBand = hard.length ? "FLAGGED" : score >= 80 ? "VERIFIED" : score >= 40 ? "NEEDS_REVIEW" : "FLAGGED";
  return { score, band, hard, rows: rows.map((r) => ({ label: r.label, note: r.note, pts: r.pts, max: r.max, tone: r.bad ? "bad" : r.pts === r.max ? "good" : r.warn ? "warn" : "neutral" })) };
}

export const SK_PRESETS: Record<"witness" | "google" | "reused", SimFacts> = {
  witness: { loc: "witness", inside: true, inWindow: true, dup: "none", watermark: false, screen: false, quality: "good", camera: true },
  google: { loc: "none", inside: true, inWindow: false, dup: "none", watermark: false, screen: false, quality: "good", camera: false },
  reused: { loc: "camera", inside: true, inWindow: true, dup: "other", watermark: false, screen: false, quality: "good", camera: true },
};

/** The prototype's exclusion for its before photo (HW:513): the sea at the top, the people in the middle. */
export const beforeExclusion = (x: number, y: number) => y * 685 < 400 - ((x * 1024) / 1024) * 260 || (x > 225 / 1024 && x < 690 / 1024 && y > 350 / 685 && y < 595 / 685);
