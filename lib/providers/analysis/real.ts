/** Cloudinary Analyze API (AI tagging, content moderation, watermark detection). Phase 8. */
import { NotConfiguredError } from "../../errors";
import type { AnalysisProvider, ModerationQuestion, TaxonomyEntry } from "./index";

export class CloudinaryAnalysisProvider implements AnalysisProvider {
  readonly kind = "real" as const;

  async tag(publicId: string, taxonomy: TaxonomyEntry[]): Promise<string[]> {
    void publicId;
    void taxonomy;
    throw new NotConfiguredError("CloudinaryAnalysisProvider", "tag");
  }

  async moderate(publicId: string, questions: ModerationQuestion[]): Promise<Record<string, boolean>> {
    void publicId;
    void questions;
    throw new NotConfiguredError("CloudinaryAnalysisProvider", "moderate");
  }

  async detectWatermark(publicId: string): Promise<boolean> {
    void publicId;
    throw new NotConfiguredError("CloudinaryAnalysisProvider", "detectWatermark");
  }
}
