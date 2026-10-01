/**
 * The capture screen's states for review (B5.11): the design capture's variant ids, as
 * `/capture?state=<id>` in development and on the parity fixture. The product never shows them.
 */
export type SimMode = "live" | "permission" | "denied" | "low" | "offline" | "done";

export const STATE_MODE: Record<string, SimMode> = {
  "live-flow": "live",
  "permission-prompt": "permission",
  "location-denied": "denied",
  "low-accuracy": "low",
  offline: "offline",
  done: "done",
};
