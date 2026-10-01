"use client";

/* eslint-disable @next/next/no-img-element -- signed Cloudinary URLs */
import { gsap } from "gsap";
import { useEffect, useRef } from "react";
import { Glyph } from "@/components/glyph";
import { BAND_COLOR, BAND_LABEL } from "@/components/trust-meter";
import { LOGO_BITS } from "@/lib/glyph";
import { rng } from "@/lib/scenes/landing-stage";
import type { TrustBand } from "@/lib/trust/types";

/**
 * Demo entry (Demo_Entry → /demo): three ways into the same demo, each card with a short loop
 * (template DE:361-486). Every photo, name and number is ours; the manager's scatter is seeded
 * where the prototype used Math.random. Loops pause off screen and rest at 70% for reduced motion.
 */
export interface DemoEntryData {
  volunteer: { photo: string; place: string; time: string; score: number | null; band: TrustBand | null; href: string };
  manager: { tiles: Array<{ src: string; flagged: boolean }>; groups: number[]; labels: [string, string, string]; href: string };
  funder: { project: string; verified: string; tiles: string[]; href: string };
  footnote: string;
  homeHref: string;
  howHref: string;
  seed: number;
}

const CARD = { display: "flex", flexDirection: "column", borderRadius: "16px", overflow: "hidden", background: "var(--card)", border: "1px solid var(--border)", color: "var(--foreground)", textDecoration: "none", transition: "border-color 160ms,box-shadow 160ms" } as const;
const TITLE = { fontFamily: "var(--font-display)", fontWeight: "650", fontSize: "26px" } as const;
const BODY = { fontSize: "14px", lineHeight: "1.5", color: "var(--muted-foreground)" } as const;
const CTA = { marginTop: "6px", alignSelf: "flex-start", padding: "10px 14px", borderRadius: "9px", background: "var(--primary)", color: "var(--card)", fontWeight: "500", fontSize: "14px" } as const;
const THREADS = ["M170 84 C170 150 40 150 40 222", "M170 84 C170 150 105 150 105 222", "M170 84 C170 150 170 150 170 222", "M170 84 C170 150 235 150 235 222", "M170 84 C170 150 300 150 300 222"];

