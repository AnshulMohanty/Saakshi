"use client";

import { defaultTrustConfig, describeReason, ledgerRows, simulate, SIM_PRESETS, type SimFacts } from "@/lib/trust";
import { HowItWorksView, type HowData, type Scoring, type SimView } from "./how-it-works";

/** The simulator on the real Trust Engine (B5.1): our rules, points, bands (45/75) and sentences. */
function view(f: SimFacts): SimView {
  const r = simulate(f);
  return { score: r.score, band: r.band, rows: ledgerRows(r.reasons, describeReason), hard: r.reasons.filter((x) => x.kind === "hard").map((x) => describeReason(x)) };
}

const { reviewMin, verifiedMin } = defaultTrustConfig;
const SCORING: Scoring = {
  score: view,
  edges: [reviewMin, verifiedMin],
  labels: [`Flagged, below ${reviewMin}`, `Needs review, ${reviewMin} to ${verifiedMin - 1}`, `Verified, ${verifiedMin}+`],
  presets: SIM_PRESETS,
};

export function HowItWorks({ data }: { data: HowData }) {
  return <HowItWorksView data={data} scoring={SCORING} />;
}
