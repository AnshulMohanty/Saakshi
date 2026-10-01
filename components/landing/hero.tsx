/* eslint-disable @next/next/no-img-element -- signed Cloudinary URLs; next/image would re-host them */
import type { LandingData } from "@/lib/landing/types";
import { BAND_COLOR, BAND_LABEL } from "@/components/trust-meter";

/**
 * Chapter 1 (L:617-675): the hero photo still first (the 3D stage replaces it after idle), the
 * headline, then "What Saakshi reads from one photo" and "Sealed into one proof" over the stage.
 * #ch1s is the static version for low power and reduced motion.
 */
const coord = (v: number, dir: [string, string]) => `${Math.abs(v).toFixed(5)}° ${v >= 0 ? dir[0] : dir[1]}`;

export function HeroChapter({ data, demoHref }: { data: LandingData; demoHref: string }) {
  const h = data.hero;
  return (
    <>
      {/* CHAPTER 1: HERO */}
      <section id="ch1" data-pin="" data-screen-label="01 Hero" style={{ position: "relative", zIndex: "2", height: "440vh" }}>
        <div id="ch1-sticky" style={{ position: "sticky", top: "0", height: "100vh", overflow: "hidden" }}>
          {h ? (
            <img id="hero-still" src={h.src} alt={h.alt} fetchPriority="high" decoding="async" style={{ position: "absolute", inset: "0", width: "100%", height: "100%", objectFit: "cover", transition: "opacity 300ms" }} />
          ) : (
            <div id="hero-still" style={{ position: "absolute", inset: "0", background: "var(--placeholder)" }} />
          )}
          <div id="h-tint" style={{ position: "absolute", inset: "0", background: "color-mix(in srgb, var(--n-background) 46%, transparent)" }} />
          <div id="h-copy" style={{ position: "absolute", left: "0", right: "0", bottom: "0", padding: "0 clamp(20px,5vw,72px) clamp(64px,10vh,96px)", display: "flex", flexDirection: "column", gap: "22px", color: "var(--l-card)", maxWidth: "1100px" }}>
            <div lang="hi" style={{ fontFamily: "var(--font-deva)", fontSize: "18px", fontWeight: "500", opacity: "0.9" }}>
              साक्षी means witness.
            </div>
            <h1 style={{ margin: "0", fontFamily: "var(--font-display)", fontWeight: "700", fontStretch: "88%", fontSize: "clamp(56px,9.4vw,156px)", lineHeight: "0.9", letterSpacing: "-0.02em", textWrap: "balance" }}>Proof, not just photos.</h1>
            <p style={{ margin: "0", maxWidth: "620px", fontSize: "clamp(17px,1.5vw,21px)", lineHeight: "1.45", color: "color-mix(in srgb, var(--l-card) 92%, transparent)", textWrap: "pretty" }}>
              Saakshi checks where and when each field photo was taken, measures what changed, and links every number in your report to the photo behind it.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "12px" }}>
              <a href={demoHref} style={{ padding: "14px 20px", borderRadius: "var(--radius)", background: "var(--l-primary)", color: "var(--l-card)", textDecoration: "none", fontWeight: "500", fontSize: "16px" }}>
                Open the live demo
              </a>
              <a href="#ch9" style={{ padding: "13px 19px", borderRadius: "var(--radius)", border: "1px solid color-mix(in srgb, var(--l-card) 70%, transparent)", color: "var(--l-card)", textDecoration: "none", fontWeight: "500", fontSize: "16px" }}>
                Be a witness
              </a>
            </div>
          </div>
          {h && (
            <div id="h-credit" style={{ position: "absolute", left: "clamp(20px,5vw,72px)", right: "clamp(20px,5vw,72px)", bottom: "16px", textAlign: "left", fontSize: "12px", lineHeight: "1.4", color: "color-mix(in srgb, var(--l-card) 78%, transparent)" }}>
              {h.credit}
            </div>
          )}
          <div id="h-explain" style={{ position: "absolute", left: "clamp(20px,5vw,72px)", top: "clamp(92px,16vh,170px)", maxWidth: "min(420px,calc(100% - 40px))", display: "flex", flexDirection: "column", gap: "12px", opacity: "0" }}>
            <h2 style={{ margin: "0", fontFamily: "var(--font-display)", fontWeight: "650", fontStretch: "100%", fontSize: "clamp(32px,4vw,58px)", lineHeight: "0.98", letterSpacing: "-0.015em", textWrap: "balance" }}>What Saakshi reads from one photo.</h2>
            <p style={{ margin: "0", fontSize: "16px", lineHeight: "1.5", color: "var(--muted-foreground)", textWrap: "pretty" }}>Five layers, all from this one file. Each one is something the app records, computes or checks.</p>
          </div>
          <div id="h-seal" style={{ position: "absolute", left: "clamp(20px,5vw,72px)", top: "clamp(92px,16vh,170px)", maxWidth: "min(440px,calc(100% - 40px))", display: "flex", flexDirection: "column", gap: "12px", opacity: "0" }}>
            <h2 id="h-seal-t" style={{ margin: "0", fontFamily: "var(--font-display)", fontWeight: "700", fontStretch: "125%", fontSize: "clamp(32px,4vw,58px)", lineHeight: "0.98", letterSpacing: "-0.015em", textWrap: "balance" }}>
              Sealed into one proof.
            </h2>
            <p style={{ margin: "0", fontSize: "16px", lineHeight: "1.5", color: "var(--muted-foreground)", textWrap: "pretty" }}>Fixed rules turn the layers into a trust score with reasons. No black box: every point is on the strip.</p>
          </div>
          <div id="h-mcap" style={{ position: "absolute", left: "20px", right: "20px", bottom: "24px", height: "120px" }} />
        </div>
      </section>

      {/* static chapter 1 block (reduced motion / low power) */}
      <section id="ch1s" data-screen-label="01 Hero, still" style={{ display: "none", position: "relative", zIndex: "2", background: "var(--background)", padding: "clamp(64px,10vh,120px) clamp(20px,5vw,72px)" }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto", display: "flex", flexWrap: "wrap", gap: "48px", alignItems: "center" }}>
          <div style={{ flex: "1 1 320px", display: "flex", flexDirection: "column", gap: "14px" }}>
            <h2 style={{ margin: "0", fontFamily: "var(--font-display)", fontWeight: "650", fontSize: "clamp(32px,4vw,56px)", lineHeight: "1", letterSpacing: "-0.015em" }}>What Saakshi reads from one photo.</h2>
            {h ? (
              <ol style={{ margin: "0", padding: "0", listStyle: "none", display: "flex", flexDirection: "column", gap: "10px", fontSize: "15px", lineHeight: "1.4", color: "var(--muted-foreground)" }}>
                <li>
                  <strong style={{ color: "var(--foreground)" }}>The photo.</strong>
                  {" Faces blurred before anything is public."}
                </li>
                <li>
                  <strong style={{ color: "var(--foreground)" }}>Where and when.</strong>{" "}
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "13px" }}>{`${h.lat !== null && h.lng !== null ? `${coord(h.lat, ["N", "S"])}, ${coord(h.lng, ["E", "W"])}, ` : ""}${h.when}`}</span>
                </li>
                <li>
                  <strong style={{ color: "var(--foreground)" }}>Its fingerprint.</strong>{" "}
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "13px", color: "var(--primary)" }}>{h.hex}</span>
                </li>
                <li>
                  <strong style={{ color: "var(--foreground)" }}>What the AI sees.</strong>
                  {` ${h.aiText}`}
                </li>
                <li>
                  <strong style={{ color: "var(--foreground)" }}>What we measured.</strong>
                  {h.cover ? (h.cover.value === null ? ` ${h.cover.text}` : ` ${h.metric === "green" ? "Green" : "Litter"} covers ${h.cover.text}% of the frame.`) : " Not measured yet."}
                </li>
              </ol>
            ) : (
              <p style={{ margin: "0", color: "var(--muted-foreground)" }}>No featured photo yet: import the demo archive.</p>
            )}
            {h?.trust && (
              <div style={{ display: "flex", alignItems: "baseline", gap: "10px" }}>
                <span style={{ fontFamily: "var(--font-display)", fontWeight: "700", fontSize: "40px", color: BAND_COLOR[h.trust.band] }}>{h.trust.score}</span>
                <span style={{ fontWeight: "600", color: BAND_COLOR[h.trust.band] }}>{BAND_LABEL[h.trust.band]}</span>
              </div>
            )}
          </div>
          {h && (
            <div style={{ flex: "1 1 360px", height: "min(560px,70vw)", perspective: "1600px", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div id="ls-stack" style={{ position: "relative", width: "min(420px,70vw)", aspectRatio: `${h.w}/${h.h}`, transformStyle: "preserve-3d", transform: "rotateX(56deg) rotateZ(-36deg)" }}>
                <img src={h.src} alt="" style={{ position: "absolute", inset: "0", width: "100%", height: "100%", borderRadius: "4px", transform: "translateZ(0px)" }} />
                {[0, 1, 2, 3].map((i) => (
                  <img key={i} data-ls={i} alt="" style={{ position: "absolute", inset: "0", width: "100%", height: "100%", transform: `translateZ(${70 * (i + 1)}px)` }} />
                ))}
              </div>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
