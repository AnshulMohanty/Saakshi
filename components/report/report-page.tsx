"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Glyph } from "@/components/glyph";
import { LOGO_BITS } from "@/lib/glyph";
import type { NumberCard, NumberKind } from "@/lib/report/numbers";

/**
 * The public report page (Report_Page → /r/[reportId], template RP:350-399): every number is a
 * button; hover, focus or tap draws threads from it to the photos it was counted from (RP:436-460),
 * and the other tiles fade. Then the flagged photos with their reasons and the Method. Below the
 * design: the summary prose and the campaign kit.
 */
export interface ReportPageData {
  kicker: string;
  title: string;
  intro: string;
  numbers: Array<NumberCard & { basis: string | null }>;
  tiles: Array<{ key: string; keys: string[]; src: string; alt: string; href: string | null }>;
  flags: Array<{ key: string; src: string; reason: string; href: string | null }>;
  method: string[];
  /** The server-side PDF; null → the browser's print (the prototype's behaviour). */
  pdfHref: string | null;
  homeHref: string;
  banner: string | null;
  summary: { parts: Array<string | { text: string; claim: string; title: string }>; notes: string[] } | null;
  campaign: { caption: string; templates: Array<{ id: string; src: string; alt: string; width: number; height: number; href: string; label: string }> } | null;
}

const VALUE: Record<NumberKind, string> = { verified: "var(--verified)", flagged: "var(--destructive)", measured: "var(--measured)", estimated: "var(--estimated)", count: "var(--foreground)" };
const TAG = { review: "var(--review)", estimated: "var(--estimated)", muted: "var(--muted-foreground)" } as const;
/** RP:442: threads are flagged red, measured blue, otherwise primary. */
const THREAD: Record<NumberKind, string> = { verified: "var(--primary)", flagged: "var(--flagged)", measured: "var(--measured)", estimated: "var(--measured)", count: "var(--primary)" };
/** RP:460: linked tiles are outlined flagged red, verified primary, otherwise measured blue. */
const OUTLINE: Record<NumberKind, string> = { verified: "var(--primary)", flagged: "var(--destructive)", measured: "var(--measured)", estimated: "var(--measured)", count: "var(--measured)" };
const SECTION = { display: "flex", flexDirection: "column", gap: "10px" } as const;
const H2 = { margin: "0", fontSize: "16px", fontWeight: "600" } as const;

