/**
 * Documented prices, for cost estimates in provider_usage (pure). Only prices that official pages
 * state are here; anything else estimates as null. Checked 2026-09-28 (docs/external-apis.md).
 *
 * OpenAI: https://developers.openai.com/api/docs/pricing (Standard tier, USD per 1M tokens).
 * Cloudinary: plans are credit-based (1 credit = 1,000 transformations or 1 GB storage or 1 GB
 * bandwidth; e_extract counts as 75 transformations), so we log units and credits, not dollars.
 */
export const OPENAI_PRICES: Record<string, { input: number; cachedInput?: number; output: number }> = {
  "gpt-6-luna": { input: 0.1, cachedInput: 0.01, output: 0.5 },
  "gpt-5.6-luna": { input: 0.2, cachedInput: 0.02, output: 1.2 },
  "gpt-5.6-terra": { input: 2, cachedInput: 0.2, output: 12 },
  "gpt-6-sol": { input: 2, cachedInput: 0.2, output: 10 },
  "gpt-5.6-sol": { input: 4, cachedInput: 0.4, output: 20 },
  "text-embedding-3-small": { input: 0.02, output: 0 },
};

/** USD for a call, or null when the model's price isn't documented here. */
export function openAiCost(model: string, inputTokens: number, outputTokens = 0, cachedInputTokens = 0): number | null {
  const p = OPENAI_PRICES[model];
  if (!p) return null;
  const fresh = Math.max(0, inputTokens - cachedInputTokens);
  return (fresh * p.input + cachedInputTokens * (p.cachedInput ?? p.input) + outputTokens * p.output) / 1_000_000;
}

/** Transformations a derived image counts as (Cloudinary transformation_counts). */
export function cloudinaryTransformations(transformation: string): number {
  // The original, delivered as stored, is not a transformation.
  if (!transformation) return 0;
  return transformation.includes("e_extract") ? 75 : 1;
}

export const CREDITS_PER_TRANSFORMATION = 1 / 1000;
