/* eslint-disable @next/next/no-img-element -- signed Cloudinary URLs */
import { LogoGlyph } from "@/components/glyph";
import type { Checkins, LandingData } from "@/lib/landing/types";

/**
 * Chapter 7 (P1, reinvented): one spot, many visits. The same framed spot photographed again
 * and again, each photo measured the same way: a large frame that steps through the visits as
 * you scroll (landing-dom: discrete steps, cross-faded, no jitter), a filmstrip with each
 * visit's measured cover and its date and time, the QR poster flow, and what the sequence
 * proves, said honestly (a sequence shot within minutes is said to be one). Real visits from
 * the spot trend (lib/landing/view.ts checkinsOf); without any, the designed empty state.
 */
const STEP = { display: "flex", gap: "10px", alignItems: "flex-start", fontSize: "13px", lineHeight: "1.4" } as const;
const DOT = { flexShrink: "0", width: "24px", height: "24px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", fontWeight: "700", background: "var(--primary)", color: "var(--primary-foreground)" } as const;

const val = (p: Checkins["points"][number]) => (p.value.value === null ? p.value.text : `${p.value.text}%`);

export function WatchingChapter({ data }: { data: LandingData }) {
  const c = data.checkins;
  const has = !!c && c.points.length > 1;
  const word = c?.metric === "green" ? "Green" : "Litter";
  const n = c?.points.length ?? 0;
  const last = n - 1;
  const max = Math.max(10, ...(c?.points.map((p) => p.value.value ?? 0) ?? [0]));
  const W = 100;
  const x = (i: number) => (n <= 1 ? W / 2 : 4 + (i / (n - 1)) * (W - 8));
  const y = (v: number | null) => 34 - ((v ?? 0) / max) * 28;
  const proves = !c
    ? null
    : c.sameDay
      ? `These ${n} photos were taken ${c.span}. Each is measured on the same frame, the same way, so they can be compared directly; this close together, the differences come from angle and light, not from change at the spot. Real check-ins come back weeks and months apart.`
      : `These ${n} visits span ${c.span}. Each is measured on the same frame, the same way, so a change in the number is a change at the spot, not in how it was counted.`;
  return (
    <section id="ch7" data-pin={has ? "" : undefined} data-screen-label="07 It keeps watching" style={{ position: "relative", zIndex: "2", height: has ? "320vh" : "auto", background: "var(--secondary)" }}>
      <div id="ch7-sticky" style={{ position: has ? "sticky" : "relative", top: "0", height: has ? "100vh" : "auto", overflow: "hidden", background: "var(--secondary)" }}>
        <div className="c7-layout" style={{ position: has ? "absolute" : "relative", inset: "0", padding: "clamp(84px,12vh,120px) clamp(20px,5vw,72px) clamp(16px,3vh,32px)", boxSizing: "border-box" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "clamp(10px,2vh,18px)", minWidth: "0" }}>
            <h2 style={{ margin: "0", fontFamily: "var(--font-display)", fontWeight: "700", fontStretch: "92%", fontSize: "clamp(32px,4.2vw,64px)", lineHeight: "0.95", letterSpacing: "-0.02em", textWrap: "balance" }}>{c?.metric === "green" ? "A planting is one day." : "A clean-up is one day."} Saakshi keeps watching.</h2>
            <p style={{ margin: "0", fontSize: "clamp(14px,1.2vw,16px)", lineHeight: "1.5", color: "var(--muted-foreground)" }}>A QR poster at the spot lets anyone passing add a photo from the same framing. Each one is measured the same way and compared with the first.</p>
            <ol className="c7-flow" aria-label="How a check-in works" style={{ margin: "0", padding: "12px", listStyle: "none", display: "flex", flexDirection: "column", gap: "10px", borderRadius: "12px", background: "var(--card)", border: "1px solid var(--border)" }}>
              <li style={STEP}>
                <span style={DOT}>1</span>
                <span style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                  <span style={{ flexShrink: "0", padding: "3px", borderRadius: "5px", border: "1px solid var(--border)", background: "var(--card)", lineHeight: "0" }}>
                    <LogoGlyph size={22} />
                  </span>
                  <span>
                    Scan the poster on the pole.{" "}
                    {c?.posterHref && (
                      <a href={c.posterHref} style={{ whiteSpace: "nowrap" }}>
                        See the poster
                      </a>
                    )}
                  </span>
                </span>
              </li>
              <li style={STEP}>
                <span style={DOT}>2</span>
                <span>Take the photo from the marked angle. Location and time are recorded with it.</span>
              </li>
              <li style={STEP}>
                <span style={DOT}>3</span>
                <span>{`Saakshi measures the ${word.toLowerCase()} cover on the same frame and compares it with the spot's first photo.`}</span>
              </li>
            </ol>
            {proves && (
              <div style={{ display: "flex", flexDirection: "column", gap: "4px", padding: "10px 12px", borderRadius: "10px", background: "color-mix(in srgb, var(--measured) 9%, var(--card))", border: "1px solid color-mix(in srgb, var(--measured) 35%, transparent)" }}>
                <span style={{ fontSize: "11px", fontWeight: "600", letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--measured)" }}>What this proves</span>
                <span style={{ fontSize: "13px", lineHeight: "1.45" }}>{proves}</span>
              </div>
            )}
          </div>
          {c && has ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px", minWidth: "0", minHeight: "0" }}>
              <div style={{ position: "relative", width: "100%", aspectRatio: "4/3", maxHeight: "min(50vh,520px)", borderRadius: "14px", overflow: "hidden", background: "var(--placeholder)", boxShadow: "0 24px 60px color-mix(in srgb, var(--foreground) 16%, transparent)" }}>
                {c.points.map((p, i) =>
                  p.photo ? <img key={i} data-c7-frame={i} src={p.photo} alt={`${c.spot}, visit ${i + 1} of ${n}, ${p.when ?? p.label}`} loading="lazy" decoding="async" style={{ position: "absolute", inset: "0", width: "100%", height: "100%", objectFit: "cover", opacity: i === last ? 1 : 0, transition: "opacity 420ms ease" }} /> : null,
                )}
                <div style={{ position: "absolute", left: "12px", top: "12px", display: "flex", gap: "6px", flexWrap: "wrap" }}>
                  <span id="c7-k" style={{ padding: "4px 9px", borderRadius: "999px", background: "color-mix(in srgb, var(--ink-black) 64%, transparent)", color: "var(--l-card)", fontSize: "12px", fontWeight: "600" }}>{`Visit ${n} of ${n}`}</span>
                  <span style={{ padding: "4px 9px", borderRadius: "999px", background: "color-mix(in srgb, var(--ink-black) 64%, transparent)", color: "var(--l-card)", fontSize: "12px" }}>{c.spot}</span>
                </div>
                <div style={{ position: "absolute", left: "12px", right: "12px", bottom: "12px", display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: "10px", flexWrap: "wrap" }}>
                  <span id="c7-when" style={{ padding: "5px 10px", borderRadius: "8px", background: "color-mix(in srgb, var(--ink-black) 64%, transparent)", color: "var(--l-card)", fontSize: "13px", fontFamily: "var(--font-mono)" }}>
                    {c.points[last].when ?? c.points[last].label}
                  </span>
                  <span style={{ display: "flex", alignItems: "baseline", gap: "6px", padding: "6px 12px", borderRadius: "10px", background: "var(--card)" }}>
                    <span style={{ fontSize: "12px", color: "var(--muted-foreground)" }}>{`${word} cover`}</span>
                    <span id="c7-val" style={{ fontFamily: "var(--font-display)", fontWeight: "700", fontSize: "28px", lineHeight: "1", color: "var(--measured)", fontVariantNumeric: "tabular-nums" }}>
                      {val(c.points[last])}
                    </span>
                    <span style={{ padding: "1px 6px", borderRadius: "5px", background: "var(--measured)", color: "var(--card)", fontSize: "10px", fontWeight: "600" }}>Measured</span>
                    {c.points.some((p) => p.value.mock) && <span style={{ padding: "1px 6px", borderRadius: "5px", border: "1px dashed var(--review)", color: "var(--review)", fontSize: "10px" }}>{data.mockTag}</span>}
                  </span>
                </div>
              </div>
              <svg viewBox={`0 0 ${W} 38`} preserveAspectRatio="none" role="img" aria-label={`${word} cover at ${c.spot}, visit by visit: ${c.points.map((p) => `${p.when ?? p.label} ${val(p)}`).join("; ")}`} style={{ width: "100%", height: "clamp(34px,6vh,56px)", overflow: "visible" }}>
                <line x1="0" y1="34" x2={W} y2="34" strokeWidth="0.4" vectorEffect="non-scaling-stroke" style={{ stroke: "var(--chart-axis)" }} />
                <polyline points={c.points.map((p, i) => `${x(i)},${y(p.value.value)}`).join(" ")} fill="none" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" style={{ stroke: "var(--measured)" }} />
              </svg>
              <div role="list" aria-label="Visits" style={{ display: "grid", gridTemplateColumns: `repeat(${n}, minmax(0,1fr))`, gap: "6px" }}>
                {c.points.map((p, i) => (
                  <div key={i} role="listitem" data-c7-thumb={i} style={{ display: "flex", flexDirection: "column", gap: "3px", padding: "4px", borderRadius: "8px", background: "var(--card)", outline: i === last ? "2px solid var(--measured)" : "2px solid transparent", transition: "outline-color 240ms, transform 240ms", transform: i === last ? "translateY(-2px)" : "none" }}>
                    {p.photo && <img src={p.photo} alt="" loading="lazy" decoding="async" style={{ width: "100%", aspectRatio: "4/3", objectFit: "cover", borderRadius: "5px", display: "block" }} />}
                    <span style={{ fontFamily: "var(--font-display)", fontWeight: "700", fontSize: "14px", color: "var(--measured)", lineHeight: "1" }}>{val(p)}</span>
                    <span className="c7-time" style={{ fontSize: "10px", color: "var(--muted-foreground)", lineHeight: "1.25" }}>{(p.when ?? p.label).replace(/ IST$/, "")}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "4px", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "24px", borderRadius: "14px", background: "var(--placeholder)", color: "var(--muted-foreground)", minHeight: "240px" }}>
              <span style={{ fontWeight: "600", color: "var(--foreground)" }}>No check-ins yet</span>
              <span style={{ fontSize: "13px" }}>Check-ins appear once someone scans a spot&apos;s poster.</span>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
