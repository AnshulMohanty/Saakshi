/** The display policy from config (server side): production hides mock-derived numbers. */
import { getConfig } from "./config";
import type { DisplayPolicy } from "./provenance";

export function displayPolicy(): DisplayPolicy {
  const c = getConfig();
  return { production: c.isProduction, minConfidence: c.env.AI_MIN_CONFIDENCE };
}
