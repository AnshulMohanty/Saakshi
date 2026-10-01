/* eslint-disable @next/next/no-img-element -- signed Cloudinary URLs */
import { Glyph } from "@/components/glyph";
import { BAND_COLOR, BAND_LABEL } from "@/components/trust-meter";
import { countWord } from "@/lib/landing/count-word";
import type { LandingData } from "@/lib/landing/types";

/**
 * Chapter 3 (L:704-780): the planted fakes fly out of the grid one by one, each with the rule
 * that caught it; then "We don't detect fakes. We require proof." with the ledger of a photo
 * found on the internet, scored by our engine.
 */
const TONE = { good: "var(--verified)", neutral: "var(--muted-foreground)", warn: "var(--review)", bad: "var(--flagged)" } as const;

export function CatchChapter({ data, heroProject }: { data: LandingData; heroProject: string | null }) {
  const flags = data.flags;
  const L = data.internet;
  return (
    <section id="ch3" className="night" data-pin="" data-night="" data-screen-label="03 The catch" style={{ position: "relative", zIndex: "2", height: "520vh", background: "var(--background)", color: "var(--foreground)" }}>
      <div id="ch3-sticky" data-dust="" style={{ position: "sticky", top: "0", height: "100vh", overflow: "hidden", backgroundColor: "var(--background)" }}>
        <div id="c3-main" style={{ position: "absolute", inset: "0", padding: "clamp(88px,13vh,130px) clamp(20px,5vw,72px) 24px", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: "clamp(16px,3vh,32px)" }}>
          <div id="c3-title" style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", justifyContent: "space-between", gap: "8px 24px" }}>
            <h2 style={{ margin: "0", fontFamily: "var(--font-display)", fontWeight: "700", fontStretch: "92%", fontSize: "clamp(34px,4.6vw,70px)", lineHeight: "0.95", letterSpacing: "-0.02em", textWrap: "balance" }}>Some photos aren&apos;t what they claim.</h2>
            <p style={{ margin: "0", fontSize: "14px", color: "var(--muted-foreground)", maxWidth: "340px" }}>
              {flags.length
                ? `${countWord(flags.length)} ${flags.length === 1 ? "fake" : "fakes"} planted in the demo archive${heroProject ? `'s ${heroProject} project` : ""}. Each is caught by a fixed rule, with its reason.`
                : "No planted fakes in the demo archive yet. Run the demo import to plant them."}
            </p>
          </div>
          <div style={{ flex: "1", minHeight: "0", display: "flex", flexWrap: "wrap", gap: "clamp(16px,3vw,48px)", alignItems: "flex-start" }}>
            <div id="c3-grid" style={{ flex: "1 1 300px", maxWidth: "600px", display: "grid", gridTemplateColumns: "repeat(6,minmax(0,1fr))", gap: "6px" }}>
              {data.grid.map((t, i) => (
                <div key={i} data-hole={t.hole} style={{ position: "relative", aspectRatio: "1", borderRadius: "6px", overflow: "hidden", background: "var(--card)", outline: "1px solid var(--border)" }}>
                  <img src={t.src} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                  <span data-holemark="" style={{ position: "absolute", inset: "0", borderRadius: "6px", outline: "2px solid var(--flagged)", outlineOffset: "-2px", opacity: "0", display: "flex", alignItems: "flex-end", justifyContent: "flex-start", padding: "4px", boxSizing: "border-box" }}>
                    <span style={{ padding: "1px 5px", borderRadius: "4px", background: "var(--l-destructive)", color: "var(--l-card)", fontSize: "10px", fontWeight: "600" }}>Flagged</span>
                  </span>
                </div>
              ))}
            </div>
            <div id="c3-slot" style={{ position: "relative", flex: "1 1 300px", maxWidth: "440px", alignSelf: "stretch", minHeight: "min(420px,48vh)" }}>
              {flags.map((f, i) => (
                <div key={f.id} data-flag={i} style={{ position: "absolute", left: "0", right: "0", top: "0", opacity: "0", display: "flex", flexDirection: "column", gap: "12px" }}>
                  <div data-flagimg="" style={{ position: "relative", width: "100%", height: "clamp(110px,24vh,280px)", borderRadius: "var(--radius)", overflow: "hidden", outline: "2px solid var(--flagged)", transformOrigin: "0 0", background: "var(--card)" }}>
                    <img loading="lazy" src={f.src} alt={f.alt} style={{ position: "absolute", inset: "0", width: "100%", height: "100%", objectFit: "cover" }} />
                    {f.watermarkOverlay && (
                      <div aria-hidden="true" style={{ position: "absolute", inset: "-20%", display: "flex", flexWrap: "wrap", gap: "18px 30px", alignContent: "center", justifyContent: "center", transform: "rotate(-24deg)", fontFamily: "var(--font-sans)", fontWeight: "600", fontSize: "22px", color: "color-mix(in srgb, var(--l-card) 42%, transparent)" }}>
                        {Array.from({ length: 12 }, (_, k) => (
                          <span key={k}>stockpix</span>
                        ))}
                      </div>
                    )}
                    {f.stampOverlay && (
                      <div style={{ position: "absolute", left: "10px", bottom: "10px", padding: "6px 8px", borderRadius: "4px", background: "color-mix(in srgb, var(--ink-black) 62%, transparent)", color: "var(--l-card)", fontFamily: "var(--font-mono)", fontSize: "11px", lineHeight: "1.35" }}>
                        {f.stampOverlay.map((l, k) => (
                          <span key={k}>
                            {k > 0 && <br />}
                            {l}
                          </span>
                        ))}
                      </div>
                    )}
                    <img loading="lazy" data-glitch="" src={f.src} alt="" style={{ position: "absolute", inset: "0", width: "100%", height: "100%", objectFit: "cover", opacity: "0", filter: "saturate(3) hue-rotate(160deg)", mixBlendMode: "screen" }} />
                  </div>
                  <div data-reason="" style={{ display: "flex", gap: "14px", alignItems: "flex-start", padding: "14px", borderRadius: "var(--radius)", background: "var(--card)", border: "1px solid var(--border)" }}>
                    <div style={{ flex: "1", display: "flex", flexDirection: "column", gap: "6px" }}>
                      <span style={{ alignSelf: "flex-start", padding: "2px 7px", borderRadius: "5px", background: "var(--l-destructive)", color: "var(--l-card)", fontSize: "12px", fontWeight: "600" }}>Flagged</span>
                      <div style={{ fontFamily: "var(--font-display)", fontWeight: "650", fontSize: "22px", lineHeight: "1.08" }}>{f.reason}</div>
                      <div style={{ fontSize: "13px", lineHeight: "1.45", color: "var(--muted-foreground)" }}>
                        {f.detail}
                        {f.evidenceUrl && (
                          <>
                            {" "}
                            <a href={f.evidenceUrl} style={{ color: "var(--code-ink)" }}>
                              See its evidence
                            </a>
                          </>
                        )}
                      </div>
                    </div>
                    {f.diff && (
                      <div style={{ flexShrink: "0", display: "flex", flexDirection: "column", gap: "6px", alignItems: "center", width: "96px" }}>
                        <Glyph bits={f.diff.bits} diffWith={f.diff.other} variant="night" size={84} label="Two fingerprints overlaid; differing cells lit in red" />
                        <div style={{ fontSize: "11px", lineHeight: "1.3", textAlign: "center", color: "var(--foreground)" }}>{f.diff.text}</div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div id="c3-close" style={{ position: "absolute", inset: "0", display: "flex", alignItems: "center", justifyContent: "center", padding: "96px clamp(20px,5vw,72px) 32px", boxSizing: "border-box", opacity: "0", pointerEvents: "none" }}>
          <div style={{ maxWidth: "1080px", width: "100%", display: "flex", flexWrap: "wrap", gap: "40px", alignItems: "center" }}>
            <h2 style={{ flex: "1 1 320px", margin: "0", fontFamily: "var(--font-display)", fontWeight: "700", fontStretch: "90%", fontSize: "clamp(40px,5.6vw,88px)", lineHeight: "0.94", letterSpacing: "-0.02em", textWrap: "balance" }}>We don&apos;t detect fakes. We require proof.</h2>
            {L && (
              <div style={{ flex: "1 1 320px", maxWidth: "440px", display: "flex", flexDirection: "column", gap: "12px", padding: "16px", borderRadius: "12px", background: "var(--card)", border: "1px solid var(--border)" }}>
                <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                  <img loading="lazy" src={L.src} alt="" style={{ width: "72px", height: "54px", objectFit: "cover", borderRadius: "6px" }} />
                  <div style={{ flex: "1", display: "flex", flexDirection: "column", gap: "2px" }}>
                    <span style={{ fontSize: "13px", color: "var(--muted-foreground)" }}>{L.caption}</span>
                    <span style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
                      <span style={{ fontFamily: "var(--font-display)", fontWeight: "700", fontSize: "30px", color: BAND_COLOR[L.band] }}>{L.score}</span>
                      <span style={{ fontWeight: "600", color: BAND_COLOR[L.band] }}>{BAND_LABEL[L.band]}</span>
                    </span>
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", fontSize: "13px" }}>
                  {L.rows.map((r) => (
                    <div key={r.label} style={{ display: "flex", justifyContent: "space-between", gap: "12px", padding: "6px 0", borderTop: "1px solid var(--border)" }}>
                      <span>{r.label}</span>
                      <span style={{ color: TONE[r.tone], textAlign: "right" }}>{r.value}</span>
                    </div>
                  ))}
                </div>
                <div style={{ fontSize: "12px", color: "var(--muted-foreground)", lineHeight: "1.4" }}>{L.note}</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
