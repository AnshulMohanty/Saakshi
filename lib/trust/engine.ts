/**
 * Trust Engine (pure: no I/O, no AI). scoreAsset turns an asset's signals into a 0–100 score, a
 * band and a ledger of reasons. Every point added or removed has a reason; flags are reasons too.
 * Rules and their rationale: docs/trust.md. Numbers: ./config.ts.
 */
import { haversine, type LatLng } from "../geo";
import { similarityPct } from "../hamming";
import { defaultTrustConfig, type TrustConfig } from "./config";
import { parseStamp, stampDayDifference } from "./stamp";
import type { DuplicateMatch, ReasonCode, ReasonDetail, ReasonKind, TrustBand, TrustProject, TrustReason, TrustResult, TrustSignalName, TrustSignals, TrustSpot } from "./types";

const km = (m: number) => Math.round(m / 100) / 10;

function inWindow(iso: string, p: TrustProject, slackHours: number): "in" | "before" | "after" | "none" {
  if (!p.startDate || !p.endDate) return "none";
  const t = Date.parse(iso);
  const slack = slackHours * 3_600_000;
  if (t < Date.parse(`${p.startDate}T00:00:00Z`) - slack) return "before";
  if (t > Date.parse(`${p.endDate}T23:59:59.999Z`) + slack) return "after";
  return "in";
}

