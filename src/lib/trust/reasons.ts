/** A deterministic plain-English sentence for every reason code (no LLM). */
import type { ReasonCode, TrustReason } from "./types";

type D = TrustReason["detail"];
const v = (d: D, k: string) => d[k] ?? "?";
/** "0.4", "3.2", "716": one decimal below 10 km. */
const kmText = (v: unknown) => (typeof v === "number" ? String(v >= 10 ? Math.round(v) : v) : "?");
const date = (iso: unknown) => (typeof iso === "string" ? iso.slice(0, 10) : "an unknown date");
const from = (d: D) => ({ witness: "the Witness Capture device fix", exif: "the photo's GPS", archive: "the archive record's GPS" })[String(d.from)] ?? "the recorded location";

const SENTENCES: Record<ReasonCode, (d: D) => string> = {
  LOCATION_WITNESS: (d) => `Captured live with Witness Capture inside the site (${v(d, "distanceM")} m from the centre).`,
  LOCATION_WITNESS_UNATTESTED: (d) => `The device location is inside the site (${v(d, "distanceM")} m), but the capture could not be attested.`,
  LOCATION_EXIF: (d) => `The photo's own GPS places it inside the site (${v(d, "distanceM")} m from the centre).`,
  LOCATION_ARCHIVE: (d) => `The archive record's GPS places it inside the site (${v(d, "distanceM")} m from the centre).`,
  LOCATION_NONE: () => "No location recorded.",
  LOCATION_NO_SITE: () => "Not assigned to a project, so its location can't be checked against a site.",
  LOCATION_MISMATCH: (d) => `${from(d)[0].toUpperCase()}${from(d).slice(1)} is ${kmText(d.distanceKm)} km from ${v(d, "site")}, outside its ${v(d, "radiusM")} m radius.`,
  LOCATION_CONFLICT: (d) => `The photo's GPS and the live device location are ${kmText(d.distanceKm)} km apart.`,
  UPLOADER_LOCATION: () => "The uploader's browser location was recorded for information; it says nothing about where the photo was taken.",
  TIME_IN_WINDOW: (d) => `Taken on ${date(d.capturedAt)}${d.dateOnly ? " (date only)" : ""}, inside the event dates${d.tzAssumed && !d.dateOnly ? " (time zone assumed)" : ""}.`,
  TIME_CHECKIN: (d) => `Check-in after the activity: taken on ${date(d.capturedAt)}${d.dateOnly ? " (date only)" : ""} at a monitored spot.`,
  TIME_UPLOAD_ONLY: () => "No capture time recorded, so the upload time is used.",
  TIME_OUTSIDE: (d) =>
    d.side === "before"
      ? `Taken on ${date(d.capturedAt)}, before the event dates (${v(d, "start")} to ${v(d, "end")}).`
      : d.monitoringOver
        ? `Taken on ${date(d.capturedAt)}, after monitoring ended.`
        : `Taken on ${date(d.capturedAt)}, after the event dates (${v(d, "start")} to ${v(d, "end")}) and not at a monitored spot.`,
  TIME_NO_WINDOW: () => "No event dates to compare the capture time with.",
  UNIQUE: () => "Not a copy of any earlier photo.",
  BURST: (d) => `Part of a burst of ${Number(d.matches) + 1} similar shots taken within minutes.`,
  REVISIT: (d) => `A revisit of the same spot ${v(d, "gapHours")} hours after a similar photo.`,
  SIMILAR_IN_PROJECT: (d) => `Similar to ${v(d, "matches")} other photo(s) in this project.`,
  POSSIBLE_DUPLICATE: () => "The identical file was already submitted to this project.",
  REUSED: (d) => `A ${v(d, "similarityPct")}% match of a photo already in ${v(d, "otherProject")} from ${date(d.otherDate)}.`,
  COPY_LATER_SUBMITTED: (d) => `A copy was later submitted to ${v(d, "otherProject")}.`,
  AUTH_CLEAR: () => "No sign of a screen, a print, compositing or stock branding.",
  AUTH_UNCHECKED: () => "Authenticity checks have not run yet.",
  SCREEN_OR_PRINT: () => "Looks like a photo of a screen or of a printed photo.",
  COMPOSITED: () => "May be digitally composited or AI-generated (flagged for a person to check; this is not a deepfake verdict).",
  STOCK_SUSPECTED: () => "Shows a watermark or stock-photo branding.",
  STAMP_CONSISTENT: () => "A burned-in GPS stamp agrees with the capture location and date.",
  STAMP_UNVERIFIABLE: () => "A burned-in stamp was found, but there is nothing to check it against.",
  STAMP_MISMATCH: (d) =>
    d.distanceKm !== null && Number(d.distanceKm) > 1
      ? `A burned-in GPS stamp says ${v(d, "stampLat")}, ${v(d, "stampLng")}: ${kmText(d.distanceKm)} km from where the photo was taken.`
      : `A burned-in stamp is dated ${v(d, "stampDate")}, ${v(d, "dayDifference")} days from the capture date.`,
  QUALITY_OK: () => "Sharp and well exposed enough to measure.",
  QUALITY_LOW: () => "Low image quality.",
  QUALITY_UNKNOWN: () => "Image quality not assessed.",
  PROVENANCE_CAMERA: (d) => `Camera recorded: ${v(d, "camera")}.`,
  PROVENANCE_NONE: () => "No camera make or model recorded.",
  PRIVACY_CHILDREN: () => "Children may be visible; public versions are always face-blurred.",
  HARD_FLAG_CAP: (d) => `Capped at ${v(d, "cap")} because of a flag above.`,
};

export function describeReason(r: Pick<TrustReason, "code" | "detail">): string {
  return SENTENCES[r.code](r.detail);
}

/** "+30", "−10", "0". */
export const formatPoints = (p: number) => (p > 0 ? `+${p}` : p < 0 ? `−${-p}` : "0");

export const REASON_CODES = Object.keys(SENTENCES) as ReasonCode[];
