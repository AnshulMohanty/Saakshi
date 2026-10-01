import type { CSSProperties } from "react";
import { defaultTrustConfig } from "@/lib/trust/config";
import type { RuleChip } from "@/lib/trust/labels";
import type { TrustBand } from "@/lib/trust/types";

const BAND_TICKS = [defaultTrustConfig.reviewMin, defaultTrustConfig.verifiedMin];

/**
 * TrustMeter (Developer Handoff: checking, counting, Verified, Needs review, Flagged): score,
 * band, a bar with the three band names, and one chip per rule (lib/trust/labels.ts ruleChips).
 * Markup from the landing's proof card (L:565-585). `ids` names the parts a timeline drives
 * (the landing counts #h-score from 0); otherwise it renders its final state.
 */
export const BAND_LABEL: Record<TrustBand, string> = { VERIFIED: "Verified", NEEDS_REVIEW: "Needs review", FLAGGED: "Flagged" };
export const BAND_COLOR: Record<TrustBand, string> = { VERIFIED: "var(--verified)", NEEDS_REVIEW: "var(--review)", FLAGGED: "var(--flagged)" };

const CHIP: Record<RuleChip["tone"], { bg: string; fg: string; dot: string }> = {
  good: { bg: "var(--verified-tint)", fg: "var(--verified-ink)", dot: "var(--verified)" },
  neutral: { bg: "var(--background)", fg: "var(--muted-foreground)", dot: "var(--neutral-dot)" },
  warn: { bg: "color-mix(in srgb, var(--review) 12%, var(--card))", fg: "var(--review)", dot: "var(--review)" },
  bad: { bg: "var(--flagged-tint)", fg: "var(--flagged-ink)", dot: "var(--flagged)" },
};

export function RuleChips({ chips, animate = false }: { chips: RuleChip[]; animate?: boolean }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
      {chips.map((c) => (
        <span key={c.code} data-rule={animate ? "" : undefined} style={{ display: "flex", alignItems: "center", gap: "6px", padding: "4px 8px", borderRadius: "6px", background: CHIP[c.tone].bg, color: CHIP[c.tone].fg, fontSize: "12px" }}>
          <span style={{ width: "6px", height: "6px", borderRadius: "3px", background: CHIP[c.tone].dot }} />
          {c.text}
        </span>
      ))}
    </div>
  );
}

export interface TrustMeterProps {
  score: number | null;
  band: TrustBand | null;
  chips: RuleChip[];
  /** Id prefix for timeline-driven parts ("h" → #h-score, #h-band, #h-bar); starts at "Checking". */
  ids?: string;
  mock?: boolean;
  style?: CSSProperties;
  innerId?: string;
}

export function TrustMeter({ score, band, chips, ids, mock, style, innerId }: TrustMeterProps) {
  const counting = !!ids;
  const shown = counting ? 0 : (score ?? 0);
  const color = counting || !band ? "var(--verified)" : BAND_COLOR[band];
  return (
    <div id={innerId} style={{ display: "flex", flexDirection: "column", gap: "10px", padding: "14px", borderRadius: "12px", background: "var(--card)", border: "1px solid var(--border)", boxShadow: "0 10px 30px color-mix(in srgb, var(--foreground) 10%, transparent)", ...style }}>
      <div style={{ display: "flex", alignItems: "center", gap: "14px", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
          <span id={ids ? `${ids}-score` : undefined} style={{ fontFamily: "var(--font-display)", fontWeight: "700", fontSize: "40px", lineHeight: "1", fontVariantNumeric: "tabular-nums", color }}>
            {shown}
          </span>
          <span id={ids ? `${ids}-band` : undefined} style={{ fontWeight: "600", fontSize: "15px", color: counting || !band ? "var(--muted-foreground)" : color }}>
            {counting || !band ? "Checking" : BAND_LABEL[band]}
          </span>
          {mock && <span style={{ fontSize: "11px", padding: "1px 6px", borderRadius: "5px", border: "1px dashed var(--review)", color: "var(--review)" }}>Mock output</span>}
        </div>
        <div style={{ flex: "1", minWidth: "160px", display: "flex", flexDirection: "column", gap: "4px" }}>
          <div style={{ position: "relative", height: "8px", borderRadius: "4px", background: "var(--secondary)", overflow: "hidden" }}>
            <div id={ids ? `${ids}-bar` : undefined} style={{ position: "absolute", left: "0", top: "0", bottom: "0", width: `${shown}%`, background: color, borderRadius: "4px" }} />
            {/* B5.1: our band edges (lib/trust config reviewMin 45, verifiedMin 75). */}
            {BAND_TICKS.map((t) => (
              <span key={t} aria-hidden="true" style={{ position: "absolute", left: `${t}%`, top: "0", bottom: "0", width: "1px", background: "var(--card)" }} />
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "var(--muted-foreground)" }}>
            <span>Flagged</span>
            <span>Needs review</span>
            <span>Verified</span>
          </div>
        </div>
      </div>
      <RuleChips chips={chips} animate={counting} />
    </div>
  );
}
