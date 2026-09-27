/**
 * Before/after pairing (pure). A pair is two photos of the same spot, both inside its radius
 * (30 m by default, up to 150 m only for projects labelled "approximate location"), in time order,
 * at least the project's min_pair_gap_hours apart, neither FLAGGED nor rejected. The rules are
 * never relaxed to produce a pair: if the data doesn't allow one, there is none, and every
 * candidate says why it failed.
 *
 * Ranking among valid pairs: stage hints (before → after best), then distance between the two
 * photos, then pHash (the same framing), then embedding similarity. Selection is greedy per spot;
 * a photo is used at most once.
 */
import { haversine, type LatLng } from "../geo";
import { hamming, isPhash } from "../hamming";

export type Stage = "before" | "during" | "after" | "ongoing" | "unknown";

export interface PairPhoto {
  id: string;
  spotId: string | null;
  location: LatLng | null;
  capturedAt: string | null;
  band: "VERIFIED" | "NEEDS_REVIEW" | "FLAGGED" | null;
  status: string;
  stage: Stage | null;
  phash: string | null;
  embedding?: number[] | null;
}

export interface PairProject {
  minPairGapHours: number;
  /** Photo GPS is approximate (archive/Commons coordinates, an indoor stage): spots up to 150 m. */
  locationApproximate: boolean;
}

export interface PairSpot {
  id: string;
  center: LatLng;
  radiusM: number;
}

export const PAIRING_DEFAULTS = { maxRadiusM: 30, approximateMaxRadiusM: 150, perSpot: 3 };
export type PairingOptions = typeof PAIRING_DEFAULTS;

export type PhotoExclusion = "no_spot" | "no_time" | "no_location" | "flagged" | "rejected" | "not_scored";
export type PairRejection = "outside_spot" | "gap_too_short" | "same_time";

export interface PairCandidate {
  beforeId: string;
  afterId: string;
  spotId: string;
  /** Between the two photos (ranking: closer framing first). */
  distanceM: number;
  /** The spot radius the pair was held to. */
  radiusM: number;
  gapHours: number;
  stageScore: number;
  hamming: number | null;
  similarity: number | null;
  ok: boolean;
  rejects: PairRejection[];
}

export interface PairingResult {
  /** Chosen pairs, best first within each spot. */
  pairs: PairCandidate[];
  /** Every same-spot pair considered, valid or not. */
  candidates: PairCandidate[];
  /** Photos that could not take part, and why. */
  excluded: Array<{ id: string; reasons: PhotoExclusion[] }>;
}

/** before → after 3; one side unknown/during 2; both unknown 1; reversed hints 0. */
export function stageScore(before: Stage | null, after: Stage | null): number {
  const b = before ?? "unknown";
  const a = after ?? "unknown";
  if (b === "after" || a === "before") return 0;
  if (b === "before" && a === "after") return 3;
  if (b === "before" || a === "after") return 2;
  return 1;
}

function cosine(a?: number[] | null, b?: number[] | null): number | null {
  if (!a || !b || a.length !== b.length || !a.length) return null;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : null;
}

export function exclusionsOf(p: PairPhoto): PhotoExclusion[] {
  const out: PhotoExclusion[] = [];
  if (!p.spotId) out.push("no_spot");
  if (!p.capturedAt) out.push("no_time");
  if (!p.location) out.push("no_location");
  if (p.status === "rejected") out.push("rejected");
  // A reviewer's approval is a person vouching for the photo; otherwise FLAGGED never pairs.
  else if (p.band === "FLAGGED" && p.status !== "approved") out.push("flagged");
  if (!p.band) out.push("not_scored");
  return out;
}

const hours = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / 3_600_000;

/** The radius a spot's pairs are held to: its own, capped at 30 m (150 m if approximate). */
export const effectiveRadius = (project: PairProject, spot: PairSpot, opts: PairingOptions = PAIRING_DEFAULTS) =>
  Math.min(spot.radiusM, project.locationApproximate ? opts.approximateMaxRadiusM : opts.maxRadiusM);

