"use client";

/* eslint-disable @next/next/no-img-element -- signed Cloudinary URLs */
import { useEffect, useRef, useState } from "react";
import { Glyph } from "@/components/glyph";
import { BAND_LABEL } from "@/components/trust-meter";
import { LOGO_BITS } from "@/lib/glyph";
import { probeMotion, resolveMotion } from "@/lib/motion/mode";
import { STEP_LABELS } from "@/lib/motion/scenes/witness-wall";
import type { WallCard, WallController } from "@/lib/scenes/witness-wall";
import { planeHeight, spotPx } from "@/lib/scenes/witness-wall";
import type { TrustBand } from "@/lib/trust/types";
import type { WallArrival, WallCounters, WallData } from "@/lib/wall/types";

/**
 * The Witness Wall (Witness_Wall → /witness): a 1920×1080 stage for the venue screen. Real
 * Witness photos land on the map as they arrive (/api/live), with the four pipeline steps and
 * their real score; counters are refetched from the database after each (rule 1). Operator
 * mode adds rehearsals (B5.8). Choreography: lib/scenes/witness-wall.ts.
 */
const NIGHT_BAND: Record<TrustBand, string> = { VERIFIED: "var(--verified)", NEEDS_REVIEW: "var(--review)", FLAGGED: "var(--flagged)" };
const EMPTY_CARD: WallCard = { src: "", place: "", score: null, band: null, reason: "", resultOpacity: 0, caption: "just now" };

