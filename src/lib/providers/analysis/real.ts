/**
 * Cloudinary Analyze API (beta, needs the AI Vision / AI Content Analysis add-ons):
 *   POST /v2/analysis/<cloud>/analyze/ai_vision_tagging     tag_definitions ≤ 10 → data.analysis.tags[{name}]
 *   POST /v2/analysis/<cloud>/analyze/ai_vision_moderation  rejection_questions ≤ 10 → responses[{prompt, value}]
 *   POST /v2/analysis/<cloud>/analyze/watermark_detection   → analysis.detections[{name, confidence}]
 * The image goes as source.uri: a signed, size-limited derivative (evidence is never public).
 * AI Vision tagging returns no confidence, so tags are yes/no. docs/external-apis.md has the details.
 */
import type { CloudinaryClient } from "../cloudinary/client";
import type { Transform } from "../../media/transform";
import type { AnalysisProvider, ModerationQuestion, TaxonomyEntry } from "./index";

/** What the Analyze API sees: long side ≤ 1600 px, JPEG. Not face-blurred: blurring would hide what moderation must see. */
export const ANALYZE_SOURCE: Transform = [{ width: 1600, height: 1600, crop: "limit" }, { format: "jpg", quality: "auto" }];

/** Watermark/banner detections at or above this confidence count. */
export const WATERMARK_MIN_CONFIDENCE = 0.5;

const MAX_PER_REQUEST = 10;

const chunks = <T>(xs: T[], n: number) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

type Analysis = Record<string, unknown>;
/** The analysis object: the docs show it under data.analysis. */
const analysisOf = (body: unknown): Analysis => {
  const b = body as { data?: { analysis?: Analysis }; analysis?: Analysis } | null;
  return b?.data?.analysis ?? b?.analysis ?? {};
};

/** Cloudinary tag names allow only lower-case letters, digits and hyphens; ours use underscores. */
export const apiTagName = (name: string) => name.toLowerCase().replace(/[^a-z0-9-]/g, "-");

/** Pure request builders and response readers (contract tests use these). */
export const analyzeRequests = {
  tagging: (uri: string, taxonomy: TaxonomyEntry[]) => ({ source: { uri }, tag_definitions: taxonomy.map((t) => ({ name: apiTagName(t.name), description: t.description })) }),
  moderation: (uri: string, questions: ModerationQuestion[]) => ({ source: { uri }, rejection_questions: questions.map((q) => q.text) }),
  watermark: (uri: string) => ({ source: { uri } }),
};

export function readTags(body: unknown, taxonomy: TaxonomyEntry[]): string[] {
  const tags = analysisOf(body).tags;
  const names = new Set((Array.isArray(tags) ? tags : []).map((t) => (typeof t === "string" ? t : (t as { name?: string })?.name)).filter(Boolean));
  return taxonomy.filter((t) => names.has(apiTagName(t.name)) || names.has(t.name)).map((t) => t.name);
}

/** "yes" → true, "no" and "unknown" → false. Matched by prompt text, falling back to order. */
export function readModeration(body: unknown, questions: ModerationQuestion[]): Record<string, boolean> {
  const a = analysisOf(body);
  const responses = (Array.isArray(a.responses) ? a.responses : []) as Array<{ prompt?: string; value?: string }>;
  return Object.fromEntries(
    questions.map((q, i) => {
      const r = responses.find((x) => x.prompt === q.text) ?? responses[i];
      return [q.id, String(r?.value ?? "").toLowerCase() === "yes"];
    }),
  );
}

export function readWatermark(body: unknown): boolean {
  const d = analysisOf(body).detections;
  return (Array.isArray(d) ? d : []).some(
    (x: { name?: string; confidence?: number }) => /watermark|banner/i.test(x?.name ?? "") && (x?.confidence ?? 0) >= WATERMARK_MIN_CONFIDENCE,
  );
}

export class CloudinaryAnalysisProvider implements AnalysisProvider {
  readonly kind = "real" as const;
  readonly id = "cloudinary-analyze";

  /** @param sourceUrl a signed delivery URL for a public id (the media provider's url()). */
  constructor(
    private readonly client: CloudinaryClient,
    private readonly sourceUrl: (publicId: string, t: Transform) => string,
  ) {}

  private uri(publicId: string) {
    return this.sourceUrl(publicId, ANALYZE_SOURCE);
  }

  async tag(publicId: string, taxonomy: TaxonomyEntry[]): Promise<string[]> {
    const out: string[] = [];
    for (const group of chunks(taxonomy, MAX_PER_REQUEST)) {
      const body = await this.client.analyze("ai_vision_tagging", analyzeRequests.tagging(this.uri(publicId), group));
      out.push(...readTags(body, group));
    }
    return out;
  }

  async moderate(publicId: string, questions: ModerationQuestion[]): Promise<Record<string, boolean>> {
    const out: Record<string, boolean> = {};
    for (const group of chunks(questions, MAX_PER_REQUEST)) {
      const body = await this.client.analyze("ai_vision_moderation", analyzeRequests.moderation(this.uri(publicId), group));
      Object.assign(out, readModeration(body, group));
    }
    return out;
  }

  async detectWatermark(publicId: string): Promise<boolean> {
    return readWatermark(await this.client.analyze("watermark_detection", analyzeRequests.watermark(this.uri(publicId))));
  }
}
