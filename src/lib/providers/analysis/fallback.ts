/**
 * Cloudinary analysis with an OpenAI vision fallback for tagging and moderation (CLD_AI_VISION):
 *   on    Cloudinary AI Vision only.
 *   off   OpenAI vision only, for tag() and moderate().
 *   auto  Cloudinary first; when AI Vision answers HTTP 429 with code MA_00008 (the monthly token
 *         quota is used up), OpenAI vision for the rest of the process, logged once. Any other
 *         Cloudinary error is thrown as before (the step retries as it always has).
 * Watermark detection is a separate add-on (AI Content Analysis) and always stays on Cloudinary.
 *
 * OpenAI answers tags AND moderation in ONE call per image. tag() and moderate() run in parallel
 * in the analyze step, so they share one in-flight call per image, and the result is kept for a
 * minute so the second of two calls that both just hit the quota error joins it too.
 */
import { ProviderHttpError } from "../http";
import type { AnalysisProvider, ModerationQuestion, TaxonomyEntry } from "./index";

export type AiVisionMode = "auto" | "on" | "off";

/** Provenance id when OpenAI answered an image's tags and moderation. */
export const FALLBACK_PROVIDER_ID = "openai-vision-fallback";

/** Cloudinary AI Vision's monthly token quota is used up (HTTP 429, code MA_00008). */
export function isAiVisionQuotaError(err: unknown): boolean {
  return err instanceof ProviderHttpError && err.provider === "cloudinary" && err.status === 429 && /MA_00008/.test(err.body);
}

/** The one vision call: tags and answers for one image (OpenAIProvider.visionLabels). */
export type VisionLabeler = (imageUrl: string, taxonomy: TaxonomyEntry[], questions: ModerationQuestion[], meta: { assetId?: string | null }) => Promise<{ tags: string[]; answers: Record<string, boolean> }>;

export interface FallbackOptions {
  /** The image the fallback reads: the same signed analysis copy Cloudinary's AI Vision sees. */
  sourceUrl: (publicId: string) => string;
  /** The lists the analyze step asks for; a caller's own entries are merged in. */
  taxonomy: TaxonomyEntry[];
  questions: ModerationQuestion[];
  log?: (message: string) => void;
  now?: () => number;
  /** How long a result is kept for the other half of the same image (default 60 s). */
  keepMs?: number;
}

type Labels = { tags: string[]; answers: Record<string, boolean> };

export class AnalysisWithFallback implements AnalysisProvider {
  readonly kind = "real" as const;
  private switched = false;
  private readonly inFlight = new Map<string, Promise<Labels>>();
  private readonly recent = new Map<string, { at: number; labels: Labels }>();
  private readonly answeredBy = new Map<string, string>();

  constructor(
    readonly cloudinary: AnalysisProvider,
    private readonly labeler: VisionLabeler,
    readonly mode: AiVisionMode,
    private readonly o: FallbackOptions,
  ) {}

  /** The provider id until a photo says otherwise (see providerFor). */
  get id(): string {
    return this.mode === "off" ? FALLBACK_PROVIDER_ID : this.cloudinary.id;
  }

  /** Which path tags and moderation take right now (services:check prints it). */
  get activePath(): "cloudinary" | "openai-fallback" {
    return this.mode === "off" || this.switched ? "openai-fallback" : "cloudinary";
  }

  /** Who answered this image's tags and moderation (provenance, read after the analyze step). */
  providerFor(publicId: string): string {
    return this.answeredBy.get(publicId) ?? this.cloudinary.id;
  }

  private useFallback() {
    return this.mode === "off" || this.switched;
  }

  private switchToFallback(err: ProviderHttpError) {
    if (this.switched) return;
    this.switched = true;
    (this.o.log ?? ((m) => console.warn(m)))(
      `[saakshi] Cloudinary AI Vision quota is used up (HTTP ${err.status}, MA_00008): tags and moderation come from OpenAI vision for the rest of this process. Watermark detection stays on Cloudinary.`,
    );
  }

  private remember(publicId: string, provider: string) {
    this.answeredBy.set(publicId, provider);
    if (this.answeredBy.size > 1000) this.answeredBy.delete(this.answeredBy.keys().next().value!);
  }

  /** The fallback's one call for an image, shared by tag() and moderate(). */
  async labels(publicId: string, taxonomy: TaxonomyEntry[] = [], questions: ModerationQuestion[] = []): Promise<Labels> {
    const tax = [...this.o.taxonomy, ...taxonomy.filter((t) => !this.o.taxonomy.some((x) => x.name === t.name))];
    const qs = [...this.o.questions, ...questions.filter((q) => !this.o.questions.some((x) => x.id === q.id))];
    const key = `${publicId}|${tax.map((t) => t.name).join(",")}|${qs.map((q) => q.id).join(",")}`;
    const now = this.o.now?.() ?? Date.now();
    const kept = this.recent.get(key);
    if (kept && now - kept.at < (this.o.keepMs ?? 60_000)) return kept.labels;
    const running = this.inFlight.get(key);
    if (running) return running;
    const call = this.labeler(this.o.sourceUrl(publicId), tax, qs, {})
      .then((labels) => {
        this.recent.set(key, { at: this.o.now?.() ?? Date.now(), labels });
        if (this.recent.size > 200) this.recent.delete(this.recent.keys().next().value!);
        this.remember(publicId, FALLBACK_PROVIDER_ID);
        return labels;
      })
      .finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, call);
    return call;
  }

  private async either<T>(publicId: string, viaCloudinary: () => Promise<T>, viaFallback: () => Promise<T>): Promise<T> {
    if (this.useFallback()) return viaFallback();
    try {
      return await viaCloudinary();
    } catch (err) {
      if (this.mode === "auto" && isAiVisionQuotaError(err)) {
        this.switchToFallback(err as ProviderHttpError);
        return viaFallback();
      }
      throw err;
    }
  }

  async tag(publicId: string, taxonomy: TaxonomyEntry[]): Promise<string[]> {
    return this.either(
      publicId,
      () => this.cloudinary.tag(publicId, taxonomy),
      async () => {
        const names = new Set(taxonomy.map((t) => t.name));
        return (await this.labels(publicId, taxonomy)).tags.filter((t) => names.has(t));
      },
    );
  }

  async moderate(publicId: string, questions: ModerationQuestion[]): Promise<Record<string, boolean>> {
    return this.either(
      publicId,
      () => this.cloudinary.moderate(publicId, questions),
      async () => {
        const { answers } = await this.labels(publicId, [], questions);
        return Object.fromEntries(questions.map((q) => [q.id, answers[q.id] === true]));
      },
    );
  }

  /** AI Content Analysis has its own quota: always Cloudinary. */
  detectWatermark(publicId: string): Promise<boolean> {
    return this.cloudinary.detectWatermark(publicId);
  }
}
