"use client";

import gsap from "gsap";
import { useEffect, useRef, useState } from "react";
import { drawThreads } from "./marks";
import type { AppProject, ProjectScreen as ProjectData } from "./types";

/** AP:1103: a sparkline's points in a 120 × 28 box (values in % of the frame, 2 px per point). */
export const sparkline = (arr: number[]) => (arr.length < 2 ? "" : arr.map((v, i) => `${4 + i * (112 / (arr.length - 1))},${24 - v * 2}`).join(" "));

/**
 * The project overview (AP:623-681): project tabs, KPI cards (hover or focus draws threads to
 * the photos counted, the rest dim to 28%), the photo strip, before and after with the mask
 * sweep (1.4 s on open and on Replay, AP:1008-1012), flagged photos with reasons, the spots table.
 */
export function ProjectsScreen({ projects, current, data, onPick, onOpen }: { projects: AppProject[]; current: string; data: ProjectData | null; onPick: (k: string) => void; onOpen: (id: string) => void }) {
  const [kpi, setKpi] = useState<string | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const mask = useRef<HTMLDivElement>(null);
  const scan = useRef<HTMLDivElement>(null);

  const sweep = () => {
    if (!mask.current || !scan.current) return;
    gsap.fromTo(mask.current, { clipPath: "inset(0% 0% 100% 0%)" }, { clipPath: "inset(0% 0% 0% 0%)", duration: 1.4, ease: "power2.inOut" });
    gsap.fromTo(scan.current, { top: "0%", opacity: 1 }, { top: "100%", duration: 1.4, ease: "power2.inOut", onComplete: () => void (scan.current && gsap.set(scan.current, { opacity: 0 })) });
  };
  // AP:859: sweep 120 ms after a project opens.
  useEffect(() => {
    const t = setTimeout(sweep, 120);
    return () => clearTimeout(t);
  }, [current]);

  // AP:1021-1026: threads from the hovered KPI to its photos.
  useEffect(() => {
    if (!kpi) {
      svg.current?.replaceChildren();
      return;
    }
    const a = document.querySelector(`[data-kpi="${kpi}"]`);
    const bs = Array.from(document.querySelectorAll<HTMLElement>("[data-pt]")).filter((t) => (t.dataset.pt ?? "").split(" ").includes(kpi));
    if (a) drawThreads(svg.current, bs.map((b) => [a, b] as [Element, Element]), kpi === "flagged" ? "var(--flagged)" : kpi === "before" || kpi === "after" ? "var(--measured)" : "var(--glow)");
  }, [kpi]);

  return (
    <div id="pj" style={{ position: "relative", display: "flex", flexDirection: "column", gap: "16px" }}>
      <svg ref={svg} id="pj-threads" aria-hidden="true" style={{ position: "absolute", inset: "0", width: "100%", height: "100%", pointerEvents: "none", overflow: "visible", zIndex: "3" }} />
      <div role="tablist" style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
        {projects.map((p) => (
          <button
            key={p.key}
            type="button"
            role="tab"
            aria-selected={p.key === current}
            onClick={() => {
              setKpi(null);
              onPick(p.key);
            }}
            style={{ whiteSpace: "nowrap", padding: "7px 12px", borderRadius: "8px", border: `1px solid ${p.key === current ? "var(--primary)" : "var(--border)"}`, background: p.key === current ? "var(--accent)" : "var(--card)", cursor: "pointer" }}
          >
            {p.city ? `${p.name}, ${p.city}` : p.name}
          </button>
        ))}
      </div>
      {data && (
        <>
          <div style={{ position: "relative", zIndex: "4", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: "8px" }}>
            {data.kpis.map((k) => (
              <button
                key={k.k}
                type="button"
                data-kpi={k.k}
                onMouseEnter={() => setKpi(k.k)}
                onFocus={() => setKpi(k.k)}
                onMouseLeave={() => setKpi(null)}
                onBlur={() => setKpi(null)}
                style={{ display: "flex", flexDirection: "column", gap: "3px", padding: "12px", borderRadius: "12px", border: `1px solid ${kpi === k.k ? "var(--primary)" : "var(--border)"}`, background: "var(--card)", cursor: "pointer", textAlign: "left", transition: "border-color 150ms" }}
              >
                <span style={{ fontFamily: "var(--font-display)", fontWeight: "700", fontSize: "32px", lineHeight: "1", color: k.color }}>{k.value}</span>
                <span style={{ fontSize: "12px", color: "var(--muted-foreground)" }}>{k.label}</span>
                {k.tag && <span style={{ fontSize: "11px", color: "var(--review)" }}>{k.tag}</span>}
              </button>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(56px,1fr))", gap: "5px" }}>
            {data.tiles.map((t, i) => {
              const on = !!kpi && t.keys.includes(kpi);
              return (
                <button key={`${t.id ?? "x"}-${i}`} type="button" data-pt={t.keys.join(" ")} onClick={() => t.id && onOpen(t.id)} aria-label="Open photo" style={{ aspectRatio: "1", padding: "0", border: "0", borderRadius: "6px", overflow: "hidden", cursor: "pointer", background: "var(--muted)", opacity: kpi ? (on ? 1 : 0.28) : 1, outline: `2px solid ${on ? "var(--primary)" : "transparent"}`, outlineOffset: "-2px", transition: "opacity 150ms" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- signed, face-blurred thumbnail */}
                  <img src={t.src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                </button>
              );
            })}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "16px" }}>
            <div style={{ flex: "1 1 420px", minWidth: "0", display: "flex", flexDirection: "column", gap: "8px", padding: "14px", borderRadius: "12px", background: "var(--card)", border: "1px solid var(--border)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px" }}>
                <span style={{ fontWeight: "600" }}>Before and after</span>
                <button type="button" onClick={sweep} style={{ padding: "5px 10px", borderRadius: "7px", border: "1px solid var(--border)", background: "transparent", cursor: "pointer", fontSize: "12px" }}>
                  Replay sweep
                </button>
              </div>
              {data.before ? (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                  <div style={{ position: "relative", aspectRatio: "1024/685", borderRadius: "8px", overflow: "hidden", background: "var(--muted)" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- signed, face-blurred same-frame view */}
                    <img src={data.before.src} alt="Before the clean-up. Faces blurred." style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                    {data.before.mask && <div ref={mask} id="pj-mask" style={{ position: "absolute", inset: "0", background: "var(--measured)", opacity: "0.75", WebkitMaskImage: `url("${data.before.mask}")`, maskImage: `url("${data.before.mask}")`, WebkitMaskSize: "100% 100%", maskSize: "100% 100%", maskMode: data.before.maskMode, clipPath: "inset(0 0 0 0)" }} />}
                    <div ref={scan} id="pj-scan" style={{ position: "absolute", left: "0", right: "0", top: "100%", height: "2px", background: "var(--measured)", boxShadow: "0 0 14px 3px color-mix(in oklch, var(--measured) 70%, transparent)" }} />
                    <span style={{ position: "absolute", left: "6px", top: "6px", padding: "2px 7px", borderRadius: "5px", background: "var(--card)", fontSize: "12px", fontWeight: "600", color: "var(--measured)" }}>{data.before.label}</span>
                  </div>
                  <div style={{ position: "relative", aspectRatio: "1024/685", borderRadius: "8px", overflow: "hidden", background: "var(--muted)", display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", padding: data.after?.src ? "0" : "8px", boxSizing: "border-box" }}>
                    {data.after?.src ? (
                      // eslint-disable-next-line @next/next/no-img-element -- signed, face-blurred same-frame view
                      <img src={data.after.src} alt="After the clean-up. Faces blurred." style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                    ) : (
                      <span style={{ fontSize: "12px", color: "var(--muted-foreground)" }}>
                        <strong style={{ color: "var(--foreground)" }}>Real photo here</strong>
                        <br />
                        same spot, after
                      </span>
                    )}
                    {data.after && <span style={{ position: "absolute", left: "6px", top: "6px", padding: "2px 7px", borderRadius: "5px", background: "var(--card)", fontSize: "12px", fontWeight: "600", color: "var(--measured)" }}>{data.after.label}</span>}
                  </div>
                </div>
              ) : (
                <span style={{ fontSize: "13px", color: "var(--muted-foreground)" }}>No before and after pair at a spot yet. Pairs need two photos of one spot, far enough apart in time.</span>
              )}
              <span style={{ fontSize: "12px", color: "var(--muted-foreground)" }}>{data.caveat}</span>
            </div>
            <div style={{ flex: "1 1 360px", minWidth: "0", display: "flex", flexDirection: "column", gap: "8px", padding: "14px", borderRadius: "12px", background: "var(--card)", border: "1px solid var(--border)" }}>
              <span style={{ fontWeight: "600" }}>Flagged, with reasons</span>
              {data.flags.map((f) => (
                <button key={f.id} type="button" onClick={() => onOpen(f.id)} style={{ display: "flex", gap: "10px", alignItems: "center", padding: "6px", borderRadius: "8px", border: "0", background: "transparent", cursor: "pointer", textAlign: "left" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- signed, face-blurred thumbnail */}
                  <img src={f.src} alt="" style={{ width: "48px", height: "36px", objectFit: "cover", borderRadius: "5px" }} />
                  <span style={{ fontSize: "13px" }}>{f.reason}</span>
                </button>
              ))}
              {data.flags.length === 0 && <span style={{ color: "var(--muted-foreground)" }}>Nothing flagged in this project.</span>}
            </div>
          </div>
          <div style={{ padding: "14px", borderRadius: "12px", background: "var(--card)", border: "1px solid var(--border)", overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "520px" }}>
              <thead>
                <tr style={{ textAlign: "left", fontSize: "12px", color: "var(--muted-foreground)" }}>
                  <th style={{ padding: "6px 8px", fontWeight: "500" }}>Spot</th>
                  <th style={{ padding: "6px 8px", fontWeight: "500" }}>Photos</th>
                  <th style={{ padding: "6px 8px", fontWeight: "500" }}>{data.trendLabel}</th>
                  <th style={{ padding: "6px 8px", fontWeight: "500" }}>Last check-in</th>
                </tr>
              </thead>
              <tbody>
                {data.spots.map((s) => (
                  <tr key={s.name} style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={{ padding: "8px", fontWeight: "500" }}>{s.name}</td>
                    <td style={{ padding: "8px" }}>{s.photos}</td>
                    <td style={{ padding: "8px" }}>
                      <svg width="120" height="28" viewBox="0 0 120 28" role="img" aria-label={s.trendAria}>
                        <polyline points={sparkline(s.points)} fill="none" stroke="var(--measured)" strokeWidth="2" strokeLinejoin="round" />
                      </svg>
                    </td>
                    <td style={{ padding: "8px", color: "var(--muted-foreground)" }}>{s.last}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.samplesNote && <span style={{ fontSize: "11px", color: "var(--review)" }}>{data.samplesNote}</span>}
          </div>
        </>
      )}
    </div>
  );
}
