"use client";

import gsap from "gsap";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
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
 * From 1024 px wide it is one screen with no page scroll (queue | photo | decision; a column
 * scrolls on its own if it must) and the actions sit in a bar that never leaves the view; narrower,
 * it stacks and the bar sticks to the bottom. J/K or the arrow keys move, A approves, R rejects.
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

  const move = useCallback(
    (d: number) => {
      setQi((x) => Math.max(0, Math.min(q.length - 1, Math.min(x, Math.max(0, q.length - 1)) + d)));
      setNoteError(false);
    },
    [q.length],
  );

  // AP:918-930: J/K (or the arrow keys) move, A approves, R rejects (not while typing or with a dialog open).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (document.activeElement as HTMLElement | null)?.tagName ?? "";
      if (e.metaKey || e.ctrlKey || e.altKey || tag === "INPUT" || tag === "TEXTAREA" || blocked) return;
      const k = e.key.toLowerCase();
      if (k === "j" || k === "arrowdown" || k === "arrowright") {
        e.preventDefault();
        move(1);
      } else if (k === "k" || k === "arrowup" || k === "arrowleft") {
        e.preventDefault();
        move(-1);
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
  }, [decide, move, blocked]);

  // Keep the current photo in sight in the queue.
  useEffect(() => {
    document.querySelector(`[data-rv-item="${i}"]`)?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [i]);

  const m = cur ? bandMark(cur.band) : null;
  const full = cur ? cur.rows.filter((r) => r.pts === r.max).length : 0;
  const badge = { position: "absolute", left: "10px", top: "10px", padding: "3px 8px", borderRadius: "6px", background: "color-mix(in srgb, var(--card) 88%, transparent)", fontSize: "12px", fontWeight: "600" } as const;
  const cap = { fontSize: "12px", color: "var(--muted-foreground)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } as const;
  return (
    <div className="rv-layout">
      <div className="rv-queue" role="group" aria-label="Review queue">
        <span className="rv-qhead" style={{ fontSize: "12px", color: "var(--muted-foreground)" }}>{`${q.length} waiting, flagged first`}</span>
        {q.map((p, k) => (
          <button
            key={p.id}
            type="button"
            data-rv-item={k}
            className="focus-ring rv-item"
            aria-current={k === i ? "true" : undefined}
            onClick={() => {
              setQi(k);
              setNoteError(false);
            }}
            style={{ display: "flex", gap: "10px", alignItems: "center", padding: "7px", borderRadius: "var(--radius)", border: `1px solid ${k === i ? "var(--primary)" : "var(--border)"}`, background: k === i ? "color-mix(in srgb, var(--primary) 8%, var(--card))" : "transparent", boxShadow: k === i ? "inset 3px 0 0 var(--primary)" : "none", cursor: "pointer", textAlign: "left", transition: "background var(--dur-ui), border-color var(--dur-ui)" }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- signed, face-blurred thumbnail */}
            <img loading="lazy" src={p.src} alt="" style={{ width: "52px", height: "40px", objectFit: "cover", borderRadius: "6px", flexShrink: "0" }} />
            <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "1px" }}>
              <span style={{ fontSize: "12px", fontWeight: "600", color: bandMark(p.band).color }}>
                {p.band}, {p.score ?? p.scoreHidden ?? "–"}
              </span>
              <span style={cap}>{p.reason}</span>
            </span>
          </button>
        ))}
        {q.length === 0 && <div style={{ padding: "14px", borderRadius: "var(--radius)", border: "1px dashed var(--border)", color: "var(--muted-foreground)" }}>Queue clear. Every photo has a decision and a note.</div>}
        {decided.length > 0 && (
          <div className="rv-decided" style={{ flexDirection: "column", gap: "2px" }}>
            <span style={{ marginTop: "10px", fontSize: "12px", color: "var(--muted-foreground)" }}>Decided</span>
            {decided.map(({ p, d }) => (
              <div key={p.id} style={{ display: "flex", gap: "10px", alignItems: "center", padding: "6px 8px", borderRadius: "8px", fontSize: "12px", color: "var(--muted-foreground)" }}>
                {/* eslint-disable-next-line @next/next/no-img-element -- signed, face-blurred thumbnail */}
                <img loading="lazy" src={p.src} alt="" style={{ width: "40px", height: "30px", objectFit: "cover", borderRadius: "4px", filter: d.kind === "rejected" ? "grayscale(1)" : "none" }} />
                <span>{`${d.kind === "approved" ? "Approved: " : "Rejected: "}${d.note}`}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      {cur && m && (
        <>
          <div className="rv-stage">
            <div className="rv-photos">
              <figure className="rv-fig">
                <div id="rv-photo" className="rv-frame">
                  {/* The same copy, blurred, fills the letterbox (no extra request). */}
                  {/* eslint-disable-next-line @next/next/no-img-element -- signed, face-blurred preview */}
                  <img src={cur.preview} alt="" aria-hidden="true" className="rv-backdrop" />
                  {/* eslint-disable-next-line @next/next/no-img-element -- signed, face-blurred preview */}
                  <img src={cur.preview} alt={cur.title} fetchPriority="high" style={{ position: "absolute", inset: "0", width: "100%", height: "100%", objectFit: "contain", display: "block" }} />
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
                  {cur.dup && <span style={badge}>This photo</span>}
                </div>
                <figcaption style={cap}>{cur.credit ? `${cur.credit.title.replace(/\.(jpe?g|png)$/i, "")}, ${cur.credit.author}` : cur.title}</figcaption>
              </figure>
              {cur.dup && (
                <figure className="rv-fig">
                  <div className="rv-frame">
                    {/* eslint-disable-next-line @next/next/no-img-element -- signed, face-blurred preview */}
                    <img src={cur.dup.src} alt="" aria-hidden="true" className="rv-backdrop" />
                    {/* eslint-disable-next-line @next/next/no-img-element -- signed, face-blurred preview */}
                    <img src={cur.dup.src} alt="The original photo" style={{ position: "absolute", inset: "0", width: "100%", height: "100%", objectFit: "contain", display: "block" }} />
                    <span style={badge}>The original</span>
                  </div>
                  <figcaption style={cap}>{cur.dup.caption}</figcaption>
                </figure>
              )}
            </div>
            {cur.dup && cur.hash && cur.dup.hash && (
              <div style={{ flexShrink: "0", display: "flex", gap: "12px", alignItems: "center", padding: "8px 12px", borderRadius: "12px", background: "var(--card)", border: "1px solid var(--border)" }}>
                <Glyph bits={cur.hash} label="Fingerprint of this photo" style={{ width: "44px", height: "44px", flexShrink: "0" }} />
                <Glyph bits={cur.hash} diffWith={cur.dup.hash} colors={{ hi: "var(--l-destructive)" }} label="Both fingerprints overlaid, differing cells in red" style={{ width: "44px", height: "44px", flexShrink: "0" }} />
                <Glyph bits={cur.dup.hash} label="Fingerprint of the original" style={{ width: "44px", height: "44px", flexShrink: "0" }} />
                <span style={{ fontWeight: "600", fontSize: "13px" }}>{cur.dup.text}</span>
              </div>
            )}
          </div>
          <div className="rv-panel">
            <div className="rv-panel-body">
              <span style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
                <span style={{ fontFamily: "var(--font-display)", fontWeight: "700", fontSize: "40px", lineHeight: "1", color: m.color }}>{cur.score ?? "–"}</span>
                <span style={{ display: "flex", alignItems: "center", gap: "6px", fontWeight: "600", color: m.color }}>
                  <span aria-hidden="true" style={{ width: "10px", height: "10px", background: m.color, borderRadius: m.radius, clipPath: m.clip, transform: `rotate(${m.rot})` }} />
                  {cur.band}
                </span>
                <span style={{ marginLeft: "auto", fontSize: "12px", color: "var(--muted-foreground)" }}>{`${i + 1} of ${q.length}`}</span>
              </span>
              <span style={{ lineHeight: "1.45" }}>{cur.reason}</span>
              <div id="rv-strip" style={{ position: "relative", display: "flex", flexDirection: "column", gap: "2px", padding: "8px", borderRadius: "10px", background: "var(--background)", border: "1px solid var(--border)", overflow: "hidden" }}>
                <div id="rv-seal" aria-hidden="true" style={{ position: "absolute", inset: "0", background: "color-mix(in oklch, var(--verified) 16%, var(--card))", transform: "scaleX(0)", transformOrigin: "0 50%" }} />
                <span style={{ position: "relative", display: "flex", justifyContent: "space-between", fontSize: "12px", color: "var(--muted-foreground)", padding: "0 4px 4px" }}>
                  <span>{`The rules: ${full} of ${cur.rows.length} at full points`}</span>
                  <span id="rv-sealed" style={{ fontWeight: "600", color: "var(--verified)", opacity: "0" }}>
                    Sealed
                  </span>
                </span>
                {cur.rows.map((r) => (
                  <span key={r.label} style={{ position: "relative", display: "grid", gridTemplateColumns: "8px minmax(0,1fr) auto", alignItems: "center", gap: "8px", padding: "3px 4px", fontSize: "12.5px" }}>
                    <span style={{ width: "8px", height: "8px", borderRadius: "4px", background: r.tone === "bad" ? "var(--flagged)" : r.pts === r.max ? "var(--verified)" : TONE_DOT[r.tone] }} />
                    <span style={{ minWidth: "0" }}>
                      <span style={{ fontWeight: "500" }}>{r.label}</span>
                      {r.pts < r.max && r.note && <span style={{ display: "block", color: "var(--muted-foreground)", fontSize: "12px", lineHeight: "1.35" }}>{r.note}</span>}
                    </span>
                    <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: "600", color: r.pts === r.max ? "var(--foreground)" : r.tone === "bad" ? "var(--flagged)" : "var(--review)" }}>{`${r.pts}/${r.max}`}</span>
                  </span>
                ))}
              </div>
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
                    } else if (e.key === "Escape") e.currentTarget.blur();
                  }}
                  rows={2}
                  placeholder="What you checked, for the audit trail"
                  aria-invalid={noteError}
                  className="focus-ring"
                  style={{ resize: "vertical", padding: "8px", borderRadius: "8px", border: `1px solid ${noteError ? "var(--flagged)" : "var(--border)"}`, background: "var(--background)" }}
                />
                {noteError && (
                  <span role="alert" style={{ fontSize: "12px", color: "var(--flagged)" }}>
                    Add a note so the decision can be audited.
                  </span>
                )}
              </label>
            </div>
          </div>
          <div className="rv-actions">
              <div style={{ display: "flex", gap: "8px" }}>
                <button type="button" className="focus-ring" onClick={() => move(-1)} disabled={i === 0} aria-label="Previous photo" title="Previous (K or ↑)" style={{ flexShrink: "0", width: "40px", borderRadius: "9px", border: "1px solid var(--border)", background: "var(--background)", cursor: i === 0 ? "default" : "pointer", opacity: i === 0 ? 0.45 : 1 }}>
                  ↑
                </button>
                <button type="button" className="focus-ring" onClick={() => decide("approved")} style={{ flex: "1", minWidth: "0", display: "flex", justifyContent: "center", alignItems: "center", gap: "8px", padding: "10px", borderRadius: "9px", border: "0", background: "var(--verified)", color: "var(--card)", cursor: "pointer", fontWeight: "600" }}>
                  Approve
                  <Kbd hint>A</Kbd>
                </button>
                <button type="button" className="focus-ring" onClick={() => decide("rejected")} style={{ flex: "1", minWidth: "0", display: "flex", justifyContent: "center", alignItems: "center", gap: "8px", padding: "10px", borderRadius: "9px", border: "1px solid var(--flagged)", background: "transparent", color: "var(--flagged)", cursor: "pointer", fontWeight: "600" }}>
                  Reject
                  <Kbd hint>R</Kbd>
                </button>
                <button type="button" className="focus-ring" onClick={() => move(1)} disabled={i >= q.length - 1} aria-label="Next photo" title="Next (J or ↓)" style={{ flexShrink: "0", width: "40px", borderRadius: "9px", border: "1px solid var(--border)", background: "var(--background)", cursor: i >= q.length - 1 ? "default" : "pointer", opacity: i >= q.length - 1 ? 0.45 : 1 }}>
                  ↓
                </button>
              </div>
              <span className="rv-hints" style={{ display: "flex", flexWrap: "wrap", gap: "4px 14px", fontSize: "12px", color: "var(--muted-foreground)" }}>
                <span>
                  <Kbd>J</Kbd> <Kbd>K</Kbd> or <Kbd>↑</Kbd> <Kbd>↓</Kbd> move
                </span>
                <span>
                  <Kbd>⌘</Kbd> <Kbd>Enter</Kbd> approves from the note
                </span>
              </span>
          </div>
        </>
      )}
    </div>
  );
}

function Kbd({ children, hint }: { children: ReactNode; hint?: boolean }) {
  return <kbd className={hint ? "rv-hints" : undefined} style={{ display: "inline-block", minWidth: "18px", padding: "0 5px", borderRadius: "4px", border: "1px solid color-mix(in srgb, currentColor 35%, transparent)", fontFamily: "var(--font-mono)", fontSize: "11px", lineHeight: "17px", textAlign: "center", opacity: 0.9 }}>{children}</kbd>;
}
