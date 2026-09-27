/**
 * Pure demo-dataset builder: archive candidates + config → three project plans with selected
 * photos, spots and a reserve for planted tests. Deterministic for a given candidates file.
 *
 * Per project rule (in order, each excluding files already used):
 *  1. pool = geotagged candidates from the rule's query groups whose text is relevant
 *  2. clusters = DBSCAN (eps ~1.5 km) with ≥ clusterMinPhotos; skip ones near `awayFrom` projects
 *  3. per cluster: centre = centroid; radius = distance covering 90% (clamped 300 m–3 km);
 *     spots = DBSCAN at ~40 m, the densest 3–5, others joining the nearest spot within 150 m;
 *     pairability = photo pairs at the same spot, in time order, at least min_pair_gap_hours
 *     apart (+ a bonus when their text says "before" then "after")
 *  4. pick by pairability, then photo count (then more spots, then tighter)
 *  5. hold back the photos that form the fewest pairs (reserve for planted tests), then select
 *     up to `target` round-robin across spots, pair-forming and best-documented first
 *  6. window = min/max capture date ± padding
 */
import type { DemoDatasetConfig, ProjectRule, ProjectType } from "../../data/demo-dataset.config";
import { haversine, type LatLng } from "../geo";
import type { Candidate } from "./candidates";
import { centroid, dbscan, radiusCovering, type GeoCluster } from "./cluster";

export interface SpotPlan {
  index: number;
  center: LatLng;
  radiusM: number;
  pageIds: number[];
}

export interface Pairability {
  pairs: number;
  bonus: number;
  score: number;
}

export interface ProjectPlan {
  key: ProjectRule["key"];
  slug: string;
  type: ProjectType;
  label: string;
  center: LatLng;
  radiusM: number;
  /** YYYY-MM-DD, inclusive; null when no selected photo is dated. */
  startDate: string | null;
  endDate: string | null;
  minPairGapHours: number;
  sdgs: number[];
  clusterSize: number;
  /** Pairability of the whole cluster (used to rank) and of the selected photos. */
  pairability: { cluster: Pairability; selected: Pairability };
  files: Candidate[];
  spots: SpotPlan[];
  /** Unselected photos inside the project radius (any relevance), best-first: for planted tests. */
  reserve: Candidate[];
}

export interface ClusterSummary {
  size: number;
  center: LatLng;
  pairability: Pairability;
  spots: number;
}

export interface DatasetPlan {
  projects: ProjectPlan[];
  /** Candidate clusters per rule, in rank order (for archive:discover and the summary). */
  ranking: Record<string, ClusterSummary[]>;
  warnings: string[];
}

const pos = (c: Candidate): LatLng | null => (c.lat === null || c.lng === null ? null : { lat: c.lat, lng: c.lng });
const text = (c: Candidate) => `${c.title} ${c.description ?? ""}`;
const time = (c: Candidate) => (c.date ? Date.parse(`${c.date.local}Z`) : null);

/** Higher is better: dated (esp. to the second), with camera make, curated GPS. */
export function preference(c: Candidate): number {
  let s = 0;
  if (c.date) s += 4 + (c.date.precision === "second" || c.date.precision === "minute" ? 1 : 0);
  if (c.make) s += 2;
  if (c.gpsSource === "desc_page") s += 0.5;
  return s;
}
const byPreference = (a: Candidate, b: Candidate) => preference(b) - preference(a) || a.pageId - b.pageId;

/** What the photo's own text says about its stage (the same explicit words the mock AI keys on). */
export function stageHint(c: Pick<Candidate, "title" | "description">): "before" | "after" | null {
  const t = text(c as Candidate);
  if (/\bbefore\b/i.test(t)) return "before";
  if (/\bafter\b/i.test(t)) return "after";
  return null;
}

/**
 * Pairs at the same spot, in time order, at least `gapHours` apart. Also returns how many pairs
 * each photo takes part in (to keep pair-forming photos when selecting).
 */
export function pairability(photos: Candidate[], spotOf: Map<number, number>, gapHours: number, stageBonus: number): Pairability & { participation: Map<number, number> } {
  const bySpot = new Map<number, Candidate[]>();
  for (const p of photos) {
    const s = spotOf.get(p.pageId);
    if (s !== undefined && time(p) !== null) bySpot.set(s, [...(bySpot.get(s) ?? []), p]);
  }
  const participation = new Map<number, number>();
  let pairs = 0;
  let bonus = 0;
  for (const group of bySpot.values()) {
    const sorted = [...group].sort((a, b) => time(a)! - time(b)! || a.pageId - b.pageId);
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        if ((time(sorted[j])! - time(sorted[i])!) / 3_600_000 < gapHours) continue;
        pairs++;
        for (const p of [sorted[i], sorted[j]]) participation.set(p.pageId, (participation.get(p.pageId) ?? 0) + 1);
        if (stageHint(sorted[i]) === "before" && stageHint(sorted[j]) === "after") bonus += stageBonus;
      }
    }
  }
  return { pairs, bonus, score: pairs + bonus, participation };
}

