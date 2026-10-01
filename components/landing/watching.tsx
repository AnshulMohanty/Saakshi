/* eslint-disable @next/next/no-img-element -- signed Cloudinary URLs */
import { LogoGlyph } from "@/components/glyph";
import type { LandingData } from "@/lib/landing/types";
import { T7 } from "@/lib/motion/scenes/landing";

/**
 * Chapter 7 (L:924-960, P1): a spot's check-ins after the clean-up, the measured cover of each
 * drawn as a line the scroll scrubs through (landing-dom ch7). Real check-ins from the spot
 * trend (lib/measure/views.ts); without any, the designed empty state.
 */
export function WatchingChapter({ data }: { data: LandingData }) {
  const c = data.checkins;
  const first = c?.points[0];
  const has = !!c && c.points.length > 1;
  return (
    <section id="ch7" data-pin={has ? "" : undefined} data-screen-label="07 It keeps watching" style={{ position: "relative", zIndex: "2", height: has ? "340vh" : "auto", background: "var(--secondary)" }}>
      <div id="ch7-sticky" style={{ position: has ? "sticky" : "relative", top: "0", height: has ? "100vh" : "auto", overflow: "hidden", background: "var(--secondary)" }}>
        <div style={{ position: has ? "absolute" : "relative", inset: "0", padding: "clamp(88px,13vh,130px) clamp(20px,5vw,72px) 24px", boxSizing: "border-box", display: "flex", flexWrap: "wrap", gap: "clamp(20px,4vw,56px)", alignContent: "flex-start" }}>
          <div style={{ flex: "1 1 300px", maxWidth: "520px", display: "flex", flexDirection: "column", gap: "14px" }}>
            <h2 style={{ margin: "0", fontFamily: "var(--font-display)", fontWeight: "700", fontStretch: "92%", fontSize: "clamp(34px,4.4vw,68px)", lineHeight: "0.95", letterSpacing: "-0.02em", textWrap: "balance" }}>A clean-up is one day. Saakshi keeps watching.</h2>
            <p style={{ margin: "0", fontSize: "15px", lineHeight: "1.5", color: "var(--muted-foreground)" }}>A QR poster on the pole lets anyone passing add a check-in photo of the same spot.</p>
            <div style={{ position: "relative", width: "100%", aspectRatio: "4/3", maxHeight: "min(40vh,52vw)", borderRadius: "var(--radius)", overflow: "hidden", background: "var(--placeholder)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {first?.photo ? (
                <img id="c7-img" src={first.photo} alt={`Check-in photo at ${c!.spot}`} style={{ position: "absolute", inset: "0", width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "4px", alignItems: "center", textAlign: "center", padding: "12px", color: "var(--muted-foreground)" }}>
                  <span style={{ fontWeight: "600", color: "var(--foreground)" }}>{c ? "Real photo here" : "No check-ins yet"}</span>
                  <span id="c7-photo" style={{ fontSize: "13px" }}>
                    {first?.label ?? "Check-ins appear once someone scans a spot's poster."}
                  </span>
                </div>
              )}
              {first?.photo && (
                <span id="c7-photo" style={{ position: "absolute", left: "12px", bottom: "12px", padding: "4px 8px", borderRadius: "6px", background: "color-mix(in srgb, var(--ink-black) 62%, transparent)", color: "var(--l-card)", fontSize: "12px" }}>
                  {first.label}
                </span>
              )}
              <div style={{ position: "absolute", right: "12px", top: "12px", width: "62px", padding: "6px", borderRadius: "6px", background: "var(--card)", display: "flex", flexDirection: "column", gap: "4px", alignItems: "center", fontSize: "9px", color: "var(--muted-foreground)" }}>
                <LogoGlyph size={40} />
                <span>QR poster</span>
              </div>
            </div>
          </div>
          {c && (
            <div style={{ flex: "1 1 320px", maxWidth: "560px", display: "flex", flexDirection: "column", gap: "12px" }}>
              <div style={{ display: "flex", gap: "24px", flexWrap: "wrap" }}>
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <span id="c7-count" style={{ fontFamily: "var(--font-display)", fontWeight: "700", fontSize: "44px", lineHeight: "1" }}>
                    0
                  </span>
                  <span style={{ fontSize: "12px", color: "var(--muted-foreground)" }}>check-ins since the clean-up</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <span id="c7-val" style={{ fontFamily: "var(--font-display)", fontWeight: "700", fontSize: "44px", lineHeight: "1", color: "var(--measured)" }}>
                    {first ? (first.value.value === null ? first.value.text : `${first.value.text}%`) : "–"}
                  </span>
                  <span style={{ fontSize: "12px", color: "var(--muted-foreground)" }}>litter cover, measured</span>
                </div>
                {c.points.some((p) => p.value.mock) && <span style={{ alignSelf: "flex-start", padding: "1px 6px", borderRadius: "5px", border: "1px dashed var(--review)", color: "var(--review)", fontSize: "12px" }}>{data.mockTag}</span>}
              </div>
              <svg id="c7-chart" viewBox={`0 0 ${T7.chart.width} ${T7.chart.height}`} role="img" aria-label={`Litter cover at ${c.spot} at each check-in`} style={{ width: "100%", height: "auto", overflow: "visible" }}>
                <line x1="0" y1={T7.chart.base} x2={T7.chart.width} y2={T7.chart.base} strokeWidth="1" style={{ stroke: "var(--chart-axis)" }} />
                <path id="c7-line" d="" fill="none" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" pathLength={1} strokeDasharray="1" strokeDashoffset="1" style={{ stroke: "var(--measured)" }} />
                <g id="c7-dots" />
                <circle id="c7-marker" cx="0" cy="0" r="7" strokeWidth="3" style={{ fill: "var(--measured)", stroke: "var(--card)" }} />
              </svg>
              <div id="c7-ticks" style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "var(--muted-foreground)" }}>
                {c.points.map((p, i) => (
                  <span key={i}>{p.short}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
