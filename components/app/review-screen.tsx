"use client";

import gsap from "gsap";
import { useCallback, useEffect, useRef, useState } from "react";
import { Glyph } from "@/components/glyph";
import { bandMark } from "./marks";
import type { AppPhoto } from "./types";

export type Decision = { kind: "approved" | "rejected"; note: string };

const TONE_DOT = { bad: "var(--flagged)", good: "var(--verified)", warn: "var(--review)", neutral: "var(--review)" } as const;

/** The review queue's order (AP:913-916): photos that wait, flagged first. */
export function reviewQueue(photos: AppPhoto[], decisions: Record<string, Decision>): AppPhoto[] {
  return photos.filter((p) => p.queue && !decisions[p.id]).sort((a, b) => (a.band === "Flagged" ? 0 : 1) - (b.band === "Flagged" ? 0 : 1));
}

/**
 * The review screen (AP:553-621): the queue and what's been decided; the current photo (and the
 * original it copies, with both fingerprints and their difference), the rule strip, the score
 * card with the reason and a required note, Approve (A) and Reject (R). Approving seals the strip
 * (AP:936-943), rejecting greys the photo out and slides it away (AP:944-946).
 */
export function ReviewScreen({ photos, decisions, onDecide, blocked }: { photos: AppPhoto[]; decisions: Record<string, Decision>; onDecide: (p: AppPhoto, d: Decision) => Promise<void>; blocked: boolean }) {
  const [qi, setQi] = useState(0);
  const [note, setNote] = useState("");
  const [noteError, setNoteError] = useState(false);
  const busy = useRef(false);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const q = reviewQueue(photos, decisions);
  const i = Math.min(qi, Math.max(0, q.length - 1));
  const cur = q[i] ?? null;
  const decided = Object.entries(decisions).map(([id, d]) => ({ p: photos.find((x) => x.id === id), d })).filter((x): x is { p: AppPhoto; d: Decision } => !!x.p);

  const decide = useCallback(
    (kind: Decision["kind"]) => {
      if (!cur || busy.current) return;
      if (!note.trim()) {
        setNoteError(true);
        const t = noteRef.current;
        if (t) {
          t.focus();
          gsap.fromTo(t, { x: -6 }, { x: 0, duration: 0.4, ease: "elastic.out(1,0.35)" });
        }
        return;
      }
      busy.current = true;
      const d: Decision = { kind, note };
      const anim = new Promise<void>((resolve) => {
        if (kind === "approved") {
          gsap
            .timeline({ onComplete: resolve })
            .to("#rv-strip", { scale: 0.97, duration: 0.09, ease: "power2.out" })
            .to("#rv-seal", { scaleX: 1, duration: 0.28, ease: "expo.out" }, "<")
            .to("#rv-strip", { scale: 1, duration: 0.35, ease: "back.out(2.2)" })
            .to("#rv-sealed", { opacity: 1, duration: 0.15 }, "<")
            .to({}, { duration: 0.35 });
          try {
            if (navigator.userActivation?.hasBeenActive) navigator.vibrate?.(12);
          } catch {
            // not supported
          }
        } else gsap.timeline({ onComplete: resolve }).to("#rv-photo", { filter: "grayscale(1)", duration: 0.25 }).to("#rv-photo", { x: 60, opacity: 0.3, scale: 0.94, duration: 0.35, ease: "power3.in" });
      });
      void Promise.all([anim, onDecide(cur, d)]).finally(() => {
        busy.current = false;
        setNote("");
        setNoteError(false);
        setQi((x) => Math.min(x, Math.max(0, q.length - 2)));
        gsap.set(["#rv-seal", "#rv-sealed", "#rv-strip", "#rv-photo"], { clearProps: "all" });
      });
    },
    [cur, note, onDecide, q.length],
  );

  // AP:918-930: J/K move, A approves, R rejects (not while typing or with a dialog open).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (document.activeElement as HTMLElement | null)?.tagName ?? "";
      if (e.metaKey || e.ctrlKey || tag === "INPUT" || tag === "TEXTAREA" || blocked) return;
      const k = e.key.toLowerCase();
      if (k === "j") {
        setQi((x) => Math.min(q.length - 1, x + 1));
        setNoteError(false);
      } else if (k === "k") {
        setQi((x) => Math.max(0, x - 1));
        setNoteError(false);
      } else if (k === "a") {
        e.preventDefault();
        decide("approved");
      } else if (k === "r") {
        e.preventDefault();
        decide("rejected");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [decide, q.length, blocked]);

  const m = cur ? bandMark(cur.band) : null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "16px", alignItems: "flex-start" }}>
      <div style={{ flex: "0 1 250px", minWidth: "200px", display: "flex", flexDirection: "column", gap: "6px" }}>
        <span style={{ fontSize: "12px", color: "var(--muted-foreground)" }}>{`${q.length} waiting, flagged first`}</span>
        {q.map((p, k) => (
          <button
            key={p.id}
            type="button"
            onClick={() => {
              setQi(k);
              setNoteError(false);
            }}
            style={{ display: "flex", gap: "10px", alignItems: "center", padding: "8px", borderRadius: "var(--radius)", border: `1px solid ${k === i ? "var(--primary)" : "var(--border)"}`, background: k === i ? "var(--card)" : "transparent", cursor: "pointer", textAlign: "left" }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- signed, face-blurred thumbnail */}
            <img loading="lazy" src={p.src} alt="" style={{ width: "52px", height: "40px", objectFit: "cover", borderRadius: "6px", flexShrink: "0" }} />
            <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "1px" }}>
              <span style={{ fontSize: "12px", fontWeight: "600", color: bandMark(p.band).color }}>
                {p.band}, {p.score ?? p.scoreHidden ?? "–"}
              </span>
              <span style={{ fontSize: "12px", color: "var(--muted-foreground)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.reason}</span>
            </span>
          </button>
        ))}
        {q.length === 0 && <div style={{ padding: "14px", borderRadius: "var(--radius)", border: "1px dashed var(--border)", color: "var(--muted-foreground)" }}>Queue clear. Every photo has a decision and a note.</div>}
        {decided.length > 0 && (
          <>
            <span style={{ marginTop: "10px", fontSize: "12px", color: "var(--muted-foreground)" }}>Decided</span>
            {decided.map(({ p, d }) => (
              <div key={p.id} style={{ display: "flex", gap: "10px", alignItems: "center", padding: "6px 8px", borderRadius: "8px", fontSize: "12px", color: "var(--muted-foreground)" }}>
                {/* eslint-disable-next-line @next/next/no-img-element -- signed, face-blurred thumbnail */}
                <img loading="lazy" src={p.src} alt="" style={{ width: "40px", height: "30px", objectFit: "cover", borderRadius: "4px", filter: d.kind === "rejected" ? "grayscale(1)" : "none" }} />
                <span>{`${d.kind === "approved" ? "Approved: " : "Rejected: "}${d.note}`}</span>
              </div>
            ))}
          </>
        )}
      </div>
      {cur && m && (
        <div style={{ flex: "1 1 380px", minWidth: "0", display: "flex", flexDirection: "column", gap: "12px" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
            <figure style={{ margin: "0", flex: "1 1 280px", minWidth: "0", display: "flex", flexDirection: "column", gap: "6px" }}>
              <div id="rv-photo" style={{ position: "relative", aspectRatio: "4/3", borderRadius: "12px", overflow: "hidden", background: "var(--muted)" }}>
                {/* eslint-disable-next-line @next/next/no-img-element -- signed, face-blurred preview */}
                <img src={cur.preview} alt={cur.title} fetchPriority="high" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                {cur.overlay === "watermark" && (
                  <div aria-hidden="true" style={{ position: "absolute", inset: "-20%", display: "flex", flexWrap: "wrap", gap: "18px 30px", alignContent: "center", justifyContent: "center", transform: "rotate(-24deg)", fontWeight: "600", fontSize: "22px", color: "color-mix(in srgb, var(--l-card) 45%, transparent)" }}>
                    {Array.from({ length: 9 }, (_, k) => (
                      <span key={k}>stockpix</span>
                    ))}
                  </div>
                )}
                {cur.overlay === "stamp" && (
                  <div style={{ position: "absolute", left: "10px", bottom: "10px", padding: "6px 8px", borderRadius: "4px", background: "color-mix(in srgb, var(--ink-black) 62%, transparent)", color: "var(--l-card)", fontFamily: "var(--font-mono)", fontSize: "11px", lineHeight: "1.35" }}>
                    New Delhi, Delhi
                    <br />
                    28.6139° N 77.2090° E
                  </div>
                )}
              </div>
              <figcaption style={{ fontSize: "12px", color: "var(--muted-foreground)" }}>{cur.credit ? `${cur.credit.title.replace(/\.(jpe?g|png)$/i, "")}, ${cur.credit.author}` : cur.title}</figcaption>
            </figure>
            {cur.dup && (
              <figure style={{ margin: "0", flex: "1 1 280px", minWidth: "0", display: "flex", flexDirection: "column", gap: "6px" }}>
                <div style={{ position: "relative", aspectRatio: "4/3", borderRadius: "12px", overflow: "hidden", background: "var(--muted)" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- signed, face-blurred preview */}
                  <img src={cur.dup.src} alt="The original photo" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                </div>
                <figcaption style={{ fontSize: "12px", color: "var(--muted-foreground)" }}>{cur.dup.caption}</figcaption>
              </figure>
            )}
          </div>
          {cur.dup && cur.hash && cur.dup.hash && (
            <div style={{ display: "flex", gap: "14px", alignItems: "center", padding: "12px", borderRadius: "12px", background: "var(--card)", border: "1px solid var(--border)" }}>
              <Glyph bits={cur.hash} label="Fingerprint of this photo" style={{ width: "64px", height: "64px" }} />
              <Glyph bits={cur.hash} diffWith={cur.dup.hash} colors={{ hi: "var(--l-destructive)" }} label="Both fingerprints overlaid, differing cells in red" style={{ width: "64px", height: "64px" }} />
              <Glyph bits={cur.dup.hash} label="Fingerprint of the original" style={{ width: "64px", height: "64px" }} />
              <span style={{ fontWeight: "600" }}>{cur.dup.text}</span>
            </div>
          )}
          <div id="rv-strip" style={{ position: "relative", display: "flex", flexWrap: "wrap", gap: "6px", padding: "10px", borderRadius: "12px", background: "var(--card)", border: "1px solid var(--border)", overflow: "hidden" }}>
            <div id="rv-seal" aria-hidden="true" style={{ position: "absolute", inset: "0", background: "color-mix(in oklch, var(--verified) 16%, var(--card))", transform: "scaleX(0)", transformOrigin: "0 50%" }} />
            {cur.rows.map((r) => (
              <span key={r.label} style={{ position: "relative", display: "flex", alignItems: "center", gap: "6px", padding: "4px 8px", borderRadius: "6px", background: "var(--muted)", fontSize: "12px" }}>
                <span style={{ width: "6px", height: "6px", borderRadius: "3px", background: r.tone === "bad" ? "var(--flagged)" : r.pts === r.max ? "var(--verified)" : TONE_DOT[r.tone] }} />
                {/* The prototype wraps each value: three flex items, so the gap shows before the comma. */}
                <span>{r.label}</span>, <span>{r.pts}</span>
              </span>
            ))}
            <span id="rv-sealed" style={{ position: "relative", marginLeft: "auto", alignSelf: "center", fontWeight: "600", color: "var(--verified)", opacity: "0" }}>
              Sealed
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px", padding: "14px", borderRadius: "12px", background: "var(--card)", border: "1px solid var(--border)" }}>
            <span style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
              <span style={{ fontFamily: "var(--font-display)", fontWeight: "700", fontSize: "40px", lineHeight: "1", color: m.color }}>{cur.score ?? "–"}</span>
              <span style={{ fontWeight: "600", color: m.color }}>{cur.band}</span>
            </span>
            <span style={{ lineHeight: "1.45" }}>{cur.reason}</span>
            <label style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              <span style={{ fontSize: "12px", fontWeight: "600" }}>Note, required</span>
              <textarea
                ref={noteRef}
                id="rv-note"
                value={note}
                onChange={(e) => {
                  setNote(e.target.value);
                  setNoteError(false);
                }}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                    e.preventDefault();
                    decide("approved");
                  }
                }}
                rows={3}
                placeholder="What you checked, for the audit trail"
                aria-invalid={noteError}
                style={{ resize: "vertical", padding: "8px", borderRadius: "8px", border: `1px solid ${noteError ? "var(--flagged)" : "var(--border)"}`, background: "var(--background)" }}
              />
              {noteError && (
                <span role="alert" style={{ fontSize: "12px", color: "var(--flagged)" }}>
                  Add a note so the decision can be audited.
                </span>
              )}
            </label>
            <div style={{ display: "flex", gap: "8px" }}>
              <button type="button" onClick={() => decide("approved")} style={{ flex: "1", display: "flex", justifyContent: "center", gap: "8px", padding: "10px", borderRadius: "9px", border: "0", background: "var(--verified)", color: "var(--card)", cursor: "pointer", fontWeight: "600" }}>
                {"Approve "}
                <kbd style={{ fontFamily: "var(--font-mono)", opacity: "0.8" }}>A</kbd>
              </button>
              <button type="button" onClick={() => decide("rejected")} style={{ flex: "1", display: "flex", justifyContent: "center", gap: "8px", padding: "10px", borderRadius: "9px", border: "1px solid var(--flagged)", background: "transparent", color: "var(--flagged)", cursor: "pointer", fontWeight: "600" }}>
                {"Reject "}
                <kbd style={{ fontFamily: "var(--font-mono)", opacity: "0.8" }}>R</kbd>
              </button>
            </div>
            <span style={{ fontSize: "12px", color: "var(--muted-foreground)" }}>J and K move through the queue. ⌘ Enter approves from the note.</span>
          </div>
        </div>
      )}
    </div>
  );
}