interface ClusterPlan {
  cluster: GeoCluster<Candidate>;
  center: LatLng;
  radiusM: number;
  inRadius: Candidate[];
  spotClusters: GeoCluster<Candidate>[];
  spotOf: Map<number, number>;
  pair: ReturnType<typeof pairability>;
}

function planCluster(cluster: GeoCluster<Candidate>, cfg: DemoDatasetConfig, gapHours: number): ClusterPlan {
  const center = cluster.centroid;
  const radiusM = Math.min(cfg.radiusMaxM, Math.max(cfg.radiusMinM, radiusCovering(cluster.members.map((m) => pos(m)!), center, cfg.radiusQuantile)));
  const inRadius = cluster.members.filter((m) => haversine(center, pos(m)!) <= radiusM).sort(byPreference);
  const spotClusters = dbscan(inRadius, pos, { epsM: cfg.spotEpsM, minPts: cfg.spotMinPts }).clusters.slice(0, cfg.spotsMax);
  const spotOf = new Map<number, number>();
  spotClusters.forEach((s, i) => s.members.forEach((m) => spotOf.set(m.pageId, i)));
  // Photos outside the spot clusters join the nearest spot when close enough.
  for (const m of inRadius) {
    if (spotOf.has(m.pageId) || spotClusters.length === 0) continue;
    const d = spotClusters.map((s) => haversine(s.centroid, pos(m)!));
    const nearest = d.indexOf(Math.min(...d));
    if (d[nearest] <= cfg.spotRadiusMaxM) spotOf.set(m.pageId, nearest);
  }
  return { cluster, center, radiusM, inRadius, spotClusters, spotOf, pair: pairability(inRadius, spotOf, gapHours, cfg.stageBonus) };
}

/** Pairability of an arbitrary group of photos treated as one cluster (for archive:discover). */
export function clusterPairability(members: Candidate[], cfg: DemoDatasetConfig, gapHours: number): Pairability {
  const located = members.filter((m) => pos(m) !== null);
  const c = centroid(located.map((m) => pos(m)!));
  const cluster: GeoCluster<Candidate> = { members: located, centroid: c, maxRadiusM: Math.max(0, ...located.map((m) => haversine(c, pos(m)!))) };
  return summary(planCluster(cluster, cfg, gapHours).pair);
}

