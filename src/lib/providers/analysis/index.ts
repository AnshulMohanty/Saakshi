/**
 * AnalysisProvider: tagging, moderation questions and watermark detection.
 * Real = Cloudinary Analyze API, with an OpenAI vision fallback for tagging and moderation when
 * OpenAI is real too (CLD_AI_VISION, fallback.ts); mock = deterministic keyword matching on
 * filename/tags/context.
 */
import "server-only";
import { getConfig } from "../../config";
import { getMediaProvider } from "../media";
import { MockMediaProvider } from "../media/mock";
import { CloudinaryMediaProvider } from "../media/real";
import { MODERATION_QUESTIONS } from "../../ai/questions";
import { TAXONOMY } from "../../ai/taxonomy";
import { OpenAIProvider } from "../ai/real";
import { AnalysisWithFallback } from "./fallback";
import { MockAnalysisProvider } from "./mock";
import { ANALYZE_SOURCE, CloudinaryAnalysisProvider } from "./real";

export interface TaxonomyEntry {
  name: string;
  description: string;
}

export interface ModerationQuestion {
  id: string;
  text: string;
}

export interface AnalysisProvider {
  readonly kind: "mock" | "real";
  /** Provider id, recorded as provenance on tags, moderation answers and watermark results. */
  readonly id: string;
  /** Names of the taxonomy entries that apply to the image. */
  tag(publicId: string, taxonomy: TaxonomyEntry[]): Promise<string[]>;
  /** Yes/no answer per question id. */
  moderate(publicId: string, questions: ModerationQuestion[]): Promise<Record<string, boolean>>;
  detectWatermark(publicId: string): Promise<boolean>;
  /** Who answered this image's tags and moderation, when it can differ per image (the fallback). */
  providerFor?(publicId: string): string;
}

let instance: AnalysisProvider | undefined;

export function getAnalysisProvider(): AnalysisProvider {
  if (!instance) {
    const config = getConfig();
    const media = getMediaProvider();
    if (config.providers.analysis.mode === "real" && media instanceof CloudinaryMediaProvider) {
      const cloudinary = new CloudinaryAnalysisProvider(media.client, (id, t) => media.url(id, t, { signed: true }));
      // The fallback exists only when OpenAI is real too; CLD_AI_VISION=on keeps Cloudinary alone.
      if (config.cloudinary.aiVision !== "on" && config.providers.ai.mode === "real") {
        const openai = new OpenAIProvider(config.openai);
        instance = new AnalysisWithFallback(cloudinary, (url, taxonomy, questions, meta) => openai.visionLabels(url, taxonomy, questions, meta), config.cloudinary.aiVision, {
          sourceUrl: (id) => media.url(id, ANALYZE_SOURCE, { signed: true }),
          taxonomy: TAXONOMY,
          questions: MODERATION_QUESTIONS,
        });
      } else {
        instance = cloudinary;
      }
    } else {
      instance = new MockAnalysisProvider((id) => (media instanceof MockMediaProvider ? media.haystack(id) : Promise.resolve(id)));
    }
  }
  return instance;
}
