"use client";

import type { CSSProperties } from "react";
import { Glyph } from "@/components/glyph";
import { useStoredDark } from "@/lib/client/theme";
import { LOGO_BITS } from "@/lib/glyph";

/**
 * Route loading states (each route's loading.tsx): the page's own frame with soft placeholder
 * blocks where its content will land, so nothing jumps when it arrives. Blocks pulse in opacity
 * (the handoff's skeleton style); reduced motion keeps them still. Screen readers hear one line.
 */
type AppScreen = "library" | "review" | "projects" | "studio";

const TITLE: Record<AppScreen, string> = { library: "Library", review: "Review", projects: "Project overview", studio: "Studio" };
const SAYS: Record<AppScreen, string> = { library: "Loading the library…", review: "Loading the review queue…", projects: "Loading the project…", studio: "Loading Studio…" };

function B({ w = "100%", h, r = 10, style }: { w?: number | string; h: number | string; r?: number; style?: CSSProperties }) {
  return <div className="sk" style={{ width: w, height: h, borderRadius: r, flexShrink: 0, ...style }} />;
}

function Cards({ n, min = 180, h = 150 }: { n: number; min?: number; h?: number }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill,minmax(${min}px,1fr))`, gap: "12px" }}>
      {Array.from({ length: n }, (_, i) => (
        <div key={i} style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <B h={h} />
          <B w="70%" h={12} r={6} />
          <B w="40%" h={10} r={6} />
        </div>
      ))}
    </div>
  );
}

function Body({ screen }: { screen: AppScreen }) {
  if (screen === "library")
    return (
      <>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {[90, 70, 110, 80, 96].map((w, i) => (
            <B key={i} w={w} h={30} r={15} />
          ))}
        </div>
        <B h="clamp(180px,28vh,300px)" r={14} />
        <Cards n={10} />
      </>
    );
  if (screen === "review")
    return (
      <div className="sk-review">
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {Array.from({ length: 7 }, (_, i) => (
            <div key={i} style={{ display: "flex", gap: "10px", alignItems: "center" }}>
              <B w={56} h={42} r={8} />
              <div style={{ flex: "1", display: "flex", flexDirection: "column", gap: "6px" }}>
                <B w="80%" h={11} r={6} />
                <B w="50%" h={9} r={6} />
              </div>
            </div>
          ))}
        </div>
        <B h="100%" r={14} style={{ minHeight: "260px" }} />
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <B h={64} r={12} />
          {Array.from({ length: 5 }, (_, i) => (
            <B key={i} h={34} r={8} />
          ))}
          <div style={{ flex: "1" }} />
          <B h={44} r={10} />
        </div>
      </div>
    );
  if (screen === "projects")
    return (
      <>
        <B w="min(420px,70%)" h={28} r={8} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(160px,1fr))", gap: "12px" }}>
          {Array.from({ length: 4 }, (_, i) => (
            <B key={i} h={84} r={12} />
          ))}
        </div>
        <Cards n={6} min={240} h={170} />
      </>
    );
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,320px),1fr))", gap: "16px" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        {Array.from({ length: 6 }, (_, i) => (
          <B key={i} h={i === 0 ? 30 : 42} r={8} />
        ))}
      </div>
      <B h="clamp(260px,52vh,520px)" r={14} />
    </div>
  );
}

/** The app shell's frame (demo bar, rail, top bar) around the screen's placeholders. */
export function AppSkeleton({ screen }: { screen: AppScreen }) {
  const dark = useStoredDark();
  return (
    <div className={`design-root app-root ${dark ? "dark" : "light"}`} data-theme={dark ? "dark" : "light"} style={{ height: "100vh", display: "flex", flexDirection: "column", fontFamily: "var(--font-sans)", fontSize: "14px", color: "var(--foreground)", background: "var(--background)", overflow: "hidden" }}>
      <div role="status" style={{ flexShrink: "0", display: "flex", alignItems: "center", justifyContent: "center", padding: "5px 12px", minHeight: "32px", boxSizing: "border-box", background: "var(--accent)", color: "var(--accent-foreground)", fontSize: "12px" }}>
        {SAYS[screen]}
      </div>
      <div style={{ flex: "1", minHeight: "0", display: "flex" }}>
        <div className="sk-rail" style={{ flexShrink: "0", display: "flex", flexDirection: "column", gap: "8px", padding: "12px 10px", boxSizing: "border-box", background: "var(--card)", borderRight: "1px solid var(--border)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "4px 6px 12px" }}>
            <Glyph bits={LOGO_BITS} colors={{ on: "var(--l-primary)", off: "transparent" }} style={{ width: "24px", height: "24px", flexShrink: "0" }} />
            <span className="sk-rail-word" style={{ fontFamily: "var(--font-display)", fontWeight: "650", fontSize: "20px" }}>
              Saakshi
            </span>
          </div>
          <B h={40} r={9} />
          {Array.from({ length: 4 }, (_, i) => (
            <B key={i} h={34} r={8} style={{ opacity: 0.7 }} />
          ))}
        </div>
        <main style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column" }}>
          <div style={{ flexShrink: "0", display: "flex", alignItems: "center", gap: "12px", padding: "10px clamp(12px,2vw,24px)", borderBottom: "1px solid var(--border)", background: "var(--card)" }}>
            <h1 style={{ margin: "0", fontFamily: "var(--font-display)", fontWeight: "650", fontSize: "22px", whiteSpace: "nowrap" }}>{TITLE[screen]}</h1>
            <div style={{ flex: "1" }} />
            <B w="min(320px,40vw)" h={34} r={8} />
          </div>
          <div style={{ flex: "1", minHeight: "0", overflow: "hidden", padding: "clamp(12px,2vw,24px)", display: "flex", flexDirection: "column", gap: "16px" }}>
            <Body screen={screen} />
          </div>
        </main>
      </div>
    </div>
  );
}

/** A public page's frame (header with the mark) around a title, the photo and its panel. */
export function DocSkeleton({ says }: { says: string }) {
  return (
    <div className="design-root" style={{ fontFamily: "var(--font-sans)", color: "var(--foreground)", background: "var(--background)", minHeight: "100vh" }}>
      <header style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px clamp(16px,4vw,48px)", background: "var(--card)", borderBottom: "1px solid var(--border)" }}>
        <Glyph bits={LOGO_BITS} size={22} colors={{ off: "transparent" }} />
        <span style={{ fontFamily: "var(--font-display)", fontWeight: "650", fontSize: "19px" }}>Saakshi</span>
        <span role="status" style={{ flex: "1", fontSize: "13px", color: "var(--muted-foreground)" }}>
          {says}
        </span>
      </header>
      <main style={{ maxWidth: "1200px", margin: "0 auto", padding: "clamp(16px,3vw,40px) clamp(16px,4vw,48px) 64px", display: "flex", flexDirection: "column", gap: "24px" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "12px 24px", alignItems: "flex-end", justifyContent: "space-between" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px", flex: "1", minWidth: "240px" }}>
            <B w={120} h={12} r={6} />
            <B w="min(560px,90%)" h="clamp(32px,5vw,52px)" r={10} />
            <B w={200} h={12} r={6} />
          </div>
          <B w={210} h={68} r={12} />
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "20px", alignItems: "flex-start" }}>
          <B h="auto" r={14} style={{ flex: "1 1 520px", aspectRatio: "4/3", maxHeight: "70vh" }} />
          <div style={{ flex: "1 1 300px", display: "flex", flexDirection: "column", gap: "10px" }}>
            {Array.from({ length: 7 }, (_, i) => (
              <B key={i} h={i === 0 ? 40 : 30} r={8} />
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
