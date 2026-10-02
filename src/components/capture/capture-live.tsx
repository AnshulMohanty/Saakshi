"use client";

import { CaptureScreen } from "./capture-screen";
import { useLiveCapture, type LiveSpot } from "./use-live-capture";
import { useSimCapture, type SimConfig } from "./use-sim-capture";

/** The phone screen, full-bleed (D-1188): no device frame, no state list. Always light tokens: it sits on a camera feed. */
const ROOT = { position: "fixed", inset: "0", background: "var(--ink-black)", fontFamily: "var(--font-sans)", color: "var(--foreground)", fontVariantNumeric: "tabular-nums" } as const;

export function CaptureLive({ project, spot, spotInfo }: { project: string | null; spot: string | null; spotInfo: LiveSpot | null }) {
  const { view, on, bindScreen, bindVideo } = useLiveCapture({ project, spot, spotInfo });
  return (
    <div className="design-root light" data-screen-label="Capture" style={ROOT}>
      <CaptureScreen ref={bindScreen} view={view} on={on} videoRef={bindVideo} framed={false} />
    </div>
  );
}

/** Development only (`/capture?state=…`, B5.11): a review state on our demo photo, simulated. */
export function CaptureDevState({ cfg }: { cfg: SimConfig }) {
  const { view, on, bindScreen } = useSimCapture(cfg);
  return (
    <div className="design-root light" data-screen-label="Capture" data-capture-state={cfg.mode} style={ROOT}>
      <CaptureScreen ref={bindScreen} view={view} on={on} feedImage={cfg.feed} drift framed={false} />
    </div>
  );
}
