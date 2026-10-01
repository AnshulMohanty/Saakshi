"use client";

import { defaultTrustConfig, describeReason, reasonLabel, signalMax, simulate, SIM_PRESETS, type SimFacts, type TrustSignalName } from "@/lib/trust";
import { HowItWorksView, type HowData, type Scoring, type SimView } from "./how-it-works";

/** The simulator on the real Trust Engine (B5.1): our rules, points, bands (45/75) and sentences. */
const SIGNALS: TrustSignalName[] = ["location", "time", "uniqueness", "authenticity", "quality", "provenance"];

function view(f: SimFacts): SimView {
  const r = simulate(f);
  const rows = SIGNALS.flatMap((sig) => {
    const rs = r.reasons.filter((x) => x.signal === sig && x.kind !== "info");
    const main = rs.find((x) => x.kind === "hard") ?? rs.find((x) => x.kind === "review") ?? rs[0];
    if (!main) return [];
    const pts = rs.reduce((n, x) => n + x.points, 0);
    const max = signalMax(sig) ?? 0;
    return [{ label: reasonLabel(main.code), note: describeReason(main), pts, max, tone: main.kind === "hard" ? ("bad" as const) : main.kind === "review" ? ("warn" as const) : pts >= max ? ("good" as const) : pts < 0 ? ("bad" as const) : ("neutral" as const) }];
  });
  return { score: r.score, band: r.band, rows, hard: r.reasons.filter((x) => x.kind === "hard").map((x) => describeReason(x)) };
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
