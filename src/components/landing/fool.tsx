"use client";

/* eslint-disable @next/next/no-img-element -- a local object URL of the visitor's own file, local samples, signed thumbnails */
import { useEffect, useRef, useState } from "react";
import { Glyph } from "@/components/glyph";
import { BAND_COLOR, BAND_LABEL } from "@/components/trust-meter";
import { reasonLabel } from "@/lib/trust/labels";
import type { ReasonCode, ReasonKind, TrustBand, TrustSignalName } from "@/lib/trust/types";

/**
 * Chapter 8 (L:962-1005, redesigned as a lab): drop a photo, or pick a sample, and it runs through
 * the live pipeline in a 24-hour sandbox (B5.7, POST /api/demo/try; API, limits and sandbox
 * unchanged). While it runs the pipeline's stages light up in order; the answer comes back as
 * the score, the band and each rule's reason in plain words.
 */
interface TryResult {
  id: string;
  score: number | null;
  band: TrustBand | null;
  reasons: Array<{ code: ReasonCode; signal: TrustSignalName; kind: ReasonKind; points: number; sentence: string }>;
  phash: string | null;
  evidenceUrl: string;
  note: string;
}

export interface FoolSample {
  src: string;
  title: string;
  credit: string;
  /** Sent as this file name. */
  name: string;
}

const SIGNAL: Partial<Record<TrustSignalName, string>> = { location: "Where", time: "When", uniqueness: "Is it new?", authenticity: "Watermark or edits", stamp: "Burned-in stamp", quality: "Quality", provenance: "Camera", privacy: "Privacy" };
const STAGES = ["Upload to the sandbox", "Read where and when", "Fingerprint the pixels", "Compare with every demo photo", "Check for watermarks and edits", "Score with the fixed rules"];
const STAGE_MS = 650;

