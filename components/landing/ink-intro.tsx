"use client";

import { useEffect, useRef } from "react";
import { CELL, glyphCells, LOGO_BITS } from "@/lib/glyph";
import { INTRO_KEY, INTRO_MS } from "@/lib/landing/intro";

/**
 * The ink-drop intro (D-0087, P1; build plan: "the mark that proves presence becoming the logo"):
 * on a first visit an ink drop spreads, resolves into the Saakshi mark and fades, 1.2 s at most.
 * Any key or tap skips it. Returning visitors and reduced motion never see it: a pre-paint check
 * in the root layout (lib/landing/intro.ts) sets html[data-intro="off"], which hides it before it paints.
 */

export function InkIntro() {
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = el.current;
    if (!node || document.documentElement.dataset.intro === "off") return;
    try {
      localStorage.setItem(INTRO_KEY, "1");
    } catch {
      // private mode: it may show again next visit
    }
    const done = () => {
      document.documentElement.dataset.intro = "off";
    };
    const t = setTimeout(done, INTRO_MS);
    window.addEventListener("keydown", done, { once: true });
    node.addEventListener("pointerdown", done, { once: true });
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", done);
      node.removeEventListener("pointerdown", done);
    };
  }, []);
  const lit = glyphCells(LOGO_BITS).filter((c) => c.on);
  return (
    <div ref={el} id="ink-intro" className="ink-intro" aria-hidden="true">
      <div className="ink-drop" />
      <svg className="ink-mark" viewBox="0 0 8 8">
        {lit.map((c, i) => (
          <rect key={i} x={c.x} y={c.y} width={CELL.size} height={CELL.size} rx={CELL.radius} style={{ animationDelay: `${300 + i * 30}ms` }} />
        ))}
      </svg>
    </div>
  );
}
