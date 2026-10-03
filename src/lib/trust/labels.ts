/**
 * Short labels for the TrustMeter's rule chips ("Location recorded, 25"; "No location recorded,
 * 0 of 30"), the design's chip wording over our engine's reasons and points (B5.1: the design's
 * five rules and weights were placeholders). Pure and browser-safe; the long sentences stay in
 * ./reasons.ts.
 */
import { defaultTrustConfig, type TrustConfig } from "./config";
import type { ReasonCode, TrustReason, TrustSignalName } from "./types";

const LABEL: Record<ReasonCode, string> = {
  LOCATION_WITNESS: "Taken in the Saakshi app, inside the site",
  LOCATION_WITNESS_UNATTESTED: "Inside the site, not attested",
  LOCATION_EXIF: "Location recorded",
  LOCATION_ARCHIVE: "Location from the archive record",
  LOCATION_NONE: "No location recorded",
  LOCATION_NO_SITE: "No site to check against",
  LOCATION_MISMATCH: "Taken outside the site",
  LOCATION_CONFLICT: "Two locations disagree",
  UPLOADER_LOCATION: "Uploader location, information only",
  TIME_IN_WINDOW: "Time recorded",
  TIME_CHECKIN: "Check-in at a monitored spot",
  TIME_UPLOAD_ONLY: "Upload time only",
  TIME_OUTSIDE: "Taken outside the event dates",
  TIME_NO_WINDOW: "No event dates to check",
  UNIQUE: "Fingerprint is new",
  BURST: "Part of a burst, counted once",
  REVISIT: "Same spot, later day",
  SIMILAR_IN_PROJECT: "Similar photos in the project",
  POSSIBLE_DUPLICATE: "Same file already here",
  REUSED: "Same photo used in another project",
  COPY_LATER_SUBMITTED: "A copy was submitted later",
  AUTH_CLEAR: "No watermark or edits",
  AUTH_UNCHECKED: "Not checked for edits yet",
  SCREEN_OR_PRINT: "Photo of a screen or print",
  COMPOSITED: "May be composited",
  STOCK_SUSPECTED: "Stock-site watermark",
  WATERMARK_UNCONFIRMED: "Possible watermark, unconfirmed",
  STAMP_CONSISTENT: "Stamp agrees",
  STAMP_UNVERIFIABLE: "Stamp can't be checked",
  STAMP_MISMATCH: "Stamp disagrees with the camera",
  QUALITY_OK: "Sharp enough to measure",
  QUALITY_LOW: "Too blurry to measure",
  QUALITY_UNKNOWN: "Quality not assessed",
  PROVENANCE_CAMERA: "Camera recorded",
  PROVENANCE_NONE: "No camera info",
  PRIVACY_CHILDREN: "Children visible, faces blurred",
  HARD_FLAG_CAP: "Capped by a flag",
};

/** Most points a signal can add, from the config (location 30, time 20, fingerprint 20, …). */
export function signalMax(signal: TrustSignalName, cfg: TrustConfig = defaultTrustConfig): number | null {
  const P = cfg.points;
  switch (signal) {
    case "location":
      return Math.max(P.locationWitness, P.locationExif, P.locationArchive);
    case "time":
      return P.timeInWindow;
    case "uniqueness":
      return Math.max(P.unique, P.revisit);
    case "authenticity":
      return P.authClear;
    case "quality":
      return P.quality;
    case "provenance":
      return P.provenance;
    default:
      return null;
  }
}

export type ChipTone = "good" | "neutral" | "warn" | "bad";

export interface RuleChip {
  code: ReasonCode;
  text: string;
  tone: ChipTone;
}

/**
 * One chip per reason that scores or flags: "Label, 25" when it adds points, "Label, 0 of 30"
 * when a scoring signal adds none, "Label, −20" when it removes points, and the bare label for
 * flags and reviews. Info-only reasons (the uploader's location) are left out.
 */
export function ruleChips(reasons: Array<Pick<TrustReason, "code" | "signal" | "kind" | "points">>, cfg: TrustConfig = defaultTrustConfig): RuleChip[] {
  const out: RuleChip[] = [];
  for (const r of reasons) {
    if (r.kind === "info" || r.code === "HARD_FLAG_CAP") continue;
    const label = LABEL[r.code];
    if (r.kind === "hard") out.push({ code: r.code, text: label, tone: "bad" });
    else if (r.kind === "review") out.push({ code: r.code, text: label, tone: "warn" });
    else if (r.points > 0) out.push({ code: r.code, text: `${label}, ${r.points}`, tone: "good" });
    else if (r.points < 0) out.push({ code: r.code, text: `${label}, −${-r.points}`, tone: "bad" });
    else {
      const max = signalMax(r.signal, cfg);
      out.push({ code: r.code, text: max ? `${label}, 0 of ${max}` : label, tone: "neutral" });
    }
  }
  return out;
}

export const reasonLabel = (code: ReasonCode) => LABEL[code];

export interface LedgerRow {
  signal: TrustSignalName;
  label: string;
  /** The deciding reason's sentence (lib/trust/reasons.ts). */
  note: string;
  pts: number;
  max: number;
  tone: ChipTone;
}

const LEDGER_SIGNALS: TrustSignalName[] = ["location", "time", "uniqueness", "authenticity", "quality", "provenance"];

/**
 * The ledger (evidence page, How it works): one row per scoring signal, labelled by its deciding
 * reason (a flag first, then a review, then the first), with the signal's points "of" its most.
 */
export function ledgerRows(reasons: TrustReason[], describe: (r: TrustReason) => string, cfg: TrustConfig = defaultTrustConfig): LedgerRow[] {
  return LEDGER_SIGNALS.flatMap((signal) => {
    const rs = reasons.filter((x) => x.signal === signal && x.kind !== "info");
    const main = rs.find((x) => x.kind === "hard") ?? rs.find((x) => x.kind === "review") ?? rs[0];
    if (!main) return [];
    const pts = rs.reduce((n, x) => n + x.points, 0);
    const max = signalMax(signal, cfg) ?? 0;
    const tone: ChipTone = main.kind === "hard" || pts < 0 ? "bad" : main.kind === "review" ? "warn" : pts >= max ? "good" : "neutral";
    return [{ signal, label: LABEL[main.code], note: describe(main), pts, max, tone }];
  });
}