export function scoreAsset(
  s: TrustSignals,
  project: TrustProject | null,
  spot: TrustSpot | null,
  dups: DuplicateMatch[],
  cfg: TrustConfig = defaultTrustConfig,
): TrustResult {
  const reasons: TrustReason[] = [];
  const add = (signal: TrustSignalName, code: ReasonCode, kind: ReasonKind, points: number, detail: ReasonDetail = {}) =>
    reasons.push({ code, signal, kind, points, detail });
  const P = cfg.points;

  // --- Location (max 30): the best *capture* location, never the uploader's -----------------
  const witnessFix = s.source === "witness" && s.deviceFix ? s.deviceFix : null;
  const capture: (LatLng & { from: "witness" | "exif" | "archive" }) | null = witnessFix
    ? { lat: witnessFix.lat, lng: witnessFix.lng, from: "witness" }
    : s.exifLocation
      ? { ...s.exifLocation, from: s.exifSource === "commons_api" ? "archive" : "exif" }
      : null;
  if (!capture) {
    add("location", "LOCATION_NONE", "points", 0);
  } else if (!project?.center || project.radiusM === null) {
    add("location", "LOCATION_NO_SITE", "points", 0, { from: capture.from });
  } else {
    const toSite = haversine(capture, project.center);
    const toSpot = spot ? haversine(capture, spot.center) : null;
    const inside = toSite <= project.radiusM || (toSpot !== null && spot !== null && toSpot <= spot.radiusM);
    const detail = { from: capture.from, distanceM: Math.round(toSpot !== null && spot && toSpot <= spot.radiusM ? toSpot : toSite), radiusM: Math.round(project.radiusM), site: project.name };
    if (!inside) add("location", "LOCATION_MISMATCH", "hard", 0, { ...detail, distanceKm: km(toSite) });
    else if (capture.from === "witness") add("location", s.attested ? "LOCATION_WITNESS" : "LOCATION_WITNESS_UNATTESTED", "points", s.attested ? P.locationWitness : P.locationWitnessUnattested, detail);
    else if (capture.from === "exif") add("location", "LOCATION_EXIF", "points", P.locationExif, detail);
    else add("location", "LOCATION_ARCHIVE", "points", P.locationArchive, detail);
  }
  if (witnessFix && s.exifLocation) {
    const apart = haversine(witnessFix, s.exifLocation);
    if (apart > cfg.conflictKm * 1000) add("location", "LOCATION_CONFLICT", "review", 0, { distanceKm: km(apart) });
  }
  if (s.uploaderLocation && s.source !== "witness") add("location", "UPLOADER_LOCATION", "info", 0);

  // --- Time (max 20) --------------------------------------------------------------------------
  if (!project) add("time", "TIME_NO_WINDOW", "points", 0);
  else if (!s.capturedAt) add("time", "TIME_UPLOAD_ONLY", "points", P.timeUploadOnly);
  else {
    const w = inWindow(s.capturedAt, project, cfg.windowSlackHours);
    const detail = { capturedAt: s.capturedAt, start: project.startDate, end: project.endDate, tzAssumed: s.capturedAtTzAssumed, anchored: s.source === "witness" };
    if (w === "none") add("time", "TIME_NO_WINDOW", "points", 0);
    else if (w === "in") add("time", "TIME_IN_WINDOW", "points", P.timeInWindow, detail);
    // A live, attested check-in after the event is spot monitoring, not an old photo.
    else if (w === "after" && s.source === "witness" && s.attested && spot) add("time", "TIME_CHECKIN", "points", P.timeInWindow, detail);
    else add("time", "TIME_OUTSIDE", "points", P.timeOutside, { ...detail, side: w });
  }

  // --- Uniqueness (max 20) ----------------------------------------------------------------------
  // A match with an unassigned photo is not evidence anywhere yet: ignored until it is assigned
  // (assignment re-scores both photos).
  const cross = dups.filter((d) => !d.sameProject && d.projectId !== null);
  const reusedFrom = cross.filter((d) => !d.otherIsLater); // this photo is the later one
  const laterCopies = cross.filter((d) => d.otherIsLater);
  const same = dups.filter((d) => d.sameProject);
  const exactSame = same.filter((d) => d.exact);
  const burst = same.filter((d) => !d.exact && d.gapHours * 60 <= cfg.burstMinutes);
  const revisit = same.filter((d) => !d.exact && d.sameSpot && d.gapHours >= (project?.minPairGapHours ?? Infinity) && d.gapHours * 60 > cfg.burstMinutes);
  const similar = same.filter((d) => !d.exact && !burst.includes(d) && !revisit.includes(d));

  if (reusedFrom.length) {
    const first = [...reusedFrom].sort((a, b) => a.hamming - b.hamming)[0];
    add("uniqueness", "REUSED", "hard", 0, {
      otherAsset: first.assetId,
      otherProject: first.projectName ?? "another project",
      otherDate: first.capturedAt ?? first.uploadedAt,
      similarityPct: similarityPct(first.hamming),
      matches: reusedFrom.length,
    });
  } else if (exactSame.length) {
    add("uniqueness", "POSSIBLE_DUPLICATE", "review", 0, { otherAsset: exactSame[0].assetId, matches: exactSame.length });
  } else if (burst.length) {
    add("uniqueness", "BURST", "points", P.burst, { matches: burst.length, otherAsset: burst[0].assetId });
  } else if (similar.length) {
    add("uniqueness", "SIMILAR_IN_PROJECT", "points", P.similarInProject, { matches: similar.length, otherAsset: similar[0].assetId, gapHours: Math.round(similar[0].gapHours) });
  } else if (revisit.length) {
    add("uniqueness", "REVISIT", "points", P.revisit, { matches: revisit.length, gapHours: Math.round(revisit[0].gapHours), otherAsset: revisit[0].assetId });
  } else {
    add("uniqueness", "UNIQUE", "points", P.unique);
  }
  for (const c of laterCopies.slice(0, 3)) {
    add("uniqueness", "COPY_LATER_SUBMITTED", "info", 0, { otherAsset: c.assetId, otherProject: c.projectName ?? "another project", similarityPct: similarityPct(c.hamming) });
  }

  // --- Authenticity (max 15) --------------------------------------------------------------------
  const m = s.moderation;
  const stock = s.watermark === true || m?.watermark_or_stock === true;
  if (!m && s.watermark === null) add("authenticity", "AUTH_UNCHECKED", "points", 0);
  else {
    if (m?.screen_or_print) add("authenticity", "SCREEN_OR_PRINT", "review", P.screenOrPrint);
    if (m?.composited_or_generated) add("authenticity", "COMPOSITED", "review", P.composited);
    if (stock) add("authenticity", "STOCK_SUSPECTED", "hard", 0, { watermark: s.watermark === true, branding: m?.watermark_or_stock === true });
    if (!m?.screen_or_print && !m?.composited_or_generated && !stock) add("authenticity", "AUTH_CLEAR", "points", P.authClear);
  }

  // --- Burned-in stamp ------------------------------------------------------------------------
  const stamp = parseStamp(s.textInImage);
  if (stamp) {
    const where = capture ?? (project?.center ? { ...project.center, from: "site" as const } : null);
    const off = stamp.lat !== null && stamp.lng !== null && where ? haversine({ lat: stamp.lat, lng: stamp.lng }, where) : null;
    const days = s.capturedAt ? stampDayDifference(stamp, s.capturedAt) : null;
    const detail = { stampLat: stamp.lat, stampLng: stamp.lng, stampDate: stamp.date, distanceKm: off === null ? null : km(off), dayDifference: days };
    if ((off !== null && off > cfg.stampKm * 1000) || (days !== null && days > cfg.stampDays)) add("stamp", "STAMP_MISMATCH", "hard", 0, detail);
    else if (off === null && days === null) add("stamp", "STAMP_UNVERIFIABLE", "info", 0, detail);
    else add("stamp", "STAMP_CONSISTENT", "info", 0, detail);
  }

  // --- Quality (max 10) and provenance (max 5) ----------------------------------------------
  if (s.qualityScore === null) add("quality", "QUALITY_UNKNOWN", "points", 0);
  else if (s.qualityScore >= cfg.qualityMin) add("quality", "QUALITY_OK", "points", P.quality, { quality: s.qualityScore });
  else add("quality", "QUALITY_LOW", "points", 0, { quality: s.qualityScore });
  if (s.cameraMake && s.cameraModel) add("provenance", "PROVENANCE_CAMERA", "points", P.provenance, { camera: `${s.cameraMake} ${s.cameraModel}` });
  else add("provenance", "PROVENANCE_NONE", "points", 0);

  // --- Privacy (info only: public outputs are always face-blurred) --------------------------
  if (s.childrenVisible || m?.children_faces) add("privacy", "PRIVACY_CHILDREN", "info", 0);

  // --- Score and band ---------------------------------------------------------------------------
  const hardFlags = reasons.filter((r) => r.kind === "hard").map((r) => r.code);
  const reviewFlags = reasons.filter((r) => r.kind === "review").map((r) => r.code);
  let score = Math.max(0, Math.min(100, reasons.reduce((sum, r) => sum + r.points, 0)));
  if (hardFlags.length && score > cfg.hardFlagCap) {
    add("score", "HARD_FLAG_CAP", "points", cfg.hardFlagCap - score, { cap: cfg.hardFlagCap });
    score = cfg.hardFlagCap;
  }
  const band: TrustBand =
    hardFlags.length || score < cfg.reviewMin ? "FLAGGED" : reviewFlags.length || score < cfg.verifiedMin ? "NEEDS_REVIEW" : "VERIFIED";
  return { score, band, reasons, hardFlags, reviewFlags };
}
