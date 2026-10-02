/**
 * AIProvider: photo understanding, placeholder-only prose, search parsing and embeddings.
 * Real = OpenAI (Structured Outputs + zod); mock = deterministic from filename/tags/context.
 *
 * Every provider is wrapped by `withGuards`, which validates outputs against the zod schemas
 * and runs lib/claims.ts validateProse on generated prose, so rules 2 and 4 hold for mock and
 * real alike.
 */
import "server-only";
import { validateProse } from "../../claims";
import { getConfig } from "../../config";
import { EMBEDDING_DIMENSIONS } from "../../db/schema";
import { getMediaProvider } from "../media";
import { MockMediaProvider } from "../media/mock";
import { MockAIProvider } from "./mock";
import { OpenAIProvider } from "./real";
import { ParsedSearch, PhotoAnalysis } from "./schemas";
import type { SearchVocabulary } from "../../ai/prompts";
import { MOCK_MEDIA_PREFIX, parseDeliveryPath } from "../../media/transform";

async function loadMockImage(media: MockMediaProvider, url: string): Promise<{ bytes: Buffer; contentType: string }> {
  const path = new URL(url, "http://local").pathname.slice(MOCK_MEDIA_PREFIX.length + 1);
  const parsed = parseDeliveryPath(path);
  if (!parsed) throw new Error("Not a mock media URL");
  const r = await media.render(parsed, "image/jpeg");
  if (r.status !== 200) throw new Error(`Mock media: ${r.error}`);
  return { bytes: r.rendered.body, contentType: r.rendered.contentType };
}

export interface ClaimRef {
  id: string;
  label: string;
}

export interface AIProvider {
  readonly kind: "mock" | "real";
  /** Model ids, recorded as provenance on everything they produce. */
  readonly models: { vision: string; text: string; embed: string };
  describePhoto(imageUrl: string): Promise<PhotoAnalysis>;
  /** Prose that references numbers only as {{claim:id}} placeholders. */
  writeWithPlaceholders(instruction: string, claims: ClaimRef[]): Promise<string>;
  /** @param vocabulary the allowed filter values (projects, bands…), so a model can't invent them. */
  parseSearch(query: string, vocabulary?: SearchVocabulary): Promise<ParsedSearch>;
  /** Unit-length embedding with EMBEDDING_DIMENSIONS (1536) dimensions. */
  embed(text: string): Promise<number[]>;
}

export function withGuards(inner: AIProvider): AIProvider {
  return {
    kind: inner.kind,
    models: inner.models,
    async describePhoto(imageUrl) {
      const analysis = PhotoAnalysis.parse(await inner.describePhoto(imageUrl));
      // Captions are generated prose: quantities belong in visibleCounts, not in text.
      validateProse(analysis.caption);
      return analysis;
    },
    async writeWithPlaceholders(instruction, claims) {
      const text = await inner.writeWithPlaceholders(instruction, claims);
      validateProse(text, { claimIds: claims.map((c) => c.id) });
      return text;
    },
    async parseSearch(query, vocabulary) {
      return ParsedSearch.parse(await inner.parseSearch(query, vocabulary));
    },
    async embed(text) {
      const v = await inner.embed(text);
      if (v.length !== EMBEDDING_DIMENSIONS || !v.every(Number.isFinite)) {
        throw new Error(`Embedding must be ${EMBEDDING_DIMENSIONS} finite numbers, got ${v.length}`);
      }
      return v;
    },
  };
}

let instance: AIProvider | undefined;

export function getAIProvider(): AIProvider {
  if (!instance) {
    const config = getConfig();
    if (config.providers.ai.mode === "real") {
      const media = getMediaProvider();
      instance = withGuards(
        new OpenAIProvider(config.openai, {
          // Mock media URLs are relative: render them in-process instead of over HTTP.
          loadImage: media instanceof MockMediaProvider ? (url) => loadMockImage(media, url) : undefined,
        }),
      );
    } else {
      const media = getMediaProvider();
      const mock = media instanceof MockMediaProvider ? media : null;
      instance = withGuards(
        new MockAIProvider(
          (publicId) => (mock ? mock.haystack(publicId) : Promise.resolve(publicId)),
          // Mock mode only: planted stamp text stored at upload. Real mode reads pixels.
          (publicId) => (mock ? mock.contextValue(publicId, "burned_text") : Promise.resolve(null)),
        ),
      );
    }
  }
  return instance;
}

export type { ParsedSearch, PhotoAnalysis };
