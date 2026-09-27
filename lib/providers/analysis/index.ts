/**
 * AnalysisProvider: tagging, moderation questions and watermark detection.
 * Real = Cloudinary Analyze API; mock = deterministic keyword matching on filename/tags/context.
 */
import "server-only";
import { getConfig } from "../../config";
import { getMediaProvider } from "../media";
import { MockMediaProvider } from "../media/mock";
import { MockAnalysisProvider } from "./mock";
import { CloudinaryAnalysisProvider } from "./real";

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
  /** Names of the taxonomy entries that apply to the image. */
  tag(publicId: string, taxonomy: TaxonomyEntry[]): Promise<string[]>;
  /** Yes/no answer per question id. */
  moderate(publicId: string, questions: ModerationQuestion[]): Promise<Record<string, boolean>>;
  detectWatermark(publicId: string): Promise<boolean>;
}

let instance: AnalysisProvider | undefined;

export function getAnalysisProvider(): AnalysisProvider {
  if (!instance) {
    const config = getConfig();
    if (config.providers.analysis.mode === "real") {
      instance = new CloudinaryAnalysisProvider();
    } else {
      const media = getMediaProvider();
      instance = new MockAnalysisProvider((id) => (media instanceof MockMediaProvider ? media.haystack(id) : Promise.resolve(id)));
    }
  }
  return instance;
}
