"use client";

import { TrustMeter } from "@/components/trust-meter";
import type { LandingData } from "@/lib/landing/types";
import type { Seal } from "@/lib/landing/seal";
import { StormMap, useStormMapGate } from "./storm-map";

/**
 * The fixed layers behind and over the story (L:534-596): the sky, chapter 2's India map (under
 * the canvas, so the storm's photos fly over it into their grids), the one WebGL canvas, and the
 * overlay the stage positions every frame (layer labels with leader lines, the proof card).
 * Hidden in low-power and reduced modes.
 */
const CHIP_TONE = {
  good: { bg: "var(--verified-tint)", fg: "var(--verified-ink)", dot: "var(--verified)" },
  neutral: { bg: "var(--background)", fg: "var(--muted-foreground)", dot: "var(--neutral-dot)" },
  warn: { bg: "color-mix(in srgb, var(--review) 12%, var(--card))", fg: "var(--review)", dot: "var(--review)" },
  bad: { bg: "var(--flagged-tint)", fg: "var(--flagged-ink)", dot: "var(--flagged)" },
} as const;

/**
 * The proof strip of "Sealed into one proof": score, band, the bar with a marker that travels as
 * the points land, and each layer's chips (data-step) lit as its layer lands; a hard-flag cap is
 * its own red chip. landing-dom drives #h-score, #h-band, #h-bar, #h-marker and the chips.
 */
