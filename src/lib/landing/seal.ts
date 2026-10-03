/**
 * "Sealed into one proof" (landing chapter 1): the photo's trust reasons grouped under the five
 * layers they come from, so the story can land each layer on the strip and count its points.
 * Pure. The points always add up: Σ items + cap = the score the Trust Engine gave (the engine
 * clamps a negative total at 0, which the `clamped` note says).
 */
import { defaultTrustConfig, type TrustConfig } from "../trust/config";
import { reasonLabel, signalMax, type ChipTone, type RuleChip } from "../trust/labels";
import type { ReasonCode, TrustReason, TrustSignalName } from "../trust/types";

export interface SealItem {
  code: ReasonCode;
  label: string;
  /** Points this reason adds (+) or removes (−); 0 for flags. */
  points: number;
  /** For a scoring signal that earned nothing: its most ("0 of 30"). */
  max: number | null;
  tone: ChipTone;
  /** The chip on the strip, same text as everywhere else (ruleChips). */
  chip: RuleChip;
}

export interface SealStep {
  layer: 1 | 2 | 3 | 4 | 5;
  title: string;
  items: SealItem[];
  points: number;
  /** Layer 5: what was measured (it scores no points). */
  note: string | null;
}

export interface Seal {
  steps: SealStep[];
  /** A hard flag caps the score: its own red line, with the flags that caused it. */
  cap: { points: number; cap: number; because: string } | null;
  score: number;
  /** The engine clamped a negative sum at 0. */
  clamped: boolean;
}

const LAYER_OF: Partial<Record<TrustSignalName, 1 | 2 | 3 | 4>> = { quality: 1, provenance: 1, privacy: 1, location: 2, time: 2, uniqueness: 3, authenticity: 4, stamp: 4 };
const TITLE: Record<1 | 2 | 3 | 4 | 5, string> = { 1: "The photo", 2: "Where and when", 3: "Its fingerprint", 4: "What the AI sees", 5: "What we measured" };

function item(r: Pick<TrustReason, "code" | "signal" | "kind" | "points">, cfg: TrustConfig): SealItem {
  const label = reasonLabel(r.code);
  const max = r.kind === "points" && r.points === 0 ? signalMax(r.signal, cfg) : null;
  const tone: ChipTone = r.kind === "hard" ? "bad" : r.kind === "review" ? "warn" : r.points > 0 ? "good" : r.points < 0 ? "bad" : "neutral";
  const text = r.kind === "hard" || r.kind === "review" ? label : r.points > 0 ? `${label}, ${r.points}` : r.points < 0 ? `${label}, −${-r.points}` : max ? `${label}, 0 of ${max}` : label;
  return { code: r.code, label, points: r.points, max, tone, chip: { code: r.code, text, tone } };
}

export function sealSteps(reasons: Array<Pick<TrustReason, "code" | "signal" | "kind" | "points" | "detail">>, score: number, measured: string | null, cfg: TrustConfig = defaultTrustConfig): Seal {
  const steps: SealStep[] = ([1, 2, 3, 4, 5] as const).map((layer) => ({ layer, title: TITLE[layer], items: [], points: 0, note: layer === 5 ? measured : null }));
  let capReason: (typeof reasons)[number] | null = null;
  for (const r of reasons) {
    if (r.kind === "info") continue;
    if (r.code === "HARD_FLAG_CAP") {
      capReason = r;
      continue;
    }
    const layer = LAYER_OF[r.signal] ?? 4;
    const s = steps[layer - 1];
    s.items.push(item(r, cfg));
    s.points += r.points;
  }
  const hard = reasons.filter((r) => r.kind === "hard").map((r) => reasonLabel(r.code));
  const cap = capReason ? { points: capReason.points, cap: Number(capReason.detail?.cap ?? cfg.hardFlagCap), because: hard.join(", ") || "a hard flag" } : null;
  const sum = steps.reduce((n, s) => n + s.points, 0) + (cap?.points ?? 0);
  return { steps: steps.filter((s) => s.items.length || s.note), cap, score, clamped: sum !== score };
}

/** The running score after each step (what the strip shows as each layer lands), then after the cap. */
export function sealRunning(seal: Seal): number[] {
  const out: number[] = [];
  let n = 0;
  for (const s of seal.steps) {
    n += s.points;
    out.push(Math.max(0, Math.min(100, n)));
  }
  if (seal.cap) out.push(seal.score);
  return out;
}
