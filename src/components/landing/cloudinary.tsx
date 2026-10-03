"use client";

/* eslint-disable @next/next/no-img-element -- signed Cloudinary URLs */
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { Glyph } from "@/components/glyph";
import type { LandingData } from "@/lib/landing/types";

/**
 * Chapter 10 (L:1032-1066): the pipeline as five stages. Scrolling walks through them (pinned,
 * reversible: landing-dom reports the stage, the rail fills with the scroll); a stage can also be
 * picked directly. Each stage shows what it does, its call with every parameter labelled in plain
 * words (lib/landing/params.ts), and its picture, large. Reduced motion: a still chapter with tabs.
 */
export function CloudinaryChapter({ data }: { data: LandingData }) {
  const nodes = data.nodes;
  const reduce = useReducedMotion();
  const [ni, setNi] = useState(0);
  const [scrollMode, setScrollMode] = useState(false);
  useEffect(() => {
    const on = (e: Event) => {
      setScrollMode(true);
      setNi((e as CustomEvent<number>).detail);
    };
    window.addEventListener("saakshi:c10", on);
    return () => window.removeEventListener("saakshi:c10", on);
  }, []);
  const node = nodes[ni];
  if (!node) return null;
  const n = nodes.length;
  const pick = (i: number) => {
    setNi(i);
    const sec = document.getElementById("ch10");
    if (!scrollMode || !sec) return;
    const top = sec.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({ top: top + ((i + 0.5) / n) * Math.max(0, sec.offsetHeight - window.innerHeight), behavior: reduce ? "auto" : "smooth" });
  };
  return (
    <section id="ch10" className="night" data-pin="" data-night="" data-screen-label="10 Built on Cloudinary" style={{ position: "relative", zIndex: "2", height: `${Math.max(2, n) * 70 + 60}vh`, background: "var(--background)", color: "var(--foreground)" }}>
      <div id="ch10-sticky" data-dust="" style={{ position: "sticky", top: "0", height: "100vh", overflow: "hidden", backgroundColor: "var(--background)" }}>
        <div aria-hidden="true" style={{ position: "absolute", right: "-10%", top: "10%", width: "60vw", height: "70vh", background: "radial-gradient(closest-side, color-mix(in srgb, var(--primary) 18%, transparent), transparent)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", inset: "0", padding: "clamp(80px,11vh,116px) clamp(20px,5vw,72px) clamp(14px,2.5vh,28px)", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: "clamp(12px,2.2vh,24px)" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 40px", alignItems: "flex-end", justifyContent: "space-between" }}>
            <h2 style={{ margin: "0", fontFamily: "var(--font-display)", fontWeight: "700", fontStretch: "92%", fontSize: "clamp(32px,4.4vw,68px)", lineHeight: "0.95", letterSpacing: "-0.02em" }}>Built on Cloudinary.</h2>
            <p style={{ margin: "0", maxWidth: "460px", fontSize: "clamp(14px,1.2vw,16px)", lineHeight: "1.5", color: "var(--muted-foreground)" }}>{`The thread is a pipeline. Every photo passes ${n === 5 ? "five" : n} stages, each one a Cloudinary feature. Scroll through them, or pick one.`}</p>
          </div>
          <div role="tablist" aria-label="Pipeline stages" style={{ position: "relative", display: "grid", gridTemplateColumns: `repeat(${n}, minmax(0,1fr))`, gap: "8px" }}>
            <div aria-hidden="true" style={{ position: "absolute", left: "0", right: "0", top: "50%", height: "3px", borderRadius: "2px", background: "var(--border)" }}>
              <div id="c10-fill" style={{ position: "absolute", inset: "0", borderRadius: "2px", background: "var(--primary)", boxShadow: "0 0 16px color-mix(in srgb, var(--primary) 70%, transparent)", transformOrigin: "0 50%", transform: `scaleX(${n > 1 ? ni / (n - 1) : 1})` }} />
            </div>
            {nodes.map((s, i) => {
              const on = i === ni;
              const past = i < ni;
              return (
                <button key={s.name} type="button" role="tab" aria-selected={on} aria-controls="c10-panel" className="focus-ring" onClick={() => pick(i)} style={{ position: "relative", display: "flex", flexDirection: "column", gap: "3px", alignItems: "flex-start", textAlign: "left", padding: "10px 12px", borderRadius: "12px", cursor: "pointer", background: on ? "var(--primary)" : past ? "color-mix(in srgb, var(--primary) 18%, var(--card))" : "var(--card)", border: `1px solid ${on ? "var(--primary)" : past ? "color-mix(in srgb, var(--primary) 50%, var(--border))" : "var(--border)"}`, color: on ? "var(--primary-foreground)" : "var(--foreground)", boxShadow: on ? "0 10px 30px color-mix(in srgb, var(--primary) 40%, transparent)" : "none", transition: "background var(--dur-ui), border-color var(--dur-ui), color var(--dur-ui)" }}>
                  <span style={{ fontSize: "11px", fontWeight: "600", opacity: on ? 0.85 : 0.7 }}>{past ? `Stage ${i + 1} ✓` : `Stage ${i + 1}`}</span>
                  <span className="c10-name" style={{ fontFamily: "var(--font-display)", fontWeight: "650", fontSize: "clamp(14px,1.4vw,19px)", lineHeight: "1.05" }}>{s.name}</span>
                </button>
              );
            })}
          </div>
          <div id="c10-panel" role="tabpanel" aria-label={node.name} style={{ position: "relative", flex: "1", minHeight: "0" }}>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={ni} className="c10-layout" initial={reduce ? false : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={reduce ? undefined : { opacity: 0, y: -10 }} transition={{ duration: reduce ? 0 : 0.24, ease: [0.2, 0.8, 0.2, 1] }} style={{ maxHeight: "100%", overflow: "hidden", padding: "clamp(14px,2vw,22px)", borderRadius: "16px", boxSizing: "border-box", background: "color-mix(in srgb, var(--card) 92%, transparent)", border: "1px solid var(--border)" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "10px", minWidth: "0", minHeight: "0" }}>
                  <span style={{ fontFamily: "var(--font-display)", fontWeight: "700", fontSize: "clamp(22px,2.2vw,30px)", lineHeight: "1.05" }}>{node.name}</span>
                  <span style={{ fontSize: "clamp(14px,1.2vw,16px)", lineHeight: "1.5", color: "var(--foreground)", opacity: 0.86 }}>{node.what}</span>
                  {node.params?.length ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px", padding: "10px", borderRadius: "10px", background: "var(--background)", border: "1px solid var(--border)", minHeight: "0", overflow: "auto" }}>
                      {node.lead && <code style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--muted-foreground)" }}>{node.lead}</code>}
                      {node.params.map((p) => (
                        <div key={p.code} className="c10-param" style={{ display: "grid", gridTemplateColumns: "minmax(0,1.1fr) minmax(0,1fr)", gap: "4px 14px", alignItems: "center" }}>
                          <code style={{ alignSelf: "start", fontFamily: "var(--font-mono)", fontSize: "12.5px", lineHeight: "1.4", padding: "4px 8px", borderRadius: "6px", background: "color-mix(in srgb, var(--primary) 16%, transparent)", borderLeft: "3px solid var(--primary)", color: "var(--code-ink)", wordBreak: "break-all" }}>{p.code}</code>
                          <span style={{ fontSize: "13px", lineHeight: "1.4", color: "var(--foreground)" }}>{p.label}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <code style={{ display: "block", padding: "12px", borderRadius: "8px", background: "var(--background)", border: "1px solid var(--border)", fontFamily: "var(--font-mono)", fontSize: "13px", lineHeight: "1.5", color: "var(--code-ink)", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>{node.code}</code>
                  )}
                </div>
                <figure style={{ margin: "0", display: "flex", flexDirection: "column", gap: "8px", minWidth: "0", minHeight: "0" }}>
                  <div style={{ position: "relative", width: "100%", aspectRatio: "4/3", maxHeight: "min(46vh,440px)", borderRadius: "12px", overflow: "hidden", background: "var(--background)", border: "1px solid var(--border)", boxShadow: "0 20px 60px color-mix(in srgb, var(--ink-black) 45%, transparent)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {node.preview?.kind === "image" && <img loading="lazy" src={node.preview.src} alt={node.alt} style={{ position: "absolute", inset: "0", width: "100%", height: "100%", objectFit: node.preview.fit }} />}
                    {node.preview?.kind === "mask" && (
                      <>
                        <img loading="lazy" src={node.preview.src} alt={node.alt} style={{ position: "absolute", inset: "0", width: "100%", height: "100%", objectFit: "cover" }} />
                        <div aria-hidden="true" style={{ position: "absolute", inset: "0", background: "var(--mask-tint)", opacity: 0.72, WebkitMaskImage: `url("${node.preview.mask}")`, maskImage: `url("${node.preview.mask}")`, WebkitMaskSize: "100% 100%", maskSize: "100% 100%", maskMode: "luminance" } as React.CSSProperties} />
                      </>
                    )}
                    {node.preview?.kind === "glyph" && <Glyph bits={node.preview.bits} variant={node.preview.variant} label={node.alt} style={{ width: "70%", height: "70%" }} />}
                  </div>
                  <figcaption style={{ fontSize: "13px", color: "var(--muted-foreground)" }}>{node.caption}</figcaption>
                </figure>
              </motion.div>
            </AnimatePresence>
          </div>
          <p style={{ margin: "0", fontSize: "12px", color: "var(--muted-foreground)" }}>{data.copy.nodesNote}</p>
        </div>
      </div>
    </section>
  );
}
