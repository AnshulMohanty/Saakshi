/**
 * OpenAI provider (Structured Outputs with the zod schemas in ./schemas). Phase 8.
 * Model ids come from config: OPENAI_MODEL_FAST / OPENAI_MODEL_SMART / OPENAI_EMBED_MODEL.
 */
import { NotConfiguredError } from "../../errors";
import type { AIProvider, ClaimRef } from "./index";
import type { ParsedSearch, PhotoAnalysis } from "./schemas";

export interface OpenAIOptions {
  apiKey?: string;
  modelFast: string;
  modelSmart: string;
  embedModel: string;
}

export class OpenAIProvider implements AIProvider {
  readonly kind = "real" as const;

  constructor(readonly options: OpenAIOptions) {}

  async describePhoto(imageUrl: string): Promise<PhotoAnalysis> {
    void imageUrl;
    throw new NotConfiguredError("OpenAIProvider", "describePhoto");
  }

  async writeWithPlaceholders(instruction: string, claims: ClaimRef[]): Promise<string> {
    void instruction;
    void claims;
    throw new NotConfiguredError("OpenAIProvider", "writeWithPlaceholders");
  }

  async parseSearch(query: string): Promise<ParsedSearch> {
    void query;
    throw new NotConfiguredError("OpenAIProvider", "parseSearch");
  }

  async embed(text: string): Promise<number[]> {
    void text;
    throw new NotConfiguredError("OpenAIProvider", "embed");
  }
}
