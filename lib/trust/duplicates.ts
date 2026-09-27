/**
 * Near-duplicate detection (pure): pHash hamming ≤ 8 is a match (≤ 4 strong), identical etag is
 * exact. A plain scan is fine at demo scale (thousands of photos). Scale-up path: a BK-tree over
 * the 64-bit hashes (metric = hamming) answers "all within 8 bits" in roughly log time.
 */
import { hamming, isPhash } from "../hamming";
import { defaultTrustConfig, type TrustConfig } from "./config";
import type { DuplicateMatch } from "./types";

export interface DupCandidate {
  id: string;
  projectId: string | null;
  spotId: string | null;
  phash: string | null;
  etag: string | null;
  capturedAt: string | null;
  uploadedAt: string;
}

/** Order two photos in time: capture time if both known, else upload time, else id. */
export function isLater(a: DupCandidate, b: DupCandidate): boolean {
  const ca = a.capturedAt ? Date.parse(a.capturedAt) : null;
  const cb = b.capturedAt ? Date.parse(b.capturedAt) : null;
  if (ca !== null && cb !== null && ca !== cb) return ca > cb;
  const ua = Date.parse(a.uploadedAt);
  const ub = Date.parse(b.uploadedAt);
  if (ua !== ub) return ua > ub;
  return a.id > b.id;
}

function gapHours(a: DupCandidate, b: DupCandidate): number {
  const t = (x: DupCandidate, useCapture: boolean) => Date.parse(useCapture ? x.capturedAt! : x.uploadedAt);
  const both = !!a.capturedAt && !!b.capturedAt;
  return Math.abs(t(a, both) - t(b, both)) / 3_600_000;
}

export function findMatches(
  asset: DupCandidate,
  others: DupCandidate[],
  projectName: (id: string | null) => string | null = () => null,
  cfg: TrustConfig = defaultTrustConfig,
): DuplicateMatch[] {
  const out: DuplicateMatch[] = [];
  for (const o of others) {
    if (o.id === asset.id) continue;
    const exact = !!asset.etag && asset.etag === o.etag;
    const h = isPhash(asset.phash) && isPhash(o.phash) ? hamming(asset.phash, o.phash) : null;
    if (!exact && (h === null || h > cfg.matchHamming)) continue;
    const distance = exact ? 0 : h!;
    out.push({
      assetId: o.id,
      projectId: o.projectId,
      projectName: projectName(o.projectId),
      spotId: o.spotId,
      hamming: distance,
      exact,
      strong: distance <= cfg.strongHamming,
      capturedAt: o.capturedAt,
      uploadedAt: o.uploadedAt,
      sameProject: !!asset.projectId && asset.projectId === o.projectId,
      sameSpot: !!asset.spotId && asset.spotId === o.spotId,
      gapHours: gapHours(asset, o),
      otherIsLater: isLater(o, asset),
    });
  }
  return out.sort((a, b) => a.hamming - b.hamming || a.assetId.localeCompare(b.assetId));
}
