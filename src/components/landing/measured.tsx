/* eslint-disable @next/next/no-img-element -- signed Cloudinary URLs */
import type { CSSProperties } from "react";
import type { LandingData, MeasuredSide } from "@/lib/landing/types";

/**
 * Chapter 4 (L:782-822): before and after, a scan line sweeping each, the mask revealed behind
 * it and the number counting to the measured cover. The pair is the best measured pair across
 * projects (lib/showcase.ts), labelled with its own project.
 */
const SCAN: CSSProperties = { position: "absolute", left: "0", right: "0", top: "0", height: "2px", background: "var(--n-measured)", boxShadow: "0 0 18px 4px color-mix(in srgb, var(--n-measured) 80%, transparent)", opacity: "0" };

function maskStyle(side: MeasuredSide): CSSProperties {
  const url = `url("${side.mask}")`;
  return { position: "absolute", inset: "0", background: "var(--mask-tint)", opacity: "0.78", WebkitMaskImage: url, maskImage: url, WebkitMaskSize: "100% 100%", maskSize: "100% 100%", maskMode: side.maskMode, clipPath: "inset(0 0 100% 0)" } as CSSProperties;
}

function Photo({ side, id, aspect }: { side: MeasuredSide; id: "a" | "b"; aspect: string }) {
  return (
    <div style={{ position: "relative", width: "100%", aspectRatio: aspect, maxHeight: "min(42vh,46vw)", borderRadius: "var(--radius)", overflow: "hidden", background: side.src ? "var(--border)" : "var(--hairline-strong)", display: side.src ? undefined : "flex", alignItems: side.src ? undefined : "center", justifyContent: side.src ? undefined : "center" }}>
      {side.src ? (
        <>
          <img loading="lazy" src={side.src} alt={side.alt} style={{ position: "absolute", inset: "0", width: "100%", height: "100%", objectFit: "cover" }} />
          {side.mask && <div id={`c4-mask-${id}`} style={maskStyle(side)} />}
        </>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "6px", alignItems: "center", textAlign: "center", padding: "16px", color: "var(--muted-foreground)" }}>
          <span style={{ fontWeight: "600", fontSize: "15px", color: "var(--foreground)" }}>Real photo here</span>
          <span style={{ fontSize: "13px", maxWidth: "280px" }}>The same spot after the clean-up, taken in the app from the same pole.</span>
        </div>
      )}
      <div id={`c4-scan-${id}`} style={SCAN} />
    </div>
  );
}

export function MeasuredChapter({ data }: { data: LandingData }) {
  const m = data.measurement;
  const word = m?.metric === "green" ? "plants" : "litter";
  const mockBadge = m && (m.before.value.mock || m.after.value.mock);
  return (
    <section id="ch4" data-pin="" data-screen-label="04 Measured" style={{ position: "relative", zIndex: "2", height: m ? "420vh" : "auto", background: "var(--background)" }}>
      <div id="ch4-sticky" style={{ position: m ? "sticky" : "relative", top: "0", height: m ? "100vh" : "auto", minHeight: "60vh", overflow: "hidden", background: "var(--background)" }}>
        <div style={{ position: m ? "absolute" : "relative", inset: "0", padding: "clamp(88px,13vh,130px) clamp(20px,5vw,72px) 24px", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: "clamp(14px,3vh,32px)" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 32px", alignItems: "flex-end", justifyContent: "space-between" }}>
            <h2 style={{ margin: "0", fontFamily: "var(--font-display)", fontWeight: "700", fontStretch: "92%", fontSize: "clamp(36px,4.8vw,74px)", lineHeight: "0.95", letterSpacing: "-0.02em" }}>Measured, not guessed.</h2>
            {m && (
              <div style={{ display: "flex", alignItems: "flex-end", gap: "14px" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ padding: "2px 7px", borderRadius: "5px", background: "var(--measured)", color: "var(--card)", fontSize: "12px", fontWeight: "600" }}>Measured</span>
                    <span id="c4-which" style={{ fontSize: "13px", color: "var(--muted-foreground)" }}>
                      before
                    </span>
                    {mockBadge && <span style={{ padding: "1px 6px", borderRadius: "5px", border: "1px dashed var(--review)", color: "var(--review)", fontSize: "12px" }}>{data.mockTag}</span>}
                  </div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: "4px" }}>
                    <span id="c4-num" style={{ fontFamily: "var(--font-display)", fontWeight: "700", fontSize: "clamp(44px,7vw,112px)", lineHeight: "0.9", color: "var(--measured)", fontVariantNumeric: "tabular-nums" }}>
                      {m.before.value.value === null ? m.before.value.text : "0"}
                    </span>
                    {m.before.value.value !== null && <span style={{ fontFamily: "var(--font-display)", fontWeight: "600", fontSize: "clamp(28px,3vw,48px)", color: "var(--measured)" }}>%</span>}
                  </div>
                  <div style={{ fontSize: "14px", color: "var(--muted-foreground)" }}>{`of the photo covered by ${word}`}</div>
                </div>
              </div>
            )}
          </div>
          {m ? (
            <div style={{ flex: "1", minHeight: "0", display: "flex", flexWrap: "wrap", gap: "clamp(10px,2vw,24px)", alignContent: "flex-start" }}>
              <figure style={{ margin: "0", flex: "1 1 300px", display: "flex", flexDirection: "column", gap: "8px", minWidth: "0" }}>
                <Photo side={m.before} id="a" aspect="1024/685" />
                <figcaption style={{ display: "flex", justifyContent: "space-between", gap: "12px", fontSize: "13px", color: "var(--muted-foreground)" }}>
                  <span>
                    <strong style={{ color: "var(--foreground)" }}>Before.</strong>
                    {` ${m.place}. ${m.metric === "green" ? "Plant" : "Litter"} mask shown in blue.`}
                  </span>
                  <span>{m.before.credit}</span>
                </figcaption>
              </figure>
              <figure style={{ margin: "0", flex: "1 1 300px", display: "flex", flexDirection: "column", gap: "8px", minWidth: "0" }}>
                <Photo side={m.after} id="b" aspect="1024/685" />
                <figcaption style={{ display: "flex", justifyContent: "space-between", gap: "12px", fontSize: "13px", color: "var(--muted-foreground)" }}>
                  <span>
                    <strong style={{ color: "var(--foreground)" }}>After.</strong>
                    {" Same spot, same framing."}
                  </span>
                  {m.after.src && <span>{m.after.credit}</span>}
                </figcaption>
              </figure>
            </div>
          ) : (
            <p style={{ margin: "0", maxWidth: "720px", fontSize: "16px", lineHeight: "1.5", color: "var(--muted-foreground)" }}>
              No measured before-and-after pair yet. When a spot has a before photo and a later photo from the same framing, its cover is measured on the pixels and shown here with its mask.
            </p>
          )}
          {m && (
            <p id="c4-caveat" style={{ margin: "0", maxWidth: "720px", fontSize: "14px", lineHeight: "1.5", color: "var(--muted-foreground)", opacity: "0" }}>
              Measured on photo pixels. Camera angle, framing, season and light affect the result. We show the mask so you can check it yourself.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
