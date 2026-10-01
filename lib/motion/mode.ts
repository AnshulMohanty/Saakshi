/**
 * Motion mode (pure decision + a browser probe). The design's rule (landing L:1239-1244):
 * reduced when the visitor prefers reduced motion (or the animation library is missing); low
 * power when there is no WebGL2, 4 GB of device memory or less, or Save-Data; otherwise full.
 * B5.11: the design's `motion` preview prop becomes this auto-detection, with a `?motion=`
 * override in development only.
 */
export type MotionMode = "full" | "low" | "reduced";

export interface MotionSignals {
  prefersReduced: boolean;
  webgl2: boolean;
  /** navigator.deviceMemory (GB), undefined where the browser doesn't expose it. */
  deviceMemory?: number;
  saveData?: boolean;
  /** GSAP and ScrollTrigger loaded. */
  animation?: boolean;
  /** Dev override: full | low-power | reduced (ignored unless allowed). */
  override?: string | null;
  allowOverride?: boolean;
}

export const LOW_MEMORY_GB = 4;

export function resolveMotion(s: MotionSignals): MotionMode {
  if (s.allowOverride && s.override) {
    if (s.override === "reduced") return "reduced";
    if (s.override === "low-power" || s.override === "low") return "low";
    if (s.override === "full") return "full";
  }
  if (s.prefersReduced || s.animation === false) return "reduced";
  if (!s.webgl2 || (s.deviceMemory !== undefined && s.deviceMemory <= LOW_MEMORY_GB) || s.saveData) return "low";
  return "full";
}

/** Reads the signals from the browser (never call during server rendering). */
export function probeMotion(opts: { allowOverride?: boolean; override?: string | null } = {}): MotionSignals {
  let webgl2 = false;
  try {
    webgl2 = !!document.createElement("canvas").getContext("webgl2");
  } catch {
    webgl2 = false;
  }
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  return {
    prefersReduced: matchMedia("(prefers-reduced-motion: reduce)").matches,
    webgl2,
    deviceMemory: nav.deviceMemory,
    saveData: nav.connection?.saveData,
    override: opts.override ?? new URLSearchParams(location.search).get("motion"),
    allowOverride: opts.allowOverride ?? false,
  };
}
