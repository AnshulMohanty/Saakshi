"use client";

import { useEffect, useRef, useState } from "react";
import { Glyph } from "@/components/glyph";
import { LOGO_BITS } from "@/lib/glyph";
import { drawThreads } from "./marks";
import type { StudioScreen as StudioData } from "./types";

const PAPER = { background: "var(--l-card)", color: "var(--l-foreground)" } as const;
const SHADOW = "0 10px 30px color-mix(in srgb, var(--l-foreground) 14%, transparent)";
type Tpl = "stat" | "split" | "photo";

/**
 * Studio (AP:684-745): the report on an A4 sheet, its numbers threaded to their photos when it
 * opens (AP:1027-1030), and Instagram posts at 4:5 (Stat, Before and after, Verified photo) with
 * a caption (2,200 characters) and the export link. Paper and posts keep light colours in dark mode.
 */
export function StudioScreen({ data, offline, toast, onExport, onGenerate }: { data: StudioData; offline: boolean; toast: (t: string) => void; onExport?: (tpl: Tpl) => void; onGenerate?: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [tpl, setTpl] = useState<Tpl>("stat");
  const [caption, setCaption] = useState(data.caption);
  const [exported, setExported] = useState(false);
  const svg = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      const pairs: Array<[Element, Element]> = [];
      for (const k of ["v", "f", "b"]) {
        const a = document.querySelector(`[data-sn="${k}"]`);
        document.querySelectorAll(`[data-st="${k}"]`).forEach((b) => a && pairs.push([a, b]));
      }
      drawThreads(svg.current, pairs, "var(--l-primary)");
    }, 120);
    return () => clearTimeout(t);
  }, []);

  const r = data.report;
  const P = data.posts;
  const count = caption.length;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "20px", alignItems: "flex-start" }}>
      <div style={{ flex: "0 1 440px", minWidth: "0", display: "flex", flexDirection: "column", gap: "8px" }}>
        <span style={{ fontWeight: "600" }}>Report, A4</span>
        {r ? (
          <div id="st-a4" style={{ position: "relative", width: "100%", maxWidth: "440px", aspectRatio: "210/297", ...PAPER, borderRadius: "4px", boxShadow: SHADOW, padding: "7%", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: "12px", overflow: "hidden" }}>
            <svg ref={svg} id="st-threads" aria-hidden="true" style={{ position: "absolute", inset: "0", width: "100%", height: "100%", pointerEvents: "none" }} />
            <span style={{ fontSize: "10px", color: "var(--l-muted-foreground)" }}>{r.kicker}</span>
            <span style={{ fontFamily: "var(--font-display)", fontWeight: "700", fontSize: "24px", lineHeight: "1" }}>{r.title}</span>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: "6px", position: "relative", zIndex: "1" }}>
              {r.numbers.map((n) => (
                <div key={n.key} data-sn={n.key} style={{ padding: "8px", borderRadius: "6px", border: "1px solid var(--l-border)", background: "var(--l-card)" }}>
                  <div style={{ fontFamily: "var(--font-display)", fontWeight: "700", fontSize: "24px", color: n.color }}>{n.value}</div>
                  <div style={{ fontSize: "9px", color: n.labelColor ?? "var(--l-muted-foreground)" }}>{n.label}</div>
                </div>
              ))}
            </div>
            <div style={{ flex: "1" }} />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: "4px", position: "relative", zIndex: "1" }}>
              {r.tiles.map((t, i) => (
                // eslint-disable-next-line @next/next/no-img-element -- signed, face-blurred thumbnail
                <img loading="lazy" key={`${t.src}-${i}`} data-st={t.k} src={t.src} alt="" style={{ width: "100%", aspectRatio: "1", objectFit: "cover", borderRadius: "3px" }} />
              ))}
            </div>
            <span style={{ fontSize: "8px", color: "var(--l-muted-foreground)", lineHeight: "1.4" }}>{r.method}</span>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px", alignItems: "flex-start" }}>
            <span style={{ color: "var(--muted-foreground)" }}>No report yet for this project. A report counts its verified photos, measurements and check-ins, each number linked to its photos.</span>
            {onGenerate && (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setBusy(true);
                  void onGenerate().finally(() => setBusy(false));
                }}
                style={{ padding: "9px 14px", borderRadius: "9px", border: "0", background: "var(--primary)", color: "var(--primary-foreground)", cursor: "pointer", fontWeight: "500" }}
              >
                {busy ? "Generating…" : "Generate the report"}
              </button>
            )}
          </div>
        )}
      </div>
      <div style={{ flex: "1 1 420px", minWidth: "0", display: "flex", flexDirection: "column", gap: "12px" }}>
        <span style={{ fontWeight: "600" }}>Instagram posts, 4:5</span>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {(
            [
              ["stat", "Stat"],
              ["split", "Before and after"],
              ["photo", "Verified photo"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              aria-pressed={tpl === k}
              onClick={() => {
                setTpl(k);
                setExported(false);
              }}
              style={{ padding: "7px 12px", borderRadius: "8px", border: `1px solid ${tpl === k ? "var(--primary)" : "var(--border)"}`, background: tpl === k ? "var(--accent)" : "var(--card)", cursor: "pointer" }}
            >
              {label}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "14px", alignItems: "flex-start" }}>
          <div style={{ position: "relative", width: "min(320px,100%)", aspectRatio: "4/5", borderRadius: "8px", overflow: "hidden", boxShadow: SHADOW, flexShrink: "0" }}>
            {tpl === "stat" &&
              (P.stat ? (
                <div style={{ position: "absolute", inset: "0", background: "var(--n-background)", color: "var(--n-foreground)", padding: "9%", boxSizing: "border-box", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: "8px", fontFamily: "var(--font-display)", fontWeight: "650", fontSize: "16px" }}>
                    <Glyph bits={LOGO_BITS} colors={{ on: "var(--n-primary)", off: "transparent" }} style={{ width: "18px", height: "18px" }} />
                    Saakshi
                  </span>
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    <span style={{ fontFamily: "var(--font-display)", fontWeight: "700", fontSize: "110px", lineHeight: "0.85", color: "var(--n-verified)" }}>{P.stat.value}</span>
                    <span style={{ fontFamily: "var(--font-display)", fontWeight: "650", fontSize: "26px", lineHeight: "1.05" }}>{P.stat.line}</span>
                  </div>
                  <span style={{ fontSize: "11px", color: "var(--n-muted-foreground)" }}>{P.stat.foot}</span>
                </div>
              ) : (
                <Unavailable />
              ))}
            {tpl === "split" &&
              (P.split ? (
                <>
                  <div style={{ position: "absolute", inset: "0", display: "grid", gridTemplateRows: "1fr 1fr", background: "var(--l-background)" }}>
                    <div style={{ position: "relative", overflow: "hidden" }}>
                      {/* eslint-disable-next-line @next/next/no-img-element -- signed, face-blurred same-frame view */}
                      <img src={P.split.before.src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      {P.split.before.mask && <div style={{ position: "absolute", inset: "0", background: "var(--mask-tint)", opacity: "0.7", WebkitMaskImage: `url("${P.split.before.mask}")`, maskImage: `url("${P.split.before.mask}")`, WebkitMaskSize: "cover", maskSize: "cover", WebkitMaskPosition: "center", maskPosition: "center", maskMode: P.split.before.maskMode }} />}
                      <span style={{ position: "absolute", left: "10px", top: "10px", padding: "4px 8px", borderRadius: "6px", background: "var(--l-card)", fontWeight: "700", color: "var(--l-measured)" }}>{P.split.before.label}</span>
                    </div>
                    <div style={{ position: "relative", background: "var(--hairline-strong)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--l-muted-foreground)", fontSize: "12px" }}>
                      {P.split.after.src ? (
                        // eslint-disable-next-line @next/next/no-img-element -- signed, face-blurred same-frame view
                        <img src={P.split.after.src} alt="" style={{ position: "absolute", inset: "0", width: "100%", height: "100%", objectFit: "cover" }} />
                      ) : (
                        "Real photo here"
                      )}
                      <span style={{ position: "absolute", left: "10px", top: "10px", padding: "4px 8px", borderRadius: "6px", background: "var(--l-card)", fontWeight: "700", color: "var(--l-measured)" }}>{P.split.after.label}</span>
                    </div>
                  </div>
                  <span style={{ position: "absolute", right: "10px", bottom: "10px", padding: "3px 7px", borderRadius: "5px", background: "var(--l-measured)", color: "var(--l-card)", fontSize: "10px", fontWeight: "600" }}>Measured</span>
                </>
              ) : (
                <Unavailable />
              ))}
            {tpl === "photo" &&
              (P.photo ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element -- signed, face-blurred photo */}
                  <img src={P.photo.src} alt="" style={{ position: "absolute", inset: "0", width: "100%", height: "100%", objectFit: "cover" }} />
                  <div style={{ position: "absolute", left: "8px", right: "8px", bottom: "8px", display: "flex", flexDirection: "column", gap: "6px", padding: "10px", borderRadius: "8px", background: "var(--l-card)", color: "var(--l-foreground)" }}>
                    <span style={{ display: "flex", alignItems: "baseline", gap: "6px" }}>
                      <span style={{ fontFamily: "var(--font-display)", fontWeight: "700", fontSize: "26px", lineHeight: "1", color: "var(--l-verified)" }}>{P.photo.score}</span>
                      <span style={{ fontWeight: "600", fontSize: "12px", color: "var(--l-verified)" }}>{P.photo.band}</span>
                      <span style={{ marginLeft: "auto", fontSize: "10px", color: "var(--l-muted-foreground)" }}>{P.photo.meta}</span>
                    </span>
                    <span style={{ display: "flex", flexWrap: "wrap", gap: "3px", fontSize: "9px" }}>
                      {P.photo.chips.map((c) => (
                        <span key={c} style={{ padding: "2px 5px", borderRadius: "4px", background: "var(--verified-tint)", color: "var(--verified-ink)" }}>
                          {c}
                        </span>
                      ))}
                    </span>
                  </div>
                </>
              ) : (
                <Unavailable />
              ))}
          </div>
          <div style={{ flex: "1 1 220px", minWidth: "0", display: "flex", flexDirection: "column", gap: "8px" }}>
            <label style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              <span style={{ fontSize: "12px", fontWeight: "600" }}>Caption</span>
              <textarea value={caption} onChange={(e) => setCaption(e.target.value)} rows={7} style={{ resize: "vertical", padding: "8px", borderRadius: "8px", border: "1px solid var(--border)", background: "var(--card)", lineHeight: "1.45" }} />
            </label>
            <span style={{ fontSize: "12px", color: count > 2200 ? "var(--flagged)" : "var(--muted-foreground)" }}>{`${count.toLocaleString("en-IN")} of 2,200 characters. Photo credits are added at the end automatically.`}</span>
            <button
              type="button"
              disabled={!data.exports[tpl]}
              onClick={() => {
                setExported(true);
                onExport?.(tpl);
                toast(offline ? "Queued. It exports when you are back online." : "Exported 1080 × 1350. Credits added to the caption.");
              }}
              style={{ alignSelf: "flex-start", padding: "9px 14px", borderRadius: "9px", border: "0", background: "var(--primary)", color: "var(--primary-foreground)", cursor: "pointer", fontWeight: "500" }}
            >
              Export 1080 × 1350
            </button>
            {exported && data.exports[tpl] && <code style={{ display: "block", padding: "8px", borderRadius: "8px", background: "var(--muted)", fontFamily: "var(--font-mono)", fontSize: "11px", wordBreak: "break-all" }}>{data.exports[tpl]}</code>}
          </div>
        </div>
      </div>
    </div>
  );
}

function Unavailable() {
  return <div style={{ position: "absolute", inset: "0", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px", textAlign: "center", background: "var(--muted)", color: "var(--muted-foreground)", fontSize: "13px" }}>Needs a report with this number first.</div>;
}
