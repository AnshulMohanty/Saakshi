"use client";

/* eslint-disable @next/next/no-img-element -- signed Cloudinary URLs */
import { useState } from "react";
import { Glyph } from "@/components/glyph";
import type { LandingData } from "@/lib/landing/types";

/**
 * Chapter 10 (L:1032-1066): the pipeline as five stages on a glowing thread; hover, focus or
 * tap one to see what it does and the call we really make (B5.5: from docs/external-apis.md).
 */
export function CloudinaryChapter({ data }: { data: LandingData }) {
  const [ni, setNi] = useState(0);
  const nodes = data.nodes;
  const node = nodes[ni];
  if (!node) return null;
  return (
    <section id="ch10" className="night" data-night="" data-screen-label="10 Built on Cloudinary" style={{ position: "relative", zIndex: "2", background: "var(--card)", color: "var(--foreground)", padding: "clamp(80px,14vh,140px) clamp(20px,5vw,72px)" }}>
      <div style={{ maxWidth: "1200px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "clamp(28px,5vh,56px)" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "12px 40px", alignItems: "flex-end", justifyContent: "space-between" }}>
          <h2 style={{ margin: "0", fontFamily: "var(--font-display)", fontWeight: "700", fontStretch: "92%", fontSize: "clamp(34px,4.4vw,68px)", lineHeight: "0.95", letterSpacing: "-0.02em" }}>Built on Cloudinary.</h2>
          <p style={{ margin: "0", maxWidth: "420px", fontSize: "15px", lineHeight: "1.5", color: "var(--muted-foreground)" }}>
            {`The thread is a pipeline. Every photo passes ${nodes.length === 5 ? "five" : nodes.length} stages, each one a Cloudinary feature. Hover or tab through them.`}
          </p>
        </div>
        <div role="tablist" aria-label="Pipeline stages" style={{ position: "relative", display: "flex", flexWrap: "wrap", gap: "10px" }}>
          <div aria-hidden="true" style={{ position: "absolute", left: "0", right: "0", top: "50%", height: "2px", background: "var(--primary)", boxShadow: "0 0 16px color-mix(in srgb, var(--primary) 70%, transparent)", opacity: "0.55" }} />
          {nodes.map((n, i) => {
            const on = i === ni;
            const pick = () => i !== ni && setNi(i);
            return (
              <button key={n.name} type="button" role="tab" aria-selected={on} aria-controls="c10-panel" onMouseEnter={pick} onFocus={pick} onClick={pick} style={{ position: "relative", flex: "1 1 150px", display: "flex", flexDirection: "column", gap: "6px", alignItems: "flex-start", textAlign: "left", padding: "14px", borderRadius: "12px", cursor: "pointer", background: on ? "var(--night-node-active)" : "var(--card)", border: `1px solid ${on ? "var(--primary)" : "var(--border)"}`, color: "var(--foreground)", transition: "background 160ms,border-color 160ms" }}>
                <span style={{ fontSize: "12px", color: "var(--muted-foreground)" }}>{`Stage ${i + 1}`}</span>
                <span style={{ fontFamily: "var(--font-display)", fontWeight: "650", fontSize: "20px", lineHeight: "1.05" }}>{n.name}</span>
              </button>
            );
          })}
        </div>
        <div id="c10-panel" role="tabpanel" style={{ display: "flex", flexWrap: "wrap", gap: "20px", padding: "20px", borderRadius: "12px", background: "var(--card)", border: "1px solid var(--border)" }}>
          <div style={{ flex: "1 1 300px", display: "flex", flexDirection: "column", gap: "10px", minWidth: "0" }}>
            <span style={{ fontFamily: "var(--font-display)", fontWeight: "650", fontSize: "26px" }}>{node.name}</span>
            <span style={{ fontSize: "15px", lineHeight: "1.5", color: "var(--muted-foreground)" }}>{node.what}</span>
            <code style={{ display: "block", padding: "12px", borderRadius: "8px", background: "var(--background)", border: "1px solid var(--border)", fontFamily: "var(--font-mono)", fontSize: "13px", lineHeight: "1.5", color: "var(--code-ink)", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>{node.code}</code>
          </div>
          <div style={{ flex: "0 0 auto", display: "flex", flexDirection: "column", gap: "6px", alignItems: "center" }}>
            <div style={{ position: "relative", width: "200px", height: "150px", borderRadius: "8px", overflow: "hidden", background: "var(--background)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {node.preview?.kind === "image" && <img src={node.preview.src} alt={node.alt} style={{ position: "absolute", inset: "0", width: "100%", height: "100%", objectFit: node.preview.fit }} />}
              {node.preview?.kind === "glyph" && <Glyph bits={node.preview.bits} variant={node.preview.variant} label={node.alt} style={{ position: "absolute", inset: "0", width: "100%", height: "100%" }} />}
            </div>
            <span style={{ fontSize: "12px", color: "var(--muted-foreground)" }}>{node.caption}</span>
          </div>
        </div>
        <p style={{ margin: "0", fontSize: "12px", color: "var(--muted-foreground)" }}>{data.copy.nodesNote}</p>
      </div>
    </section>
  );
}