/** Evaluates one ordered pair (before earlier than after) at `spot` against the rules. */
export function evaluatePair(project: PairProject, spot: PairSpot, before: PairPhoto, after: PairPhoto, opts: PairingOptions = PAIRING_DEFAULTS): PairCandidate {
  const radiusM = effectiveRadius(project, spot, opts);
  const inside = (p: PairPhoto) => !!p.location && haversine(p.location, spot.center) <= radiusM;
  const distanceM = before.location && after.location ? haversine(before.location, after.location) : Infinity;
  const gap = before.capturedAt && after.capturedAt ? hours(before.capturedAt, after.capturedAt) : 0;
  const rejects: PairRejection[] = [];
  if (!inside(before) || !inside(after)) rejects.push("outside_spot");
  if (gap <= 0) rejects.push("same_time");
  else if (gap < project.minPairGapHours) rejects.push("gap_too_short");
  return {
    beforeId: before.id,
    afterId: after.id,
    spotId: spot.id,
    distanceM: Number.isFinite(distanceM) ? Math.round(distanceM * 10) / 10 : distanceM,
    radiusM,
    gapHours: Math.round(gap * 100) / 100,
    stageScore: stageScore(before.stage, after.stage),
    hamming: isPhash(before.phash) && isPhash(after.phash) ? hamming(before.phash, after.phash) : null,
    similarity: cosine(before.embedding, after.embedding),
    ok: rejects.length === 0,
    rejects,
  };
}

/** Best first: stage hints, distance, pHash distance, embedding similarity, then ids. */
export function compareCandidates(a: PairCandidate, b: PairCandidate): number {
  return (
    b.stageScore - a.stageScore ||
    a.distanceM - b.distanceM ||
    (a.hamming ?? 65) - (b.hamming ?? 65) ||
    (b.similarity ?? -2) - (a.similarity ?? -2) ||
    a.beforeId.localeCompare(b.beforeId) ||
    a.afterId.localeCompare(b.afterId)
  );
}

const byTime = (a: PairPhoto, b: PairPhoto) => Date.parse(a.capturedAt!) - Date.parse(b.capturedAt!) || a.id.localeCompare(b.id);

export function findPairs(project: PairProject, spots: PairSpot[], photos: PairPhoto[], opts: PairingOptions = PAIRING_DEFAULTS): PairingResult {
  const spotById = new Map(spots.map((s) => [s.id, s]));
  const excluded: PairingResult["excluded"] = [];
  const bySpot = new Map<string, PairPhoto[]>();
  for (const p of photos) {
    const reasons = exclusionsOf(p);
    if (p.spotId && !spotById.has(p.spotId)) reasons.push("no_spot");
    if (reasons.length) {
      excluded.push({ id: p.id, reasons });
      continue;
    }
    bySpot.set(p.spotId!, [...(bySpot.get(p.spotId!) ?? []), p]);
  }

  const candidates: PairCandidate[] = [];
  const pairs: PairCandidate[] = [];
  for (const spotId of [...bySpot.keys()].sort()) {
    const spot = spotById.get(spotId)!;
    const list = bySpot.get(spotId)!.sort(byTime);
    const spotCandidates: PairCandidate[] = [];
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) spotCandidates.push(evaluatePair(project, spot, list[i], list[j], opts));
    candidates.push(...spotCandidates);
    const used = new Set<string>();
    let chosen = 0;
    for (const c of spotCandidates.filter((x) => x.ok).sort(compareCandidates)) {
      if (chosen >= opts.perSpot) break;
      if (used.has(c.beforeId) || used.has(c.afterId)) continue;
      used.add(c.beforeId);
      used.add(c.afterId);
      pairs.push(c);
      chosen++;
    }
  }
  return { pairs, candidates, excluded };
}

/**
 * A spot's baseline: its best "after" photo (the state later check-ins are compared with).
 * Eligible photos only; stage "after" first, then trust score, then the latest. Without an
 * "after" photo, the latest eligible photo.
 */
export function chooseBaseline<T extends PairPhoto & { score: number | null }>(photos: T[]): T | null {
  const eligible = photos.filter((p) => exclusionsOf(p).length === 0);
  return (
    eligible.sort(
      (a, b) =>
        Number(b.stage === "after") - Number(a.stage === "after") ||
        (b.score ?? 0) - (a.score ?? 0) ||
        Date.parse(b.capturedAt!) - Date.parse(a.capturedAt!) ||
        a.id.localeCompare(b.id),
    )[0] ?? null
  );
}

const EXCLUSION_TEXT: Record<PhotoExclusion, string> = {
  no_spot: "not at a spot",
  no_time: "no capture time",
  no_location: "no location",
  flagged: "flagged by the Trust Engine",
  rejected: "rejected by a reviewer",
  not_scored: "not scored yet",
};
const REJECTION_TEXT: Record<PairRejection, string> = {
  outside_spot: "a photo is outside the spot radius",
  gap_too_short: "taken too close together in time",
  same_time: "taken at the same time",
};

export const describeExclusion = (r: PhotoExclusion) => EXCLUSION_TEXT[r];
export const describeRejection = (r: PairRejection) => REJECTION_TEXT[r];
