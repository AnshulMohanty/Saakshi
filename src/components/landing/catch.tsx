/* eslint-disable @next/next/no-img-element -- signed Cloudinary URLs */
import { Glyph } from "@/components/glyph";
import { BAND_COLOR, BAND_LABEL } from "@/components/trust-meter";
import { countWord } from "@/lib/landing/count-word";
import type { LandingData } from "@/lib/landing/types";

/**
 * Chapter 3 (L:704-780): the planted fakes fly out of the grid one by one, each with the rule
 * that caught it in plain words and the proof that would change the verdict. Then the grid leaves
 * completely and "We don't detect fakes. We require proof." comes in with the ledger of a photo
 * from the internet, its rows landing one by one while the score counts (landing-dom). Nothing is
 * ever drawn over other text. The heading and grid are visible as the chapter scrolls in.
 */
const TONE = { good: "var(--verified)", neutral: "var(--muted-foreground)", warn: "var(--review)", bad: "var(--flagged)" } as const;
const KICKER = { fontSize: "11px", fontWeight: "600", letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--muted-foreground)" } as const;

export function CatchChapter({ data, heroProject }: { data: LandingData; heroProject: string | null }) {
  const flags = data.flags;
  const L = data.internet;
  return (
    <section id="ch3" className="night" data-pin="" data-night="" data-screen-label="03 The catch" style={{ position: "relative", zIndex: "2", height: "460vh", background: "var(--background)", color: "var(--foreground)" }}>
      <div id="ch3-sticky" data-dust="" style={{ position: "sticky", top: "0", height: "100vh", overflow: "hidden", backgroundColor: "var(--background)" }}>
        <div id="c3-main" style={{ position: "absolute", inset: "0", padding: "clamp(84px,12vh,124px) clamp(20px,5vw,72px) 20px", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: "clamp(14px,2.6vh,28px)" }}>
          <div id="c3-title" style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", justifyContent: "space-between", gap: "8px 24px" }}>
            <h2 style={{ margin: "0", fontFamily: "var(--font-display)", fontWeight: "700", fontStretch: "92%", fontSize: "clamp(32px,4.4vw,68px)", lineHeight: "0.95", letterSpacing: "-0.02em", textWrap: "balance" }}>Some photos aren&apos;t what they claim.</h2>
            <p style={{ margin: "0", fontSize: "14px", lineHeight: "1.45", color: "var(--muted-foreground)", maxWidth: "360px" }}>
              {flags.length
                ? `${countWord(flags.length)} ${flags.length === 1 ? "fake" : "fakes"} planted in the demo archive${heroProject ? `'s ${heroProject} project` : ""}. Each is caught by a fixed rule; here is the rule and what would change the verdict.`
                : "No planted fakes in the demo archive yet. Run the demo import to plant them."}
            </p>
          </div>
          <div style={{ flex: "1", minHeight: "0", display: "flex", flexWrap: "wrap", gap: "clamp(16px,3vw,48px)", alignItems: "flex-start" }}>
            <div id="c3-grid" style={{ flex: "1 1 280px", maxWidth: "560px", display: "grid", gridTemplateColumns: "repeat(6,minmax(0,1fr))", gap: "6px" }}>
              {data.grid.map((t, i) => (
                <div key={i} data-hole={t.hole} style={{ position: "relative", aspectRatio: "1", borderRadius: "6px", overflow: "hidden", background: "var(--card)", outline: "1px solid var(--border)" }}>
                  <img src={t.src} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                  <span data-holemark="" style={{ position: "absolute", inset: "0", borderRadius: "6px", outline: "2px solid var(--flagged)", outlineOffset: "-2px", opacity: "0", display: "flex", alignItems: "flex-end", justifyContent: "flex-start", padding: "4px", boxSizing: "border-box" }}>
                    <span style={{ padding: "1px 5px", borderRadius: "4px", background: "var(--l-destructive)", color: "var(--l-card)", fontSize: "10px", fontWeight: "600" }}>Flagged</span>
                  </span>
                </div>
              ))}
            </div>
            <div id="c3-slot" style={{ position: "relative", flex: "1 1 340px", maxWidth: "520px", alignSelf: "stretch", minHeight: "min(440px,52vh)" }}>
              {flags.map((f, i) => (
                <div key={f.id} data-flag={i} style={{ position: "absolute", left: "0", right: "0", top: "0", opacity: "0", display: "flex", flexDirection: "column", gap: "10px" }}>
                  <div data-flagimg="" style={{ position: "relative", width: "100%", height: "clamp(96px,22vh,240px)", borderRadius: "var(--radius)", overflow: "hidden", outline: "2px solid var(--flagged)", transformOrigin: "0 0", background: "var(--card)" }}>
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
                    <span style={{ position: "absolute", left: "10px", top: "10px", padding: "3px 8px", borderRadius: "999px", background: "color-mix(in srgb, var(--ink-black) 64%, transparent)", color: "var(--l-card)", fontSize: "11px", fontWeight: "600" }}>{`Planted fake ${i + 1} of ${flags.length}`}</span>
                  </div>
                  <div data-reason="" style={{ display: "flex", gap: "14px", alignItems: "flex-start", padding: "14px", borderRadius: "var(--radius)", background: "var(--card)", border: "1px solid var(--border)" }}>
                    <div style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "8px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                        <span style={{ padding: "2px 7px", borderRadius: "5px", background: "var(--l-destructive)", color: "var(--l-card)", fontSize: "12px", fontWeight: "600" }}>Flagged</span>
                        <span style={{ fontFamily: "var(--font-display)", fontWeight: "650", fontSize: "clamp(18px,1.7vw,22px)", lineHeight: "1.1" }}>{f.reason}</span>
                      </div>
                      {f.rule && (
                        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                          <span style={KICKER}>The rule that caught it</span>
                          <span style={{ fontSize: "13px", lineHeight: "1.45" }}>{f.rule}</span>
                        </div>
                      )}
                      <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                        <span style={KICKER}>What it found</span>
                        <span style={{ fontSize: "13px", lineHeight: "1.45", color: "var(--muted-foreground)" }}>
                          {f.detail}
                          {f.evidenceUrl && (
                            <>
                              {" "}
                              <a href={f.evidenceUrl} style={{ color: "var(--code-ink)" }}>
                                See its evidence
                              </a>
                            </>
                          )}
                        </span>
                      </div>
                      {f.proof && (
                        <div style={{ display: "flex", flexDirection: "column", gap: "2px", padding: "8px 10px", borderRadius: "8px", background: "color-mix(in srgb, var(--verified) 10%, transparent)", border: "1px solid color-mix(in srgb, var(--verified) 35%, transparent)" }}>
                          <span style={{ ...KICKER, color: "var(--verified)" }}>What would change the verdict</span>
                          <span style={{ fontSize: "13px", lineHeight: "1.45" }}>{f.proof}</span>
                        </div>
                      )}
                    </div>
                    {f.diff && (
                      <div style={{ flexShrink: "0", display: "flex", flexDirection: "column", gap: "6px", alignItems: "center", width: "92px" }}>
                        <Glyph bits={f.diff.bits} diffWith={f.diff.other} variant="night" size={80} label="Two fingerprints overlaid; differing cells lit in red" />
                        <div style={{ fontSize: "11px", lineHeight: "1.3", textAlign: "center", color: "var(--foreground)" }}>{f.diff.text}</div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div id="c3-close" style={{ position: "absolute", inset: "0", display: "flex", alignItems: "center", justifyContent: "center", padding: "clamp(84px,12vh,110px) clamp(20px,5vw,72px) 24px", boxSizing: "border-box", opacity: "0", visibility: "hidden" }}>
          <div style={{ maxWidth: "1120px", width: "100%", display: "flex", flexWrap: "wrap", gap: "clamp(20px,4vw,56px)", alignItems: "center" }}>
            <div style={{ flex: "1 1 320px", display: "flex", flexDirection: "column", gap: "16px" }}>
              <h2 style={{ margin: "0", fontFamily: "var(--font-display)", fontWeight: "700", fontStretch: "90%", fontSize: "clamp(38px,5.4vw,84px)", lineHeight: "0.94", letterSpacing: "-0.02em", textWrap: "balance" }}>We don&apos;t detect fakes. We require proof.</h2>
              <p style={{ margin: "0", maxWidth: "460px", fontSize: "clamp(15px,1.3vw,17px)", lineHeight: "1.5", color: "var(--muted-foreground)" }}>
                A photo is trusted for what it can show: where and when it was taken, that it is new, that nothing is drawn on it. A picture from the internet shows none of that, so it can&apos;t verify, however real it looks.
              </p>
            </div>
            {L && (
              <div id="c3-ledger" style={{ flex: "1 1 320px", maxWidth: "460px", display: "flex", flexDirection: "column", gap: "12px", padding: "16px", borderRadius: "14px", background: "var(--card)", border: "1px solid var(--border)", boxShadow: "0 24px 70px color-mix(in srgb, var(--ink-black) 45%, transparent)" }}>
                <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                  {L.src ? (
                    <img loading="lazy" src={L.src} alt="" style={{ width: "72px", height: "54px", objectFit: "cover", borderRadius: "6px", flexShrink: "0" }} />
                  ) : (
                    <span aria-hidden="true" style={{ width: "72px", height: "54px", borderRadius: "6px", flexShrink: "0", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--muted)", border: "1px dashed var(--border)", fontSize: "11px", color: "var(--muted-foreground)" }}>
                      from the web
                    </span>
                  )}
                  <div style={{ flex: "1", display: "flex", flexDirection: "column", gap: "2px" }}>
                    <span style={{ fontSize: "13px", color: "var(--muted-foreground)" }}>{L.caption}</span>
                    <span style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
                      <span id="c3-lscore" data-final={L.score} style={{ fontFamily: "var(--font-display)", fontWeight: "700", fontSize: "32px", color: BAND_COLOR[L.band], fontVariantNumeric: "tabular-nums" }}>
                        {L.score}
                      </span>
                      <span style={{ fontWeight: "600", color: BAND_COLOR[L.band] }}>{BAND_LABEL[L.band]}</span>
                    </span>
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", fontSize: "13px" }}>
                  {L.rows.map((r) => (
                    <div key={r.label} data-lrow="" style={{ display: "flex", justifyContent: "space-between", gap: "12px", padding: "6px 0", borderTop: "1px solid var(--border)" }}>
                      <span>{r.label}</span>
                      <span style={{ color: TONE[r.tone], textAlign: "right" }}>{r.value}</span>
                    </div>
                  ))}
                </div>
                <div data-lrow="" style={{ display: "flex", flexDirection: "column", gap: "4px", padding: "8px 10px", borderRadius: "8px", background: "color-mix(in srgb, var(--verified) 10%, transparent)", border: "1px solid color-mix(in srgb, var(--verified) 35%, transparent)" }}>
                  <span style={{ ...KICKER, color: "var(--verified)" }}>What would make it Verified</span>
                  <span style={{ fontSize: "13px", lineHeight: "1.45" }}>Proof of where and when: the photo taken with Witness Capture at the site, or the original camera file with its GPS and time.</span>
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
