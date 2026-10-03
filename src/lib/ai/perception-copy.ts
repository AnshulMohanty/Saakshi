/**
 * What the pages say about who reads a photo's tags and moderation (pure). Cloudinary AI Vision by
 * default; OpenAI vision when CLD_AI_VISION=off, or under auto once AI Vision's token quota is
 * used up. Watermark detection is always Cloudinary. The evidence page says who answered for
 * that photo, from its provenance.
 */
import type { AiVisionMode } from "../providers/analysis/fallback";
import { FALLBACK_PROVIDER_ID } from "../providers/analysis/fallback";

/** The Perception stage's code line on How it works. */
export function perceptionCode(mode: AiVisionMode): string {
  if (mode === "off") return "OpenAI vision: tags + moderation in one call; analyze/watermark_detection";
  if (mode === "auto") return "analyze/ai_vision_tagging, ai_vision_moderation, watermark_detection (OpenAI vision for tags and moderation once the AI Vision quota runs out)";
  return "analyze/ai_vision_tagging, ai_vision_moderation, watermark_detection";
}

/** The landing's Perception node code block. */
export function perceptionCodeBlock(mode: AiVisionMode): string {
  if (mode === "off") return "POST /v1/responses (OpenAI vision)\n  tags + moderation, one call\nPOST /v2/analysis/<cloud>/analyze/\n  watermark_detection";
  const base = "POST /v2/analysis/<cloud>/analyze/\n  ai_vision_tagging\n  ai_vision_moderation\n  watermark_detection";
  return mode === "auto" ? `${base}\n# quota used up: OpenAI vision\n# for tags and moderation` : base;
}

/** Who read this photo, for the evidence page (null for mock providers). */
export function answeredByNote(provider: string | null | undefined): string | null {
  if (provider === FALLBACK_PROVIDER_ID) return "Tags and moderation by OpenAI vision, standing in for Cloudinary AI Vision; the watermark check by Cloudinary.";
  if (provider === "cloudinary-analyze") return "Tags, moderation and the watermark check by Cloudinary AI.";
  return null;
}
