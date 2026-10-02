"use client";

import { beforeExclusion, skScore, SK_PRESETS } from "@/lib/parity/sk";
import { HowItWorksView, type HowData, type Scoring } from "./how-it-works";

/** /dev/parity only: the view on the prototype's placeholder rules, for pixel parity. */
const SCORING: Scoring = { score: skScore, edges: [40, 80], labels: ["Flagged, below 40", "Needs review, 40 to 79", "Verified, 80+"], presets: SK_PRESETS };

export function HowItWorksDesign({ data }: { data: HowData }) {
  return <HowItWorksView data={data} scoring={SCORING} exclusion={beforeExclusion} />;
}
