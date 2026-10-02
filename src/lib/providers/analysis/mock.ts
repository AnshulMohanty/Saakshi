/**
 * Deterministic analysis: an entry/question applies when one of its content words (after
 * stemming and synonym canonicalisation) appears in the asset's filename, tags or context.
 */
import { hasAny, tokens as allTokens } from "../mock-text";
import type { AnalysisProvider, ModerationQuestion, TaxonomyEntry } from "./index";

const NEGATION = /\b(no|not|without|free of)\b[^,.;:]*/gi;

/**
 * Splits a taxonomy entry or question into words that must appear and words that must not
 * ("a tidy public space with no visible litter": tidy/public/space yes, litter no).
 */
function terms(text: string): { include: string[]; exclude: string[] } {
  const negated: string[] = [];
  const positive = text.replace(NEGATION, (m) => {
    negated.push(m.replace(/^\s*(no|not|without|free of)\b/i, ""));
    return " ";
  });
  return { include: allTokens(positive), exclude: allTokens(negated.join(" ")) };
}

const tokens = allTokens;
const applies = (words: Set<string>, text: string) => {
  const t = terms(text);
  return hasAny(words, t.include) && !hasAny(words, t.exclude);
};

export class MockAnalysisProvider implements AnalysisProvider {
  readonly kind = "mock" as const;
  readonly id = "mock-analysis-1";

  /** @param describe returns the text to match for a public id (filename, tags, context). */
  constructor(private readonly describe: (publicId: string) => Promise<string>) {}

  private async words(publicId: string): Promise<Set<string>> {
    return new Set(tokens(await this.describe(publicId)));
  }

  async tag(publicId: string, taxonomy: TaxonomyEntry[]): Promise<string[]> {
    const words = await this.words(publicId);
    return taxonomy.filter((t) => applies(words, `${t.name.replaceAll("_", " ")}, ${t.description}`)).map((t) => t.name);
  }

  async moderate(publicId: string, questions: ModerationQuestion[]): Promise<Record<string, boolean>> {
    const words = await this.words(publicId);
    return Object.fromEntries(questions.map((q) => [q.id, applies(words, q.text)]));
  }

  async detectWatermark(publicId: string): Promise<boolean> {
    return (await this.words(publicId)).has("watermark");
  }
}
