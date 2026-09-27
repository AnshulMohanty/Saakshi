/**
 * Pure project/spot assignment. Priority:
 *   manual (never overridden) > capture hint (token or upload project/spot) >
 *   GPS inside a project's radius AND capture date inside its window >
 *   cosine similarity to a project description ≥ threshold > unassigned.
 * Then the nearest spot of that project whose radius contains the photo.
 */
import { haversine, type LatLng } from "../geo";

export type AssignmentMethod = "capture_hint" | "geo_time" | "similarity" | "manual" | "none";

export interface AssignProject {
  id: string;
  center: LatLng | null;
  radiusM: number | null;
  /** YYYY-MM-DD, inclusive. */
  startDate: string | null;
  endDate: string | null;
  embedding: number[] | null;
}

export interface AssignSpot {
  id: string;
  projectId: string;
  center: LatLng;
  radiusM: number;
}

export interface AssignInput {
  hint?: { projectId?: string | null; spotId?: string | null } | null;
  location: LatLng | null;
  /** ISO timestamp. */
  capturedAt: string | null;
  embedding: number[] | null;
  current?: { projectId: string | null; spotId: string | null; method: AssignmentMethod } | null;
}

export interface Assignment {
  projectId: string | null;
  spotId: string | null;
  method: AssignmentMethod;
  /** Why: distance to the project centre, similarity score, … */
  detail: Record<string, number | string>;
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na === 0 || nb === 0 ? 0 : dot / Math.sqrt(na * nb);
}

function inWindow(capturedAt: string, p: AssignProject): boolean {
  if (!p.startDate || !p.endDate) return false;
  const t = Date.parse(capturedAt);
  return t >= Date.parse(`${p.startDate}T00:00:00Z`) && t <= Date.parse(`${p.endDate}T23:59:59.999Z`);
}

function nearestSpot(projectId: string, location: LatLng | null, spots: AssignSpot[]): { id: string; distanceM: number } | null {
  if (!location) return null;
  let best: { id: string; distanceM: number } | null = null;
  for (const s of spots) {
    if (s.projectId !== projectId) continue;
    const d = haversine(s.center, location);
    if (d <= s.radiusM && (!best || d < best.distanceM)) best = { id: s.id, distanceM: d };
  }
  return best;
}

export function assign(input: AssignInput, projects: AssignProject[], spots: AssignSpot[], { threshold }: { threshold: number }): Assignment {
  if (input.current?.method === "manual") return { ...input.current, detail: { kept: "manual" } };

  const withSpot = (projectId: string, method: AssignmentMethod, detail: Assignment["detail"]): Assignment => {
    const spot = nearestSpot(projectId, input.location, spots);
    return { projectId, spotId: spot?.id ?? null, method, detail: spot ? { ...detail, spotDistanceM: Math.round(spot.distanceM) } : detail };
  };

  // 1. Capture hint (a spot implies its project).
  const hintSpot = input.hint?.spotId ? spots.find((s) => s.id === input.hint!.spotId) : undefined;
  if (hintSpot) return { projectId: hintSpot.projectId, spotId: hintSpot.id, method: "capture_hint", detail: { hint: "spot" } };
  const hintProject = input.hint?.projectId;
  if (hintProject && projects.some((p) => p.id === hintProject)) return withSpot(hintProject, "capture_hint", { hint: "project" });

  // 2. Inside a project's radius and window (nearest centre wins).
  if (input.location && input.capturedAt) {
    const loc = input.location;
    const at = input.capturedAt;
    const hits = projects
      .filter((p) => p.center && p.radiusM !== null && inWindow(at, p))
      .map((p) => ({ p, d: haversine(p.center!, loc) }))
      .filter(({ p, d }) => d <= p.radiusM!)
      .sort((a, b) => a.d - b.d);
    if (hits[0]) return withSpot(hits[0].p.id, "geo_time", { distanceM: Math.round(hits[0].d) });
  }

  // 3. Content similarity to project descriptions.
  if (input.embedding) {
    const e = input.embedding;
    const scored = projects
      .filter((p) => p.embedding)
      .map((p) => ({ p, s: cosine(e, p.embedding!) }))
      .sort((a, b) => b.s - a.s);
    if (scored[0] && scored[0].s >= threshold) return withSpot(scored[0].p.id, "similarity", { similarity: Number(scored[0].s.toFixed(4)) });
  }

  return { projectId: null, spotId: null, method: "none", detail: {} };
}
