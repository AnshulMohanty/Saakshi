/**
 * Capture screen motion constants, from the design source (capture template "CA:"). Each is
 * commented with its design/INVENTORY.md id. tests/motion-capture.test.ts pins them against the
 * source values. Times are seconds on one GSAP timeline that starts at the shutter.
 */

/** D-1189 (CA:470-485): the shutter sequence. */
export const SHUTTER = {
  flash: { from: 0.9, duration: 0.35 },
  glyphIn: 0.1,
  cells: { at: 0.15, duration: 0.05, each: 0.012 },
  flyIn: 1.0,
  glyphOut: { at: 1.0, duration: 0.2 },
  fly: { at: 1.05, duration: 0.6, ease: "power3.inOut", radius: 40 },
  trayAt: 1.65,
  sheet: { at: 1.7, duration: 0.6, ease: "expo.out", hidden: "translateY(105%)", shown: "translateY(0%)" },
  steps: { from: 1.9, every: 0.45 },
  score: { at: 3.3, duration: 0.8, ease: "power2.out" },
  doneAt: 4.1,
  offlineDoneAt: 2.4,
  /** "Done" picked as a state runs the whole sequence six times faster (CA:469). */
  instantScale: 6,
} as const;

/** D-1190 (CA:464,484): vibration on the shutter and on the score (Android). */
export const VIBRATE = { shutter: 18, scored: [12, 40, 12] } as const;

/** D-1191 (CA:439-448): GPS samples every 450 ms; ring and horizon ease to each sample. */
export const SAMPLE_MS = 450;
export const HUD_TWEEN = { duration: 0.45, ease: "power2.out" } as const;

/** D-1304 (CA:438): the prototype's hand-held drift of the feed. The live camera moves by itself. */
export const FEED_DRIFT = { x: 8, y: -6, rotate: 0.6, duration: 3.2, ease: "sine.inOut" } as const;

/**
 * D-1305 (CA:429,439-443,453): the prototype's GPS simulation (the parity fixture and the dev
 * states): accuracy decays by 0.86 per sample with ±1 m of noise, to a floor of 6 m (36 m with
 * weak GPS); the level wanders ±4° until within 2°, then ±1.5°.
 */
export const SIM = { start: { acc: 48, level: 6 }, reset: { acc: 30, lowAcc: 48 }, decay: 0.86, noise: 2, floor: { live: 6, low: 36 }, level: { wide: 8, narrow: 3, narrowWithin: 2 } } as const;

/** CA:467: with weak GPS the prototype caps the shown score at 75. */
export const LOW_ACC_SCORE_CAP = 75;

/** One simulated GPS sample (CA:441-442); `random` is Math.random in the prototype. */
export function simSample(s: { acc: number; level: number }, low: boolean, random: () => number = Math.random): { acc: number; level: number } {
  const floor = low ? SIM.floor.low : SIM.floor.live;
  const acc = Math.max(floor, Math.round(s.acc * SIM.decay + (random() - 0.5) * SIM.noise));
  const level = Math.round((random() - 0.5) * (s.level > SIM.level.narrowWithin ? SIM.level.wide : SIM.level.narrow));
  return { acc, level: level || 0 };
}