export function DemoEntry({ data }: { data: DemoEntryData }) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const q = (s: string) => el.querySelector<HTMLElement>(s);
    const qa = (s: string) => [...el.querySelectorAll<HTMLElement>(s)];
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const ctx = gsap.context(() => {}, el);
    let io: IntersectionObserver | null = null;
    ctx.add(() => {
      // volunteer (DE:456-464)
      const s = { v: 0 };
      const target = data.volunteer.score ?? 0;
      const setScore = (v: number) => {
        const n = q('[data-v="score"]');
        if (n) n.textContent = data.volunteer.score === null ? "–" : String(Math.round(v));
      };
      const v = gsap
        .timeline({ repeat: -1, repeatDelay: 1.2 })
        .set('[data-v="sheet"]', { yPercent: 110 })
        .set(s, { v: 0 })
        .call(() => setScore(0))
        .fromTo('[data-v="frame"]', { scale: 1.12, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.7, ease: "expo.out" })
        .to('[data-v="shutter"]', { scale: 0.85, duration: 0.12, yoyo: true, repeat: 1 }, "+=0.6")
        .fromTo('[data-v="flash"]', { opacity: 0.9 }, { opacity: 0, duration: 0.4 }, "<")
        .to('[data-v="sheet"]', { yPercent: 0, duration: 0.6, ease: "expo.out" }, "+=0.2")
        .to(s, { v: target, duration: 0.8, ease: "power2.out", onUpdate: () => setScore(s.v) }, "<0.1")
        .to({}, { duration: 1.6 });
      // manager (DE:466-474): scattered, then sorted into one column per project
      const tiles = qa("[data-mt]");
      const box = q('[data-m="field"]')!;
      const W = () => box.clientWidth;
      const H = 300;
      const groups = data.manager.groups;
      const slot = (i: number) => {
        const gi = groups[i];
        const idx = groups.slice(0, i).filter((x) => x === gi).length;
        const cw = (W() - 40) / 3;
        return { x: 20 + gi * cw + (idx % 2) * 56, y: 40 + Math.floor(idx / 2) * 56 };
      };
      const r = rng(data.seed);
      const scatter = tiles.map(() => ({ x: r(), y: r(), rot: r() }));
      const m = gsap.timeline({ repeat: -1, repeatDelay: 1 });
      tiles.forEach((t, i) => m.set(t, { x: () => scatter[i].x * (W() - 52), y: () => 30 + scatter[i].y * (H - 90), rotate: () => (scatter[i].rot - 0.5) * 40, opacity: 1 }, 0));
      m.set('[data-m="label"]', { opacity: 0 }, 0).to({}, { duration: 0.9 });
      tiles.forEach((t, i) => m.to(t, { x: () => slot(i).x, y: () => slot(i).y, rotate: 0, duration: 0.9, ease: "power3.inOut" }, 1 + i * 0.05));
      m.to('[data-m="label"]', { opacity: 1, duration: 0.4 }, 2.4).to({}, { duration: 2.4 });
      // funder (DE:476-481)
      const f = gsap
        .timeline({ repeat: -1, repeatDelay: 1 })
        .set('[data-f="th"]', { strokeDashoffset: 1 })
        .set('[data-f="tile"]', { opacity: 0.35 })
        .to('[data-f="th"]', { strokeDashoffset: 0, duration: 0.9, stagger: 0.08, ease: "power2.inOut" }, 0.6)
        .to('[data-f="tile"]', { opacity: 1, duration: 0.3, stagger: 0.08 }, 1.2)
        .to({}, { duration: 2.2 })
        .to('[data-f="th"]', { opacity: 0, duration: 0.4 })
        .set('[data-f="th"]', { opacity: 1, strokeDashoffset: 1 });
      const tls = { volunteer: v, manager: m, funder: f };
      el.dataset.loopsReady = "";
      if (reduced) {
        for (const t of Object.values(tls)) t.progress(0.7).pause();
        return;
      }
      io = new IntersectionObserver((es) =>
        es.forEach((e) => {
          const k = tls[(e.target as HTMLElement).dataset.role as keyof typeof tls];
          if (!k) return;
          if (e.isIntersecting) k.play();
          else k.pause();
        }),
      );
      qa("[data-role]").forEach((x) => io!.observe(x));
    });
    return () => {
      io?.disconnect();
      ctx.revert();
    };
  }, [data]);

  const vb = data.volunteer.band;
  const vColor = vb ? BAND_COLOR[vb] : "var(--muted-foreground)";
  return (
    <div ref={root} className="design-root" style={{ background: "var(--background)" }}>
      <style>{`.de-card:hover,.de-card:focus-visible{border-color:var(--primary)!important;box-shadow:0 0 0 3px color-mix(in srgb,var(--primary) 18%,transparent)!important;outline:none}`}</style>
      <div data-screen-label="Demo entry" style={{ minHeight: "100vh", boxSizing: "border-box", fontFamily: "var(--font-sans)", color: "var(--foreground)", fontVariantNumeric: "tabular-nums", padding: "clamp(20px,4vw,48px) clamp(16px,5vw,72px) 48px", display: "flex", flexDirection: "column", gap: "clamp(28px,6vh,56px)" }}>
        <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px" }}>
          <a href={data.homeHref} style={{ display: "flex", alignItems: "center", gap: "10px", color: "var(--foreground)", textDecoration: "none" }}>
            <Glyph bits={LOGO_BITS} size={26} colors={{ off: "transparent" }} />
            <span style={{ fontFamily: "var(--font-display)", fontWeight: "650", fontSize: "22px" }}>Saakshi</span>
            <span lang="hi" style={{ fontFamily: "var(--font-deva)", fontSize: "18px", color: "var(--muted-foreground)" }}>
              साक्षी
            </span>
          </a>
          <a href={data.howHref} style={{ fontSize: "14px", color: "var(--foreground)" }}>
            How it works
          </a>
        </header>
        <main style={{ display: "contents" }}>
          <div style={{ maxWidth: "1200px", width: "100%", margin: "0 auto", display: "flex", flexDirection: "column", gap: "12px" }}>
            <h1 style={{ margin: "0", fontFamily: "var(--font-display)", fontWeight: "700", fontStretch: "88%", fontSize: "clamp(40px,6vw,88px)", lineHeight: "0.92", letterSpacing: "-0.02em" }}>How do you want to see it?</h1>
            <p style={{ margin: "0", maxWidth: "600px", fontSize: "17px", lineHeight: "1.5", color: "var(--muted-foreground)" }}>Same demo archive, three people. Pick one; you can switch at any time from the top bar.</p>
          </div>
          <div style={{ maxWidth: "1200px", width: "100%", margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: "16px" }}>
            <a className="de-card" href={data.volunteer.href} data-role="volunteer" style={{ ...CARD, gap: "0" }}>
              <div style={{ position: "relative", height: "300px", background: "var(--secondary)", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <div style={{ position: "relative", width: "150px", height: "270px", borderRadius: "24px", background: "var(--foreground)", padding: "7px", boxSizing: "border-box" }}>
                  <div style={{ position: "relative", width: "100%", height: "100%", borderRadius: "18px", overflow: "hidden", background: "var(--ink-black)" }}>
                    <img src={data.volunteer.photo} alt="" style={{ position: "absolute", inset: "0", width: "100%", height: "100%", objectFit: "cover", objectPosition: "40% 50%" }} />
                    <div data-v="frame" style={{ position: "absolute", left: "16px", right: "16px", top: "60px", bottom: "90px", border: "1.5px solid color-mix(in srgb, var(--card) 85%, transparent)", borderRadius: "6px" }} />
                    <div data-v="flash" style={{ position: "absolute", inset: "0", background: "var(--card)", opacity: "0" }} />
                    <div data-v="shutter" style={{ position: "absolute", left: "50%", bottom: "18px", width: "40px", height: "40px", marginLeft: "-20px", borderRadius: "20px", border: "3px solid var(--card)", boxSizing: "border-box" }} />
                    <div data-v="sheet" style={{ position: "absolute", left: "0", right: "0", bottom: "0", padding: "10px", background: "var(--card)", borderRadius: "12px 12px 0 0", display: "flex", flexDirection: "column", gap: "4px", transform: "translateY(110%)" }}>
                      <span style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "10px", color: "var(--muted-foreground)" }}>
                        <span style={{ width: "7px", height: "7px", borderRadius: "4px", background: vColor }} />
                        {`${data.volunteer.place}, ${data.volunteer.time}`}
                      </span>
                      <span style={{ display: "flex", alignItems: "baseline", gap: "6px" }}>
                        <span data-v="score" style={{ fontFamily: "var(--font-display)", fontWeight: "700", fontSize: "26px", lineHeight: "1", color: vColor }}>
                          0
                        </span>
                        <span style={{ fontSize: "11px", fontWeight: "600", color: vColor }}>{vb ? BAND_LABEL[vb] : "Scored"}</span>
                      </span>
                    </div>
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "18px 20px 20px" }}>
                <span style={TITLE}>As a volunteer</span>
                <span style={BODY}>Take a photo at a spot. See where and when it was recorded, and its score, before you leave.</span>
                <span style={CTA}>Start capturing</span>
              </div>
            </a>

            <a className="de-card" href={data.manager.href} data-role="manager" style={CARD}>
              <div style={{ position: "relative", height: "300px", background: "var(--secondary)", overflow: "hidden" }}>
                <div style={{ position: "absolute", left: "20px", top: "18px", right: "20px", display: "flex", justifyContent: "space-between", fontSize: "11px", color: "var(--muted-foreground)" }}>
                  {data.manager.labels.map((l, i) => (
                    <span key={i} data-m="label" style={{ opacity: "0" }}>
                      {l}
                    </span>
                  ))}
                </div>
                <div data-m="field" style={{ position: "absolute", inset: "0" }}>
                  {data.manager.tiles.map((t, i) => (
                    <img key={i} data-mt={i} src={t.src} alt="" style={{ position: "absolute", left: "0", top: "0", width: "52px", height: "52px", objectFit: "cover", borderRadius: "6px", boxShadow: "0 2px 8px color-mix(in srgb, var(--foreground) 18%, transparent)", outline: `2px solid ${t.flagged ? "var(--l-destructive)" : "transparent"}`, outlineOffset: "-2px" }} />
                  ))}
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "18px 20px 20px" }}>
                <span style={TITLE}>As a program manager</span>
                <span style={BODY}>Import a folder of field photos. Watch them sort by place and project, and review the ones that were flagged.</span>
                <span style={CTA}>Open the library</span>
              </div>
            </a>

            <a className="de-card" href={data.funder.href} data-role="funder" style={CARD}>
              <div className="night" style={{ position: "relative", height: "300px", background: "var(--background)", overflow: "hidden" }}>
                <div style={{ position: "absolute", left: "50%", top: "22px", width: "170px", marginLeft: "-85px", padding: "10px 12px", borderRadius: "var(--radius)", background: "var(--l-primary-foreground)", display: "flex", flexDirection: "column", gap: "2px", zIndex: "2" }}>
                  <span style={{ fontSize: "10px", color: "var(--l-muted-foreground)" }}>{data.funder.project}</span>
                  <span style={{ display: "flex", alignItems: "baseline", gap: "6px" }}>
                    <span data-f="num" style={{ fontFamily: "var(--font-display)", fontWeight: "700", fontSize: "30px", lineHeight: "1", color: "var(--l-verified)" }}>
                      {data.funder.verified}
                    </span>
                    <span style={{ fontSize: "11px", color: "var(--l-muted-foreground)" }}>photos verified</span>
                  </span>
                </div>
                <svg viewBox="0 0 340 300" preserveAspectRatio="none" aria-hidden="true" style={{ position: "absolute", inset: "0", width: "100%", height: "100%" }}>
                  <g fill="none" strokeWidth="1.4" style={{ stroke: "var(--primary)" }}>
                    {THREADS.map((d) => (
                      <path key={d} data-f="th" pathLength={1} strokeDasharray="1" strokeDashoffset="1" d={d} />
                    ))}
                  </g>
                </svg>
                <div style={{ position: "absolute", left: "0", right: "0", top: "222px", display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: "8px", padding: "0 16px" }}>
                  {data.funder.tiles.map((src, i) => (
                    <img key={i} data-f="tile" src={src} alt="" style={{ width: "100%", aspectRatio: "1", objectFit: "cover", borderRadius: "5px", opacity: "0.35" }} />
                  ))}
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "18px 20px 20px" }}>
                <span style={TITLE}>As a funder</span>
                <span style={BODY}>Read the report. Pull any number and it opens the photos behind it, with faces blurred.</span>
                <span style={CTA}>Read the report</span>
              </div>
            </a>
          </div>
          <p style={{ maxWidth: "1200px", width: "100%", margin: "0 auto", fontSize: "13px", color: "var(--muted-foreground)" }}>{data.footnote}</p>
        </main>
      </div>
    </div>
  );
}