export function FoolChapter({ samples, copy }: { samples: FoolSample[]; copy: { dropHint: string; ledgerHint: string } }) {
  const [state, setState] = useState<{ src: string; pending: boolean; result: TryResult | null; error: string | null } | null>(null);
  const [stage, setStage] = useState(0);
  const [shown, setShown] = useState(0);
  const [over, setOver] = useState(false);
  const objectUrl = useRef<string | null>(null);
  useEffect(() => () => void (objectUrl.current && URL.revokeObjectURL(objectUrl.current)), []);

  // Stages light up in order while the request runs; the last one waits for the answer.
  const pending = !!state?.pending;
  useEffect(() => {
    if (!pending) return;
    const id = window.setInterval(() => setStage((s) => Math.min(STAGES.length - 1, s + 1)), STAGE_MS);
    return () => window.clearInterval(id);
  }, [pending]);

  // The score counts up once the answer is in (instantly under reduced motion).
  const final = state?.result?.score ?? null;
  useEffect(() => {
    if (final === null) return;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    const t0 = performance.now();
    const step = (t: number) => {
      const k = reduce ? 1 : Math.min(1, (t - t0) / 900);
      setShown(Math.round(final * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [final]);

  const analyse = (file: Blob, name: string, preview?: string) => {
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = preview ? null : URL.createObjectURL(file);
    setStage(0);
    setShown(0);
    setState({ src: preview ?? objectUrl.current!, pending: true, result: null, error: null });
    const form = new FormData();
    form.append("file", file, name);
    fetch("/api/demo/try", { method: "POST", body: form })
      .then(async (r) => {
        const body = (await r.json().catch(() => ({}))) as TryResult & { error?: string };
        if (!r.ok) throw new Error(r.status === 429 ? "Too many tries: wait a few minutes." : (body.error ?? `HTTP ${r.status}`));
        return body;
      })
      .then(
        (result) => {
          setStage(STAGES.length);
          setState((s) => s && { ...s, pending: false, result });
        },
        (e: unknown) => setState((s) => s && { ...s, pending: false, error: e instanceof Error ? e.message : String(e) }),
      );
  };
  const pick = (s: FoolSample) => {
    void fetch(s.src)
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(String(r.status)))))
      .then(
        (b) => analyse(b, s.name, s.src),
        () => setState({ src: s.src, pending: false, result: null, error: "That sample couldn't be loaded. Try another." }),
      );
  };

  const r = state?.result;
  const headline = r ? (r.reasons.find((x) => x.kind === "hard") ?? r.reasons.find((x) => x.kind === "review") ?? r.reasons.find((x) => x.kind === "points" && x.points <= 0)) : null;
  const rows = r ? r.reasons.filter((x) => x.kind !== "info" && x.code !== "HARD_FLAG_CAP") : [];
  const cap = r?.reasons.find((x) => x.code === "HARD_FLAG_CAP");
  const busy = !!state?.pending;
  return (
    <section id="ch8" className="night" data-night="" data-screen-label="08 Try to fool it" style={{ position: "relative", zIndex: "2", background: "var(--background)", color: "var(--foreground)", padding: "clamp(72px,11vh,120px) clamp(20px,5vw,72px)", overflow: "hidden" }}>
      <div aria-hidden="true" data-dust="" style={{ position: "absolute", inset: "0", opacity: "0.6", pointerEvents: "none" }} />
      <div aria-hidden="true" style={{ position: "absolute", left: "50%", top: "40%", width: "min(1100px,120vw)", height: "min(700px,90vw)", transform: "translate(-50%,-50%)", background: "radial-gradient(closest-side, color-mix(in srgb, var(--primary) 22%, transparent), transparent)", pointerEvents: "none" }} />
      <div style={{ position: "relative", maxWidth: "1240px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "clamp(20px,3.5vh,36px)" }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: "12px 40px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px", maxWidth: "640px" }}>
            <span style={{ alignSelf: "flex-start", padding: "3px 10px", borderRadius: "999px", border: "1px solid var(--primary)", color: "var(--code-ink)", fontSize: "12px", fontWeight: "600", letterSpacing: "0.04em" }}>The lab · a sandbox deleted within a day</span>
            <h2 style={{ margin: "0", fontFamily: "var(--font-display)", fontWeight: "700", fontStretch: "92%", fontSize: "clamp(38px,5vw,80px)", lineHeight: "0.95", letterSpacing: "-0.02em" }}>Try to fool it.</h2>
          </div>
          <p style={{ margin: "0", maxWidth: "440px", fontSize: "clamp(15px,1.3vw,17px)", lineHeight: "1.5", color: "var(--muted-foreground)" }}>Drop any photo from the internet, or pick one below. It runs through the same rules as the demo and comes back with its ledger.</p>
        </div>
        <div className="c8-layout">
          <div style={{ display: "flex", flexDirection: "column", gap: "14px", minWidth: "0" }}>
            <label
              className="c8-drop"
              onDragOver={(e) => {
                e.preventDefault();
                setOver(true);
              }}
              onDragLeave={() => setOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setOver(false);
                const f = e.dataTransfer.files?.[0];
                if (f && !busy) analyse(f, f.name);
              }}
              data-over={over ? "" : undefined}
              style={{ position: "relative", display: "flex", flexDirection: "column", gap: "8px", alignItems: "center", justifyContent: "center", textAlign: "center", minHeight: "clamp(170px,24vh,240px)", padding: "22px", borderRadius: "18px", border: `2px dashed ${over ? "var(--primary)" : "color-mix(in srgb, var(--primary) 55%, var(--border))"}`, background: over ? "color-mix(in srgb, var(--primary) 18%, var(--card))" : "color-mix(in srgb, var(--card) 85%, transparent)", cursor: busy ? "progress" : "pointer", transition: "background var(--dur-ui), border-color var(--dur-ui)" }}
            >
              <span aria-hidden="true" style={{ width: "54px", height: "54px", borderRadius: "16px", display: "flex", alignItems: "center", justifyContent: "center", background: "color-mix(in srgb, var(--primary) 22%, transparent)", color: "var(--code-ink)", fontSize: "26px" }}>
                ⇪
              </span>
              <span style={{ fontWeight: "700", fontSize: "18px" }}>{busy ? "Running…" : "Drop a photo here"}</span>
              <span style={{ fontSize: "13px", color: "var(--muted-foreground)", maxWidth: "340px" }}>{copy.dropHint}</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={busy}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) analyse(f, f.name);
                  e.target.value = "";
                }}
                aria-label="Choose a photo to test"
                style={{ position: "absolute", width: "1px", height: "1px", opacity: "0" }}
              />
            </label>
            {samples.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <span style={{ fontSize: "12px", fontWeight: "600", color: "var(--muted-foreground)" }}>Or try one of these:</span>
                <div style={{ display: "grid", gridTemplateColumns: `repeat(${samples.length}, minmax(0,1fr))`, gap: "8px" }}>
                  {samples.map((s) => (
                    <button key={s.src} type="button" className="focus-ring" disabled={busy} onClick={() => pick(s)} style={{ display: "flex", flexDirection: "column", gap: "6px", padding: "6px", borderRadius: "12px", border: "1px solid var(--border)", background: "var(--card)", color: "var(--foreground)", cursor: busy ? "progress" : "pointer", textAlign: "left" }}>
                      <img src={s.src} alt="" loading="lazy" style={{ width: "100%", aspectRatio: "4/3", objectFit: "cover", borderRadius: "8px", display: "block" }} />
                      <span style={{ fontSize: "12px", fontWeight: "600", lineHeight: "1.3" }}>{s.title}</span>
                      <span style={{ fontSize: "10px", color: "var(--muted-foreground)", lineHeight: "1.3" }}>{s.credit}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div aria-live="polite" style={{ minWidth: "0", display: "flex", flexDirection: "column", gap: "14px", padding: "18px", borderRadius: "18px", background: "var(--card)", border: "1px solid var(--border)", boxShadow: "0 30px 90px color-mix(in srgb, var(--ink-black) 50%, transparent)" }}>
            <ol aria-label="Pipeline stages" style={{ margin: "0", padding: "0", listStyle: "none", display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(170px,1fr))", gap: "6px" }}>
              {STAGES.map((t, i) => {
                const done = !!state && (stage > i || !!r);
                const now = !!state && busy && stage === i;
                return (
                  <li key={t} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "7px 9px", borderRadius: "9px", fontSize: "12px", background: now ? "color-mix(in srgb, var(--primary) 20%, transparent)" : "var(--muted)", border: `1px solid ${now ? "var(--primary)" : "transparent"}`, color: done || now ? "var(--foreground)" : "var(--muted-foreground)", transition: "background var(--dur-ui), border-color var(--dur-ui), color var(--dur-ui)" }}>
                    <span aria-hidden="true" className={now ? "c8-spin" : undefined} style={{ flexShrink: "0", width: "16px", height: "16px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "10px", fontWeight: "700", border: now ? "2px solid var(--primary)" : "none", borderTopColor: now ? "transparent" : undefined, background: done ? "var(--verified)" : now ? "transparent" : "var(--border)", color: "var(--l-card)" }}>
                      {done ? "✓" : ""}
                    </span>
                    {t}
                  </li>
                );
              })}
            </ol>
            {state ? (
              <>
                <div style={{ display: "flex", gap: "14px", alignItems: "center" }}>
                  <img src={state.src} alt="The photo you are testing" style={{ width: "120px", height: "90px", objectFit: "cover", borderRadius: "10px", background: "var(--background)", flexShrink: "0" }} />
                  <div style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "4px" }}>
                    {r?.band ? (
                      <span style={{ display: "flex", alignItems: "baseline", gap: "10px" }}>
                        <span style={{ fontFamily: "var(--font-display)", fontWeight: "700", fontSize: "48px", lineHeight: "1", color: BAND_COLOR[r.band], fontVariantNumeric: "tabular-nums" }}>{shown}</span>
                        <span style={{ fontWeight: "700", fontSize: "18px", color: BAND_COLOR[r.band] }}>{BAND_LABEL[r.band]}</span>
                      </span>
                    ) : (
                      <span style={{ fontWeight: "600", fontSize: "15px", color: state.error ? "var(--flagged)" : "var(--muted-foreground)" }}>{state.error ?? `${STAGES[Math.min(stage, STAGES.length - 1)]}…`}</span>
                    )}
                    <span style={{ fontSize: "14px", lineHeight: "1.4" }}>{headline ? headline.sentence : r ? "Every check passed." : ""}</span>
                  </div>
                  {r?.phash && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "4px", alignItems: "center", flexShrink: "0" }}>
                      <Glyph hex={r.phash} size={60} label="Fingerprint of your photo" variant="night" />
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--muted-foreground)" }}>fingerprint</span>
                    </div>
                  )}
                </div>
                {r && (
                  <>
                    <div style={{ display: "flex", flexDirection: "column", fontSize: "13px" }}>
                      {rows.map((x, i) => {
                        const tone = x.kind === "hard" ? "var(--flagged)" : x.kind === "review" ? "var(--review)" : x.points > 0 ? "var(--verified)" : "var(--muted-foreground)";
                        return (
                          <div key={x.code} className="c8-row" style={{ display: "grid", gridTemplateColumns: "minmax(90px,0.35fr) 1fr auto", gap: "10px", alignItems: "baseline", padding: "8px 0", borderTop: "1px solid var(--border)", animationDelay: `${i * 70}ms` }}>
                            <span style={{ fontWeight: "600" }}>{SIGNAL[x.signal] ?? reasonLabel(x.code)}</span>
                            <span style={{ color: "var(--muted-foreground)", lineHeight: "1.4" }}>{x.sentence}</span>
                            <span style={{ fontWeight: "700", color: tone, whiteSpace: "nowrap" }}>{x.kind === "hard" ? "flag" : x.kind === "review" ? "review" : x.points > 0 ? `+${x.points}` : x.points < 0 ? `−${-x.points}` : "0"}</span>
                          </div>
                        );
                      })}
                      {cap && (
                        <div className="c8-row" style={{ display: "grid", gridTemplateColumns: "minmax(90px,0.35fr) 1fr auto", gap: "10px", alignItems: "baseline", padding: "8px 0", borderTop: "1px solid var(--border)", color: "var(--flagged)" }}>
                          <span style={{ fontWeight: "600" }}>Capped</span>
                          <span>A hard flag caps the score at 40.</span>
                          <span style={{ fontWeight: "700" }}>{`−${-cap.points}`}</span>
                        </div>
                      )}
                    </div>
                    <span style={{ fontSize: "12px", color: "var(--muted-foreground)", lineHeight: "1.45" }}>
                      {r.note}{" "}
                      <a href={r.evidenceUrl} style={{ color: "var(--code-ink)" }}>
                        See its evidence page
                      </a>
                    </span>
                  </>
                )}
              </>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "12px 4px", color: "var(--muted-foreground)", fontSize: "14px", lineHeight: "1.5" }}>
                <span style={{ fontWeight: "600", color: "var(--foreground)", fontSize: "16px" }}>Its ledger appears here.</span>
                <span>{copy.ledgerHint}</span>
                <span>A photo found online has no proof of where or when it was taken, so the best it can do is Needs review. A copy of a demo photo is caught by its fingerprint.</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
