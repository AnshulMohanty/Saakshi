/**
 * The report page's numbers (pure): one card per report claim (lib/report/claims.ts, SQL), in the
 * design's form (RP:463-471: a big value, a lowercase label that carries the unit, an optional
 * tag), plus the period line and the Method text built from our own trust config (B5.1).
 */
import type { Claim } from "../claims";
import { countWord } from "../landing/count-word";
import { defaultTrustConfig, type TrustConfig } from "../trust/config";

/** How the design colours a number and its threads (RP:442,459-460). */
export type NumberKind = "verified" | "flagged" | "measured" | "estimated" | "count";

export interface NumberCard {
  key: string;
  kind: NumberKind;
  value: string;
  label: string;
  /** "Mock output", "AI estimate, confidence 60%", or "". */
  tag: string;
  tagTone: "review" | "estimated" | "muted";
  hidden: boolean;
}

const ORDER = ["photos_verified", "photos_flagged", "litter_cover_change", "green_cover_change", "items_visible_change", "spots_monitored", "checkins_after_cleanup", "days_since_last_checkin"];

const MINUS = "−";
const signed = (v: number) => {
  const n = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1 }).format(Math.abs(v));
  return v > 0 ? `+${n}` : v < 0 ? `${MINUS}${n}` : "0";
};

export interface Shown {
  kind: "value" | "hidden";
  text: string;
  mock?: boolean;
}

/** Claims → cards, in the design's order; `show` applies the display policy (lib/provenance showClaim). */
export function numberCards(claims: ReadonlyArray<Claim>, show: (c: Claim) => Shown, event = "clean-up"): NumberCard[] {
  return [...claims]
    .filter((c) => ORDER.includes(c.id))
    .sort((a, b) => ORDER.indexOf(a.id) - ORDER.indexOf(b.id))
    .map((c) => {
      const s = show(c);
      const hidden = s.kind === "hidden";
      const v = c.value;
      const one = v === 1;
      const base: Record<string, { kind: NumberKind; value: string; label: string }> = {
        photos_verified: { kind: "verified", value: String(v), label: one ? "photo verified" : "photos verified" },
        photos_flagged: { kind: "flagged", value: String(v), label: `${one ? "photo" : "photos"} flagged, with reasons` },
        litter_cover_change: { kind: "measured", value: signed(v), label: "points, median change in litter cover, Measured, with mask" },
        green_cover_change: { kind: "measured", value: signed(v), label: "points, median change in green cover, Measured, with mask" },
        items_visible_change: { kind: "estimated", value: `≈${signed(v)}`, label: "items visible, median change" },
        spots_monitored: { kind: "count", value: String(v), label: one ? "spot monitored" : "spots monitored" },
        checkins_after_cleanup: { kind: "count", value: String(v), label: `${one ? "check-in" : "check-ins"} since the ${event}` },
        days_since_last_checkin: { kind: "count", value: String(v), label: one ? "day since the last check-in" : "days since the last check-in" },
      };
      const b = base[c.id];
      const tag = hidden ? s.text : s.mock ? "Mock output" : c.method === "ai_estimated" ? `AI estimate${c.confidence !== undefined ? `, confidence ${Math.round(c.confidence * 100)}%` : ""}` : "";
      return { key: c.id, kind: b.kind, value: hidden ? "–" : b.value, label: b.label, tag, tagTone: hidden ? "muted" : s.mock ? "review" : c.method === "ai_estimated" ? "estimated" : "muted", hidden };
    });
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-09-14", "2026-09-27" → "14 to 27 Sep 2026" (the design's form), widening as needed. */
export function periodLabel(from: string, to: string): string {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  if (from === to) return `${td} ${MONTHS[tm - 1]} ${ty}`;
  if (fy === ty && fm === tm) return `${fd} to ${td} ${MONTHS[tm - 1]} ${ty}`;
  if (fy === ty) return `${fd} ${MONTHS[fm - 1]} to ${td} ${MONTHS[tm - 1]} ${ty}`;
  return `${fd} ${MONTHS[fm - 1]} ${fy} to ${td} ${MONTHS[tm - 1]} ${ty}`;
}

/** The Method section (RP:393-398) from the rules as they are, never hand-written numbers. */
export function methodLines(o: { metric: "litter" | "green"; threshold: number; archive: boolean; planted: number }, cfg: TrustConfig = defaultTrustConfig): string[] {
  const P = cfg.points;
  const fakes = `${countWord(o.planted)} ${o.planted === 1 ? "fake was" : "fakes were"}`;
  return [
    `Trust rules, fixed: location recorded up to ${Math.max(P.locationWitness, P.locationExif, P.locationArchive)}, time in the event window ${P.timeInWindow}, fingerprint is new ${P.unique}, no watermark or edits ${P.authClear}, image quality ${P.quality}, taken in the app ${P.provenance}. Verified at ${cfg.verifiedMin} or more, Needs review from ${cfg.reviewMin}. Any hard fail is Flagged.`,
    `${o.metric === "litter" ? "Litter" : "Green"} cover is measured on photo pixels at mask threshold ${o.threshold.toFixed(2)}. Camera angle, framing, season and light affect the result. Only photos of the same spot are compared.`,
    o.archive
      ? `Photos: Wikimedia Commons, credited on each evidence page, faces blurred.${o.planted ? ` ${fakes} planted to show the checks.` : ""}`
      : "Photos: taken or uploaded by the organisation, faces blurred on every public copy.",
  ];
}
