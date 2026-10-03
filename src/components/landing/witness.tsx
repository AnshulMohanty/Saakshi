"use client";

/* eslint-disable @next/next/no-img-element -- signed, face-blurred thumbnails from the live feed */
import { useEffect, useRef, useState } from "react";
import { IndiaMap } from "@/components/map/india-map";
import type { LandingData } from "@/lib/landing/types";
import type { LiveEvent } from "@/lib/live";

/**
 * Chapter 9 (L:1008-1030): the QR to the witness camera, and the full map of India where real
 * Witness photos land as they arrive (/api/live, B5.8): each one drops onto its place as a
 * thumbnail with a ripple. The QR is rendered on the server (level M), dark modules on white.
 * The feed opens only while the chapter is on screen.
 */
type Arrival = Pick<LiveEvent, "id" | "thumbUrl" | "place" | "band"> & { lat: number; lng: number; at: number };

const BAND_WORD: Record<string, string> = { VERIFIED: "verified", NEEDS_REVIEW: "needs review", FLAGGED: "flagged" };

export function WitnessChapter({ data, qrSvg, live = true }: { data: LandingData; qrSvg: string; live?: boolean }) {
  const w = data.witness;
  const box = useRef<HTMLElement>(null);
  const [arrivals, setArrivals] = useState<Arrival[]>([]);
  const [latest, setLatest] = useState<string>("Waiting for the next witness photo");

  useEffect(() => {
    const el = box.current;
    if (!el || !live) return;
    let es: EventSource | null = null;
    const nearest = (lat: number, lng: number) => w.spots.reduce((best, s) => ((s.lat - lat) ** 2 + (s.lng - lng) ** 2 < (best.lat - lat) ** 2 + (best.lng - lng) ** 2 ? s : best), w.spots[0]);
    const open = () => {
      if (es) return;
      try {
        es = new EventSource("/api/live");
        es.addEventListener("arrival", (m) => {
          const ev = JSON.parse((m as MessageEvent<string>).data) as LiveEvent;
          if (!ev.location) return;
          const near = w.spots.length ? nearest(ev.location.lat, ev.location.lng).city : null;
          setLatest(`New witness photo${ev.place ? ` at ${ev.place}` : near ? ` near ${near}` : ""}${ev.band ? `, ${BAND_WORD[ev.band] ?? ev.band.toLowerCase()}` : ""}`);
          setArrivals((a) => [{ id: ev.id, thumbUrl: ev.thumbUrl, place: ev.place, band: ev.band, lat: ev.location!.lat, lng: ev.location!.lng, at: Date.now() }, ...a.filter((x) => x.id !== ev.id)].slice(0, 6));
        });
      } catch {
        es = null;
      }
    };
    const close = () => {
      es?.close();
      es = null;
    };
    const io = new IntersectionObserver((e) => (e.some((x) => x.isIntersecting) ? open() : close()), { rootMargin: "200px" });
    io.observe(el);
    return () => {
      io.disconnect();
      close();
    };
  }, [live, w.spots]);

  return (
    <section ref={box} id="ch9" className="night" data-night="" data-screen-label="09 Be a witness" style={{ position: "relative", zIndex: "2", background: "var(--background)", color: "var(--foreground)", padding: "clamp(72px,11vh,120px) clamp(20px,5vw,72px)", overflow: "hidden" }}>
      <div style={{ maxWidth: "1200px", margin: "0 auto", display: "flex", flexWrap: "wrap", gap: "clamp(24px,4vw,64px)", alignItems: "center" }}>
        <div style={{ flex: "1 1 320px", display: "flex", flexDirection: "column", gap: "18px" }}>
          <h2 style={{ margin: "0", fontFamily: "var(--font-display)", fontWeight: "700", fontStretch: "88%", fontSize: "clamp(44px,6vw,96px)", lineHeight: "0.92", letterSpacing: "-0.02em" }}>Be a witness.</h2>
          <p style={{ margin: "0", fontSize: "clamp(17px,1.6vw,22px)", lineHeight: "1.45", color: "var(--foreground)", maxWidth: "440px" }}>Scan with your phone. Take a photo. Watch it land here.</p>
          <div style={{ display: "flex", gap: "18px", alignItems: "center", flexWrap: "wrap" }}>
            <div id="qr" role="img" aria-label="QR code to open the Saakshi witness camera" dangerouslySetInnerHTML={{ __html: qrSvg }} style={{ width: "clamp(180px,20vw,240px)", aspectRatio: "1", padding: "14px", borderRadius: "14px", background: "var(--l-card)", boxSizing: "border-box", boxShadow: "0 0 0 6px color-mix(in srgb, var(--primary) 22%, transparent), 0 20px 60px color-mix(in srgb, var(--primary) 30%, transparent)" }} />
            <div style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "13px", color: "var(--muted-foreground)", maxWidth: "240px" }}>
              <a href={w.url} style={{ fontFamily: "var(--font-mono)", color: "var(--foreground)", textDecoration: "none", overflowWrap: "anywhere" }}>
                {w.label}
              </a>
              <span>Opens the camera in your browser. Your location and time are recorded with the photo. Faces are blurred before it appears.</span>
            </div>
          </div>
          <ol style={{ margin: "0", padding: "0", listStyle: "none", display: "flex", flexWrap: "wrap", gap: "8px", fontSize: "13px" }}>
            {["Scan the code", "Take one photo", "It lands on the map, scored"].map((t, i) => (
              <li key={t} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "6px 10px", borderRadius: "999px", background: "var(--muted)", border: "1px solid var(--border)" }}>
                <span style={{ width: "20px", height: "20px", borderRadius: "50%", background: "var(--primary)", color: "var(--primary-foreground)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", fontWeight: "700" }}>{i + 1}</span>
                {t}
              </li>
            ))}
          </ol>
        </div>
        <div style={{ flex: "1 1 380px", minWidth: "0", display: "flex", flexDirection: "column", gap: "10px" }}>
          <IndiaMap
            theme="night"
            variant="panel"
            ariaLabel={`Map of India with the demo sites: ${w.spots.map((s) => s.city).join(", ")}. New witness photos appear where they were taken.`}
            sites={w.spots.map((s, i) => ({ key: `${s.city}-${i}`, lat: s.lat, lng: s.lng, label: s.city, tone: "verified" as const }))}
            ripples={arrivals.map((a) => ({ id: `${a.id}-${a.at}`, lat: a.lat, lng: a.lng }))}
            overlay={(p) =>
              arrivals.map((a, i) => (
                <span key={`${a.id}-${a.at}`} className="im-drop" style={{ position: "absolute", left: `${p.x(a.lng)}px`, top: `${p.y(a.lat)}px`, zIndex: 4 + (6 - i), width: "52px", height: "40px", borderRadius: "6px", overflow: "hidden", border: "2px solid var(--l-card)", boxShadow: "0 8px 22px color-mix(in srgb, var(--ink-black) 45%, transparent)", opacity: i === 0 ? 1 : 0.75 }}>
                  <img src={a.thumbUrl} alt={`New witness photo${a.place ? ` at ${a.place}` : ""}`} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                </span>
              ))
            }
            style={{ width: "100%", aspectRatio: "0.92", maxHeight: "min(78vh,720px)" }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", fontSize: "12px", color: "var(--muted-foreground)" }}>
            <span id="c9-latest" aria-live="polite" style={{ display: "flex", alignItems: "center", gap: "8px", color: arrivals.length ? "var(--foreground)" : undefined }}>
              <span aria-hidden="true" style={{ width: "8px", height: "8px", borderRadius: "50%", background: "var(--verified)", boxShadow: "0 0 0 3px color-mix(in srgb, var(--verified) 30%, transparent)" }} />
              {latest}
            </span>
            <span>{data.copy.liveCaption}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
