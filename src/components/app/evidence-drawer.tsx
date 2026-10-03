"use client";

import gsap from "gsap";
import { useEffect, useRef, useState } from "react";
import { Glyph } from "@/components/glyph";
import { groupRows, plainVerdict, pointsBreakdown, type QuestionKey } from "@/lib/app/drawer";
import { glyphSvg, svgDataUrl } from "@/lib/glyph";
import { LOUPE_QUERY, useMediaQuery } from "@/lib/client/media-query";
import { drawLayers, loadImage } from "@/lib/scenes/layers";
import { bandMark, resolveColor } from "./marks";
import type { Decision } from "./review-screen";
import type { AppPhoto, AppProject } from "./types";

type Tab = "checks" | "history" | "facts" | "dups" | "credits";
const TABS: Array<[Tab, string]> = [
  ["checks", "Checks"],
  ["history", "Timeline"],
  ["facts", "Facts"],
  ["dups", "Duplicates"],
  ["credits", "Credits"],
];
const TONE = { bad: "var(--flagged)", good: "var(--verified)", warn: "var(--review)", neutral: "var(--muted-foreground)" } as const;
/** One shade per question in the points bar (the legend repeats them). */
const SHADE: Record<QuestionKey, string> = {
  where: "var(--primary)",
  when: "color-mix(in srgb, var(--primary) 72%, var(--card))",
  original: "color-mix(in srgb, var(--primary) 50%, var(--card))",
  clear: "color-mix(in srgb, var(--primary) 32%, var(--card))",
  other: "color-mix(in srgb, var(--primary) 22%, var(--card))",
};

/**
 * The evidence drawer (AP:751-811): code and project; the photo with its layer viewer (taken apart
 * in 3-D: AP:986-992; a loupe over the fingerprint layer: AP:997-1006), kept compact; then the
 * answer in plain words: a one-line verdict, the score as a sum that adds up (each question's
 * points, and a hard flag's cap as its own term), and tabs: the checks grouped by the question
 * each answers (Where? When? Is it original? Is it clear?) with a why-line for every row short
 * of its points, the audit timeline, facts, duplicates, credits. Esc closes (the shell's key handler).
 */
