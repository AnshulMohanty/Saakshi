/** Plain-text pairing reports for the CLI: every candidate, and why each reject failed. */
import { describeExclusion, describeRejection, type PairingResult } from "./pairing";

export interface PairingSummary {
  project: string;
  pairs: number;
  candidates: number;
  rejected: Record<string, number>;
  excluded: Record<string, number>;
}

export function summarisePairing(project: string, r: PairingResult): PairingSummary {
  const rejected: Record<string, number> = {};
  for (const c of r.candidates) for (const x of c.rejects) rejected[x] = (rejected[x] ?? 0) + 1;
  const excluded: Record<string, number> = {};
  for (const e of r.excluded) for (const x of e.reasons) excluded[x] = (excluded[x] ?? 0) + 1;
  return { project, pairs: r.pairs.length, candidates: r.candidates.length, rejected, excluded };
}

/** One line per candidate: "✓ PAIR a → b  12.3 m, 4.5 h, stage 3" or "✗ a → b  too far apart (…)". */
export function pairingLines(r: PairingResult, label: (id: string) => string): string[] {
  const chosen = new Set(r.pairs.map((p) => `${p.beforeId}>${p.afterId}`));
  const lines = r.candidates.map((c) => {
    const facts = `${Number.isFinite(c.distanceM) ? `${c.distanceM} m` : "no location"}, ${c.gapHours} h, stage ${c.stageScore}${c.hamming !== null ? `, pHash ${c.hamming}` : ""}`;
    const head = `${label(c.beforeId)} → ${label(c.afterId)}`;
    if (chosen.has(`${c.beforeId}>${c.afterId}`)) return `  ✓ PAIR  ${head}  (${facts})`;
    if (c.ok) return `  · valid ${head}  (${facts}; a photo is already in a better pair)`;
    return `  ✗ ${head}  ${c.rejects.map(describeRejection).join("; ")}  (${facts})`;
  });
  for (const e of r.excluded) lines.push(`  – ${label(e.id)} left out: ${e.reasons.map(describeExclusion).join(", ")}`);
  return lines;
}
