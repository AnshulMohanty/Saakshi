/**
 * The capture screen's parity states, shared by design:capture (the prototype) and parity:capture
 * (our fixture) so both run the same steps. The prototype's screen is never still: its feed drifts
 * on a 3.2 s yoyo and its GPS samples add Math.random noise every 450 ms. So, on the fake clock:
 *   - "ready" waits until the accuracy has settled at its ±6 m floor (it gets there whatever the
 *     noise);
 *   - the trigger makes Math.random 0.5 (zero noise: every later sample is deterministic and the
 *     level settles at 0), freezes the feed's drift at rest (an !important rule beats the inline
 *     transform) and picks the state. Not from document start: React keys its internals by
 *     Math.random at load, and with a constant the app and the dev overlay's React collide and
 *     the app's events never attach;
 *   - the shutter fires 1 s after the trigger, once two samples have levelled the horizon;
 *   - frames are taken once the state has settled (6 s: the accuracy is back at its floor and
 *     "Done" has run its six-times-faster sequence).
 */
import type { Variant } from "./_capture";

const STATES = ["Live flow", "Permission prompt", "Location denied", "Low accuracy", "Offline", "Done"];
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-");
const RANDOM = "Math.random = () => 0.5;";
const FREEZE = "(() => { const s = document.createElement('style'); s.textContent = '#feed { transform: none !important; }'; document.head.appendChild(s); })();";
const click = (text: string) => `[...document.querySelectorAll('[role="radiogroup"] button')].find((b) => (b.textContent || "").trim().startsWith(${JSON.stringify(text)}))?.click();`;
const SETTLED = "[...document.querySelectorAll('#cam span')].some((e) => e.textContent === '±6 m, good fix')";

export function captureStateVariants(ready: string, desktop: { width: number; height: number; mobile: boolean }): Variant[] {
  const r = `(${ready}) && ${SETTLED}`;
  const state = (s: string, element?: string): Variant => ({
    id: `${slug(s)}${element ? "-screen" : ""}`,
    label: `${s}${element ? ", phone screen only" : ""} (fake clock, settled)`,
    mode: "timeline",
    ...(element ? { element } : {}),
    timeline: { ready: r, trigger: `${RANDOM} ${FREEZE} ${click(s)}`, at: [6] },
  });
  return [
    ...STATES.map((s) => state(s)),
    ...STATES.map((s) => state(s, "#cam")),
    {
      id: "shutter",
      label: "shutter sequence on the fake clock",
      viewports: [desktop],
      mode: "timeline",
      element: "#cam",
      timeline: { ready: r, trigger: `${RANDOM} ${FREEZE} setTimeout(() => document.querySelector('button[aria-label="Take photo"]').click(), 1000);`, at: [0, 0.1, 0.35, 0.8, 1.05, 1.65, 1.9, 2.35, 2.8, 3.3, 4.1, 4.6].map((t) => t + 1) },
    },
  ];
}