export function ReportPage({ data }: { data: ReportPageData }) {
  const [hi, setHi] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const kindOf = useCallback((k: string) => data.numbers.find((n) => n.key === k)?.kind ?? "count", [data.numbers]);

  const draw = useCallback(() => {
    const svg = svgRef.current;
    if (!svg) return;
    svg.replaceChildren();
    if (!hi) return;
    const num = document.querySelector(`[data-num="${hi}"]`);
    if (!num) return;
    const o = svg.getBoundingClientRect();
    const n = num.getBoundingClientRect();
    const x1 = n.left + n.width / 2 - o.left;
    const y1 = n.bottom - o.top;
    const col = THREAD[kindOf(hi)];
    const ns = "http://www.w3.org/2000/svg";
    document.querySelectorAll<HTMLElement>("[data-tile]").forEach((t) => {
      if (!(t.dataset.tile ?? "").split(" ").includes(hi)) return;
      const r = t.getBoundingClientRect();
      const x2 = r.left + r.width / 2 - o.left;
      const y2 = r.top - o.top + 3;
      const dy = Math.max(30, (y2 - y1) * 0.5);
      for (const [mix, w] of [
        [16, 5],
        [90, 1.3],
      ] as const) {
        const p = document.createElementNS(ns, "path");
        p.setAttribute("d", `M${x1} ${y1} C${x1} ${y1 + dy} ${x2} ${y2 - dy} ${x2} ${y2}`);
        p.setAttribute("fill", "none");
        p.style.stroke = `color-mix(in srgb, ${col} ${mix}%, transparent)`;
        p.setAttribute("stroke-width", String(w));
        p.setAttribute("pathLength", "1");
        p.setAttribute("stroke-dasharray", "1");
        p.setAttribute("stroke-dashoffset", "1");
        p.style.transition = "stroke-dashoffset 600ms cubic-bezier(0.16,1,0.3,1)";
        svg.appendChild(p);
        requestAnimationFrame(() => requestAnimationFrame(() => p.setAttribute("stroke-dashoffset", "0")));
      }
    });
  }, [hi, kindOf]);

  useEffect(() => {
    draw();
    window.addEventListener("resize", draw);
    return () => window.removeEventListener("resize", draw);
  }, [draw]);

  const on = (k: string) => () => setHi((h) => (h === k ? h : k));
  const off = () => setHi(null);
  const print = () => window.print();
  const btn = { padding: "9px 14px", borderRadius: "9px", border: "0", background: "var(--primary)", color: "var(--card)", cursor: "pointer", fontSize: "14px", fontWeight: "500" } as const;

  return (
    <div className="design-root" data-screen-label="Report page" style={{ fontFamily: "var(--font-sans)", color: "var(--foreground)", fontVariantNumeric: "tabular-nums", background: "var(--background)", minHeight: "100vh" }}>
      <header style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px clamp(16px,4vw,48px)", background: "var(--card)", borderBottom: "1px solid var(--border)" }}>
        <a style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--foreground)", textDecoration: "none" }} href={data.homeHref}>
          <Glyph bits={LOGO_BITS} size={22} colors={{ off: "transparent" }} style={{ width: "22px", height: "22px" }} />
          <span style={{ fontFamily: "var(--font-display)", fontWeight: "650", fontSize: "19px" }}>Saakshi</span>
        </a>
        <span style={{ flex: "1", fontSize: "13px", color: "var(--muted-foreground)" }}>Report</span>
        {data.pdfHref ? (
          <a style={{ ...btn, textDecoration: "none" }} href={data.pdfHref} data-testid="pdf-link">
            Download PDF
          </a>
        ) : (
          <button type="button" style={btn} onClick={print}>
            Download PDF
          </button>
        )}
      </header>
      <main id="rp-main" style={{ position: "relative", maxWidth: "1100px", margin: "0 auto", padding: "clamp(20px,4vw,48px) clamp(16px,4vw,48px) 64px", display: "flex", flexDirection: "column", gap: "28px" }} data-testid="report">
        <svg ref={svgRef} id="rp-threads" aria-hidden="true" style={{ position: "absolute", inset: "0", width: "100%", height: "100%", pointerEvents: "none", overflow: "visible", zIndex: "1" }} />
        {data.banner && (
          <span role="note" style={{ alignSelf: "flex-start", padding: "6px 10px", borderRadius: "8px", border: "1px dashed var(--review)", color: "var(--review)", fontSize: "13px", lineHeight: "1.45" }} data-testid="mock-banner">
            {data.banner}
          </span>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <span style={{ fontSize: "13px", color: "var(--muted-foreground)" }}>{data.kicker}</span>
          <h1 style={{ margin: "0", fontFamily: "var(--font-display)", fontWeight: "700", fontStretch: "90%", fontSize: "clamp(34px,5.4vw,64px)", lineHeight: "0.94", letterSpacing: "-0.015em" }}>{data.title}</h1>
          <p style={{ margin: "0", maxWidth: "640px", fontSize: "15px", lineHeight: "1.5", color: "var(--muted-foreground)" }}>{data.intro}</p>
        </div>
        <div style={{ position: "relative", zIndex: "2", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: "10px" }}>
          {data.numbers.map((n) => (
            <button
              type="button"
              key={n.key}
              data-num={n.key}
              id={`claim-${n.key}`}
              title={n.basis ?? undefined}
              onMouseEnter={on(n.key)}
              onFocus={on(n.key)}
              onClick={on(n.key)}
              onMouseLeave={off}
              onBlur={off}
              aria-pressed={hi === n.key}
              data-testid="claim"
              style={{ all: "unset", cursor: "pointer", display: "flex", flexDirection: "column", gap: "4px", padding: "14px", borderRadius: "12px", background: "var(--card)", border: `1px solid ${hi === n.key ? "var(--primary)" : "var(--border)"}`, boxShadow: hi === n.key ? "0 0 0 3px color-mix(in srgb, var(--primary) 18%, transparent)" : "none", transition: "border-color 160ms,box-shadow 160ms" }}
            >
              <span style={{ fontFamily: "var(--font-display)", fontWeight: "700", fontSize: n.hidden ? "32px" : "40px", lineHeight: "1", color: n.hidden ? "var(--muted-foreground)" : VALUE[n.kind] }}>{n.value}</span>
              <span style={{ fontSize: "13px", color: "var(--muted-foreground)", lineHeight: "1.35" }}>{n.label}</span>
              <span style={{ fontSize: "11px", color: TAG[n.tagTone] }}>{n.tag}</span>
            </button>
          ))}
        </div>
        <section style={SECTION}>
          <h2 style={H2}>Photos in this report</h2>
          <div id="rp-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(64px,1fr))", gap: "6px" }}>
            {data.tiles.map((t) => {
              const lit = !!hi && t.keys.includes(hi);
              return (
                <a
                  key={t.key}
                  href={t.href ?? undefined}
                  data-tile={t.keys.join(" ")}
                  style={{ position: "relative", display: "block", aspectRatio: "1", borderRadius: "6px", overflow: "hidden", background: "var(--border)", outline: `2px solid ${lit ? OUTLINE[kindOf(hi!)] : "transparent"}`, outlineOffset: "-2px", opacity: hi ? (lit ? 1 : 0.3) : 1, transition: "opacity 160ms" }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- signed, face-blurred thumbnail */}
                  <img src={t.src} alt={t.alt} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                </a>
              );
            })}
          </div>
        </section>
        <section style={SECTION}>
          <h2 style={H2}>Flagged, with reasons</h2>
          {data.flags.length ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: "10px" }}>
              {data.flags.map((f) => (
                <a key={f.key} href={f.href ?? undefined} style={{ display: "flex", gap: "10px", alignItems: "center", padding: "10px", borderRadius: "12px", background: "var(--card)", border: "1px solid var(--border)", color: "var(--foreground)", textDecoration: "none" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- signed, face-blurred thumbnail */}
                  <img loading="lazy" src={f.src} alt="" style={{ width: "64px", height: "48px", objectFit: "cover", borderRadius: "6px", flexShrink: "0" }} />
                  <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                    <span style={{ alignSelf: "flex-start", padding: "1px 6px", borderRadius: "5px", background: "var(--destructive)", color: "var(--card)", fontSize: "11px", fontWeight: "600" }}>Flagged</span>
                    <span style={{ fontSize: "13px", lineHeight: "1.35" }}>{f.reason}</span>
                  </div>
                </a>
              ))}
            </div>
          ) : (
            <span style={{ fontSize: "13px", color: "var(--muted-foreground)" }}>No photo in this report was flagged.</span>
          )}
        </section>
        <section style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "16px", borderRadius: "12px", background: "var(--card)", border: "1px solid var(--border)", fontSize: "13px", lineHeight: "1.55", color: "var(--muted-foreground)" }}>
          <h2 style={{ ...H2, color: "var(--foreground)" }}>Method</h2>
          {data.method.map((m) => (
            <span key={m}>{m}</span>
          ))}
        </section>
        {data.summary && (
          <section style={{ ...SECTION, padding: "16px", borderRadius: "12px", background: "var(--card)", border: "1px solid var(--border)" }}>
            <h2 style={H2}>Summary</h2>
            <p style={{ margin: "0", fontSize: "15px", lineHeight: "1.55" }} data-testid="prose">
              {data.summary.parts.map((p, i) =>
                typeof p === "string" ? (
                  <span key={i}>{p}</span>
                ) : (
                  <button key={i} type="button" title={p.title} onMouseEnter={on(p.claim)} onFocus={on(p.claim)} onMouseLeave={off} onBlur={off} onClick={on(p.claim)} style={{ all: "unset", cursor: "pointer", fontWeight: "600", color: "var(--primary)", textDecoration: "underline", textUnderlineOffset: "3px" }}>
                    {p.text}
                  </button>
                ),
              )}
            </p>
            {data.summary.notes.map((n) => (
              <span key={n} style={{ fontSize: "13px", color: "var(--review)" }}>
                {n}
              </span>
            ))}
            <span style={{ fontSize: "12px", color: "var(--muted-foreground)" }}>The text was written with placeholders; every number in it is filled from the numbers above.</span>
          </section>
        )}
        {data.campaign && (
          <section style={SECTION} data-testid="campaign">
            <h2 style={H2}>Campaign kit (Instagram 4:5)</h2>
            <span style={{ fontSize: "13px", color: "var(--muted-foreground)" }}>Caption: {data.campaign.caption}</span>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: "10px" }}>
              {data.campaign.templates.map((t) => (
                <div key={t.id} style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- signed, face-blurred template built from Transforms */}
                  <img src={t.src} alt={t.alt} width={t.width} height={t.height} loading="lazy" style={{ width: "100%", height: "auto", aspectRatio: "4/5", objectFit: "cover", borderRadius: "10px", border: "1px solid var(--border)" }} />
                  <a href={t.href} style={{ fontSize: "13px" }} data-testid={`download-${t.id}`}>
                    Download PNG ({t.label})
                  </a>
                  <span style={{ fontSize: "12px", color: "var(--muted-foreground)" }}>Alt text: {t.alt}</span>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
