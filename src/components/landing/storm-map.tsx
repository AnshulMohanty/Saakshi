"use client";

/* eslint-disable @next/next/no-img-element -- signed, face-blurred thumbnails */
import { useEffect, useState } from "react";
import { IndiaMap, type Projector } from "@/components/map/india-map";
import { cellId, gridBlocks, heroKeyOf, INDIA_MID_LNG, stormSlots, type GridBlock } from "@/lib/landing/storm-slots";
import type { LandingData } from "@/lib/landing/types";
import { STORM } from "@/lib/motion/scenes/landing";

/** A grid's label: at least the grid's width (wide enough for "River clean-up, Coimbatore" on a desktop). */
const labelWidth = (b: GridBlock) => Math.max(b.w, Math.min(210, b.w * 2.2, 130 + b.w));
/** Relative to the grid, the label hangs toward its outer side but never leaves the map box. */
const labelLeft = (b: GridBlock, W: number) => {
  const lw = labelWidth(b);
  const want = b.side < 0 ? b.w - lw : 0;
  return Math.max(4 - b.left, Math.min(W - 4 - b.left - lw, want));
};

/**
 * Chapter 2's map: the shared India map with each project's photos as a grid attached to its real
 * site (pin at the project's centre, grid beside it, label with name, count and years). In the
 * scroll story it is a fixed layer under the WebGL canvas: the storm's tiles fly into these cells
 * (lib/scenes/landing-stage.ts reads them with [data-cell] / [data-site]) and the grid takes over.
 * `still` is the static version (reduced motion, low power): grids shown, nothing moves.
 */
export function StormMap({ data, still = false, enabled = true, settled = false }: { data: LandingData; still?: boolean; enabled?: boolean; settled?: boolean }) {
  const { slots } = stormSlots(data.storm, data.projects);
  const heroKey = heroKeyOf(data.projects);
  const byProject = new Map<string, Array<{ slot: number; src: string; alt: string }>>();
  for (const p of data.projects) byProject.set(p.key, []);
  if (data.hero) byProject.get(heroKey)?.push({ slot: 0, src: data.hero.src, alt: data.hero.alt });
  data.storm.forEach((t, i) => byProject.get(slots[i].k)?.push({ slot: slots[i].slot, src: t.src, alt: "" }));

  const grids = (p: Projector) => {
    const cs = Math.round(Math.max(STORM.grid.minPx, Math.min(STORM.grid.maxPx, p.W * STORM.grid.cellOfWidth)));
    const blocks = gridBlocks(
      data.projects.map((pr) => ({ key: pr.key, x: p.x(pr.lng), y: p.y(pr.lat), n: (byProject.get(pr.key) ?? []).length })),
      { cs, gap: STORM.grid.gapPx, cols: STORM.grid.cols, midX: p.x(INDIA_MID_LNG), labelH: 40, W: p.W, H: p.H },
    );
    return (
      <div id="c2-grids" style={{ position: "absolute", inset: "0", opacity: still ? 1 : 0, pointerEvents: "none" }}>
        <svg aria-hidden="true" style={{ position: "absolute", inset: "0", width: "100%", height: "100%", overflow: "visible" }}>
          {blocks.map((b) => (
            <line key={b.key} x1={b.pin.x} y1={b.pin.y} x2={b.side < 0 ? b.left + b.w : b.left} y2={Math.max(b.top + 8, Math.min(b.top + b.h - 8, b.pin.y))} strokeWidth="1.5" strokeDasharray="3 3" style={{ stroke: "color-mix(in srgb, var(--n-verified) 70%, transparent)" }} />
          ))}
        </svg>
        {blocks.map((b) => {
          const pr = data.projects.find((x) => x.key === b.key)!;
          const cells = byProject.get(pr.key) ?? [];
          return (
            <div key={pr.key} style={{ position: "absolute", left: `${b.left}px`, top: `${b.top}px`, width: `${b.w}px` }}>
              <div style={{ position: "absolute", bottom: `${b.h + 6}px`, left: `${labelLeft(b, p.W)}px`, width: `${labelWidth(b)}px`, boxSizing: "border-box", display: "flex", flexDirection: "column", gap: "1px", padding: "4px 9px", borderRadius: "8px", background: "color-mix(in srgb, var(--n-background) 84%, transparent)", border: "1px solid var(--n-border)", color: "var(--n-foreground)", textAlign: b.side < 0 ? "right" : "left", lineHeight: "1.25" }}>
                <span style={{ fontWeight: "600", fontSize: "13px" }}>{pr.city ? `${pr.name}, ${pr.city}` : pr.name}</span>
                <span style={{ fontSize: "12px", color: "var(--n-muted-foreground)" }}>{`${cells.length} photos${pr.range ? `, ${pr.range}` : ""}`}</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: `repeat(${b.cols}, ${cs}px)`, gap: `${STORM.grid.gapPx}px` }}>
                {cells.map((c) => (
                  <img key={c.slot} data-cell={cellId(pr.key, c.slot)} src={c.src} alt={c.alt} loading="lazy" decoding="async" style={{ width: `${cs}px`, height: `${cs}px`, objectFit: "cover", borderRadius: "3px", display: "block", outline: "1px solid color-mix(in srgb, var(--n-foreground) 18%, transparent)", boxShadow: "0 4px 10px color-mix(in srgb, var(--ink-black) 40%, transparent)" }} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <IndiaMap
      theme="night"
      variant="stage"
      still={still || !settled}
      enabled={enabled}
      pointerFromWindow
      ariaLabel={`Map of India with the demo projects at their sites: ${data.projects.map((p) => (p.city ? `${p.name}, ${p.city}, ${p.count} photos` : p.name)).join("; ")}.`}
      sites={data.projects.map((p) => ({ key: p.key, lat: p.lat, lng: p.lng, tone: "verified" as const, weight: Math.max(1, p.count / 8) }))}
      overlay={grids}
      style={{ position: "absolute", inset: "0" }}
    />
  );
}

/** Loads the map when chapter 2 comes within a screen of the viewport, and settles once its photos have landed. */
export function useStormMapGate(): { enabled: boolean; settled: boolean } {
  const [state, setState] = useState({ enabled: false, settled: false });
  useEffect(() => {
    const ch2 = document.getElementById("ch2");
    if (!ch2) return;
    const io = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && setState((s) => (s.enabled ? s : { ...s, enabled: true })), { rootMargin: "100% 0px" });
    io.observe(ch2);
    const onSettle = (e: Event) => setState((s) => ({ ...s, settled: (e as CustomEvent<boolean>).detail }));
    window.addEventListener("saakshi:c2-settled", onSettle);
    return () => {
      io.disconnect();
      window.removeEventListener("saakshi:c2-settled", onSettle);
    };
  }, []);
  return state;
}
