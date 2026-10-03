"use client";

/**
 * The one India map (landing chapters 2 and 9, the library): the official outline of India
 * (lib/map/india.ts, public/geo/india.json) in the dotted style, drawn once per size and view on
 * a canvas. Depth is a few extrusion layers under the dots; the plane rests tilted and follows the
 * pointer and the scroll gently (CSS transforms on a requestAnimationFrame, never layout).
 * Sites glow and pulse; pins and overlays sit on the same plane at their true coordinates.
 * Interactive mode adds zoom (buttons, ⌘/Ctrl + wheel, double-click, pinch, + and −), drag to pan
 * and the arrow keys. Reduced motion: no tilt, no pulse, no fly-to: a still map.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { dotsInside, fitView, gridStep, INDIA_BOUNDS, labelSides, panView, unfit, visibleBounds, zoomView, type Bounds, type IndiaMapData, type View } from "@/lib/map/india";
import { INDIA_MAP_COLORS, INDIA_MAP_MOTION as M, type MapTheme } from "@/lib/motion/scenes/india-map";

export type { View };

let dataPromise: Promise<IndiaMapData> | null = null;
// Fine grids (zoomed in) for a window around the view, snapped so small pans reuse them.
const fineCache = new Map<string, Array<[number, number]>>();
function fineDots(data: IndiaMapData, step: number, vb: Bounds): Array<[number, number]> {
  const S = Math.max(vb.lng1 - vb.lng0, vb.lat1 - vb.lat0);
  const snap = (v: number, up: boolean) => (up ? Math.ceil(v / S) + 1 : Math.floor(v / S) - 1) * S;
  const win: Bounds = { lng0: snap(vb.lng0, false), lng1: snap(vb.lng1, true), lat0: snap(vb.lat0, false), lat1: snap(vb.lat1, true) };
  const key = `${step}:${win.lng0}:${win.lat0}:${win.lng1}:${win.lat1}`;
  let d = fineCache.get(key);
  if (!d) {
    d = dotsInside(data.outline, step, win, false);
    if (fineCache.size > 8) fineCache.delete(fineCache.keys().next().value!);
    fineCache.set(key, d);
  }
  return d;
}
/** The map file, fetched once per page (it is static and cached by the browser). */
export function loadIndiaMap(): Promise<IndiaMapData> {
  dataPromise ??= fetch("/geo/india.json").then((r) => {
    if (!r.ok) throw new Error(`india.json ${r.status}`);
    return r.json() as Promise<IndiaMapData>;
  });
  return dataPromise;
}

export interface MapSite {
  key: string;
  lat: number;
  lng: number;
  /** Shown next to the pin. */
  label?: string;
  sub?: string;
  /** Hover / focus tooltip lines. */
  tip?: string[];
  tone?: "verified" | "review" | "flagged" | "primary";
  /** Glow radius multiplier (photo count, say). */
  weight?: number;
}

export interface MapPin {
  id: string;
  lat: number;
  lng: number;
  title: string;
  /** CSS for the mark (shape by band). */
  mark: CSSProperties;
  z?: number;
  /** Tooltip lines on hover or focus (the first in bold). */
  tip?: string[];
  /** Nudge in pixels, so photos taken at the same spot fan out instead of stacking. */
  offset?: [number, number];
}

export interface Projector {
  x: (lng: number) => number;
  y: (lat: number) => number;
  /** Pixels per degree of latitude. */
  k: number;
  W: number;
  H: number;
}

export interface IndiaMapProps {
  theme?: MapTheme;
  /** "stage": landing (strong tilt), "panel": a still-ish panel, "interactive": the library. */
  variant?: "stage" | "panel" | "interactive";
  sites?: MapSite[];
  pins?: MapPin[];
  /** Live arrivals: each new id ripples where it landed. */
  ripples?: Array<{ id: string; lat: number; lng: number }>;
  /** Target view; changing it flies there (interactive) or jumps (others). */
  view?: View;
  onViewChange?: (v: View) => void;
  onSite?: (key: string) => void;
  onPin?: (id: string) => void;
  /** Extra DOM on the map plane, positioned with the projector (photo grids, cards). */
  overlay?: (p: Projector) => ReactNode;
  /** Padding inside the box, px. */
  pad?: number;
  /** Disable all motion (reduced motion is detected too). */
  still?: boolean;
  /** Fades the whole map (the landing drives it from scroll). */
  opacity?: number;
  ariaLabel: string;
  className?: string;
  style?: CSSProperties;
  /** Small "Boundary: Survey of India" credit in the corner. */
  credit?: boolean;
  /** Load the map file only once this is true (a layer that is always on screen but shown later). */
  enabled?: boolean;
  /** Pointer parallax listens on the window (a layer under other content gets no pointer events). */
  pointerFromWindow?: boolean;
  children?: ReactNode;
}

