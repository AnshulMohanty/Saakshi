"use client";

/* eslint-disable @next/next/no-img-element -- a local object URL of the visitor's own file */
import { useEffect, useRef, useState } from "react";
import { Glyph } from "@/components/glyph";
import { BAND_COLOR, BAND_LABEL } from "@/components/trust-meter";
import { reasonLabel, ruleChips } from "@/lib/trust/labels";
import type { ReasonCode, ReasonKind, TrustBand, TrustSignalName } from "@/lib/trust/types";

/**
 * Chapter 8 (L:962-1005, P1): drop any photo and it runs through the live pipeline in a 24-hour
 * sandbox (B5.7, POST /api/demo/try), coming back with its score, band, fingerprint and ledger.
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

const SIGNAL: Partial<Record<TrustSignalName, string>> = { location: "Location", time: "Time", uniqueness: "Fingerprint", authenticity: "Watermark or edits", stamp: "Stamp", quality: "Quality", provenance: "Camera", privacy: "Privacy" };
const TONE = { good: "var(--verified)", neutral: "var(--muted-foreground)", warn: "var(--review)", bad: "var(--flagged)" } as const;

export function FoolChapter({ sampleUrl, copy }: { sampleUrl: string | null; copy: { dropHint: string; ledgerHint: string } }) {
  const [state, setState] = useState<{ src: string; pending: boolean; result: TryResult | null; error: string | null } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const objectUrl = useRef<string | null>(null);
  useEffect(() => () => void (objectUrl.current && URL.revokeObjectURL(objectUrl.current)), []);

  const analyse = (file: Blob, name: string) => {
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = URL.createObjectURL(file);
    setState({ src: objectUrl.current, pending: true, result: null, error: null });
    const form = new FormData();
    form.append("file", file, name);
    fetch("/api/demo/try", { method: "POST", body: form })
      .then(async (r) => {
        const body = (await r.json().catch(() => ({}))) as TryResult & { error?: string };
        if (!r.ok) throw new Error(r.status === 429 ? "Too many tries: wait a few minutes." : (body.error ?? `HTTP ${r.status}`));
        return body;
      })
      .then(
        (result) => setState((s) => s && { ...s, pending: false, result }),
        (e: unknown) => setState((s) => s && { ...s, pending: false, error: e instanceof Error ? e.message : String(e) }),
      );
  };
  const trySample = () => {
    if (!sampleUrl) return;
    void fetch(sampleUrl)
      .then((r) => r.blob())
      .then((b) => analyse(b, "photo-from-the-internet.jpg"));
  };

  const r = state?.result;
  const chips = r ? ruleChips(r.reasons) : [];
  const headline = r ? (r.reasons.find((x) => x.kind === "hard") ?? r.reasons.find((x) => x.kind === "review") ?? r.reasons.find((x) => x.kind === "points" && x.points <= 0)) : null;
  return (
    <section id="ch8" data-screen-label="08 Try to fool it" style={{ position: "relative", zIndex: "2", background: "var(--background)", padding: "clamp(80px,14vh,140px) clamp(20px,5vw,72px)" }}>
      <div style={{ maxWidth: "1200px", margin: "0 auto", display: "flex", flexWrap: "wrap", gap: "clamp(28px,5vw,72px)", alignItems: "flex-start" }}>
        <div style={{ flex: "1 1 300px", maxWidth: "440px", display: "flex", flexDirection: "column", gap: "14px" }}>
          <h2 style={{ margin: "0", fontFamily: "var(--font-display)", fontWeight: "700", fontStretch: "92%", fontSize: "clamp(34px,4.4vw,68px)", lineHeight: "0.95", letterSpacing: "-0.02em" }}>Try to fool it.</h2>
          <p style={{ margin: "0", fontSize: "16px", lineHeight: "1.55", color: "var(--muted-foreground)" }}>Drop any photo from the internet. It runs through the same rules as the demo and comes back with its ledger.</p>
          <label
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files?.[0];
              if (f) analyse(f, f.name);
            }}
            style={{ position: "relative", display: "flex", flexDirection: "column", gap: "6px", alignItems: "center", justifyContent: "center", textAlign: "center", minHeight: "170px", padding: "20px", borderRadius: "12px", border: "1.5px dashed var(--neutral-dot)", background: "var(--card)", cursor: "pointer" }}
          >
            <span style={{ fontWeight: "600" }}>Drop a photo here</span>
            <span style={{ fontSize: "13px", color: "var(--muted-foreground)" }}>{copy.dropHint}</span>
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) analyse(f, f.name);
              }}
              style={{ position: "absolute", width: "1px", height: "1px", opacity: "0" }}
            />
          </label>
          {sampleUrl && (
            <button type="button" onClick={trySample} style={{ alignSelf: "flex-start", padding: "10px 14px", borderRadius: "9px", border: "1px solid var(--border)", background: "var(--card)", cursor: "pointer", fontSize: "14px" }}>
              Use a photo from the internet for me
            </button>
          )}
        </div>
        <div aria-live="polite" style={{ flex: "1 1 380px", minWidth: "0", maxWidth: "560px", display: "flex", flexDirection: "column", gap: "14px", padding: "18px", borderRadius: "12px", background: "var(--card)", border: "1px solid var(--border)" }}>
          {state ? (
            <>
              <div style={{ display: "flex", gap: "14px", alignItems: "center" }}>
                <img src={state.src} alt="Your photo" style={{ width: "110px", height: "82px", objectFit: "cover", borderRadius: "8px", background: "var(--background)" }} />
                <div style={{ flex: "1", display: "flex", flexDirection: "column", gap: "4px" }}>
                  {r?.band ? (
                    <span style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
                      <span style={{ fontFamily: "var(--font-display)", fontWeight: "700", fontSize: "40px", lineHeight: "1", color: BAND_COLOR[r.band] }}>{r.score}</span>
                      <span style={{ fontWeight: "600", color: BAND_COLOR[r.band] }}>{BAND_LABEL[r.band]}</span>
                    </span>
                  ) : (
                    <span style={{ fontWeight: "600", fontSize: "15px", color: state.error ? "var(--flagged)" : "var(--muted-foreground)" }}>{state.error ?? "Checking: upload, fingerprint, rules…"}</span>
                  )}
                  <span style={{ fontSize: "13px", color: "var(--muted-foreground)" }}>{headline ? reasonLabel(headline.code) : r ? "Every check passed." : ""}</span>
                </div>
                {r?.phash && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px", alignItems: "center" }}>
                    <Glyph hex={r.phash} size={64} label="Fingerprint of your photo" />
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--muted-foreground)" }}>{r.phash}</span>
                  </div>
                )}
              </div>
              {r && (
                <>
                  <div style={{ display: "flex", flexDirection: "column", fontSize: "13px" }}>
                    {chips.map((c) => {
                      const reason = r.reasons.find((x) => x.code === c.code)!;
                      return (
                        <div key={c.code} style={{ display: "flex", justifyContent: "space-between", gap: "12px", padding: "7px 0", borderTop: "1px solid var(--secondary)" }}>
                          <span>{SIGNAL[reason.signal] ?? reasonLabel(c.code)}</span>
                          <span title={reason.sentence} style={{ color: TONE[c.tone], textAlign: "right" }}>
                            {c.text}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <span style={{ fontSize: "12px", color: "var(--muted-foreground)", lineHeight: "1.45" }}>
                    {r.note}{" "}
                    <a href={r.evidenceUrl}>See its evidence page</a>
                  </span>
                </>
              )}
            </>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", color: "var(--muted-foreground)", fontSize: "14px", lineHeight: "1.5" }}>
              <span style={{ fontWeight: "600", color: "var(--foreground)" }}>Its ledger appears here.</span>
              <span>{copy.ledgerHint}</span>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
