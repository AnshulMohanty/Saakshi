"use client";

import { gsap } from "gsap";
import { useEffect, useMemo, useRef, useState } from "react";
import { Glyph } from "@/components/glyph";
import { LOGO_BITS } from "@/lib/glyph";
import { coverAt, litterScores, tintAbove } from "@/lib/measure/demo-mask";
import type { SimFacts } from "@/lib/trust/simulate";
import type { TrustBand } from "@/lib/trust/types";

/**
 * How it works (How_It_Works → /how-it-works): the trust simulator, the threshold demo, the
 * pipeline and the rule (template HW:350-481). The view takes its scoring: the product passes
 * the real Trust Engine (components/how/product.tsx), the /dev/parity fixture the prototype's
 * placeholder rules (components/how/design.tsx).
 */
export interface SimRow {
  label: string;
  note: string;
  pts: number;
  max: number;
  tone: "good" | "neutral" | "warn" | "bad";
}
export interface SimView {
  score: number;
  band: TrustBand;
  rows: SimRow[];
  hard: string[];
}
export interface Scoring {
  score(f: SimFacts): SimView;
  /** Band edges on the bar (the design's 40/80; ours 45/75) and their labels. */
  edges: [number, number];
  labels: [string, string, string];
  presets: Record<"witness" | "google" | "reused", SimFacts>;
}
export interface HowData {
  photo: { src: string; credit: string; badge: string; metric: string; threshold: number } | null;
  stages: Array<{ n: number; name: string; what: string; code: string; writes: string }>;
  homeHref: string;
  demoHref: string;
  ruleNote: string;
}

const BAND_LABEL: Record<TrustBand, string> = { VERIFIED: "Verified", NEEDS_REVIEW: "Needs review", FLAGGED: "Flagged" };
const BAND_COLOR: Record<TrustBand, string> = { VERIFIED: "var(--verified)", NEEDS_REVIEW: "var(--review)", FLAGGED: "var(--flagged)" };
const TONE_PTS: Record<SimRow["tone"], string> = { good: "var(--verified)", neutral: "var(--muted-foreground)", warn: "var(--review)", bad: "var(--l-destructive)" };
const TONE_NOTE: Record<SimRow["tone"], string> = { good: "var(--muted-foreground)", neutral: "var(--muted-foreground)", warn: "var(--review)", bad: "var(--l-destructive)" };

type GroupDef = { label: string; key: keyof SimFacts; options: Array<[string, SimFacts[keyof SimFacts]]> };
const GROUPS: GroupDef[] = [
  { label: "Location source", key: "loc", options: [["Witness camera", "witness"], ["Camera data", "camera"], ["Archive", "archive"], ["None", "none"]] },
  { label: "Inside the site", key: "inside", options: [["Yes", true], ["No", false]] },
  { label: "Time inside the window", key: "inWindow", options: [["Yes", true], ["No", false]] },
  { label: "Duplicate", key: "dup", options: [["None", "none"], ["Burst", "burst"], ["Revisit", "revisit"], ["Other project", "other"]] },
  { label: "Watermark", key: "watermark", options: [["None", false], ["Found", true]] },
  { label: "Photo of a screen", key: "screen", options: [["No", false], ["Yes", true]] },
  { label: "Quality", key: "quality", options: [["Good", "good"], ["Poor", "poor"]] },
  { label: "Camera info", key: "camera", options: [["Present", true], ["Missing", false]] },
];

