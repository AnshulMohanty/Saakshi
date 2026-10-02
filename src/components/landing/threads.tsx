/* eslint-disable @next/next/no-img-element -- signed Cloudinary URLs */
import type { CSSProperties } from "react";
import type { LandingData, LandingNumber } from "@/lib/landing/types";

/**
 * Chapter 5 (L:824-875): a report card over a tilted field of photos; each number draws its
 * threads to the photos behind it. Numbers are database aggregates (rule 1). Hover or focus a
 * number to light its threads (landing-dom hi()).
 */
const NUM: CSSProperties = { all: "unset", cursor: "pointer", display: "flex", flexDirection: "column", gap: "2px", padding: "10px", borderRadius: "8px", border: "1px solid var(--l-border)", background: "var(--l-card)", transition: "border-color 160ms,box-shadow 160ms" };
const VAL: CSSProperties = { fontFamily: "var(--font-display)", fontWeight: "700", fontSize: "34px", lineHeight: "1" };
const CAP: CSSProperties = { fontSize: "12px", color: "var(--l-muted-foreground)" };

const pct = (n: LandingNumber) => (n.value === null ? n.text : `${n.text}%`);

export function ThreadsChapter({ data, onHi }: { data: LandingData; onHi: (k: string | null) => void }) {
  const r = data.report;
  const word = r?.metric === "green" ? "green" : "litter";
  const tag = (n: LandingNumber | null | undefined) => (n?.mock ? <span style={{ color: "var(--l-review)" }}>{`, ${data.mockTag.toLowerCase()}`}</span> : null);
  const handlers = (k: string) => ({ onMouseEnter: () => onHi(k), onFocus: () => onHi(k), onMouseLeave: () => onHi(null), onBlur: () => onHi(null) });
  return (
    <section id="ch5" className="night" data-pin="" data-night="" data-screen-label="05 Threads" style={{ position: "relative", zIndex: "2", height: "420vh", background: "var(--background)", color: "var(--foreground)" }}>
      <div id="ch5-sticky" data-dust="" style={{ position: "sticky", top: "0", height: "100vh", overflow: "hidden", backgroundColor: "var(--background)" }}>
        <svg id="c5-threads" aria-hidden="true" style={{ position: "absolute", inset: "0", width: "100%", height: "100%", pointerEvents: "none", zIndex: "1", overflow: "visible" }} />
        <div style={{ position: "absolute", inset: "0", zIndex: "2", padding: "clamp(88px,12vh,120px) clamp(20px,5vw,72px) 20px", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: "clamp(18px,4vh,44px)" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "20px 48px", alignItems: "flex-start" }}>
            <div style={{ flex: "1 1 260px", maxWidth: "420px", display: "flex", flexDirection: "column", gap: "12px" }}>
              <h2 style={{ margin: "0", fontFamily: "var(--font-display)", fontWeight: "700", fontStretch: "92%", fontSize: "clamp(34px,4.4vw,68px)", lineHeight: "0.95", letterSpacing: "-0.02em", textWrap: "balance" }}>Every number has a thread.</h2>
              <p id="c5-pull" style={{ margin: "0", fontSize: "16px", lineHeight: "1.5", color: "var(--muted-foreground)" }}>
                Pull any number and it leads to the photos behind it. Hover or tab to a number to try.
              </p>
            </div>
            {r && (
              <div style={{ flex: "1 1 320px", perspective: "1400px", display: "flex", justifyContent: "center" }}>
                <div id="c5-report" style={{ position: "relative", zIndex: "3", width: "min(460px,100%)", padding: "18px", borderRadius: "12px", background: "var(--l-primary-foreground)", color: "var(--l-foreground)", transformOrigin: "50% 100%", boxShadow: "0 30px 80px color-mix(in srgb, var(--ink-black) 50%, transparent)", display: "flex", flexDirection: "column", gap: "12px" }}>
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
                    <button type="button" data-num="verified" {...handlers("verified")} style={NUM}>
                      <span data-val="" style={{ ...VAL, color: "var(--l-verified)" }}>
                        {r.verified.text}
                      </span>
                      <span style={CAP}>photos verified{tag(r.verified)}</span>
                    </button>
                    <button type="button" data-num="flagged" {...handlers("flagged")} style={NUM}>
                      <span data-val="" style={{ ...VAL, color: "var(--l-destructive)" }}>
                        {r.flagged.text}
                      </span>
                      <span style={CAP}>photos flagged, with reasons{tag(r.flagged)}</span>
                    </button>
                    {r.before && (
                      <button type="button" data-num="before" {...handlers("before")} style={NUM}>
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
                      <button type="button" data-num="after" {...handlers("after")} style={NUM}>
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
                </div>
              </div>
            )}
          </div>
          <div style={{ flex: "1", minHeight: "0", perspective: "900px", display: "flex", alignItems: "flex-start", justifyContent: "center" }}>
            <div id="c5-field" style={{ width: "min(1100px,100%)", display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(52px,1fr))", gap: "6px", transform: "rotateX(46deg)", transformOrigin: "50% 0" }}>
              {data.field.map((t, i) => (
                <div key={i} data-tile={t.k} style={{ position: "relative", aspectRatio: "1", borderRadius: "5px", overflow: "hidden", background: "var(--card)", opacity: "0.5", transition: "opacity 160ms,outline-color 160ms", outline: "2px solid transparent" }}>
                  <img src={t.src} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