const TONE: Record<NonNullable<MapSite["tone"]>, string> = { verified: "var(--verified)", review: "var(--review)", flagged: "var(--flagged)", primary: "var(--primary)" };

function useReducedMotion(): boolean {
  const [r, setR] = useState(false);
  useEffect(() => {
    const m = matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setR(m.matches);
    on();
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return r;
}

export function IndiaMap({ theme = "night", variant = "panel", sites = [], pins = [], ripples = [], view: target, onViewChange, onSite, onPin, overlay, pad = 12, still = false, opacity, ariaLabel, className, style, credit = true, enabled = true, pointerFromWindow = false, children }: IndiaMapProps) {
  const root = useRef<HTMLDivElement>(null);
  const plane = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [data, setData] = useState<IndiaMapData | null>(null);
  const [size, setSize] = useState({ W: 0, H: 0 });
  const [view, setView] = useState<View>(target ?? INDIA_BOUNDS);
  const viewRef = useRef(view);
  const [hover, setHover] = useState<string | null>(null);
  const reduced = useReducedMotion();
  const calm = still || reduced;
  const interactive = variant === "interactive";

  // Load the map file when the box comes near the viewport.
  useEffect(() => {
    const el = root.current;
    if (!el || !enabled) return;
    let live = true;
    let onLoad: (() => void) | null = null;
    const io = new IntersectionObserver(
      (es) => {
        if (!es.some((e) => e.isIntersecting)) return;
        io.disconnect();
        // After the page's own load, so the map never competes with its largest image.
        const go = () =>
          void loadIndiaMap().then(
            (d) => live && setData(d),
            () => undefined,
          );
        if (document.readyState === "complete") go();
        else {
          onLoad = go;
          window.addEventListener("load", go, { once: true });
        }
      },
      { rootMargin: "800px" },
    );
    io.observe(el);
    return () => {
      live = false;
      io.disconnect();
      if (onLoad) window.removeEventListener("load", onLoad);
    };
  }, [enabled]);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    // The observer reports the first size too.
    const ro = new ResizeObserver(() => setSize({ W: el.clientWidth, H: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // A new target view: fly (interactive, motion allowed) or jump.
  useEffect(() => {
    if (!target) return;
    const from = viewRef.current;
    const same = (a: View, b: View) => Math.abs(a.lng0 - b.lng0) + Math.abs(a.lng1 - b.lng1) + Math.abs(a.lat0 - b.lat0) + Math.abs(a.lat1 - b.lat1) < 1e-6;
    if (same(from, target)) return;
    let raf = 0;
    if (!interactive || calm) {
      raf = requestAnimationFrame(() => {
        viewRef.current = target;
        setView(target);
      });
      return () => cancelAnimationFrame(raf);
    }
    const t0 = performance.now();
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / M.zoom.flyMs);
      const e = 1 - Math.pow(1 - k, 4);
      const v = { lng0: from.lng0 + (target.lng0 - from.lng0) * e, lng1: from.lng1 + (target.lng1 - from.lng1) * e, lat0: from.lat0 + (target.lat0 - from.lat0) * e, lat1: from.lat1 + (target.lat1 - from.lat1) * e };
      viewRef.current = v;
      setView(v);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, interactive, calm]);

  const fit = useMemo(() => fitView(view, size.W, size.H, pad), [view, size, pad]);

  // Finer dots when zoomed in (a city view), for the window the box actually shows.
  const stepDeg = data ? gridStep(data.step, fit.k, M.maxCellPx) : 0;
  const dots = useMemo(() => {
    if (!data) return [];
    if (stepDeg >= data.step) return data.dots;
    return fineDots(data, stepDeg, visibleBounds(view, size.W, size.H, pad));
  }, [data, view, size, pad, stepDeg]);

  // Draw: the shadow, the extrusion layers, the dots, the official outline.
  useEffect(() => {
    const c = canvas.current;
    if (!c || !data || !size.W || !size.H) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = size.W;
    const H = size.H;
    if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) {
      c.width = Math.round(W * dpr);
      c.height = Math.round(H * dpr);
    }
    const x = c.getContext("2d");
    if (!x) return;
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    x.clearRect(0, 0, W, H);
    const col = INDIA_MAP_COLORS[theme];
    const coarse = stepDeg >= data.step;
    // The dotted look needs air between dots: at small sizes keep every n-th grid row and column.
    const stride = coarse ? Math.max(1, Math.ceil(M.minCellPx / (stepDeg * fit.k))) : 1;
    const cell = stepDeg * fit.k * stride;
    const s = coarse ? Math.max(1.4, Math.min(6, cell * 0.56)) : Math.max(1.4, cell * 0.4);
    // Depth stays inside the gap below each dot, so rows never merge into stripes.
    const depth = Math.max(1, Math.min(cell - s - 0.8, (M.depth.px * fit.k) / 20, 5));
    const onGrid = (v: number) => {
      const i = Math.round(v / stepDeg);
      return Math.abs(i * stepDeg - v) < stepDeg * 0.01 ? i : null;
    };
    const pts: Array<[number, number]> = [];
    for (const [lng, lat] of dots) {
      if (stride > 1) {
        const gi = onGrid(lng);
        const gj = onGrid(lat);
        // Off-grid dots are islands (one dot each): always kept.
        if (gi !== null && gj !== null && (gi % stride !== 0 || gj % stride !== 0)) continue;
      }
      const px = fit.x(lng);
      const py = fit.y(lat);
      if (px < -10 || py < -10 || px > W + 10 || py > H + 10) continue;
      pts.push([px, py]);
    }
    // Zoomed in, the grid is texture: flat and lighter, so pins and sites stand out.
    if (coarse) {
      // Soft shadow under the slab.
      x.fillStyle = col.shadow;
      for (const [px, py] of pts) x.fillRect(px - s / 2 + depth * 0.6, py - s / 2 + depth * 1.6, s, s);
      // Extrusion: the dot's sides, deepest first.
      x.fillStyle = col.side;
      for (let l = M.depth.layers; l >= 1; l--) {
        const off = (depth * l) / M.depth.layers;
        for (const [px, py] of pts) x.fillRect(px - s / 2, py - s / 2 + off, s, s);
      }
    }
    x.globalAlpha = coarse ? 1 : M.fineAlpha;
    x.fillStyle = col.dot;
    for (const [px, py] of pts) x.fillRect(px - s / 2, py - s / 2, s, s);
    x.globalAlpha = 1;
    // The official boundary, drawn as a fine line.
    x.strokeStyle = col.outline;
    x.lineWidth = Math.max(0.8, Math.min(1.6, fit.k / 30));
    x.lineJoin = "round";
    x.beginPath();
    for (const poly of data.outline) {
      const r = poly[0];
      for (let i = 0; i < r.length; i++) {
        const px = fit.x(r[i][0]);
        const py = fit.y(r[i][1]);
        if (i === 0) x.moveTo(px, py);
        else x.lineTo(px, py);
      }
      x.closePath();
    }
    x.stroke();
  }, [data, dots, fit, size, theme, stepDeg]);

  // Tilt: resting angle + pointer parallax + scroll parallax, applied on rAF as a transform.
  useEffect(() => {
    const el = root.current;
    const pl = plane.current;
    if (!el || !pl) return;
    const base = M.baseTilt[variant];
    if (calm || variant === "interactive") {
      pl.style.transform = base ? `rotateX(${base}deg)` : "";
      return;
    }
    let tx = 0;
    let ty = 0;
    let cx = 0;
    let cy = 0;
    let visible = false;
    let raf = 0;
    const fine = matchMedia("(pointer: fine)").matches;
    const onMove = (e: PointerEvent) => {
      if (!fine) return;
      const r = el.getBoundingClientRect();
      tx = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width) * 2 - 1));
      ty = Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height) * 2 - 1));
    };
    const onLeave = () => {
      tx = 0;
      ty = 0;
    };
    const loop = () => {
      if (!visible) return;
      raf = requestAnimationFrame(loop);
      const r = el.getBoundingClientRect();
      const sc = Math.max(-1, Math.min(1, (r.top + r.height / 2 - window.innerHeight / 2) / window.innerHeight));
      cx += (tx - cx) * M.pointer.follow;
      cy += (ty - cy) * M.pointer.follow;
      pl.style.transform = `rotateX(${(base - cy * M.pointer.rotX + sc * M.scroll.rotX).toFixed(2)}deg) rotateY(${(cx * M.pointer.rotY).toFixed(2)}deg)`;
    };
    const io = new IntersectionObserver((es) => {
      visible = es.some((e) => e.isIntersecting);
      cancelAnimationFrame(raf);
      if (visible) raf = requestAnimationFrame(loop);
    });
    io.observe(el);
    const src: HTMLElement | Window = pointerFromWindow ? window : el;
    src.addEventListener("pointermove", onMove as EventListener);
    src.addEventListener("pointerleave", onLeave);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
      src.removeEventListener("pointermove", onMove as EventListener);
      src.removeEventListener("pointerleave", onLeave);
    };
  }, [calm, variant, pointerFromWindow]);

  // Interactive: drag to pan, pinch / ⌘-wheel / double-click to zoom, keys.
  const commit = useCallback(
    (v: View) => {
      viewRef.current = v;
      setView(v);
      onViewChange?.(v);
    },
    [onViewChange],
  );
  const zoomBy = useCallback(
    (f: number, px?: number, py?: number) => {
      const v = viewRef.current;
      const at = px === undefined || py === undefined ? { lng: (v.lng0 + v.lng1) / 2, lat: (v.lat0 + v.lat1) / 2 } : unfit(v, size.W, size.H, px, py, pad);
      commit(zoomView(v, f, at, { minSpan: M.zoom.minSpan, maxView: INDIA_BOUNDS }));
    },
    [commit, size, pad],
  );
  useEffect(() => {
    const el = root.current;
    if (!el || !interactive) return;
    const pts = new Map<number, { x: number; y: number }>();
    let pinch = 0;
    const down = (e: PointerEvent) => {
      if ((e.target as HTMLElement).closest("button")) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      el.setPointerCapture(e.pointerId);
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        pinch = Math.hypot(a.x - b.x, a.y - b.y);
      }
    };
    const move = (e: PointerEvent) => {
      const p = pts.get(e.pointerId);
      if (!p) return;
      if (pts.size === 2) {
        pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch > 0 && d > 0) {
          const r = el.getBoundingClientRect();
          zoomBy(pinch / d, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
        }
        pinch = d;
        return;
      }
      const v = viewRef.current;
      const f = fitView(v, size.W, size.H, pad);
      commit(panView(v, -(e.clientX - p.x) / (f.k * Math.cos((22 * Math.PI) / 180)), (e.clientY - p.y) / f.k));
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    };
    const up = (e: PointerEvent) => {
      pts.delete(e.pointerId);
      pinch = 0;
    };
    const wheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomBy(e.deltaY > 0 ? 1 / M.zoom.wheel : M.zoom.wheel, e.clientX - r.left, e.clientY - r.top);
    };
    const dbl = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest("button")) return;
      const r = el.getBoundingClientRect();
      zoomBy(M.zoom.step, e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("wheel", wheel, { passive: false });
    el.addEventListener("dblclick", dbl);
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      el.removeEventListener("wheel", wheel);
      el.removeEventListener("dblclick", dbl);
    };
  }, [interactive, zoomBy, commit, size, pad]);

  const onKey = (e: React.KeyboardEvent) => {
    if (!interactive) return;
    const v = viewRef.current;
    const span = (v.lat1 - v.lat0) * 0.15;
    const k = e.key;
    if (k === "+" || k === "=") zoomBy(M.zoom.step);
    else if (k === "-" || k === "_") zoomBy(1 / M.zoom.step);
    else if (k === "ArrowLeft") commit(panView(v, -span, 0));
    else if (k === "ArrowRight") commit(panView(v, span, 0));
    else if (k === "ArrowUp") commit(panView(v, 0, span));
    else if (k === "ArrowDown") commit(panView(v, 0, -span));
    else return;
    e.preventDefault();
  };

  const projector: Projector = { x: fit.x, y: fit.y, k: fit.k, W: size.W, H: size.H };
  const ready = !!data && size.W > 0;
  const tipPin = hover?.startsWith("pin:") ? pins.find((p) => `pin:${p.id}` === hover) : null;
  const tipSite = tipPin ? { tip: tipPin.tip, lng: tipPin.lng, lat: tipPin.lat } : hover ? sites.find((s) => s.key === hover) : null;
  const glowBase = Math.max(28, Math.min(120, fit.k * 1.6));
  // Labels go right of their pin, left, or above, never cut off or over a neighbour (lib/map/india.ts).
  const sides = ready ? labelSides(sites.filter((s) => s.label).map((s) => ({ key: s.key, x: fit.x(s.lng), y: fit.y(s.lat), w: 26 + 18 + 6.8 * Math.max(s.label!.length, s.sub?.length ?? 0) })), size.W) : {};
  const LABEL_AT: Record<string, CSSProperties> = { right: { left: "26px", top: "50%", transform: "translateY(-50%)" }, left: { right: "26px", top: "50%", transform: "translateY(-50%)" }, above: { left: "6px", bottom: "26px" } };

  return (
    <div
      ref={root}
      className={className}
      role={interactive ? "application" : "img"}
      aria-label={ariaLabel}
      aria-roledescription={interactive ? "map" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={onKey}
      style={{ position: "relative", overflow: interactive ? "hidden" : "visible", touchAction: interactive ? "none" : undefined, cursor: interactive ? "grab" : undefined, opacity, ...style }}
    >
      <div style={{ position: "absolute", inset: "0", perspective: variant === "stage" ? "1500px" : "1800px", perspectiveOrigin: "50% 40%" }}>
        <div ref={plane} style={{ position: "absolute", inset: "0", transformStyle: "preserve-3d", transformOrigin: "50% 55%", transform: M.baseTilt[variant] ? `rotateX(${M.baseTilt[variant]}deg)` : undefined, willChange: calm || interactive ? undefined : "transform" }}>
          {ready &&
            sites.map((s) => {
              const r = glowBase * (0.7 + Math.min(1.2, (s.weight ?? 1) * 0.3));
              return <span key={`g-${s.key}`} aria-hidden="true" style={{ position: "absolute", left: `${fit.x(s.lng)}px`, top: `${fit.y(s.lat)}px`, width: `${r * 2}px`, height: `${r * 2}px`, transform: "translate(-50%,-50%)", borderRadius: "50%", background: `radial-gradient(circle, color-mix(in srgb, ${TONE[s.tone ?? "verified"]} 34%, transparent) 0%, transparent 68%)`, pointerEvents: "none" }} />;
            })}
          <canvas ref={canvas} aria-hidden="true" style={{ position: "absolute", inset: "0", width: "100%", height: "100%", opacity: ready ? 1 : 0, transition: "opacity 400ms" }} />
          {ready &&
            pins.map((p) => {
              const x = fit.x(p.lng) + (p.offset?.[0] ?? 0);
              const y = fit.y(p.lat) + (p.offset?.[1] ?? 0);
              if (x < -8 || y < -8 || x > size.W + 8 || y > size.H + 8) return null;
              return (
                <button key={p.id} type="button" className="focus-ring" aria-label={p.title} title={p.tip ? undefined : p.title} onClick={() => onPin?.(p.id)} onMouseEnter={() => setHover(`pin:${p.id}`)} onMouseLeave={() => setHover((h) => (h === `pin:${p.id}` ? null : h))} onFocus={() => setHover(`pin:${p.id}`)} onBlur={() => setHover((h) => (h === `pin:${p.id}` ? null : h))} style={{ position: "absolute", left: `${x}px`, top: `${y}px`, width: "22px", height: "22px", transform: "translate(-50%,-50%)", padding: "0", border: "0", background: "transparent", cursor: "pointer", zIndex: p.z ?? 1 }}>
                  <span style={{ position: "absolute", left: "4px", top: "4px", width: "14px", height: "14px", boxShadow: "0 0 0 2px var(--card)", ...p.mark }} />
                </button>
              );
            })}
          {ready &&
            sites.map((s) => {
              const x = fit.x(s.lng);
              const y = fit.y(s.lat);
              const tone = TONE[s.tone ?? "verified"];
              const Tag = onSite ? "button" : "span";
              return (
                <Tag
                  key={s.key}
                  data-site={s.key}
                  {...(onSite ? { type: "button" as const, onClick: () => onSite(s.key), "aria-label": [s.label, s.sub].filter(Boolean).join(", ") } : { "aria-hidden": true as const })}
                  onMouseEnter={() => setHover(s.key)}
                  onMouseLeave={() => setHover((h) => (h === s.key ? null : h))}
                  onFocus={() => setHover(s.key)}
                  onBlur={() => setHover((h) => (h === s.key ? null : h))}
                  className={onSite ? "focus-ring" : undefined}
                  style={{ position: "absolute", left: `${x}px`, top: `${y}px`, width: "30px", height: "30px", transform: "translate(-50%,-50%)", padding: "0", border: "0", background: "transparent", cursor: onSite ? "pointer" : "default", zIndex: 3 }}
                >
                  {!calm && <span className="im-pulse" aria-hidden="true" style={{ position: "absolute", left: "50%", top: "50%", width: "22px", height: "22px", borderRadius: "50%", border: `2px solid ${tone}` }} />}
                  <span aria-hidden="true" style={{ position: "absolute", left: "50%", top: "50%", width: "11px", height: "11px", transform: "translate(-50%,-50%)", borderRadius: "50%", background: tone, boxShadow: `0 0 0 3px color-mix(in srgb, ${tone} 28%, transparent), 0 0 14px 2px color-mix(in srgb, ${tone} 70%, transparent)` }} />
                  {s.label && (
                    <span aria-hidden="true" style={{ position: "absolute", ...LABEL_AT[sides[s.key] ?? "right"], whiteSpace: "nowrap", display: "flex", flexDirection: "column", gap: "1px", padding: "4px 8px", borderRadius: "8px", background: "color-mix(in srgb, var(--card) 88%, transparent)", border: "1px solid var(--border)", color: "var(--foreground)", fontSize: "12px", fontWeight: "600", lineHeight: "1.25", textAlign: "left", pointerEvents: "none" }}>
                      {s.label}
                      {s.sub && <span style={{ fontWeight: "400", color: "var(--muted-foreground)" }}>{s.sub}</span>}
                    </span>
                  )}
                </Tag>
              );
            })}
          {ready &&
            ripples.map((r) => (
              <span key={r.id} className="im-ripple" aria-hidden="true" style={{ position: "absolute", left: `${fit.x(r.lng)}px`, top: `${fit.y(r.lat)}px`, width: "18px", height: "18px", borderRadius: "50%", border: "2px solid var(--primary)", transform: "translate(-50%,-50%)", pointerEvents: "none" }} />
            ))}
          {ready && overlay?.(projector)}
        </div>
      </div>
      {tipSite?.tip && ready && (
        <div role="tooltip" style={{ position: "absolute", left: `${Math.min(size.W - 200, Math.max(8, fit.x(tipSite.lng) + (tipPin?.offset?.[0] ?? 0) + 18))}px`, top: `${Math.max(8, fit.y(tipSite.lat) + (tipPin?.offset?.[1] ?? 0) - 64)}px`, zIndex: 6, width: "190px", display: "flex", flexDirection: "column", gap: "2px", padding: "8px 10px", borderRadius: "8px", background: "var(--popover)", color: "var(--popover-foreground)", border: "1px solid var(--border)", boxShadow: "0 8px 24px color-mix(in srgb, var(--ink-black) 18%, transparent)", fontSize: "12px", lineHeight: "1.35", pointerEvents: "none" }}>
          {tipSite.tip.map((t, i) => (
            <span key={i} style={i === 0 ? { fontWeight: "600" } : { color: "var(--muted-foreground)" }}>
              {t}
            </span>
          ))}
        </div>
      )}
      {interactive && (
        <div style={{ position: "absolute", right: "10px", top: "10px", zIndex: 5, display: "flex", flexDirection: "column", gap: "4px" }}>
          <MapButton label="Zoom in" onClick={() => zoomBy(M.zoom.step)}>
            +
          </MapButton>
          <MapButton label="Zoom out" onClick={() => zoomBy(1 / M.zoom.step)}>
            −
          </MapButton>
          <MapButton label="Show all of India" onClick={() => commit(INDIA_BOUNDS)}>
            ⤢
          </MapButton>
        </div>
      )}
      {children}
      {credit && (
        <span style={{ position: "absolute", right: "8px", bottom: "4px", zIndex: 4, fontSize: "10px", lineHeight: "1.2", color: "var(--muted-foreground)", opacity: 0.85, pointerEvents: "none", ...(interactive ? { padding: "1px 6px", borderRadius: "5px", background: "color-mix(in srgb, var(--card) 85%, transparent)", opacity: 1 } : null) }}>
          Boundary: Survey of India (via DataMeet, CC BY-SA)
        </span>
      )}
    </div>
  );
}

function MapButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className="focus-ring" aria-label={label} title={label} onClick={onClick} style={{ width: "32px", height: "32px", borderRadius: "8px", border: "1px solid var(--border)", background: "var(--card)", color: "var(--foreground)", cursor: "pointer", fontSize: "16px", lineHeight: "1" }}>
      {children}
    </button>
  );
}