export function HowItWorksView({ data, scoring, exclusion }: { data: HowData; scoring: Scoring; exclusion?: (x: number, y: number) => boolean }) {
  const [facts, setFacts] = useState<SimFacts>(scoring.presets.witness);
  const [preset, setPreset] = useState<string | null>("witness");
  const [thr, setThr] = useState(Math.round((data.photo?.threshold ?? 0.5) * 100));
  const [cover, setCover] = useState<number | null>(null);
  const r = useMemo(() => scoring.score(facts), [scoring, facts]);
  const num = useRef<HTMLSpanElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const mask = useRef<{ img: HTMLImageElement; scores: Float32Array; W: number; H: number } | null>(null);

  // The score and bar count to the new result (HW:502-508): 0.6 s expo.out.
  useEffect(() => {
    const n = num.current;
    const b = bar.current;
    if (!n || !b) return;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const o = { v: Number(n.textContent) || 0 };
    const tw = gsap.to(o, { v: r.score, duration: reduce ? 0 : 0.6, ease: "expo.out", overwrite: true, onUpdate: () => void (n.textContent = String(Math.round(o.v))) });
    const tb = gsap.to(b, { width: `${r.score}%`, duration: reduce ? 0 : 0.6, ease: "expo.out", overwrite: true });
    return () => {
      tw.kill();
      tb.kill();
    };
  }, [r.score]);

  const draw = (t: number) => {
    const c = canvas.current;
    const m = mask.current;
    if (!c || !m) return;
    c.width = m.W;
    c.height = m.H;
    const x = c.getContext("2d", { willReadFrequently: true })!;
    x.drawImage(m.img, 0, 0, m.W, m.H);
    const od = x.getImageData(0, 0, m.W, m.H);
    tintAbove(od.data, m.scores, t);
    x.putImageData(od, 0, 0);
    const v = coverAt(m.scores, t);
    requestAnimationFrame(() => setCover(v));
  };
  useEffect(() => {
    if (!data.photo) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const W = 512;
      const H = 343;
      const c = document.createElement("canvas");
      c.width = W;
      c.height = H;
      const x = c.getContext("2d", { willReadFrequently: true })!;
      x.drawImage(img, 0, 0, W, H);
      mask.current = { img, scores: litterScores(x.getImageData(0, 0, W, H).data, W, H, exclusion), W, H };
      draw(thr / 100);
    };
    img.src = data.photo.src;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once; the threshold redraws below
  }, [data.photo?.src]);
  useEffect(() => {
    draw(thr / 100);
  }, [thr]);

  const set = (patch: Partial<SimFacts>) => {
    setFacts((f) => ({ ...f, ...patch }));
    setPreset(null);
  };
  const color = BAND_COLOR[r.band];
  const [e1, e2] = scoring.edges;
  const thrText = (thr / 100).toFixed(2);
  const fixed = Math.round((data.photo?.threshold ?? 0.5) * 100);

  return (
    <div className="design-root" style={{ fontFamily: "var(--font-sans)", color: "var(--foreground)", fontVariantNumeric: "tabular-nums", background: "var(--background)" }}>
      <header style={{ position: "sticky", top: "0", zIndex: "20", display: "flex", alignItems: "center", gap: "16px", padding: "12px clamp(16px,4vw,48px)", background: "color-mix(in srgb, var(--card) 95%, transparent)", borderBottom: "1px solid var(--border)" }}>
        <a href={data.homeHref} style={{ display: "flex", alignItems: "center", gap: "10px", color: "var(--foreground)", textDecoration: "none" }}>
          <Glyph bits={LOGO_BITS} size={24} colors={{ off: "transparent" }} />
          <span style={{ fontFamily: "var(--font-display)", fontWeight: "650", fontSize: "21px" }}>Saakshi</span>
          <span lang="hi" style={{ fontFamily: "var(--font-deva)", fontSize: "17px", color: "var(--muted-foreground)" }}>
            साक्षी
          </span>
        </a>
        <nav aria-label="On this page" style={{ flex: "1", minWidth: "0", height: "22px", overflow: "hidden", display: "flex", flexWrap: "wrap", justifyContent: "flex-end", gap: "4px 22px", fontSize: "14px" }}>
          <a href="#sim" style={{ color: "var(--foreground)", textDecoration: "none" }}>
            Trust score
          </a>
          <a href="#measure" style={{ color: "var(--foreground)", textDecoration: "none" }}>
            Measurement
          </a>
          <a href="#pipeline" style={{ color: "var(--foreground)", textDecoration: "none" }}>
            Pipeline
          </a>
        </nav>
        <a href={data.demoHref} style={{ flexShrink: "0", padding: "9px 14px", borderRadius: "9px", background: "var(--primary)", color: "var(--card)", textDecoration: "none", fontWeight: "500", fontSize: "14px" }}>
          Open the live demo
        </a>
      </header>

      <main>
        <section data-screen-label="How it works intro" style={{ padding: "clamp(48px,9vh,96px) clamp(16px,5vw,72px) 24px" }}>
          <div style={{ maxWidth: "1200px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "14px" }}>
            <h1 style={{ margin: "0", fontFamily: "var(--font-display)", fontWeight: "700", fontStretch: "88%", fontSize: "clamp(44px,7vw,104px)", lineHeight: "0.92", letterSpacing: "-0.02em" }}>How it works</h1>
            <p style={{ margin: "0", maxWidth: "680px", fontSize: "clamp(17px,1.5vw,20px)", lineHeight: "1.5", color: "var(--muted-foreground)" }}>Every photo gets a trust score from fixed rules, and every rule shows its reason. Change the facts about a photo below and watch the score follow.</p>
          </div>
        </section>

        <section id="sim" data-screen-label="Trust simulator" style={{ padding: "24px clamp(16px,5vw,72px) clamp(56px,9vh,96px)" }}>
          <div style={{ maxWidth: "1200px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "20px" }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center" }}>
              <span style={{ fontSize: "14px", color: "var(--muted-foreground)", marginRight: "4px" }}>Start from</span>
              {(
                [
                  ["witness", "Real witness photo"],
                  ["google", "Google image"],
                  ["reused", "Reused photo"],
                ] as const
              ).map(([k, label]) => {
                const on = preset === k;
                return (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={on}
                    onClick={() => {
                      setFacts({ ...scoring.presets[k] });
                      setPreset(k);
                    }}
                    style={{ whiteSpace: "nowrap", padding: "9px 14px", borderRadius: "9px", border: `1px solid ${on ? "var(--primary)" : "var(--border)"}`, background: on ? "var(--primary)" : "var(--card)", color: on ? "var(--card)" : "var(--foreground)", cursor: "pointer", fontSize: "14px", fontWeight: "500", transition: "background 160ms,border-color 160ms" }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "20px", alignItems: "flex-start" }}>
              <div style={{ flex: "1 1 420px", minWidth: "0", display: "flex", flexDirection: "column", gap: "14px", padding: "20px", borderRadius: "14px", background: "var(--card)", border: "1px solid var(--border)" }}>
                {GROUPS.map((g) => (
                  <div key={g.key} style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    <span style={{ fontSize: "13px", fontWeight: "600" }}>{g.label}</span>
                    <div role="radiogroup" aria-label={g.label} style={{ display: "flex", flexWrap: "wrap", gap: "4px", padding: "3px", borderRadius: "var(--radius)", background: "var(--background)" }}>
                      {g.options.map(([label, val]) => {
                        const on = facts[g.key] === val;
                        return (
                          <button key={label} type="button" role="radio" aria-checked={on} onClick={() => set({ [g.key]: val } as Partial<SimFacts>)} style={{ flex: "1 1 auto", padding: "8px 10px", borderRadius: "8px", border: "0", cursor: "pointer", fontSize: "13px", background: on ? "var(--card)" : "transparent", color: on ? "var(--foreground)" : "var(--muted-foreground)", boxShadow: on ? "0 1px 3px color-mix(in srgb, var(--foreground) 14%, transparent)" : "none", transition: "background 160ms,color 160ms" }}>
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ flex: "1 1 420px", minWidth: "0", display: "flex", flexDirection: "column", gap: "14px", position: "sticky", top: "76px" }}>
                <div aria-live="polite" style={{ display: "flex", flexDirection: "column", gap: "14px", padding: "20px", borderRadius: "14px", background: "var(--card)", border: "1px solid var(--border)" }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: "12px" }}>
                    <span id="tm-num" ref={num} style={{ fontFamily: "var(--font-display)", fontWeight: "700", fontSize: "clamp(64px,8vw,104px)", lineHeight: "0.9", color }}>
                      0
                    </span>
                    <span style={{ fontFamily: "var(--font-display)", fontWeight: "650", fontSize: "clamp(24px,2.6vw,34px)", color }}>{BAND_LABEL[r.band]}</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    <div style={{ position: "relative", height: "12px", borderRadius: "6px", background: "var(--secondary)", overflow: "hidden" }}>
                      <div style={{ position: "absolute", left: `${e1}%`, top: "0", bottom: "0", width: "1px", background: "var(--card)" }} />
                      <div style={{ position: "absolute", left: `${e2}%`, top: "0", bottom: "0", width: "1px", background: "var(--card)" }} />
                      <div id="tm-bar" ref={bar} style={{ position: "absolute", left: "0", top: "0", bottom: "0", width: "0%", borderRadius: "6px", background: color }} />
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: `${e1}fr ${e2 - e1}fr ${100 - e2}fr`, fontSize: "12px", color: "var(--muted-foreground)" }}>
                      <span>{scoring.labels[0]}</span>
                      <span>{scoring.labels[1]}</span>
                      <span style={{ textAlign: "right" }}>{scoring.labels[2]}</span>
                    </div>
                  </div>
                  {r.hard.length > 0 && (
                    <div role="alert" style={{ display: "flex", flexDirection: "column", gap: "4px", padding: "10px 12px", borderRadius: "var(--radius)", background: "var(--flagged-tint)", color: "var(--flagged-ink)", fontSize: "14px" }}>
                      <span style={{ fontWeight: "600" }}>Flagged regardless of score</span>
                      {r.hard.map((h) => (
                        <span key={h}>{h}</span>
                      ))}
                    </div>
                  )}
                  <div style={{ display: "flex", flexDirection: "column", fontSize: "14px" }}>
                    {r.rows.map((row) => (
                      <div key={row.label} style={{ display: "flex", justifyContent: "space-between", gap: "16px", padding: "9px 0", borderTop: "1px solid var(--secondary)" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: "2px", minWidth: "0" }}>
                          <span style={{ fontWeight: "500" }}>{row.label}</span>
                          <span style={{ fontSize: "13px", color: TONE_NOTE[row.tone] }}>{row.note}</span>
                        </div>
                        <span style={{ flexShrink: "0", fontWeight: "600", color: TONE_PTS[row.tone] }}>{`${row.pts} of ${row.max}`}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <p style={{ margin: "0", fontSize: "13px", lineHeight: "1.5", color: "var(--muted-foreground)" }}>{data.ruleNote}</p>
              </div>
            </div>
          </div>
        </section>

        <section id="measure" data-screen-label="Measurement" style={{ background: "var(--card)", borderTop: "1px solid var(--border)", padding: "clamp(56px,9vh,96px) clamp(16px,5vw,72px)" }}>
          <div style={{ maxWidth: "1200px", margin: "0 auto", display: "flex", flexWrap: "wrap", gap: "clamp(24px,4vw,56px)", alignItems: "flex-start" }}>
            <div style={{ flex: "1 1 320px", maxWidth: "440px", display: "flex", flexDirection: "column", gap: "14px" }}>
              <h2 style={{ margin: "0", fontFamily: "var(--font-display)", fontWeight: "700", fontStretch: "92%", fontSize: "clamp(34px,4.2vw,60px)", lineHeight: "0.95", letterSpacing: "-0.02em" }}>How a percentage is measured</h2>
              <p style={{ margin: "0", fontSize: "16px", lineHeight: "1.55", color: "var(--muted-foreground)" }}>The measurement stage scores every pixel for how likely it is to be litter. A threshold turns those scores into a mask, and the number is the share of the photo inside the mask.</p>
              <p style={{ margin: "0", fontSize: "16px", lineHeight: "1.55", color: "var(--muted-foreground)" }}>Move the threshold and the number moves too. That&apos;s why the threshold is fixed for each model version and printed next to every measurement. Nobody can tune it for a better report.</p>
              <label style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "14px", borderRadius: "12px", background: "var(--background)" }}>
                <span style={{ display: "flex", justifyContent: "space-between", fontSize: "14px" }}>
                  <span style={{ fontWeight: "600" }}>Threshold</span>
                  <span style={{ fontFamily: "var(--font-mono)" }}>{thrText}</span>
                </span>
                <input type="range" min="10" max="90" value={thr} onChange={(e) => setThr(+e.target.value)} aria-label="Mask threshold" style={{ accentColor: "var(--measured)" }} />
                <span style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: "var(--muted-foreground)" }}>
                  <span>Looser, more pixels count</span>
                  <span>Stricter</span>
                </span>
              </label>
              <button type="button" onClick={() => setThr(fixed)} style={{ alignSelf: "flex-start", padding: "9px 14px", borderRadius: "9px", border: "1px solid var(--border)", background: "var(--card)", cursor: "pointer", fontSize: "14px" }}>
                {`Back to the fixed threshold, ${(fixed / 100).toFixed(2)}`}
              </button>
            </div>
            <figure style={{ margin: "0", flex: "1 1 440px", minWidth: "0", display: "flex", flexDirection: "column", gap: "10px" }}>
              <div style={{ position: "relative", borderRadius: "12px", overflow: "hidden", background: "var(--border)", aspectRatio: "1024/685" }}>
                <canvas id="m-canvas" ref={canvas} role="img" aria-label={`Photo with the pixels above the threshold tinted: ${cover === null ? "loading" : `${(cover * 100).toFixed(1)}%`}`} style={{ position: "absolute", inset: "0", width: "100%", height: "100%" }} />
                <div style={{ position: "absolute", left: "12px", top: "12px", display: "flex", flexDirection: "column", gap: "2px", padding: "10px 12px", borderRadius: "var(--radius)", background: "color-mix(in srgb, var(--card) 94%, transparent)" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ padding: "1px 7px", borderRadius: "5px", background: "var(--measured)", color: "var(--card)", fontSize: "12px", fontWeight: "600" }}>{data.photo?.badge ?? "Measured"}</span>
                    <span style={{ fontSize: "12px", color: "var(--muted-foreground)" }}>{`threshold ${thrText}`}</span>
                  </span>
                  <span style={{ fontFamily: "var(--font-display)", fontWeight: "700", fontSize: "44px", lineHeight: "1", color: "var(--measured)" }}>{cover === null ? "…" : `${(cover * 100).toFixed(1)}%`}</span>
                  <span style={{ fontSize: "12px", color: "var(--muted-foreground)" }}>{`of the photo covered by ${data.photo?.metric ?? "litter"}`}</span>
                </div>
              </div>
              <figcaption style={{ fontSize: "13px", lineHeight: "1.45", color: "var(--muted-foreground)" }}>{data.photo?.credit ?? "No demo photo yet."}</figcaption>
            </figure>
          </div>
        </section>

        <section id="pipeline" className="night" data-screen-label="Pipeline" style={{ background: "var(--background)", color: "var(--foreground)", padding: "clamp(56px,9vh,96px) clamp(16px,5vw,72px)" }}>
          <div style={{ maxWidth: "1200px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "28px" }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "12px 40px", justifyContent: "space-between", alignItems: "flex-end" }}>
              <h2 style={{ margin: "0", fontFamily: "var(--font-display)", fontWeight: "700", fontStretch: "92%", fontSize: "clamp(34px,4.2vw,60px)", lineHeight: "0.95", letterSpacing: "-0.02em" }}>The Cloudinary pipeline</h2>
              <p style={{ margin: "0", maxWidth: "420px", fontSize: "15px", lineHeight: "1.5", color: "var(--muted-foreground)" }}>Five stages run on every photo, in order. Each one writes facts; none of them writes the score.</p>
            </div>
            <ol style={{ margin: "0", padding: "0", listStyle: "none", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: "10px" }}>
              {data.stages.map((s) => (
                <li key={s.n} style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "16px", borderRadius: "12px", background: "var(--card)", border: "1px solid var(--border)" }}>
                  <span style={{ fontSize: "12px", color: "var(--muted-foreground)" }}>{`Stage ${s.n}`}</span>
                  <span style={{ fontFamily: "var(--font-display)", fontWeight: "650", fontSize: "21px" }}>{s.name}</span>
                  <span style={{ fontSize: "13px", lineHeight: "1.45", color: "var(--muted-foreground)" }}>{s.what}</span>
                  <code style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--code-ink)", wordBreak: "break-all" }}>{s.code}</code>
                  <span style={{ fontSize: "12px", color: "var(--foreground)" }}>{`Writes: ${s.writes}`}</span>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="night" data-screen-label="The rule" style={{ background: "var(--background)", color: "var(--foreground)", padding: "0 clamp(16px,5vw,72px) clamp(64px,10vh,120px)" }}>
          <div style={{ maxWidth: "1200px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "28px", paddingTop: "clamp(40px,6vh,72px)", borderTop: "1px solid var(--border)" }}>
            <h2 style={{ margin: "0", fontFamily: "var(--font-display)", fontWeight: "700", fontStretch: "86%", fontSize: "clamp(44px,7vw,112px)", lineHeight: "0.9", letterSpacing: "-0.025em", textWrap: "balance" }}>The model never writes a number.</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: "12px" }}>
              {[
                ["1", "The model draws", "A mask of litter pixels, and boxes around things it recognises. Pictures, not figures."],
                ["2", "Code counts", "Plain code counts mask pixels and divides by the photo's pixels. Same input, same number, every time."],
                ["3", "The report shows its work", "Every number keeps its mask and its thread to the photos. Item counts from boxes are labelled AI-estimated, with confidence."],
              ].map(([n, t, d]) => (
                <div key={n} style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "18px", borderRadius: "12px", background: "var(--card)", border: "1px solid var(--border)" }}>
                  <span style={{ fontSize: "12px", color: "var(--muted-foreground)" }}>{n}</span>
                  <span style={{ fontFamily: "var(--font-display)", fontWeight: "650", fontSize: "24px" }}>{t}</span>
                  <span style={{ fontSize: "14px", lineHeight: "1.5", color: "var(--muted-foreground)" }}>{d}</span>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", fontSize: "13px" }}>
              <span style={{ display: "flex", alignItems: "center", gap: "8px", padding: "6px 10px", borderRadius: "8px", background: "var(--card)", border: "1px solid var(--border)" }}>
                <span style={{ padding: "1px 7px", borderRadius: "5px", background: "var(--l-measured)", color: "var(--l-card)", fontWeight: "600" }}>Measured</span>
                counted from pixels by code
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: "8px", padding: "6px 10px", borderRadius: "8px", background: "var(--card)", border: "1px solid var(--border)" }}>
                <span style={{ padding: "1px 7px", borderRadius: "5px", background: "var(--l-estimated)", color: "var(--l-card)", fontWeight: "600" }}>AI-estimated</span>
                from model boxes, always with confidence
              </span>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
