"use client";

import gsap from "gsap";
import { useCallback, useEffect, useRef, useState } from "react";
import { cardOffset, dotRadius, lerpBox, pinPosition, project, zoomBox, type BBox } from "@/lib/app/map";
import { bandMark } from "./marks";
import type { AppPhoto, AppProject } from "./types";

/**
 * The library map (AP:499-525): the dot field on a canvas, one cluster per project (count, band
 * bar, name) or, zoomed into a project, one pin per photo by band shape. Zoom tweens the view box
 * 0.9 s expo.out (AP:969-976).
 */
export function LibraryMap({ photos, projects, area, land, zoom, onZoom, onOpen, caption, dark }: { photos: AppPhoto[]; projects: AppProject[]; area: BBox; land: Array<[number, number]>; zoom: string | null; onZoom: (k: string | null) => void; onOpen: (id: string) => void; caption: string; dark: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ W: 640, H: 260 });
  const [view, setView] = useState<BBox>(() => {
    const z = zoom ? projects.find((p) => p.key === zoom) : null;
    return z ? zoomBox(z) : area;
  });
  const viewRef = useRef(view);
  const tween = useRef<gsap.core.Tween | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ W: el.clientWidth, H: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // AP:969-976: tween the view to the project (or back to the area).
  useEffect(() => {
    const z = zoom ? projects.find((p) => p.key === zoom) : null;
    const to = z ? zoomBox(z) : area;
    const from = { ...viewRef.current };
    const o = { t: 0 };
    tween.current?.kill();
    tween.current = gsap.to(o, {
      t: 1,
      duration: 0.9,
      ease: "expo.out",
      onUpdate: () => {
        viewRef.current = lerpBox(from, to, o.t);
        setView(viewRef.current);
      },
    });
    return () => void tween.current?.kill();
  }, [zoom, projects, area]);

  // AP:958-967: the dots (and, zoomed in, the site's dashed ellipse).
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const { W, H } = size;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (c.width !== Math.round(W * dpr)) {
      c.width = Math.round(W * dpr);
      c.height = Math.round(H * dpr);
    }
    const x = c.getContext("2d");
    if (!x) return;
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    x.clearRect(0, 0, W, H);
    const rr = dotRadius(view);
    x.fillStyle = getComputedStyle(c).getPropertyValue(dark ? "--map-dot-dark" : "--map-dot").trim() || "rgba(110,100,160,0.34)";
    for (const [lng, lat] of land) {
      if (lng < view.lng0 - 0.5 || lng > view.lng1 + 0.5 || lat < view.lat0 - 0.5 || lat > view.lat1 + 0.5) continue;
      const p = project(view, W, H, lat, lng);
      x.beginPath();
      x.arc(p.x, p.y, rr * (0.8 + 0.2 * (p.y / H)), 0, 7);
      x.fill();
    }
    const z = zoom ? projects.find((p) => p.key === zoom) : null;
    if (view.lng1 - view.lng0 < 2 && z) {
      x.strokeStyle = getComputedStyle(c).getPropertyValue(dark ? "--map-site-dark" : "--map-site").trim();
      x.setLineDash([5, 5]);
      const c0 = project(view, W, H, z.lat, z.lng);
      const c1 = project(view, W, H, z.lat, z.lng + 0.15);
      x.beginPath();
      x.ellipse(c0.x, c0.y, Math.abs(c1.x - c0.x), Math.abs(c1.x - c0.x) * 0.72, 0, 0, 7);
      x.stroke();
      x.setLineDash([]);
    }
  }, [view, size, land, dark, zoom, projects]);

  const P = useCallback((lat: number, lng: number) => project(view, size.W, size.H, lat, lng), [view, size]);

  const z = zoom ? projects.find((p) => p.key === zoom) ?? null : null;
  let outside = 0;
  const pins = z
    ? photos
        .filter((p) => p.project === z.key)
        .map((p) => {
          const at = pinPosition(p, z);
          if (!at) {
            outside++;
            return null;
          }
          const g = P(at.lat, at.lng);
          return { p, g };
        })
        .filter((x): x is NonNullable<typeof x> => !!x)
    : [];
  const text = z ? `${z.name}, ${z.city}${outside ? `, ${outside} photo taken outside this view` : ""}. Photos without GPS wait near the site.` : caption;

  return (
    <div ref={box} id="lib-map" style={{ position: "relative", height: "clamp(260px,36vh,400px)", borderRadius: "12px", overflow: "hidden", background: "var(--card)", border: "1px solid var(--border)" }}>
      <canvas ref={canvas} id="lib-dots" style={{ position: "absolute", inset: "0", width: "100%", height: "100%" }} />
      {!z &&
        projects.map((pr) => {
          const ps = photos.filter((p) => p.project === pr.key);
          const n = ps.length || 1;
          const c = (b: string) => ps.filter((p) => p.band === b).length;
          const g = P(pr.lat, pr.lng);
          const [dx, dy] = cardOffset(pr.card, g, size.W, size.H);
          const aria = `Zoom to ${pr.city || pr.name}, ${ps.length} photos`;
          return (
            <button key={pr.key} type="button" data-pin="" onClick={() => onZoom(pr.key)} aria-label={aria} title={aria} style={{ position: "absolute", left: `${Math.round(g.x)}px`, top: `${Math.round(g.y)}px`, width: "0", height: "0", padding: "0", border: "0", background: "transparent", cursor: "pointer", zIndex: "2" }}>
              <span style={{ position: "absolute", left: "-4px", top: "-4px", width: "8px", height: "8px", borderRadius: "4px", background: "var(--foreground)", boxShadow: "0 0 0 3px var(--card)" }} />
              <span style={{ position: "absolute", left: "0", top: "0", transform: `translate(${Math.round(dx)}px, ${Math.round(dy)}px)`, width: "180px", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: "3px", alignItems: "flex-start", padding: "7px 10px", borderRadius: "var(--radius)", background: "var(--card)", border: "1px solid var(--border)", boxShadow: "0 6px 18px color-mix(in srgb, var(--ink-black) 12%, transparent)", textAlign: "left" }}>
                <span style={{ display: "flex", alignItems: "baseline", gap: "6px" }}>
                  <span style={{ fontFamily: "var(--font-display)", fontWeight: "700", fontSize: "24px", lineHeight: "1" }}>{ps.length}</span>
                  <span style={{ fontSize: "12px", color: "var(--muted-foreground)" }}>photos</span>
                </span>
                <span style={{ display: "flex", width: "100%", minWidth: "90px", height: "5px", borderRadius: "3px", overflow: "hidden", background: "var(--muted)" }}>
                  <span style={{ width: `${(c("Verified") / n) * 100}%`, background: "var(--verified)" }} />
                  <span style={{ width: `${(c("Needs review") / n) * 100}%`, background: "var(--review)" }} />
                  <span style={{ width: `${(c("Flagged") / n) * 100}%`, background: "var(--flagged)" }} />
                </span>
                <span style={{ maxWidth: "100%", fontSize: "12px", fontWeight: "500", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pr.city ? `${pr.name}, ${pr.city}` : pr.name}</span>
              </span>
            </button>
          );
        })}
      {pins.map(({ p, g }) => {
        const m = bandMark(p.band);
        const aria = `${p.band}, ${p.title}`;
        return (
          <button key={p.id} type="button" data-pin="" onClick={() => onOpen(p.id)} aria-label={aria} title={aria} style={{ position: "absolute", left: `${Math.round(g.x)}px`, top: `${Math.round(g.y)}px`, width: "0", height: "0", padding: "0", border: "0", background: "transparent", cursor: "pointer", zIndex: p.band === "Flagged" ? "3" : "1" }}>
            <span style={{ position: "absolute", left: "-8px", top: "-8px", width: "16px", height: "16px", background: m.color, borderRadius: m.radius, clipPath: m.clip, transform: `rotate(${m.rot})`, boxShadow: "0 0 0 2px var(--card)" }} />
          </button>
        );
      })}
      <div style={{ position: "absolute", left: "10px", top: "10px", right: "10px", display: "flex", gap: "6px", alignItems: "center" }}>
        {z && (
          <button type="button" onClick={() => onZoom(null)} style={{ flexShrink: "0", whiteSpace: "nowrap", padding: "6px 10px", borderRadius: "8px", border: "1px solid var(--border)", background: "var(--card)", cursor: "pointer" }}>
            All projects
          </button>
        )}
        <span style={{ minWidth: "0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", padding: "6px 10px", borderRadius: "8px", background: "var(--card)", border: "1px solid var(--border)", fontSize: "12px" }}>{text}</span>
      </div>
      <div style={{ position: "absolute", right: "10px", bottom: "10px", display: "flex", gap: "10px", padding: "6px 10px", borderRadius: "8px", background: "var(--card)", border: "1px solid var(--border)", fontSize: "12px" }}>
        <span style={{ display: "flex", alignItems: "center", gap: "5px" }}>
          <span style={{ width: "9px", height: "9px", borderRadius: "50%", background: "var(--verified)" }} />
          Verified
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: "5px" }}>
          <span style={{ width: "8px", height: "8px", borderRadius: "2px", transform: "rotate(45deg)", background: "var(--review)" }} />
          Needs review
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: "5px" }}>
          <span style={{ width: "10px", height: "10px", clipPath: "polygon(50% 0,100% 100%,0 100%)", background: "var(--flagged)" }} />
          Flagged
        </span>
      </div>
    </div>
  );
}
