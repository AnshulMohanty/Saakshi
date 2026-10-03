/** Pure verdicts for `pnpm services:check` (scripts/services-check.ts), so they can be tested. */
import type { AiVisionMode } from "./providers/analysis/fallback";

export type Verdict = { level: "ok" | "warn" | "fail"; detail: string };

/**
 * GET /api/inngest on the deployment. Inngest SDK v4 in cloud mode refuses unsigned requests with
 * 401 {"message":"Unauthorized"} by design, so 401 means it is serving; 404 means the route isn't
 * there (not enabled); anything else is a failure.
 */
export function inngestVerdict(status: number): Verdict {
  if (status === 200) return { level: "ok", detail: "serving" };
  if (status === 401) return { level: "ok", detail: "serving (cloud mode: unsigned requests refused, as expected)" };
  if (status === 404) return { level: "warn", detail: "not enabled: /api/inngest answers 404" };
  return { level: "fail", detail: `HTTP ${status}` };
}

/** Which service answers tags and moderation, as configured and as observed in this run. */
export function analysisPathLabel(mode: AiVisionMode, o: { fallbackReady: boolean; quotaUsedUp: boolean }): string {
  if (!o.fallbackReady) return mode === "on" ? "Cloudinary AI Vision only (CLD_AI_VISION=on)" : `Cloudinary AI Vision only: the fallback needs OpenAI (CLD_AI_VISION=${mode})`;
  if (mode === "off") return "OpenAI vision fallback only (CLD_AI_VISION=off)";
  if (mode === "on") return "Cloudinary AI Vision only (CLD_AI_VISION=on)";
  return o.quotaUsedUp
    ? "auto: the AI Vision quota is used up, so the OpenAI vision fallback answers (CLD_AI_VISION=auto)"
    : "auto: Cloudinary AI Vision, OpenAI vision fallback if its quota runs out (CLD_AI_VISION=auto)";
}
