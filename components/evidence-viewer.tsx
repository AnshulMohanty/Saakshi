"use client";

/* eslint-disable @next/next/no-img-element -- signed Cloudinary URLs and canvas art */
import { gsap } from "gsap";
import { useEffect, useRef, useState } from "react";
import { drawLayers, loadImage, type LayerInput } from "@/lib/scenes/layers";

/**
 * EvidenceViewer (Developer Handoff: collapsed, exploded, single layer): the photo and its four
 * evidence layers (lib/scenes/layers.ts art) as a CSS 3D stack (evidence page EV:372-391,
 * place() EV:496-506). Tap to take it apart; pick a layer to see it alone on the photo.
 */
export interface ViewerLayer {
  name: string;
  color: string;
  detail: string;
}

export interface EvidenceViewerProps {
  photo: { src: string; alt: string };
  layer: LayerInput;
  mask: string | null;
  layers: ViewerLayer[];
}

export function EvidenceViewer({ photo, layer, mask, layers }: EvidenceViewerProps) {
  const [exploded, setExploded] = useState(false);
  const [pick, setPick] = useState(0);
  const stack = useRef<HTMLDivElement>(null);
  const spin = useRef<HTMLDivElement>(null);
  const imgs = useRef<Array<HTMLImageElement | null>>([]);
  const first = useRef(true);

  // Layer art, drawn once from our data.
  useEffect(() => {
    let live = true;
    void loadImage(mask).then((m) =>
      drawLayers(layer, m).then((arts) => {
        if (!live) return;
        arts.forEach((c, i) => {
          const el = imgs.current[i + 1];
          if (el) el.src = c.toDataURL("image/png");
        });
      }),
    );
    return () => {
      live = false;
    };
  }, [layer, mask]);

  // place(): instant on mount, then 0.8 s expo.out (EV:496-506).
  useEffect(() => {
    if (!stack.current || !spin.current) return;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const d = first.current || reduced ? 0 : 0.8;
    first.current = false;
    const ease = "expo.out";
    const ex = exploded;
    const tweens = [
      gsap.to(stack.current, { rotateX: ex ? 56 : 0, y: ex ? "12%" : "0%", scale: ex ? 0.92 : 1.28, duration: d, ease }),
      gsap.to(spin.current, { rotateZ: ex ? -34 : 0, duration: d, ease }),
      ...imgs.current.map((el, i) => (el ? gsap.to(el, { z: ex ? i * 46 : 0, opacity: pick && !ex ? (i === 0 || i === pick ? 1 : 0) : ex ? 1 : i === 0 ? 1 : 0, duration: d, ease }) : null)),
    ];
    return () => tweens.forEach((t) => t?.kill());
  }, [exploded, pick]);

  const current = layers[pick];
  return (
    <section aria-label="Evidence layers" style={{ flex: "1 1 440px", minWidth: "0", display: "flex", flexDirection: "column", gap: "10px" }}>
      <button
        type="button"
        onClick={() => setExploded((e) => !e)}
        aria-pressed={exploded}
        aria-label={exploded ? "Collapse the evidence layers" : "Explode the photo into its evidence layers"}
        className="focus-ring"
        style={{ all: "unset", cursor: "pointer", position: "relative", display: "block", width: "100%", aspectRatio: "4/3", borderRadius: "14px", background: "var(--secondary)", perspective: "1400px", overflow: "hidden" }}
      >
        <div ref={stack} style={{ position: "absolute", left: "14%", top: "14%", width: "72%", aspectRatio: "4/3", transformStyle: "preserve-3d" }}>
          <div ref={spin} style={{ position: "absolute", inset: "0", transformStyle: "preserve-3d" }}>
            {[0, 1, 2, 3, 4].map((i) => (
              <img
                key={i}
                ref={(el) => {
                  imgs.current[i] = el;
                }}
                data-ev={i}
                fetchPriority={i === 0 ? "high" : "auto"}
                src={i === 0 ? photo.src : undefined}
                alt={i === 0 ? photo.alt : ""}
                style={{ position: "absolute", inset: "0", width: "100%", height: "100%", ...(i === 0 ? { borderRadius: "4px" } : { opacity: "0" }) }}
              />
            ))}
          </div>
        </div>
        <span style={{ position: "absolute", left: "12px", bottom: "12px", padding: "6px 10px", borderRadius: "8px", background: "color-mix(in srgb, var(--foreground) 82%, transparent)", color: "var(--card)", fontSize: "13px" }}>{exploded ? "Tap to put it back together" : "Tap to take it apart"}</span>
      </button>
      <div role="radiogroup" aria-label="Evidence layer" style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
        {layers.map((l, i) => (
          <button key={l.name} type="button" role="radio" aria-checked={i === pick} onClick={() => setPick(i)} style={{ display: "flex", alignItems: "center", gap: "6px", padding: "6px 10px", borderRadius: "8px", border: `1px solid ${i === pick ? "var(--primary)" : "var(--border)"}`, background: i === pick ? "var(--card)" : "transparent", cursor: "pointer", fontSize: "13px", color: "var(--foreground)" }}>
            <span style={{ width: "8px", height: "8px", borderRadius: "2px", background: l.color }} />
            {l.name}
          </button>
        ))}
      </div>
      <div aria-live="polite" style={{ padding: "12px 14px", borderRadius: "var(--radius)", background: "var(--card)", border: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: "4px", minHeight: "58px" }}>
        <span style={{ fontWeight: "600", fontSize: "14px" }}>{current?.name}</span>
        <span style={{ fontSize: "13px", lineHeight: "1.45", color: "var(--muted-foreground)" }}>{current?.detail}</span>
      </div>
    </section>
  );
}