export function EvidenceDrawer({ photo, project, decision, onClose }: { photo: AppPhoto; project: AppProject | null; decision: Decision | null; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>("checks");
  const [exploded, setExploded] = useState(false);
  // C25: the loupe is for a mouse; touch and reduced motion get no button (the label drops the design's "P1" mark, B5.11).
  const canLoupe = useMediaQuery(LOUPE_QUERY);
  const [loupeOn, setLoupe] = useState(false);
  const loupe = canLoupe && loupeOn;
  const [art, setArt] = useState<string[] | null>(null);
  const [glyph, setGlyph] = useState<string | null>(null);
  const view = useRef<HTMLDivElement>(null);
  const stack = useRef<HTMLDivElement>(null);
  const spin = useRef<HTMLDivElement>(null);
  const lens = useRef<HTMLDivElement>(null);
  const first = useRef(true);

  // AP:993-996: the layer art, drawn once from the photo's data.
  useEffect(() => {
    let live = true;
    const l = photo.layer;
    if (!l) return;
    void loadImage(l.mask)
      .then((m) => drawLayers(l.input, m))
      .then((arts) => {
        if (!live) return;
        setArt(
          arts.map((c) => {
            const s = document.createElement("canvas");
            s.width = 800;
            s.height = 600;
            s.getContext("2d")!.drawImage(c, 0, 0, 800, 600);
            return s.toDataURL("image/png");
          }),
        );
      });
    return () => {
      live = false;
    };
  }, [photo.layer]);

  // AP:1120: the fingerprint layer as an image (its colours resolved: images can't read tokens).
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      const el = view.current;
      if (!el) return;
      setGlyph(svgDataUrl(glyphSvg(photo.hash ?? "0".repeat(64), { on: resolveColor("color-mix(in srgb, var(--l-primary) 85%, transparent)", el), off: resolveColor("color-mix(in srgb, var(--l-card) 35%, transparent)", el) })));
    });
    return () => cancelAnimationFrame(raf);
  }, [photo.hash]);
  const layers = [{ src: photo.preview, alt: photo.title, fit: "contain" as const }, ...(art ? art.map((src) => ({ src, alt: "", fit: "fill" as const })) : glyph ? [{ src: glyph, alt: "", fit: "contain" as const }] : [])];

  // AP:986-992: together (instant on first open) or taken apart, 0.8 s expo.out.
  useEffect(() => {
    const d = first.current ? 0 : 0.8;
    first.current = false;
    const els = Array.from(stack.current?.querySelectorAll("[data-dl]") ?? []);
    gsap.to(stack.current, { rotateX: exploded ? 56 : 0, y: exploded ? "8%" : "0%", scale: exploded ? 0.82 : 1, duration: d, ease: "expo.out" });
    gsap.to(spin.current, { rotateZ: exploded ? -34 : 0, duration: d, ease: "expo.out" });
    els.forEach((el, i) => gsap.to(el, { z: exploded ? i * 40 : 0, opacity: exploded || i === 0 ? 1 : 0, duration: d, ease: "expo.out" }));
  }, [exploded, layers.length]);

  const move = (e: React.MouseEvent) => {
    if (!loupe || !view.current || !lens.current || !stack.current) return;
    const r = view.current.getBoundingClientRect();
    const sr = stack.current.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    const l = lens.current;
    const src = art ? art[1] : (glyph ?? "");
    l.style.opacity = "1";
    l.style.transform = `translate(${x - 75}px, ${y - 75}px)`;
    l.style.backgroundImage = `url("${src}"), url("${photo.preview}")`;
    l.style.backgroundSize = `${sr.width}px ${sr.height}px, ${sr.width}px ${sr.height}px`;
    const pos = `${sr.left - r.left - x + 75}px ${sr.top - r.top - y + 75}px`;
    l.style.backgroundPosition = `${pos}, ${pos}`;
  };
  const hide = () => void (lens.current && (lens.current.style.opacity = "0"));

  const m = bandMark(photo.band);
  const history = [...photo.history, ...(decision ? [{ what: `${decision.kind === "approved" ? "Approved: " : "Rejected: "}${decision.note}`, when: "Just now" }] : [])];
  const near = photo.nearest;
  const groups = groupRows(photo.rows);
  const bd = pointsBreakdown(photo.rows, photo.score, photo.hard);
  const ctl = { padding: "6px 10px", borderRadius: "8px", border: "0", color: "var(--l-card)", cursor: "pointer", fontSize: "12px" } as const;
  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: "0", background: "color-mix(in srgb, var(--n-background) 40%, transparent)", zIndex: "30" }} />
      <aside role="dialog" aria-label="Evidence" style={{ position: "fixed", right: "0", top: "0", bottom: "0", width: "min(760px,100%)", zIndex: "31", display: "flex", flexDirection: "column", background: "var(--card)", borderLeft: "1px solid var(--border)", boxShadow: "-20px 0 60px color-mix(in srgb, var(--ink-black) 20%, transparent)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
          <div style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column" }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--muted-foreground)" }}>{photo.code}</span>
            <span style={{ fontWeight: "600", fontSize: "16px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{project ? (project.city ? `${project.name}, ${project.city}` : project.name) : "Not assigned to a project"}</span>
          </div>
          {photo.evidenceHref && (
            <a href={photo.evidenceHref} className="focus-ring" style={{ flexShrink: "0", padding: "6px 10px", borderRadius: "8px", border: "1px solid var(--border)", color: "var(--foreground)", fontSize: "13px", textDecoration: "none", whiteSpace: "nowrap" }}>
              Evidence page ↗
            </a>
          )}
          <button type="button" className="focus-ring" onClick={onClose} aria-label="Close" style={{ flexShrink: "0", width: "32px", height: "32px", borderRadius: "8px", border: "1px solid var(--border)", background: "transparent", cursor: "pointer" }}>
            ×
          </button>
        </div>
        <div style={{ flex: "1", minHeight: "0", overflowY: "auto", overflowX: "hidden", padding: "16px", display: "flex", flexDirection: "column", gap: "14px" }}>
          <div ref={view} id="dr-view" onMouseMove={move} onMouseLeave={hide} style={{ position: "relative", flexShrink: "0", width: "100%", aspectRatio: "16/10", maxHeight: "36vh", borderRadius: "12px", background: "color-mix(in srgb, var(--foreground) 7%, var(--muted))", perspective: "1300px", overflow: "hidden", contain: "paint", isolation: "isolate" }}>
            <div ref={stack} id="dr-stack" style={{ position: "absolute", left: "4%", top: "5%", width: "92%", height: "90%", transformStyle: "preserve-3d" }}>
              <div ref={spin} id="dr-spin" style={{ position: "absolute", inset: "0", transformStyle: "preserve-3d" }}>
                {layers.map((l, i) => (
                  // eslint-disable-next-line @next/next/no-img-element -- the signed photo and its layer art (data URLs)
                  <img key={`${i}-${l.fit}`} data-dl={i} src={l.src} alt={l.alt} style={{ position: "absolute", inset: "0", width: "100%", height: "100%", objectFit: l.fit, opacity: i === 0 ? 1 : 0 }} />
                ))}
              </div>
            </div>
            <div ref={lens} id="dr-loupe" aria-hidden="true" style={{ position: "absolute", left: "0", top: "0", width: "150px", height: "150px", borderRadius: "50%", border: "2px solid var(--glow)", boxShadow: "0 0 0 4px color-mix(in oklch, var(--glow) 25%, transparent)", pointerEvents: "none", opacity: "0", backgroundRepeat: "no-repeat" }} />
            <div style={{ position: "absolute", left: "10px", bottom: "10px", display: "flex", gap: "6px" }}>
              <button type="button" className="focus-ring" onClick={() => setExploded((x) => !x)} aria-pressed={exploded} style={{ ...ctl, background: "color-mix(in srgb, var(--l-foreground) 82%, transparent)" }}>
                {exploded ? "Put it back together" : "Take it apart"}
              </button>
              {canLoupe && (
                <button
                  type="button"
                  className="focus-ring"
                  aria-pressed={loupe}
                  onClick={() => {
                    setLoupe((x) => !x);
                    if (loupe) hide();
                  }}
                  style={{ ...ctl, background: loupe ? "var(--primary)" : "color-mix(in srgb, var(--l-foreground) 82%, transparent)" }}
                >
                  Loupe
                </button>
              )}
            </div>
          </div>

          <section aria-label="Verdict" style={{ display: "flex", flexDirection: "column", gap: "12px", padding: "14px", borderRadius: "12px", border: `1px solid color-mix(in srgb, ${m.color} 40%, var(--border))`, background: `color-mix(in srgb, ${m.color} 7%, var(--card))` }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <span style={{ fontFamily: "var(--font-display)", fontWeight: "700", fontSize: "36px", lineHeight: "1", color: m.color }} title={photo.scoreHidden ?? undefined}>
                {photo.score ?? "–"}
              </span>
              <span style={{ display: "flex", flexDirection: "column", gap: "2px", minWidth: "0" }}>
                <span style={{ display: "flex", alignItems: "center", gap: "6px", fontWeight: "600", color: m.color }}>
                  <span aria-hidden="true" style={{ width: "10px", height: "10px", background: m.color, borderRadius: m.radius, clipPath: m.clip, transform: `rotate(${m.rot})` }} />
                  {photo.band}
                </span>
                {photo.score === null && photo.scoreHidden && <span style={{ fontSize: "12px", color: "var(--muted-foreground)" }}>{photo.scoreHidden}</span>}
                <span data-testid="drawer-verdict" style={{ fontSize: "15px", lineHeight: "1.4", color: "var(--foreground)" }}>
                  {plainVerdict(photo.band, photo.reason, photo.hard)}
                </span>
              </span>
            </div>
            {bd && (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <div role="img" aria-label={`Score ${bd.score} of 100: ${bd.parts.map((p) => `${p.short} ${p.pts}`).join(", ")}${bd.adjust ? `, ${bd.adjust.why} ${bd.adjust.pts}` : ""}`} style={{ position: "relative", display: "flex", height: "14px", borderRadius: "7px", overflow: "hidden", background: "repeating-linear-gradient(135deg, color-mix(in srgb, var(--foreground) 8%, transparent) 0 4px, transparent 4px 8px)", border: "1px solid var(--border)" }}>
                  {bd.parts.map((p) => (
                    <span key={p.key} title={`${p.short}: ${p.pts} of ${p.max}`} style={{ width: `${Math.max(0, p.pts)}%`, background: SHADE[p.key], borderRight: p.pts > 0 ? "1px solid var(--card)" : "0" }} />
                  ))}
                  {bd.adjust && bd.adjust.pts < 0 && <span aria-hidden="true" style={{ position: "absolute", top: "0", bottom: "0", left: `${Math.max(0, bd.score)}%`, width: `${Math.min(100, bd.sum) - Math.max(0, bd.score)}%`, background: "repeating-linear-gradient(135deg, color-mix(in srgb, var(--flagged) 70%, transparent) 0 4px, color-mix(in srgb, var(--flagged) 30%, transparent) 4px 8px)" }} />}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "4px 6px", fontSize: "13px", fontVariantNumeric: "tabular-nums" }}>
                  {bd.parts.map((p, i) => (
                    <span key={p.key} style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}>
                      {i > 0 && <span style={{ color: "var(--muted-foreground)" }}>+</span>}
                      <span aria-hidden="true" style={{ width: "10px", height: "10px", borderRadius: "3px", background: SHADE[p.key] }} />
                      <span>{p.short}</span>
                      <b>{p.pts}</b>
                    </span>
                  ))}
                  {bd.adjust && (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", padding: "1px 7px", borderRadius: "6px", background: bd.adjust.pts < 0 ? "color-mix(in srgb, var(--flagged) 14%, var(--card))" : "var(--muted)", color: bd.adjust.pts < 0 ? "var(--flagged)" : "var(--foreground)" }}>
                      {bd.adjust.pts < 0 ? "−" : "+"}
                      <b>{Math.abs(bd.adjust.pts)}</b>
                      <span>{bd.adjust.why}</span>
                    </span>
                  )}
                  <span style={{ color: "var(--muted-foreground)" }}>=</span>
                  <b style={{ color: m.color }}>{bd.score}</b>
                  <span style={{ color: "var(--muted-foreground)" }}>of 100</span>
                </div>
              </div>
            )}
          </section>

          <div role="tablist" aria-label="Evidence details" style={{ display: "flex", gap: "2px", borderBottom: "1px solid var(--border)", overflowX: "auto", flexShrink: "0" }}>
            {TABS.map(([k, label]) => (
              <button key={k} type="button" role="tab" className="focus-ring" aria-selected={tab === k} onClick={() => setTab(k)} style={{ padding: "8px 12px", border: "0", borderBottom: `2px solid ${tab === k ? "var(--primary)" : "transparent"}`, background: "transparent", cursor: "pointer", whiteSpace: "nowrap", color: tab === k ? "var(--foreground)" : "var(--muted-foreground)", fontWeight: tab === k ? "600" : "400" }}>
                {label}
              </button>
            ))}
          </div>
          {tab === "checks" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {groups.map((g) => (
                <section key={g.key} aria-label={g.ask} style={{ display: "flex", flexDirection: "column", borderRadius: "10px", border: "1px solid var(--border)", overflow: "hidden" }}>
                  <header style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 12px", background: "var(--muted)" }}>
                    <span aria-hidden="true" style={{ width: "10px", height: "10px", borderRadius: "3px", background: SHADE[g.key] }} />
                    <span style={{ flex: "1", fontWeight: "600" }}>{g.ask}</span>
                    <span style={{ fontSize: "12px", fontWeight: "600", color: g.answer === "Yes" ? TONE.good : g.answer === "No" && g.tone === "bad" ? TONE.bad : TONE.warn }}>{g.answer}</span>
                    <span style={{ fontSize: "12px", color: "var(--muted-foreground)", fontVariantNumeric: "tabular-nums" }}>{`${g.pts} of ${g.max}`}</span>
                  </header>
                  {g.rows.map((r) => (
                    <div key={r.label} style={{ display: "grid", gridTemplateColumns: "10px minmax(0,1fr) auto", gap: "4px 10px", alignItems: "baseline", padding: "8px 12px", borderTop: "1px solid var(--border)" }}>
                      <span aria-hidden="true" style={{ width: "8px", height: "8px", borderRadius: "4px", alignSelf: "center", background: r.tone === "bad" ? TONE.bad : r.pts >= r.max ? TONE.good : r.pts ? TONE.warn : TONE.neutral }} />
                      <span style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                        <span>{r.label}</span>
                        <span style={{ fontSize: "12px", color: "var(--muted-foreground)" }}>{r.why ?? r.note}</span>
                      </span>
                      <span style={{ whiteSpace: "nowrap", fontWeight: "600", fontVariantNumeric: "tabular-nums", color: r.tone === "bad" ? TONE.bad : r.pts >= r.max ? TONE.good : r.pts ? TONE.warn : TONE.neutral }}>{`${r.pts} of ${r.max}`}</span>
                    </div>
                  ))}
                </section>
              ))}
              {photo.hard.map((h) => (
                <div key={h} role="note" style={{ display: "flex", gap: "8px", alignItems: "center", padding: "8px 12px", borderRadius: "8px", background: "color-mix(in oklch, var(--flagged) 12%, var(--card))", color: "var(--flagged)", fontWeight: "500" }}>
                  <span aria-hidden="true" style={{ width: "10px", height: "10px", clipPath: "polygon(50% 0,100% 100%,0 100%)", background: "var(--flagged)" }} />
                  {`Hard flag: ${h}`}
                </div>
              ))}
            </div>
          )}
          {tab === "facts" && (
            <div style={{ display: "flex", flexDirection: "column" }}>
              {photo.facts.map((f) => (
                <div key={f.k} style={{ display: "flex", justifyContent: "space-between", gap: "12px", padding: "7px 0", borderTop: "1px solid var(--border)" }}>
                  <span style={{ color: "var(--muted-foreground)" }}>{f.k}</span>
                  <span style={{ textAlign: "right", overflowWrap: "anywhere" }}>{f.v}</span>
                </div>
              ))}
            </div>
          )}
          {tab === "history" && (
            <>
              <ol aria-label="Audit timeline" style={{ position: "relative", margin: "0", padding: "0 0 0 4px", listStyle: "none", display: "flex", flexDirection: "column", gap: "14px" }}>
                <span aria-hidden="true" style={{ position: "absolute", left: "8px", top: "8px", bottom: "8px", width: "2px", borderRadius: "1px", background: "color-mix(in srgb, var(--primary) 30%, var(--border))" }} />
                {history.map((h, i) => {
                  const last = i === history.length - 1;
                  return (
                    <li key={`${i}-${h.what}`} style={{ position: "relative", display: "flex", gap: "12px" }}>
                      <span aria-hidden="true" style={{ position: "relative", width: "10px", height: "10px", marginTop: "5px", borderRadius: "5px", background: last ? "var(--primary)" : "var(--card)", border: "2px solid var(--primary)", flexShrink: "0", boxSizing: "border-box" }} />
                      <span style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
                        <span style={{ fontWeight: last ? "600" : "400" }}>{h.what}</span>
                        <span style={{ fontSize: "12px", color: "var(--muted-foreground)" }}>{h.when}</span>
                      </span>
                    </li>
                  );
                })}
              </ol>
              {photo.evidenceHref ? (
                <a href={photo.evidenceHref} style={{ display: "inline-flex", alignSelf: "flex-start", marginTop: "4px", padding: "3px 9px", borderRadius: "7px", background: "color-mix(in oklch, var(--verified) 14%, var(--card))", color: "var(--verified)", fontSize: "12px", fontWeight: "600", textDecoration: "none" }}>
                  History intact
                </a>
              ) : (
                <span style={{ display: "inline-flex", alignSelf: "flex-start", marginTop: "4px", padding: "3px 9px", borderRadius: "7px", background: "color-mix(in oklch, var(--verified) 14%, var(--card))", color: "var(--verified)", fontSize: "12px", fontWeight: "600" }}>History intact</span>
              )}
            </>
          )}
          {tab === "dups" && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "14px", alignItems: "center" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "4px", alignItems: "center" }}>
                <Glyph bits={photo.hash ?? "0".repeat(64)} label="This photo's fingerprint" style={{ width: "90px", height: "90px" }} />
                <span style={{ fontSize: "12px", color: "var(--muted-foreground)" }}>This photo</span>
              </div>
              {near && near.hash && photo.hash && (
                <div style={{ display: "flex", flexDirection: "column", gap: "4px", alignItems: "center" }}>
                  <Glyph bits={photo.hash} diffWith={near.hash} colors={{ hi: "var(--l-destructive)" }} label="Fingerprints overlaid, differing cells in red" style={{ width: "90px", height: "90px" }} />
                  <span style={{ fontSize: "12px", color: "var(--muted-foreground)" }}>Overlaid</span>
                </div>
              )}
              {near && (
                <div style={{ display: "flex", flexDirection: "column", gap: "4px", alignItems: "center" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- signed, face-blurred thumbnail */}
                  <img src={near.src} alt="Closest photo" style={{ width: "120px", height: "90px", objectFit: "cover", borderRadius: "6px" }} />
                  <span style={{ fontSize: "12px", color: "var(--muted-foreground)" }}>Closest match</span>
                </div>
              )}
              <span style={{ flex: "1 1 200px", fontWeight: "600" }}>{near ? (near.cells <= 6 ? `${near.cells} of 64 cells differ. Same photo.` : `Closest photo differs in ${near.cells} of 64 cells. Not a reuse.`) : "No other photo to compare yet."}</span>
            </div>
          )}
          {tab === "credits" &&
            (photo.credit ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "4px", lineHeight: "1.5" }}>
                <a href={photo.credit.page}>{photo.credit.title}</a>
                <span>
                  {photo.credit.author}, {photo.credit.license}
                </span>
                <span style={{ color: "var(--muted-foreground)" }}>{`Wikimedia Commons. Faces blurred on every public copy.${photo.planted ? " Planted fake for the demo." : ""}`}</span>
              </div>
            ) : (
              <span style={{ color: "var(--muted-foreground)" }}>Taken or uploaded by the organisation. Faces blurred on every public copy.</span>
            ))}
        </div>
      </aside>
    </>
  );
}
