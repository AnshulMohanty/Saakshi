/**
 * Where numbers come from, and whether they may be shown (pure).
 *
 * Rule: reports, claims, Instagram posts, /api/stats and public pages never show a number
 * derived from a mock provider in production. In development, mock-derived values render with
 * a visible "Mock output" tag. AI estimates below the confidence threshold show "Not enough
 * confidence to estimate" instead of a number, everywhere.
 *
 * Preview (DEMO_PREVIEW=1, the preview video only, never a public deployment): values computed
 * on this machine are shown in production too, badged "Prototype measurement", and readings a
 * mock AI made up say "AI reading pending" instead of a result.
 */
import { formatClaimValue, type Claim } from "./claims";
import type { AssetProvenance, ProviderMode } from "./db/schema";

export type { ProviderMode };

export interface DisplayPolicy {
  production: boolean;
  /** AI_MIN_CONFIDENCE (default 0.5). */
  minConfidence: number;
  /** DEMO_PREVIEW=1: mock-derived values tagged "Prototype measurement" instead of hidden. */
  preview?: boolean;
}

export const MOCK_TAG = "Mock output";
export const HIDDEN_MOCK = "Not available: computed with mock providers";
export const LOW_CONFIDENCE = "Not enough confidence to estimate";
export const PREVIEW_TAG = "Prototype measurement";
export const AI_PENDING = "AI reading pending";

/** Production withholds mock-derived values (counts only real rows); development and the preview don't. */
export const hidesMock = (policy: DisplayPolicy): boolean => policy.production && !policy.preview;

/** The badge on a tagged value: "Mock output" in development, "Prototype measurement" in the preview. */
export const mockLabel = (policy: DisplayPolicy): string => (policy.preview ? PREVIEW_TAG : MOCK_TAG);

/** The preview never shows a reading a mock AI made up (captions, tags, moderation answers). */
export const aiPending = (mode: ProviderMode | null | undefined, policy: DisplayPolicy): boolean => !!policy.preview && mode !== "real";

/** A trust score rests on the analysis (tags, moderation, watermark) and the AI (OCR, children). Unknown = mock. */
export function assetMode(p: AssetProvenance | null | undefined): ProviderMode {
  return p?.analysis?.mode === "real" && p?.ai?.mode === "real" ? "real" : "mock";
}

/** "mock" if any input is mock (or there are none to vouch for it). */
export const combineModes = (modes: Iterable<ProviderMode | null | undefined>): ProviderMode => {
  let any = false;
  for (const m of modes) {
    any = true;
    if (m !== "real") return "mock";
  }
  return any ? "real" : "mock";
};

/** show: plain · tag: show with a badge (development, or the preview) · hide: never (production). */
export function numberPolicy(mode: ProviderMode, policy: DisplayPolicy): "show" | "tag" | "hide" {
  if (mode === "real") return "show";
  return hidesMock(policy) ? "hide" : "tag";
}

export type Shown =
  | { kind: "value"; text: string; mock: boolean }
  | { kind: "hidden"; text: string; reason: "mock_in_production" | "low_confidence" };

/** How one claim may be displayed. */
export function showClaim(claim: Claim, policy: DisplayPolicy, locale?: string): Shown {
  const mode: ProviderMode = claim.provider_mode ?? "mock";
  const p = numberPolicy(mode, policy);
  if (p === "hide") return { kind: "hidden", text: HIDDEN_MOCK, reason: "mock_in_production" };
  if (claim.method === "ai_estimated" && (claim.confidence ?? 0) < policy.minConfidence) return { kind: "hidden", text: LOW_CONFIDENCE, reason: "low_confidence" };
  return { kind: "value", text: formatClaimValue(claim, locale), mock: p === "tag" };
}

/** One raw number (a trust score, a measurement) under the same rule. */
export function showNumber(value: number | null, mode: ProviderMode, policy: DisplayPolicy, format: (v: number) => string = String): Shown | null {
  if (value === null) return null;
  const p = numberPolicy(mode, policy);
  if (p === "hide") return { kind: "hidden", text: HIDDEN_MOCK, reason: "mock_in_production" };
  return { kind: "value", text: format(value), mock: p === "tag" };
}

/** An AI estimate (value + confidence) under the confidence threshold and the mock rule. */
export function showEstimate(value: number, confidence: number | null, mode: ProviderMode, policy: DisplayPolicy, format: (v: number) => string = String): Shown {
  const p = numberPolicy(mode, policy);
  if (p === "hide") return { kind: "hidden", text: HIDDEN_MOCK, reason: "mock_in_production" };
  if ((confidence ?? 0) < policy.minConfidence) return { kind: "hidden", text: LOW_CONFIDENCE, reason: "low_confidence" };
  return { kind: "value", text: format(value), mock: p === "tag" };
}
