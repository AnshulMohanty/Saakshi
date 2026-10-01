"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { Glyph } from "@/components/glyph";
import { BAND_COLOR, BAND_LABEL } from "@/components/trust-meter";
import { breakJoins, TREND_BOX, trendGeometry, trendPath } from "@/lib/charts/trend-svg";
import { LOGO_BITS } from "@/lib/glyph";
import type { TrustBand } from "@/lib/trust/types";

/**
 * The public spot page (Spot_Page → /spots/[slug], template SP:319-387): counters, the photo with
 * its mask and a scrubber through every measured photo, the trend card (the design's look on the
 * adaptive time axis, A3), the latest check-ins and the fixed "Add a check-in photo" bar. Below
 * the design, the product's map of where each photo was taken.
 */
export interface SpotPoint {
  key: string;
  /** Capture time, epoch ms. */
  t: number;
  value: number;
  /** The value as shown ("10", "3.5"). */
  v: string;
  label: string;
  /** Scrubber header ("14 Sep 2026, the baseline"). */
  date: string;
  /** Full date and time, on hover. */
  when: string;
  photo: { src: string; alt: string } | null;
  mask: string | null;
  /** The prototype's empty frame (fixture only: every real point has a photo). */
  placeholder?: { title: string; sub: string };
}

export interface SpotCard {
  key: string;
  date: string;
  who: string;
  v: string | null;
  band: TrustBand | null;
  thumb: string | null;
  /** The prototype's thumbnail text (fixture only). */
  thumbText?: string;
  href: string | null;
}

export interface SpotPageData {
  project: string;
  title: string;
  coords: string;
  /** "clean-up", "planting". */
  event: string;
  /** "litter", "green". */
  metric: string;
  counters: { checkins: string; daysSince: string; change: string };
  /** Why there is no trend (production hides mock-derived numbers), or null. */
  hidden: string | null;
  mock: boolean;
  points: SpotPoint[];
  /** Our masks are greyscale (luminance); the prototype's are transparent PNGs (alpha). */
  maskMode: "luminance" | "alpha";
  /** The frame the photos and masks share ("800/600"). */
  frameAspect: string;
  offsetMinutes: number;
  latestTitle: string;
  latest: SpotCard[];
  caveat: string;
  framing: { note: string; thumb: string | null } | null;
  map: { lat: number; lng: number; radiusM: number; pins: Array<{ id: string; lat: number; lng: number; label: string }> } | null;
  homeHref: string;
  posterHref: string;
  checkinHref: string;
}

const CARD = { display: "flex", flexDirection: "column", gap: "2px", padding: "14px", borderRadius: "12px", background: "var(--card)" } as const;
const BIG = { fontFamily: "var(--font-display)", fontWeight: "700", fontSize: "40px", lineHeight: "1" } as const;
const SMALL = { fontSize: "13px", color: "var(--muted-foreground)" } as const;
const MOCK = { alignSelf: "flex-start", padding: "1px 6px", borderRadius: "5px", border: "1px dashed var(--review)", color: "var(--review)", fontSize: "11px" } as const;

const SpotMap = dynamic(() => import("./spot-map"), { ssr: false, loading: () => <div style={{ height: "256px", borderRadius: "12px", background: "var(--placeholder)" }} /> });

