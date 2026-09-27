/**
 * Deterministic analysis: an entry/question applies when one of its content words (after
 * stemming and synonym canonicalisation) appears in the asset's filename, tags or context.
 */
import { hasAny, tokens } from "../mock-text";
import type { AnalysisProvider, ModerationQuestion, TaxonomyEntry } from "./index";

export class MockAnalysisProvider implements AnalysisProvider {
  readonly kind = "mock" as const;

  /** @param describe returns the text to match for a public id (filename, tags, context). */
  constructor(private readonly describe: (publicId: string) => Promise<string>) {}

  private async words(publicId: string): Promise<Set<string>> {
    return new Set(tokens(await this.describe(publicId)));
  }

  async tag(publicId: string, taxonomy: TaxonomyEntry[]): Promise<string[]> {
    const words = await this.words(publicId);
    return taxonomy.filter((t) => hasAny(words, tokens(`${t.name} ${t.description}`))).map((t) => t.name);
  }

  async moderate(publicId: string, questions: ModerationQuestion[]): Promise<Record<string, boolean>> {
    const words = await this.words(publicId);
    return Object.fromEntries(questions.map((q) => [q.id, hasAny(words, tokens(q.text))]));
  }

  async detectWatermark(publicId: string): Promise<boolean> {
    return (await this.words(publicId)).has("watermark");
  }
}