export function WitnessWall({ data, qrSvg, allowMotionOverride = false }: { data: WallData; qrSvg: string; allowMotionOverride?: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  const ctl = useRef<WallController | null>(null);
  const [card, setCard] = useState<WallCard | null>(null);
  const [step, setStep] = useState(-1);
  const [arrivals, setArrivals] = useState<WallArrival[]>(data.arrivals);
  const [counters, setCounters] = useState<WallCounters>(data.counters);
  const [live, setLive] = useState<"live" | "reconnecting" | "off">(data.live ? "live" : "off");

  // Rehearsal photos load before they are needed, so a card never lands empty.
  useEffect(() => {
    for (const p of data.rehearsals.slice(0, 12)) new Image().src = p.src;
  }, [data.rehearsals]);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    let disposed = false;
    const mode = resolveMotion({ ...probeMotion({ allowOverride: allowMotionOverride }), webgl2: true, animation: true });
    void import("@/lib/scenes/witness-wall").then(({ setupWall }) => {
      if (disposed) return;
      ctl.current = setupWall(el, data, mode, {
        setCard,
        patchCard: (p) => setCard((c) => (c ? { ...c, ...p } : c)),
        setStep,
        setLive,
        landed: (a) => {
          setArrivals((xs) => [a, ...xs.filter((x) => x.id !== a.id)].slice(0, 5));
          if (data.counting === "local") {
            setCounters((c) => ({ total: c.total + 1, verified: c.verified + (a.band === "VERIFIED" ? 1 : 0), flagged: c.flagged + (a.band === "FLAGGED" ? 1 : 0) }));
            return;
          }
          // Counters are SQL counts: refetch rather than add in the browser (rule 1).
          if (!a.rehearsal && data.live)
            fetch("/api/witness/today", { cache: "no-store" })
              .then((r) => (r.ok ? (r.json() as Promise<WallCounters>) : null))
              .then((c) => c && setCounters(c))
              .catch(() => undefined);
        },
      });
    });
    return () => {
      disposed = true;
      ctl.current?.dispose();
      ctl.current = null;
    };
  }, [data, allowMotionOverride]);

  const c = card ?? EMPTY_CARD;
  const ph = planeHeight(data.frame);
  const color = c.band ? NIGHT_BAND[c.band] : "var(--foreground)";
  const steps = STEP_LABELS.map((label, i) => ({ label, bar: i < step ? "var(--primary)" : i === step ? "var(--foreground)" : "var(--border)", text: i <= step ? "var(--foreground)" : "var(--night-step-muted)" }));
  return (
    <div ref={root} className="design-root night" style={{ position: "fixed", inset: "0" }}>
      <div id="ww-fit" data-screen-label="Witness Wall" style={{ position: "fixed", inset: "0", background: "var(--background)", overflow: "hidden", fontFamily: "var(--font-sans)", color: "var(--foreground)", fontVariantNumeric: "tabular-nums" }}>
        <div id="ww-stage" style={{ position: "absolute", left: "0", top: "0", width: "1920px", height: "1080px", transformOrigin: "0 0", overflow: "hidden", background: "var(--background)" }}>
          <div id="ww-map" data-dust="" style={{ position: "absolute", left: "0", top: "0", width: "1300px", height: "1080px", overflow: "hidden", backgroundColor: "var(--background)", perspective: "1500px", perspectiveOrigin: "50% 30%" }}>
            <div id="ww-cam" style={{ position: "absolute", left: "50%", top: "56%", width: "0", height: "0", transformStyle: "preserve-3d", transform: "rotateX(54deg) rotateZ(-10deg) scale(1)" }}>
              <div id="ww-plane" style={{ position: "absolute", left: "-700px", top: `-${Math.floor(ph / 2)}px`, width: "1400px", height: `${ph}px`, transformStyle: "preserve-3d" }}>
                <canvas id="ww-dots" width="1400" height={ph} role="img" aria-label={`Map of the demo sites: ${data.spots.map((s) => s.label).join("; ")}`} style={{ position: "absolute", inset: "0", width: "1400px", height: `${ph}px` }} />
                <div id="ww-ripples" style={{ position: "absolute", inset: "0" }} />
                {data.spots.map((s) => {
                  const p = spotPx(s, data.frame);
                  return (
                    <div key={s.k} data-spot={s.k} style={{ position: "absolute", left: `${p.px}px`, top: `${p.py}px`, width: "0", height: "0" }}>
                      <div style={{ position: "absolute", left: "-14px", top: "-14px", width: "28px", height: "28px", borderRadius: "14px", background: "color-mix(in srgb, var(--verified) 18%, transparent)" }} />
                      <div data-pin="" style={{ position: "absolute", left: "-7px", top: "-7px", width: "14px", height: "14px", borderRadius: "7px", background: "var(--verified)", boxShadow: "0 0 18px 4px color-mix(in srgb, var(--verified) 55%, transparent)" }} />
                      <div style={{ position: "absolute", left: "22px", top: s.labelBelow ? "14px" : "-50px", whiteSpace: "nowrap", padding: "5px 10px", borderRadius: "8px", background: "color-mix(in srgb, var(--card) 90%, transparent)", border: "1px solid var(--border)", fontSize: "22px", fontWeight: "500" }}>{s.label}</div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div style={{ position: "absolute", left: "56px", top: "48px", display: "flex", alignItems: "center", gap: "16px" }}>
              <Glyph bits={LOGO_BITS} size={44} colors={{ on: "var(--primary)", off: "transparent" }} />
              <span style={{ fontFamily: "var(--font-display)", fontWeight: "650", fontSize: "40px" }}>Saakshi</span>
              <span lang="hi" style={{ fontFamily: "var(--font-deva)", fontSize: "32px", color: "var(--muted-foreground)" }}>
                साक्षी
              </span>
              <span style={{ marginLeft: "18px", whiteSpace: "nowrap", fontFamily: "var(--font-display)", fontWeight: "600", fontSize: "34px", color: "var(--muted-foreground)" }}>Witness Wall</span>
              <span role="status" style={{ display: "flex", alignItems: "center", gap: "8px", marginLeft: "12px", padding: "6px 12px", borderRadius: "8px", background: "var(--card)", border: "1px solid var(--border)", fontSize: "20px" }}>
                <span id="ww-live" style={{ width: "10px", height: "10px", borderRadius: "5px", background: live === "live" ? "var(--verified)" : "var(--muted-foreground)" }} />
                {live === "reconnecting" ? "Reconnecting" : "Live"}
              </span>
            </div>
            <div id="ww-focus" style={{ position: "absolute", left: "56px", bottom: "48px", display: "flex", flexDirection: "column", gap: "4px" }}>
              <span style={{ fontSize: "20px", color: "var(--muted-foreground)" }}>Now watching</span>
              <span id="ww-focus-name" style={{ fontFamily: "var(--font-display)", fontWeight: "650", fontSize: "34px" }}>
                All demo spots
              </span>
            </div>
            <div style={{ position: "absolute", right: "40px", bottom: "48px", display: "flex", gap: "10px", alignItems: "center" }}>
              {data.operator && (
                <>
                  <button type="button" onClick={() => ctl.current?.rehearse()} style={{ padding: "10px 16px", borderRadius: "var(--radius)", border: "1px solid var(--border)", background: "var(--card)", color: "var(--foreground)", fontSize: "18px", cursor: "pointer", whiteSpace: "nowrap" }}>
                    Simulate an arrival
                  </button>
                  <span style={{ fontSize: "16px", color: "var(--muted-foreground)" }}>{data.opsHint}</span>
                </>
              )}
            </div>
          </div>

          <aside style={{ position: "absolute", right: "0", top: "0", width: "620px", height: "1080px", boxSizing: "border-box", padding: "48px 52px", background: "var(--card)", borderLeft: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: "32px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "18px", alignItems: "flex-start" }}>
              <span style={{ fontFamily: "var(--font-display)", fontWeight: "700", fontStretch: "88%", fontSize: "64px", lineHeight: "0.92", letterSpacing: "-0.02em" }}>Scan to be a witness</span>
              <div style={{ display: "flex", gap: "22px", alignItems: "center" }}>
                <div id="ww-qr" role="img" aria-label="QR code to open the witness camera" dangerouslySetInnerHTML={{ __html: qrSvg }} style={{ width: "260px", height: "260px", padding: "16px", borderRadius: "16px", background: "var(--l-card)", boxSizing: "border-box" }} />
                <div style={{ display: "flex", flexDirection: "column", gap: "10px", fontSize: "20px", lineHeight: "1.4", color: "var(--muted-foreground)" }}>
                  <span>Take a photo of anything around you.</span>
                  <span>Watch it land on the map.</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "18px", color: "var(--foreground)" }}>{data.qr.label}</span>
                </div>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "12px" }}>
              {[
                { id: "ww-c-total", v: counters.total, label: "photos today", color: undefined },
                { id: undefined, v: counters.verified, label: "verified", color: "var(--verified)" },
                { id: undefined, v: counters.flagged, label: "flagged", color: "var(--flagged)" },
              ].map((k) => (
                <div key={k.label} style={{ display: "flex", flexDirection: "column", gap: "4px", padding: "16px", borderRadius: "12px", background: "var(--card)", border: "1px solid var(--border)" }}>
                  <span id={k.id} style={{ fontFamily: "var(--font-display)", fontWeight: "700", fontSize: "64px", lineHeight: "1", color: k.color }}>
                    {k.v}
                  </span>
                  <span style={{ fontSize: "18px", color: "var(--muted-foreground)" }}>{k.label}</span>
                </div>
              ))}
            </div>
            <div style={{ flex: "1", minHeight: "0", display: "flex", flexDirection: "column", gap: "12px" }}>
              <span style={{ fontSize: "22px", fontWeight: "600" }}>Latest arrivals</span>
              <div id="ww-list" aria-live="polite" style={{ display: "flex", flexDirection: "column", gap: "10px", overflow: "hidden" }}>
                {arrivals.map((a) => {
                  const col = a.band ? NIGHT_BAND[a.band] : "var(--muted-foreground)";
                  return (
                    <div key={a.id} style={{ display: "flex", gap: "14px", alignItems: "center", padding: "10px", borderRadius: "12px", background: "var(--card)", border: "1px solid var(--border)" }}>
                      <img src={a.src} alt="" style={{ width: "96px", height: "72px", objectFit: "cover", borderRadius: "8px" }} />
                      <div style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px" }}>
                        <span style={{ fontSize: "20px", fontWeight: "500" }}>{a.place}</span>
                        <span style={{ fontSize: "16px", color: "var(--muted-foreground)" }}>{a.rehearsal && data.rehearsalTag ? `${data.rehearsalTag}. ${a.reason}` : a.reason}</span>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                        <span style={{ fontFamily: "var(--font-display)", fontWeight: "700", fontSize: "34px", lineHeight: "1", color: col }}>{a.score ?? "–"}</span>
                        <span style={{ fontSize: "15px", fontWeight: "600", color: col }}>{a.band ? BAND_LABEL[a.band] : "Checking"}</span>
                      </div>
                    </div>
                  );
                })}
                {!arrivals.length && <div style={{ padding: "20px", borderRadius: "12px", border: "1px dashed var(--border)", fontSize: "19px", color: "var(--muted-foreground)", lineHeight: "1.45" }}>No witness photos yet. The first one lands on the map with a ripple.</div>}
              </div>
            </div>
            <span style={{ fontSize: "15px", color: "var(--muted-foreground)" }}>Faces are blurred before any photo appears here.</span>
          </aside>

          <div id="ww-card" aria-live="polite" style={{ position: "absolute", left: "0", top: "0", width: "400px", opacity: "0", transformOrigin: "0 0", display: "flex", flexDirection: "column", borderRadius: "16px", overflow: "hidden", background: "var(--card)", border: "1px solid var(--night-code-border)", boxShadow: "0 30px 80px color-mix(in srgb, var(--ink-black) 55%, transparent)", pointerEvents: "none" }}>
            {c.src ? <img src={c.src} alt="" style={{ width: "100%", height: "280px", objectFit: "cover", display: "block", background: "var(--background)" }} /> : <div style={{ width: "100%", height: "280px", background: "var(--background)" }} />}
            <div style={{ display: "flex", flexDirection: "column", gap: "12px", padding: "16px 18px 18px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "baseline" }}>
                <span style={{ fontSize: "22px", fontWeight: "600" }}>{c.place}</span>
                <span style={{ fontSize: "16px", color: "var(--muted-foreground)" }}>{c.caption}</span>
              </div>
              <div style={{ display: "flex", gap: "6px" }}>
                {steps.map((st) => (
                  <div key={st.label} style={{ flex: "1", display: "flex", flexDirection: "column", gap: "6px" }}>
                    <div style={{ height: "5px", borderRadius: "3px", background: st.bar }} />
                    <span style={{ fontSize: "14px", color: st.text }}>{st.label}</span>
                  </div>
                ))}
              </div>
              <div id="ww-result" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", minHeight: "52px", opacity: c.resultOpacity }}>
                <span style={{ display: "flex", alignItems: "baseline", gap: "10px" }}>
                  <span style={{ fontFamily: "var(--font-display)", fontWeight: "700", fontSize: "48px", lineHeight: "1", color }}>{c.score ?? ""}</span>
                  <span style={{ fontSize: "22px", fontWeight: "600", color }}>{c.band ? BAND_LABEL[c.band] : ""}</span>
                </span>
                <span style={{ fontSize: "15px", color: "var(--muted-foreground)", textAlign: "right", maxWidth: "170px" }}>{c.reason}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
