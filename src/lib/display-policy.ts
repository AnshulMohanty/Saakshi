/** The display policy from config (server side): production hides mock-derived numbers, unless DEMO_PREVIEW=1 (the preview video). */
import { getConfig } from "./config";
import type { DisplayPolicy } from "./provenance";

export function displayPolicy(): DisplayPolicy {
  const c = getConfig();
  return { production: c.isProduction, minConfidence: c.env.AI_MIN_CONFIDENCE, preview: c.env.DEMO_PREVIEW === "1" };
}
