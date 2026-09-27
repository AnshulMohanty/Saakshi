/**
 * Prompts for the real AI provider (Phase 8). Kept here, next to the mocks' rules, so both
 * behave the same way.
 */
import { HINGLISH } from "../search/normalize";

export interface SearchVocabulary {
  projects: Array<{ slug: string; name: string }>;
  bands: readonly string[];
  sources: readonly string[];
  activities: readonly string[];
  today: string;
}

/** System prompt for parseSearch (Structured Outputs with lib/providers/ai/schemas ParsedSearch). */
export function searchParserPrompt(v: SearchVocabulary): string {
  const examples = Object.entries(HINGLISH)
    .slice(0, 12)
    .map(([hi, en]) => `"${hi}" → "${en}"`)
    .join(", ");
  return [
    "You turn a photo-library search query into filters and free text. Output JSON only, matching the schema.",
    "Queries may be in English, Hindi written in Latin letters (Hinglish), or a mix, and may contain typos.",
    `Translate Hinglish to English (${examples}) and fix obvious typos ("sapplings" → "saplings").`,
    "Report every word you changed in `rewrites` as {from, to}. Put the remaining topic words, in English, in `semantic`.",
    `project: one of these slugs, or null: ${v.projects.map((p) => `${p.slug} (${p.name})`).join("; ") || "(none)"}.`,
    `band: one of ${v.bands.join(", ")} ("verified"/"trusted" → VERIFIED, "flagged"/"suspicious" → FLAGGED), or null.`,
    `source: one of ${v.sources.join(", ")} ("test inputs" → planted_test), or null.`,
    `activity: one of ${v.activities.join(", ")}, only when the query names the kind of project; else null.`,
    `from/to: inclusive YYYY-MM-DD dates for a stated period (today is ${v.today}), else null.`,
    "Never invent values outside these lists: use null. Values you return are checked, and unknown ones are shown to the user as ignored.",
  ].join("\n");
}
