"use client";

import { useEffect, useRef } from "react";
import type { LandingData } from "@/lib/landing/types";
import { probeMotion, resolveMotion } from "@/lib/motion/mode";
import type { LandingController } from "@/lib/scenes/landing-dom";
import { CatchChapter } from "./catch";
import { CloudinaryChapter } from "./cloudinary";
import { FacesChapter } from "./faces";
import { FoolChapter } from "./fool";
import { LandingFooter } from "./footer";
import { HeroChapter } from "./hero";
import { MeasuredChapter } from "./measured";
import { LandingNav } from "./nav";
import { LandingOverlay } from "./overlay";
import { StormChapter } from "./storm";
import { ThreadsChapter } from "./threads";
import { WatchingChapter } from "./watching";
import { WitnessChapter } from "./witness";

/**
 * The landing (Saakshi_Landing → /): eleven chapters over one fixed WebGL stage, choreographed by
 * lib/scenes/landing-dom.ts. Server-rendered with its final data; motion is added after mount,
 * so reduced motion and low power get the same content (C02, C03).
 */
export interface LandingProps {
  data: LandingData;
  qrSvg: string;
  demoHref: string;
  heroProject: string | null;
  /** Development: honour ?motion= (B5.11). */
  allowMotionOverride?: boolean;
  /** Chapter 9 listens to /api/live. */
  live?: boolean;
}

export function Landing({ data, qrSvg, demoHref, heroProject, allowMotionOverride = false, live = true }: LandingProps) {
  const root = useRef<HTMLDivElement>(null);
  const ctl = useRef<LandingController | null>(null);
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    let disposed = false;
    const mode = resolveMotion({ ...probeMotion({ allowOverride: allowMotionOverride }), animation: true });
    el.dataset.motion = mode;
    void import("@/lib/scenes/landing-dom").then(({ setupLanding }) => {
      if (disposed) return;
      ctl.current = setupLanding(el, data, { mode, live });
    });
    return () => {
      disposed = true;
      ctl.current?.dispose();
      ctl.current = null;
    };
  }, [data, allowMotionOverride, live]);

  return (
    <div id="top" ref={root} className="design-root" style={{ position: "relative", overflowX: "clip", fontFamily: "var(--font-sans)", color: "var(--foreground)", fontVariantNumeric: "tabular-nums" }}>
      <LandingOverlay data={data} />
      <LandingNav
        demoHref={demoHref}
        links={[
          { href: "#ch3", label: "How it works" },
          { href: "#ch9", label: "Witness wall" },
          { href: "#ch10", label: "Built on Cloudinary" },
        ]}
      />
      <main>
        <HeroChapter data={data} demoHref={demoHref} />
        <StormChapter data={data} />
        <CatchChapter data={data} heroProject={heroProject} />
        <MeasuredChapter data={data} />
        <ThreadsChapter data={data} onHi={(k) => ctl.current?.hi(k)} />
        <FacesChapter data={data} />
        <WatchingChapter data={data} />
        <FoolChapter sampleUrl={data.internet?.src ?? null} copy={data.copy} />
        <WitnessChapter data={data} qrSvg={qrSvg} />
        <CloudinaryChapter data={data} />
      </main>
      <LandingFooter data={data} />
    </div>
  );
}
