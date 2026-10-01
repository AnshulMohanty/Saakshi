import { TrustMeter } from "@/components/trust-meter";
import type { LandingData } from "@/lib/landing/types";

/**
 * The fixed layers behind and over the story (L:534-596): the sky, the one WebGL canvas, and the
 * overlay the stage positions every frame (layer labels with leader lines, the proof card,
 * project labels over the stacks). Hidden in low-power and reduced modes.
 */
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
          {h?.trust && <TrustMeter innerId="h-proof-in" ids="h" score={h.trust.score} band={h.trust.band} chips={h.trust.chips} mock={h.trust.mock} mockTag={data.mockTag} style={{ opacity: "0" }} />}
        </div>

        <div id="gl-projects">
          {data.projects.map((p) => (
            <div key={p.key} data-pl={p.key} style={{ position: "absolute", left: "0", top: "0", opacity: "0", display: "flex", flexDirection: "column", gap: "2px", padding: "6px 10px", borderRadius: "8px", background: "color-mix(in srgb, var(--n-background) 86%, transparent)", color: "var(--n-foreground)", whiteSpace: "nowrap" }}>
              <span style={{ fontWeight: "600", fontSize: "13px" }}>{`${p.name}, ${p.city}`}</span>
              <span style={{ fontSize: "12px", color: "var(--n-muted-foreground)" }}>{`${p.count} photos${p.range ? `, ${p.range}` : ""}`}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
