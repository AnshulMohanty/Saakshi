/**
 * The trust simulator's facts (How it works, the landing's closing ledger) turned into Trust
 * Engine signals and scored by the real engine (B5.1): same rules, same points as every photo.
 * Pure and browser-safe. The site: a 300 m circle around a fixed point, a two-week event.
 */
import { defaultTrustConfig } from "./config";
import { scoreAsset } from "./engine";
import type { DuplicateMatch, TrustProject, TrustResult, TrustSignals, TrustSpot } from "./types";

export interface SimFacts {
  loc: "witness" | "camera" | "archive" | "none";
  inside: boolean;
  inWindow: boolean;
  dup: "none" | "burst" | "revisit" | "other";
  watermark: boolean;
  screen: boolean;
  quality: "good" | "poor";
  camera: boolean;
}

/** The three starting points of the How it works simulator. */
export const SIM_PRESETS: Record<"witness" | "google" | "reused", SimFacts> = {
  witness: { loc: "witness", inside: true, inWindow: true, dup: "none", watermark: false, screen: false, quality: "good", camera: true },
  google: { loc: "none", inside: true, inWindow: false, dup: "none", watermark: false, screen: false, quality: "good", camera: false },
  reused: { loc: "camera", inside: true, inWindow: true, dup: "other", watermark: false, screen: false, quality: "good", camera: true },
};

const SITE = { lat: 19.1265, lng: 72.8156 };
const north = (m: number) => ({ lat: SITE.lat + m / 111_195, lng: SITE.lng });
export const SIM_PROJECT: TrustProject = { id: "sim", name: "the simulated site", center: SITE, radiusM: 300, startDate: "2026-09-20", endDate: "2026-10-02", monitoringEndsAt: null, minPairGapHours: 0.5 };
const SIM_SPOT: TrustSpot = { id: "sim-spot", name: "Pole 3", center: SITE, radiusM: 30 };

function match(kind: "burst" | "revisit" | "other", capturedAt: string): DuplicateMatch {
  const gap = kind === "burst" ? 0.05 : 72;
  return {
    assetId: `sim-${kind}`,
    projectId: kind === "other" ? "other" : SIM_PROJECT.id,
    projectName: kind === "other" ? "another project" : SIM_PROJECT.name,
    spotId: kind === "revisit" ? SIM_SPOT.id : null,
    hamming: kind === "other" ? 3 : 6,
    exact: false,
    strong: kind === "other",
    capturedAt: new Date(Date.parse(capturedAt) - gap * 3_600_000).toISOString(),
    uploadedAt: new Date(Date.parse(capturedAt) - gap * 3_600_000).toISOString(),
    sameProject: kind !== "other",
    sameSpot: kind === "revisit",
    gapHours: gap,
    gapHoursMin: gap,
    gapHoursMax: gap,
    otherIsLater: false,
  };
}

export function simulationSignals(f: SimFacts): { signals: TrustSignals; dups: DuplicateMatch[] } {
  const where = f.inside ? north(40) : north(5_000);
  // Outside the window = before the event (after it, at a monitored spot, would be a check-in).
  const capturedAt = f.inWindow ? "2026-09-28T10:30:00+05:30" : "2026-09-05T10:30:00+05:30";
  const signals: TrustSignals = {
    assetId: "sim",
    source: f.loc === "witness" ? "witness" : f.loc === "archive" ? "archive" : "upload",
    exifSource: f.loc === "camera" ? "file" : f.loc === "archive" ? "commons_api" : "none",
    deviceFix: f.loc === "witness" ? { ...where, accuracyM: 8 } : null,
    attested: f.loc === "witness",
    exifLocation: f.loc === "camera" || f.loc === "archive" ? where : null,
    uploaderLocation: null,
    // Without a recorded time only the upload time is known (a file date isn't a capture time).
    capturedAt: f.loc === "none" && !f.inWindow ? null : capturedAt,
    capturedAtTzAssumed: false,
    capturedAtPrecision: "second",
    uploadedAt: "2026-11-21T09:00:00+05:30",
    moderation: { screen_or_print: f.screen, composited_or_generated: false, watermark_or_stock: false, children_faces: false },
    watermark: f.watermark,
    textInImage: null,
    childrenVisible: false,
    qualityScore: f.quality === "good" ? 0.9 : 0.3,
    cameraMake: f.camera ? "Google" : null,
    cameraModel: f.camera ? "Pixel 7" : null,
  };
  return { signals, dups: f.dup === "none" ? [] : [match(f.dup, capturedAt)] };
}

export function simulate(f: SimFacts, cfg = defaultTrustConfig): TrustResult {
  const { signals, dups } = simulationSignals(f);
  return scoreAsset(signals, SIM_PROJECT, SIM_SPOT, dups, cfg);
}
