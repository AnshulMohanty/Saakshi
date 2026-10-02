/**
 * Witness Wall motion constants, from the design source (witness-wall template "WW:") and the
 * pass 2 spec ("P2"). Each is commented with its design/INVENTORY.md id (lines 168-180 of
 * design/inventory.manual.ts). tests/motion-wall.test.ts pins them.
 */

/** Stage: 1920×1080, letterboxed. */
export const STAGE = { width: 1920, height: 1080, mapWidth: 1300, asideWidth: 620 } as const;

/** Dot-field plane and camera (WW:414-418, 529-531). */
export const PLANE = { width: 1400, height: 1067, camX: "50%", camY: "56%", rotateX: 54, rotateZ: -10, perspective: 1500, origin: "50% 30%" } as const;
export const DOTS = { color: "rgba(156,125,255,0.34)", radius: 2.2, edge: { lat: 2.5, lng: 2 }, seed: 7 } as const;

/** Idle drift (WW:549-566): overview, then each spot. */
export const DRIFT = { move: 7, hold: 3, overview: { x: 60, y: -40, rotateZ: -8, scale: 1 }, spot: { yOffset: 60, rotateZ: -14, scale: 1.7 }, ease: "sine.inOut" } as const;

/** Live dot pulse (WW:538). */
export const LIVE_PULSE = { opacity: 0.25, duration: 0.9, ease: "sine.inOut" } as const;

/** Arrival sequence, seconds from the trigger (WW:580-610). */
export const ARRIVAL = {
  fly: { at: 0, dur: 1.4 },
  drop: { at: 0.1, dur: 0.8, from: { x: 450, y: -420, rotate: -4 }, to: { y: 250, rotate: 0 } },
  toPin: { at: 1.5, dur: 0.9, dx: 24, dy: -150, scale: 0.62 },
  steps: [2.3, 2.9, 3.6, 4.4],
  count: { dur: 0.7 },
  toList: { at: 7.4, dur: 0.7, scale: 1.3 },
  settle: { at: 8.0, tail: 0.4 },
} as const;

/** Ripples when the card lands (WW:612-620). */
export const RIPPLE = { count: 3, gap: 0.25, dur: 1.8, from: 0.3, to: 7, size: 40, border: 3, color: "var(--primary)", glow: "0 0 20px color-mix(in srgb, var(--primary) 70%, transparent)" } as const;

/** Queue (P2 Queueing): one arrival at a time; beyond this many waiting, land straight on the map. */
export const QUEUE = { maxWaiting: 3 } as const;

/** Waiting for the real score after "Checking" (the prototype's score was instant). */
export const SCORE_WAIT_MS = 20_000;

/** Latest arrivals kept in the list (WW:606). */
export const LIST_SIZE = 5;

/** Card pipeline steps (WW:625-626). */
export const STEP_LABELS = ["Uploading", "Reading", "Checking", "Scored"] as const;