const day = (local: string, deltaDays: number) => {
  const d = new Date(`${local.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
};

function majorityLabel(files: Candidate[], rule: ProjectRule): string {
  let best = { label: rule.label, n: 0 };
  for (const l of rule.labels) {
    const n = files.filter((f) => l.match.test(text(f))).length;
    if (n > best.n && n * 2 >= files.length) best = { label: l.label, n };
  }
  return best.label;
}

const summary = (p: Pairability): Pairability => ({ pairs: p.pairs, bonus: p.bonus, score: p.score });

export function buildDemoDataset(all: Candidate[], cfg: DemoDatasetConfig): DatasetPlan {
  const used = new Set<number>();
  const placed = new Map<ProjectRule["key"], LatLng>();
  const projects: ProjectPlan[] = [];
  const ranking: DatasetPlan["ranking"] = {};
  const warnings: string[] = [];
  const geotagged = all.filter((c) => pos(c) !== null);

  for (const rule of cfg.projects as ProjectRule[]) {
    const gapHours = cfg.minPairGapHours[rule.types[0]];
    const pool = geotagged.filter((c) => !used.has(c.pageId) && c.groups.some((g) => rule.groups.includes(g)) && rule.relevant.test(text(c)) && !rule.exclude?.test(text(c)));
    const plans = dbscan(pool, pos, { epsM: cfg.clusterEpsM, minPts: cfg.clusterMinPts })
      .clusters.filter((cl) => cl.members.length >= cfg.clusterMinPhotos)
      .filter((cl) =>
        (rule.awayFrom ?? []).every(({ key, minKm }) => {
          const other = placed.get(key);
          return !other || haversine(other, cl.centroid) >= minKm * 1000;
        }),
      )
      .map((cl) => planCluster(cl, cfg, gapHours))
      .sort(
        (a, b) =>
          b.pair.score - a.pair.score ||
          b.cluster.members.length - a.cluster.members.length ||
          b.spotClusters.length - a.spotClusters.length ||
          a.cluster.maxRadiusM - b.cluster.maxRadiusM,
      );
    ranking[rule.key] = plans.slice(0, 5).map((p) => ({ size: p.cluster.members.length, center: p.center, pairability: summary(p.pair), spots: p.spotClusters.length }));
    const plan = plans[0];
    if (!plan) {
      warnings.push(`Project ${rule.key}: no cluster of ≥${cfg.clusterMinPhotos} relevant geotagged photos found.`);
      continue;
    }

    // Hold back the photos that form the fewest pairs (then the least documented).
    const participation = (c: Candidate) => plan.pair.participation.get(c.pageId) ?? 0;
    const held = new Set(
      [...plan.inRadius]
        .sort((a, b) => participation(a) - participation(b) || preference(a) - preference(b) || b.pageId - a.pageId)
        .slice(0, rule.holdBack ?? 0)
        .map((c) => c.pageId),
    );
    const eligible = plan.inRadius.filter((c) => !held.has(c.pageId));

    // Round-robin across spots; within a spot, pair-forming and best-documented photos first.
    const queues = plan.spotClusters.map((_, i) =>
      eligible.filter((c) => plan.spotOf.get(c.pageId) === i).sort((a, b) => participation(b) - participation(a) || byPreference(a, b)),
    );
    const selected: Candidate[] = [];
    while (selected.length < rule.target && queues.some((q) => q.length)) {
      for (const q of queues) {
        const next = q.shift();
        if (next && selected.length < rule.target) selected.push(next);
      }
    }
    if (plan.spotClusters.length === 0) {
      warnings.push(`Project ${rule.key}: photos are more than ${cfg.spotEpsM} m apart; no spots.`);
      selected.push(...eligible.slice(0, rule.target));
    }
    if (plan.spotClusters.length < cfg.spotsMin) warnings.push(`Project ${rule.key}: only ${plan.spotClusters.length} spot(s) (wanted ${cfg.spotsMin}–${cfg.spotsMax}).`);
    if (selected.length < rule.target) warnings.push(`Project ${rule.key}: ${selected.length}/${rule.target} photos (cluster has ${eligible.length} eligible).`);

    const spots: SpotPlan[] = plan.spotClusters
      .map((_, i) => {
        const members = selected.filter((f) => plan.spotOf.get(f.pageId) === i);
        const c = centroid(members.map((m) => pos(m)!));
        const far = Math.max(0, ...members.map((m) => haversine(c, pos(m)!)));
        return { index: i, center: c, radiusM: Math.min(cfg.spotRadiusMaxM, Math.max(cfg.spotRadiusMinM, Math.ceil(far + 10))), pageIds: members.map((m) => m.pageId) };
      })
      .filter((s) => s.pageIds.length > 0)
      .map((s, i) => ({ ...s, index: i }));

    const dates = selected.map((f) => f.date?.local).filter((d): d is string => !!d).sort();
    const isWater = rule.types.includes("water") && selected.filter((f) => cfg.waterWords.test(text(f))).length * 2 > selected.length;
    const type: ProjectType = isWater ? "water" : rule.types[0];
    const selectedSpotOf = new Map(spots.flatMap((s) => s.pageIds.map((id) => [id, s.index] as const)));

    for (const f of selected) used.add(f.pageId);
    placed.set(rule.key, plan.center);
    const reserve = geotagged.filter((c) => !used.has(c.pageId) && haversine(plan.center, pos(c)!) <= plan.radiusM).sort(byPreference);
    projects.push({
      key: rule.key,
      slug: rule.slug,
      type,
      label: majorityLabel(selected, rule),
      center: plan.center,
      radiusM: Math.round(plan.radiusM),
      startDate: dates.length ? day(dates[0], -cfg.datePaddingDays) : null,
      endDate: dates.length ? day(dates.at(-1)!, cfg.datePaddingDays) : null,
      minPairGapHours: cfg.minPairGapHours[type],
      sdgs: cfg.sdgs[type],
      clusterSize: plan.cluster.members.length,
      pairability: { cluster: summary(plan.pair), selected: summary(pairability(selected, selectedSpotOf, cfg.minPairGapHours[type], cfg.stageBonus)) },
      files: selected,
      spots,
      reserve,
    });
  }
  return { projects, ranking, warnings };
}