function SealStrip({ trust, seal, mockTag }: { trust: { mock: boolean }; seal: Seal; mockTag: string }) {
  return (
    <div id="h-proof-in" style={{ opacity: "0", display: "flex", flexDirection: "column", gap: "10px", padding: "14px", borderRadius: "14px", background: "var(--card)", border: "1px solid var(--border)", boxShadow: "0 18px 50px color-mix(in srgb, var(--foreground) 14%, transparent)" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
          <span id="h-score" style={{ fontFamily: "var(--font-display)", fontWeight: "700", fontSize: "42px", lineHeight: "1", fontVariantNumeric: "tabular-nums", color: "var(--muted-foreground)" }}>
            0
          </span>
          <span id="h-band" style={{ fontWeight: "600", fontSize: "15px", color: "var(--muted-foreground)" }}>
            Checking
          </span>
          {trust.mock && <span style={{ fontSize: "11px", padding: "1px 6px", borderRadius: "5px", border: "1px dashed var(--review)", color: "var(--review)" }}>{mockTag}</span>}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          <div style={{ position: "relative", height: "10px", marginTop: "6px" }}>
            <div style={{ position: "absolute", inset: "0", borderRadius: "5px", background: "var(--secondary)", overflow: "hidden" }}>
              <div id="h-bar" style={{ position: "absolute", left: "0", top: "0", bottom: "0", width: "0%", background: "var(--verified)", borderRadius: "5px" }} />
              {[45, 75].map((t) => (
                <span key={t} aria-hidden="true" style={{ position: "absolute", left: `${t}%`, top: "0", bottom: "0", width: "2px", background: "var(--card)" }} />
              ))}
            </div>
            <span id="h-marker" aria-hidden="true" style={{ position: "absolute", left: "0%", top: "-8px", width: "0", height: "0", borderLeft: "6px solid transparent", borderRight: "6px solid transparent", borderTop: "7px solid var(--foreground)", transform: "translateX(-6px)" }} />
          </div>
          <div style={{ position: "relative", height: "14px", fontSize: "11px", color: "var(--muted-foreground)" }}>
            <span style={{ position: "absolute", left: "0" }}>Flagged</span>
            <span style={{ position: "absolute", left: "45%" }}>Needs review, 45</span>
            <span style={{ position: "absolute", right: "0" }}>Verified, 75+</span>
          </div>
        </div>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
        {seal.steps.flatMap((st, k) =>
          st.items.map((it) => (
            <span key={it.code} data-step={k} style={{ opacity: "0.18", display: "flex", alignItems: "center", gap: "6px", padding: "4px 8px", borderRadius: "6px", background: CHIP_TONE[it.tone].bg, color: CHIP_TONE[it.tone].fg, fontSize: "12px" }}>
              <span style={{ width: "6px", height: "6px", borderRadius: "3px", background: CHIP_TONE[it.tone].dot }} />
              {it.chip.text}
            </span>
          )),
        )}
        {seal.cap && (
          <span data-step="cap" style={{ opacity: "0.18", display: "flex", alignItems: "center", gap: "6px", padding: "4px 8px", borderRadius: "6px", background: "var(--flagged)", color: "var(--l-card)", fontSize: "12px", fontWeight: "600" }}>
            {`Capped at ${seal.cap.cap} (${seal.cap.because}), −${-seal.cap.points}`}
          </span>
        )}
      </div>
    </div>
  );
}

function StormMapLayer({ data }: { data: LandingData }) {
  const gate = useStormMapGate();
  return (
    <div id="c2-map" aria-hidden="true" style={{ position: "fixed", inset: "0", zIndex: "1", opacity: "0", visibility: "hidden", pointerEvents: "none" }}>
      <div className="c2-mapbox">
        <StormMap data={data} enabled={gate.enabled} settled={gate.settled} />
      </div>
    </div>
  );
}

const LABEL = { position: "absolute", left: "0", top: "0", opacity: "0", width: "250px", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: "3px", padding: "8px 12px", borderRadius: "var(--radius)", background: "var(--card)", border: "1px solid var(--border)", boxShadow: "0 6px 24px color-mix(in srgb, var(--foreground) 8%, transparent)" } as const;
const TITLE = { fontFamily: "var(--font-display)", fontWeight: "650", fontSize: "19px", lineHeight: "1.05" } as const;
const NUM = { color: "var(--muted-foreground)", fontWeight: "500" } as const;
const NOTE = { fontSize: "12px", color: "var(--muted-foreground)", lineHeight: "1.35" } as const;
const BADGE = { padding: "1px 6px", borderRadius: "5px", color: "var(--card)", fontFamily: "var(--font-sans)", fontSize: "11px", fontWeight: "500" } as const;

const coord = (v: number, dir: [string, string]) => `${Math.abs(v).toFixed(5)}° ${v >= 0 ? dir[0] : dir[1]}`;

export function LandingOverlay({ data }: { data: LandingData }) {
  const h = data.hero;
  const metric = h?.metric === "green" ? "Green" : "Litter";
  return (
    <>
      <div id="sk-sky" style={{ position: "fixed", inset: "0", background: "var(--background)", zIndex: "0" }} />
      {data.hero && data.projects.length > 0 && <StormMapLayer data={data} />}
      <canvas id="sk-gl" aria-hidden="true" style={{ position: "fixed", inset: "0", width: "100vw", height: "100vh", zIndex: "1", pointerEvents: "none", display: "block" }} />
      {/* fixed overlay driven by the WebGL stage */}
      <div id="gl-overlay" aria-hidden="true" style={{ position: "fixed", inset: "0", zIndex: "3", pointerEvents: "none" }}>
        <div id="gl-labels">
          <svg id="gl-leaders" style={{ position: "absolute", inset: "0", width: "100%", height: "100%", overflow: "visible" }}>
            {[0, 1, 2, 3, 4].map((i) => (
              <line key={i} data-ld={i} strokeOpacity="0.35" strokeWidth="1" style={{ stroke: "var(--foreground)" }} />
            ))}
          </svg>
          {h && (
            <>
              <div data-ll="0" style={LABEL}>
                <div style={TITLE}>
                  <span style={NUM}>{"1 "}</span>
                  The photo
                </div>
                <div style={NOTE}>{h.photoNote}</div>
              </div>
              <div data-ll="1" style={LABEL}>
                <div style={TITLE}>
                  <span style={NUM}>{"2 "}</span>
                  Where and when
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: "12px", lineHeight: "1.45", color: "var(--foreground)" }}>
                  {h.lat !== null && h.lng !== null ? `${coord(h.lat, ["N", "S"])}, ${coord(h.lng, ["E", "W"])}` : "No location recorded"}
                  <br />
                  {h.when}
                </div>
                <div style={{ fontSize: "11px", color: "var(--muted-foreground)" }}>{h.locationNote}</div>
              </div>
              <div data-ll="2" style={LABEL}>
                <div style={TITLE}>
                  <span style={NUM}>{"3 "}</span>
                  Its fingerprint
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--primary)" }}>{h.hex}</div>
                <div style={{ fontSize: "11px", color: "var(--muted-foreground)" }}>64-bit perceptual hash of the pixels.</div>
              </div>
              <div data-ll="3" style={LABEL}>
                <div style={{ ...TITLE, display: "flex", gap: "8px", alignItems: "center" }}>
                  <span>
                    <span style={NUM}>{"4 "}</span>
                    What the AI sees
                  </span>
                  <span style={{ ...BADGE, background: "var(--estimated)" }}>AI-estimated</span>
                </div>
                <div style={NOTE}>{h.aiText}</div>
              </div>
              <div data-ll="4" style={LABEL}>
                <div style={{ ...TITLE, display: "flex", gap: "8px", alignItems: "center" }}>
                  <span>
                    <span style={NUM}>{"5 "}</span>
                    What we measured
                  </span>
                  <span style={{ ...BADGE, background: "var(--measured)" }}>Measured</span>
                </div>
                <div style={NOTE}>{h.cover ? (h.cover.value === null ? h.cover.text : `${metric} covers ${h.cover.text}% of the frame.${h.cover.mock ? ` (${data.mockTag})` : ""}`) : "Not measured yet."}</div>
              </div>
            </>
          )}
        </div>

        <div id="h-proof" style={{ position: "absolute", left: "0", top: "0", width: "520px" }}>
          {h?.trust && (h.trust.seal ? <SealStrip trust={h.trust} seal={h.trust.seal} mockTag={data.mockTag} /> : <TrustMeter innerId="h-proof-in" ids="h" score={h.trust.score} band={h.trust.band} chips={h.trust.chips} mock={h.trust.mock} mockTag={data.mockTag} style={{ opacity: "0" }} />)}
        </div>

      </div>
    </>
  );
}