export function SpotPage({ data }: { data: SpotPageData }) {
  const pts = data.points;
  const [idx, setIdx] = useState(Math.max(0, pts.length - 1));
  const [mask, setMask] = useState(true);
  const [hover, setHover] = useState<number | null>(null);
  const g = useMemo(() => trendGeometry(pts, { offsetMinutes: data.offsetMinutes }), [pts, data.offsetMinutes]);
  const cur = pts[idx] ?? null;
  const tip = hover !== null ? { p: pts[hover], at: g.pts[hover] } : null;

  return (
    <div className="design-root" data-screen-label="Spot page" style={{ fontFamily: "var(--font-sans)", color: "var(--foreground)", fontVariantNumeric: "tabular-nums", paddingBottom: data.framing ? "148px" : "96px", background: "var(--secondary)", minHeight: "100vh" }}>
      <header style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px clamp(16px,4vw,48px)", background: "var(--card)", borderBottom: "1px solid var(--border)" }}>
        <a style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--foreground)", textDecoration: "none" }} href={data.homeHref}>
          <Glyph bits={LOGO_BITS} size={22} colors={{ off: "transparent" }} style={{ width: "22px", height: "22px" }} />
          <span style={{ fontFamily: "var(--font-display)", fontWeight: "650", fontSize: "19px" }}>Saakshi</span>
        </a>
        <span style={{ flex: "1", fontSize: "13px", color: "var(--muted-foreground)" }}>Spot</span>
        <a style={{ fontSize: "13px" }} href={data.posterHref}>
          QR poster
        </a>
      </header>
      <main style={{ maxWidth: "1200px", margin: "0 auto", padding: "clamp(16px,3vw,40px) clamp(16px,4vw,48px)", display: "flex", flexDirection: "column", gap: "22px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <span style={SMALL}>{data.project}</span>
          <h1 style={{ margin: "0", fontFamily: "var(--font-display)", fontWeight: "700", fontStretch: "90%", fontSize: "clamp(34px,5.4vw,64px)", lineHeight: "0.94", letterSpacing: "-0.015em" }}>{data.title}</h1>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "13px", color: "var(--muted-foreground)" }}>{data.coords}</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: "10px" }}>
          <div style={CARD}>
            <span style={BIG}>{data.counters.checkins}</span>
            <span style={SMALL}>check-ins since the {data.event}</span>
          </div>
          <div style={CARD}>
            <span style={BIG}>{data.counters.daysSince}</span>
            <span style={SMALL}>{data.counters.daysSince === "–" ? "no check-ins yet" : "days since the last check-in"}</span>
          </div>
          <div style={CARD}>
            <span style={{ ...BIG, color: "var(--measured)" }} data-testid="spot-change">
              {data.counters.change}
            </span>
            <span style={SMALL}>{data.metric} cover, before and now, Measured</span>
            {data.mock && <span style={MOCK}>Mock output</span>}
          </div>
        </div>
        <section style={{ display: "flex", flexWrap: "wrap", gap: "16px", alignItems: "flex-start" }}>
          <div style={{ flex: "1 1 380px", minWidth: "0", display: "flex", flexDirection: "column", gap: "10px" }}>
            <div style={{ position: "relative", width: "100%", aspectRatio: data.frameAspect, borderRadius: "12px", overflow: "hidden", background: "var(--placeholder)" }}>
              {cur?.photo && (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element -- signed, face-blurred Cloudinary delivery URL */}
                  <img style={{ position: "absolute", inset: "0", width: "100%", height: "100%", objectFit: "cover" }} src={cur.photo.src} alt={cur.photo.alt} />
                  {cur.mask && <div style={{ position: "absolute", inset: "0", background: "var(--mask-tint)", opacity: mask ? 0.75 : 0, WebkitMaskImage: `url("${cur.mask}")`, maskImage: `url("${cur.mask}")`, WebkitMaskSize: "100% 100%", maskSize: "100% 100%", maskMode: data.maskMode }} />}
                </>
              )}
              {cur && !cur.photo && cur.placeholder && (
                <div style={{ position: "absolute", inset: "0", display: "flex", flexDirection: "column", gap: "4px", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "16px", color: "var(--muted-foreground)" }}>
                  <span style={{ fontWeight: "600", color: "var(--foreground)" }}>{cur.placeholder.title}</span>
                  <span style={{ fontSize: "13px" }}>{cur.placeholder.sub}</span>
                </div>
              )}
              {!cur && (
                <div style={{ position: "absolute", inset: "0", display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "16px", fontSize: "13px", color: "var(--muted-foreground)" }}>{data.hidden ?? "Nothing measured here yet."}</div>
              )}
              {cur && (
                <div style={{ position: "absolute", left: "10px", top: "10px", display: "flex", gap: "6px", alignItems: "center", padding: "6px 10px", borderRadius: "8px", background: "color-mix(in srgb, var(--card) 94%, transparent)", fontSize: "13px" }}>
                  <span style={{ fontWeight: "600" }}>{cur.label}</span>
                  <span style={{ color: "var(--measured)", fontWeight: "600" }}>{`${cur.v}%`}</span>
                </div>
              )}
            </div>
            {cur && (
              <label style={{ display: "flex", flexDirection: "column", gap: "6px", padding: "12px 14px", borderRadius: "12px", background: "var(--card)" }}>
                <span style={{ display: "flex", justifyContent: "space-between", gap: "12px", fontSize: "13px" }}>
                  <span style={{ fontWeight: "600" }}>Move through time</span>
                  <span style={{ color: "var(--muted-foreground)", textAlign: "right" }}>{cur.date}</span>
                </span>
                <input
                  type="range"
                  min="0"
                  max={pts.length - 1}
                  step="1"
                  value={idx}
                  onChange={(e) => setIdx(Number(e.target.value))}
                  aria-label="Check-in"
                  aria-valuetext={`${cur.label}, ${cur.date}, ${cur.v}%`}
                  style={{ accentColor: "var(--measured)" }}
                  data-testid="spot-scrubber"
                />
                <span style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "var(--muted-foreground)" }}>
                  <span>Before</span>
                  <span>Latest</span>
                </span>
              </label>
            )}
            {pts.some((p) => p.mask) && (
              <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", color: "var(--muted-foreground)" }}>
                <input type="checkbox" checked={mask} onChange={() => setMask((m) => !m)} />
                {` Show the ${data.metric} mask`}
              </label>
            )}
          </div>
          <div style={{ flex: "1 1 380px", minWidth: "0", display: "flex", flexDirection: "column", gap: "12px", padding: "16px", borderRadius: "12px", background: "var(--card)" }}>
            <span style={{ fontWeight: "600" }}>{data.metric === "litter" ? "Litter" : "Green"} trend</span>
            {pts.length ? (
              <div style={{ position: "relative", display: "flex", flexDirection: "column" }}>
                <svg
                  style={{ width: "100%", height: "auto", overflow: "visible" }}
                  viewBox={`0 0 ${TREND_BOX.w} ${TREND_BOX.h}`}
                  role="img"
                  aria-label={`${data.metric === "litter" ? "Litter" : "Green"} cover over time: ${pts.length} measured photos, from ${pts[0].v}% to ${pts.at(-1)!.v}%`}
                  data-testid="spot-trend"
                  data-points={pts.length}
                  data-runs={g.breaks.length + 1}
                  onMouseLeave={() => setHover(null)}
                >
                  <line style={{ stroke: "var(--border)" }} x1={TREND_BOX.x0} y1={TREND_BOX.base} x2={TREND_BOX.x1} y2={TREND_BOX.base} />
                  {g.breaks.map((b) => (
                    <g key={b.x0} data-testid="trend-break">
                      <rect x={b.x0} y={TREND_BOX.base - TREND_BOX.height} width={b.x1 - b.x0} height={TREND_BOX.height + 4} style={{ fill: "var(--background)" }} />
                      <text x={(b.x0 + b.x1) / 2} y={TREND_BOX.base - TREND_BOX.height - 6} textAnchor="middle" fontSize="11" style={{ fill: "var(--muted-foreground)", fontFamily: "var(--font-sans)" }}>
                        {b.label}
                      </text>
                    </g>
                  ))}
                  {g.ticks.map((t) => (
                    <g key={`${t.x}-${t.label}`}>
                      <line x1={t.x} y1={TREND_BOX.base} x2={t.x} y2={TREND_BOX.base + 4} style={{ stroke: "var(--border)" }} />
                      <text x={t.x} y="232" textAnchor={t.anchor} fontSize="12" style={{ fill: "var(--muted-foreground)", fontFamily: "var(--font-sans)" }}>
                        {t.label}
                      </text>
                    </g>
                  ))}
                  {breakJoins(g, idx).map((j) => (
                    <line key={j.x1} {...j} strokeWidth="2" strokeDasharray="4 4" style={{ stroke: "var(--measured)" }} opacity="0.6" />
                  ))}
                  <path style={{ stroke: "var(--measured)" }} d={trendPath(g, idx)} fill="none" strokeWidth="3" strokeLinejoin="round" />
                  {g.pts.map((p, k) => (
                    <circle
                      key={pts[k].key}
                      style={{ stroke: "var(--measured)", fill: k <= idx ? "var(--measured)" : "var(--card)", cursor: "pointer" }}
                      cx={p.x}
                      cy={p.y}
                      r={k === idx ? 8 : 4}
                      strokeWidth="2"
                      onMouseEnter={() => setHover(k)}
                      onClick={() => setIdx(k)}
                    />
                  ))}
                </svg>
                {tip && (
                  <div
                    aria-hidden
                    style={{ position: "absolute", left: `${(tip.at.x / TREND_BOX.w) * 100}%`, top: `${(tip.at.y / TREND_BOX.h) * 100}%`, transform: `translate(${tip.at.x < 140 ? "-10%" : tip.at.x > 420 ? "-90%" : "-50%"}, calc(-100% - 14px))`, pointerEvents: "none", whiteSpace: "nowrap", padding: "6px 9px", borderRadius: "8px", background: "var(--card)", border: "1px solid var(--border)", boxShadow: "0 6px 18px color-mix(in srgb, var(--foreground) 12%, transparent)", fontSize: "12px", display: "flex", flexDirection: "column", gap: "2px" }}
                    data-testid="trend-tip"
                  >
                    <span style={{ fontWeight: "600" }}>
                      {tip.p.label}, <span style={{ color: "var(--measured)" }}>{tip.p.v}%</span>
                    </span>
                    <span style={{ color: "var(--muted-foreground)" }}>{tip.p.when}</span>
                  </div>
                )}
              </div>
            ) : (
              <span style={SMALL}>{data.hidden ?? "Nothing measured here yet."}</span>
            )}
            {g.captions.length > 0 && <span style={{ fontSize: "12px", color: "var(--muted-foreground)" }}>{g.captions.join(" · ")}</span>}
            <span style={{ fontSize: "12px", color: "var(--muted-foreground)", lineHeight: "1.45" }}>{data.caveat}</span>
          </div>
        </section>
        <section style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <h2 style={{ margin: "0", fontSize: "17px", fontWeight: "600" }}>{data.latestTitle}</h2>
          {data.latest.length ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))", gap: "10px" }}>
              {data.latest.map((c) => (
                <a style={{ display: "flex", gap: "10px", alignItems: "center", padding: "10px", borderRadius: "12px", background: "var(--card)", color: "var(--foreground)", textDecoration: "none" }} href={c.href ?? undefined} key={c.key}>
                  {c.thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element -- signed, face-blurred thumbnail
                    <img src={c.thumb} alt="" loading="lazy" style={{ width: "72px", height: "54px", borderRadius: "8px", objectFit: "cover", flexShrink: "0", background: "var(--placeholder)" }} />
                  ) : (
                    <div style={{ width: "72px", height: "54px", borderRadius: "8px", background: "var(--placeholder)", flexShrink: "0", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "9px", color: "var(--muted-foreground)", textAlign: "center" }}>{c.thumbText}</div>
                  )}
                  <div style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px" }}>
                    <span style={{ fontSize: "14px", fontWeight: "500" }}>{c.date}</span>
                    <span style={{ fontSize: "12px", color: "var(--muted-foreground)" }}>{c.who}</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "2px" }}>
                    {c.v !== null && <span style={{ fontWeight: "600", color: "var(--measured)" }}>{`${c.v}%`}</span>}
                    {c.band && <span style={{ fontSize: "11px", fontWeight: "600", color: BAND_COLOR[c.band] }}>{BAND_LABEL[c.band]}</span>}
                  </div>
                </a>
              ))}
            </div>
          ) : (
            <span style={SMALL}>No check-ins yet. Scan the poster at the spot to add the first one.</span>
          )}
        </section>
        {data.map && (
          <section style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <h2 style={{ margin: "0", fontSize: "17px", fontWeight: "600" }}>Where the photos were taken</h2>
            <SpotMap map={data.map} />
            <span style={{ fontSize: "12px", color: "var(--muted-foreground)" }}>The circle is the site radius ({data.map.radiusM} m). Pins are each photo&apos;s recorded location.</span>
          </section>
        )}
      </main>
      <div style={{ position: "fixed", left: "0", right: "0", bottom: "0", padding: "12px clamp(16px,4vw,48px)", background: "color-mix(in srgb, var(--card) 96%, transparent)", borderTop: "1px solid var(--border)", display: "flex", flexDirection: "column", alignItems: "center", gap: "10px" }}>
        {data.framing && (
          <span style={{ width: "min(520px,100%)", display: "flex", alignItems: "center", gap: "10px", fontSize: "13px", color: "var(--muted-foreground)" }} data-testid="spot-framing">
            {data.framing.thumb && (
              // eslint-disable-next-line @next/next/no-img-element -- signed, face-blurred thumbnail of the baseline
              <img src={data.framing.thumb} alt="The baseline photo: frame your check-in like this" style={{ width: "48px", height: "36px", borderRadius: "6px", objectFit: "cover", flexShrink: "0" }} />
            )}
            <span>{data.framing.note}</span>
          </span>
        )}
        <a style={{ width: "min(520px,100%)", boxSizing: "border-box", textAlign: "center", padding: "14px 18px", borderRadius: "12px", background: "var(--primary)", color: "var(--card)", textDecoration: "none", fontWeight: "600", fontSize: "16px" }} href={data.checkinHref} data-testid="checkin-link">
          Add a check-in photo
        </a>
      </div>
    </div>
  );
}
