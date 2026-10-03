/* eslint-disable @next/next/no-img-element -- signed Cloudinary URLs */
import type { CSSProperties } from "react";
import type { FieldTile, LandingData, LandingNumber } from "@/lib/landing/types";

/**
 * Chapter 5 (L:824-875): the project's report card on the left, the photos behind it on the right
 * as a legible wall; each number draws its threads to its photos (landing-dom). Numbers are
 * database aggregates (rule 1). Hover or focus a number to light its photos and threads
 * (landing-dom hi()); phones stack the card over the wall and the threads run down.
 */
const NUM: CSSProperties = { all: "unset", cursor: "pointer", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: "4px", padding: "12px 14px", borderRadius: "10px", border: "1px solid var(--l-border)", background: "var(--l-card)", transition: "border-color 160ms,box-shadow 160ms,transform 160ms" };
const VAL: CSSProperties = { fontFamily: "var(--font-display)", fontWeight: "700", fontSize: "clamp(30px,3vw,42px)", lineHeight: "1" };
const CAP: CSSProperties = { fontSize: "13px", color: "var(--l-muted-foreground)", lineHeight: "1.3" };
const BADGE: Record<FieldTile["k"], { text: string; bg: string } | null> = { verified: null, flagged: { text: "Flagged", bg: "var(--l-destructive)" }, before: { text: "Before", bg: "var(--l-measured)" }, after: { text: "After", bg: "var(--l-measured)" } };

const pct = (n: LandingNumber) => (n.value === null ? n.text : `${n.text}%`);

export function ThreadsChapter({ data, onHi }: { data: LandingData; onHi: (k: string | null) => void }) {
  const r = data.report;
  const word = r?.metric === "green" ? "green" : "litter";
  const tag = (n: LandingNumber | null | undefined) => (n?.mock ? <span style={{ color: "var(--l-review)" }}>{`, ${data.mockTag.toLowerCase()}`}</span> : null);
  const handlers = (k: string) => ({ onMouseEnter: () => onHi(k), onFocus: () => onHi(k), onMouseLeave: () => onHi(null), onBlur: () => onHi(null) });
  const tiles = data.field.slice(0, 40);
  return (
    <section id="ch5" className="night" data-pin="" data-night="" data-screen-label="05 Threads" style={{ position: "relative", zIndex: "2", height: "340vh", background: "var(--background)", color: "var(--foreground)" }}>
      <div id="ch5-sticky" data-dust="" style={{ position: "sticky", top: "0", height: "100vh", overflow: "hidden", backgroundColor: "var(--background)" }}>
        <svg id="c5-threads" aria-hidden="true" style={{ position: "absolute", inset: "0", width: "100%", height: "100%", pointerEvents: "none", zIndex: "1", overflow: "visible" }} />
        <div className="c5-layout" style={{ position: "absolute", inset: "0", zIndex: "2", padding: "clamp(84px,12vh,118px) clamp(20px,5vw,72px) clamp(16px,3vh,32px)", boxSizing: "border-box" }}>
          <div className="c5-left" style={{ display: "flex", flexDirection: "column", gap: "clamp(12px,2.4vh,22px)", minWidth: "0" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <h2 style={{ margin: "0", fontFamily: "var(--font-display)", fontWeight: "700", fontStretch: "92%", fontSize: "clamp(32px,4.2vw,64px)", lineHeight: "0.95", letterSpacing: "-0.02em", textWrap: "balance" }}>Every number has a thread.</h2>
              <p id="c5-pull" style={{ margin: "0", fontSize: "clamp(14px,1.2vw,16px)", lineHeight: "1.5", color: "var(--muted-foreground)" }}>
                Pull any number and it leads to the photos behind it. Hover or tab to a number to light its photos.
              </p>
            </div>
            {r && (
              <div id="c5-report" style={{ position: "relative", zIndex: "3", padding: "16px", borderRadius: "14px", background: "var(--l-primary-foreground)", color: "var(--l-foreground)", boxShadow: "0 30px 80px color-mix(in srgb, var(--ink-black) 50%, transparent)", display: "flex", flexDirection: "column", gap: "12px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "12px", borderBottom: "1px solid var(--l-border)", paddingBottom: "10px" }}>
                  <span style={{ fontFamily: "var(--font-display)", fontWeight: "650", fontSize: "19px" }}>{r.title}</span>
                  {r.url ? (
                    <a href={r.url} style={{ fontSize: "12px", color: "var(--l-muted-foreground)", whiteSpace: "nowrap" }}>
                      {r.kind}
                    </a>
                  ) : (
                    <span style={{ fontSize: "12px", color: "var(--l-muted-foreground)", whiteSpace: "nowrap" }}>{r.kind}</span>
                  )}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: "8px" }}>
                  <button type="button" data-num="verified" className="focus-ring" {...handlers("verified")} style={NUM}>
                    <span data-val="" style={{ ...VAL, color: "var(--l-verified)" }}>
                      {r.verified.text}
                    </span>
                    <span style={CAP}>photos verified{tag(r.verified)}</span>
                  </button>
                  <button type="button" data-num="flagged" className="focus-ring" {...handlers("flagged")} style={NUM}>
                    <span data-val="" style={{ ...VAL, color: "var(--l-destructive)" }}>
                      {r.flagged.text}
                    </span>
                    <span style={CAP}>photos flagged, with reasons{tag(r.flagged)}</span>
                  </button>
                  {r.before && (
                    <button type="button" data-num="before" className="focus-ring" {...handlers("before")} style={NUM}>
                      <span data-val="" style={{ ...VAL, color: "var(--l-measured)" }}>
                        {pct(r.before)}
                      </span>
                      <span style={CAP}>
                        {`${word} cover before, measured`}
                        {tag(r.before)}
                      </span>
                    </button>
                  )}
                  {r.after && (
                    <button type="button" data-num="after" className="focus-ring" {...handlers("after")} style={NUM}>
                      <span data-val="" style={{ ...VAL, color: "var(--l-measured)" }}>
                        {pct(r.after)}
                      </span>
                      <span style={CAP}>
                        {`${word} cover after, measured`}
                        {tag(r.after)}
                      </span>
                    </button>
                  )}
                </div>
                <span style={{ fontSize: "12px", color: "var(--l-muted-foreground)" }}>Counted from the database, never typed. Each number opens the photos it counts.</span>
              </div>
            )}
          </div>
          <div className="c5-right" style={{ minWidth: "0", minHeight: "0", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div id="c5-field" className="c5-wall" style={{ display: "grid", gap: "clamp(5px,0.6vw,9px)", width: "100%", gridTemplateColumns: `repeat(${tiles.length <= 24 ? 6 : tiles.length <= 35 ? 7 : 8}, minmax(0, 1fr))` }}>
              {tiles.map((t, i) => {
                const b = BADGE[t.k];
                return (
                  <div key={i} data-tile={t.k} style={{ position: "relative", aspectRatio: "4/3", borderRadius: "8px", overflow: "hidden", background: "var(--card)", opacity: "0.5", transition: "opacity 160ms,outline-color 160ms,transform 160ms", outline: "2px solid transparent", outlineOffset: "1px", boxShadow: "0 8px 24px color-mix(in srgb, var(--ink-black) 40%, transparent)" }}>
                    <img src={t.src} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                    {b && <span style={{ position: "absolute", left: "5px", bottom: "5px", padding: "1px 6px", borderRadius: "4px", background: b.bg, color: "var(--l-card)", fontSize: "10px", fontWeight: "600" }}>{b.text}</span>}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
