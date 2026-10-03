/**
 * OpenAI provider on the Responses API (recommended for new projects) and the Embeddings API,
 * over lib/providers/http.ts (timeouts, retries honouring Retry-After, no retry on quota errors,
 * usage + cost per call). Request and response shapes: docs/external-apis.md.
 *
 *   describePhoto   POST /v1/responses  input_text + input_image (base64 data URL, detail high),
 *                   text.format json_schema strict (PhotoAnalysisOutput)
 *   writeWith…      POST /v1/responses  plain text; checked with validateProse, retried with the
 *                   issues when a draft breaks the placeholder rule
 *   parseSearch     POST /v1/responses  json_schema strict (ParsedSearch), vocabulary in the prompt
 *   embed           POST /v1/embeddings dimensions 1536 (text-embedding-3 models)
 *   visionLabels    POST /v1/responses  the Cloudinary AI Vision fallback: tags + moderation answers
 *                   in one call, detail low, json_schema strict (analysis/fallback.ts)
 *
 * Images go as data URLs: whether OpenAI can fetch signed Cloudinary URLs is not documented.
 * describePhoto gets a face-blurred copy (UNDERSTAND_TRANSFORM). visionLabels gets the same signed,
 * unblurred analysis copy (ANALYZE_SOURCE) Cloudinary AI Vision reads, because "are children's
 * faces clearly visible?" can't be answered on a blurred one (docs/providers.md). store: false.
 */
import { z } from "zod";
import { findProseIssues } from "../../claims";
import { EMBEDDING_DIMENSIONS } from "../../db/schema";
import { searchParserPrompt, type SearchVocabulary } from "../../ai/prompts";
import { openAiCost } from "../../pricing";
import { callWithRetry, type HttpDeps } from "../http";
import type { ModerationQuestion, TaxonomyEntry } from "../analysis";
import type { AIProvider, ClaimRef } from "./index";
import { strictJsonSchema } from "./json-schema";
import { ParsedSearch, PhotoAnalysisOutput, type PhotoAnalysis } from "./schemas";

export interface OpenAIOptions {
  apiKey?: string;
  modelFast: string;
  modelSmart: string;
  embedModel: string;
  imageDetail?: "low" | "high";
  timeoutMs?: number;
  /** Reasoning effort for reasoning models ("none" | "low" | …); omitted when undefined. */
  reasoningEffort?: string;
}

export interface OpenAIDeps extends HttpDeps {
  /** Image bytes for a delivery URL (real media: HTTPS fetch; mock media: rendered in-process). */
  loadImage?: (url: string) => Promise<{ bytes: Buffer; contentType: string }>;
}

const API = "https://api.openai.com/v1";

export class OpenAIRefusalError extends Error {
  constructor(readonly refusal: string) {
    super(`The model refused: ${refusal.slice(0, 200)}`);
    this.name = "OpenAIRefusalError";
  }
}

interface ResponsesBody {
  model?: string;
  status?: string;
  incomplete_details?: { reason?: string } | null;
  output?: Array<{ type: string; content?: Array<{ type: string; text?: string; refusal?: string }> }>;
  usage?: { input_tokens?: number; output_tokens?: number; input_tokens_details?: { cached_tokens?: number } };
}

/** Text of a Responses API result: output[] message → content[] output_text (output_text is SDK-only). */
export function responseText(body: ResponsesBody): string {
  if (body.status && body.status !== "completed") {
    throw new Error(`OpenAI response ${body.status}${body.incomplete_details?.reason ? ` (${body.incomplete_details.reason})` : ""}`);
  }
  const parts = (body.output ?? []).filter((o) => o.type === "message").flatMap((o) => o.content ?? []);
  const refusal = parts.find((p) => p.type === "refusal");
  if (refusal) throw new OpenAIRefusalError(refusal.refusal ?? "");
  const text = parts.filter((p) => p.type === "output_text").map((p) => p.text ?? "").join("");
  if (!text) throw new Error("OpenAI response has no output_text");
  return text;
}

const responsesMeter = (model: string) => (b: unknown) => {
  const u = (b as ResponsesBody).usage ?? {};
  const input = u.input_tokens ?? 0;
  const output = u.output_tokens ?? 0;
  const cached = u.input_tokens_details?.cached_tokens ?? 0;
  return { units: { input_tokens: input, output_tokens: output, cached_tokens: cached }, costUsd: openAiCost(model, input, output, cached) };
};

export const PHOTO_PROMPT = [
  "You describe one field photo from an NGO or community project in India, for an evidence library.",
  "Return JSON matching the schema. Be literal: describe only what is visible.",
  "caption: one plain sentence with no digits and no number words (quantities go in visibleCounts).",
  "activity: cleanup | plantation | school | water | other. stage: before | during | after | ongoing | unknown (before = the problem is visible, e.g. litter; after = the result, e.g. a cleared area).",
  "visibleCounts: countable things you can see (e.g. litter bags, saplings, volunteers), each with a 0–1 confidence. Estimates, never exact claims.",
  "visualSignals: short phrases for what supports the activity and stage. sdgs: UN SDG numbers that apply.",
  "childrenVisible: true if any child may be visible. textInImage: any text burned into the photo (signs, date stamps, watermarks) exactly as written, else null.",
  "confidence: 0–1 for the activity and stage reading overall. Faces are blurred on purpose.",
].join("\n");

/** The AI Vision fallback: tags and moderation in one short call (docs/providers.md, CLD_AI_VISION). */
export const VISION_FALLBACK_PROMPT = [
  "You label one photo for an evidence library.",
  "tags: the names from the list that clearly apply; none is fine.",
  "answers: true or false for every question id; when unsure, false.",
].join("\n");

/** Tags and moderation answers for one image, from one vision call. */
export interface VisionLabels {
  tags: string[];
  answers: Record<string, boolean>;
  model: string;
}

/** What the model may return: a tag enum and one boolean per question id (strict mode needs every key). */
function visionLabelsSchema(taxonomy: TaxonomyEntry[], questions: ModerationQuestion[]) {
  const names = taxonomy.map((t) => t.name);
  return z.object({
    tags: names.length ? z.array(z.enum(names as [string, ...string[]])) : z.array(z.string()).max(0),
    answers: z.object(Object.fromEntries(questions.map((q) => [q.id, z.boolean()]))),
  });
}

export function prosePrompt(claims: ClaimRef[]): string {
  return [
    "You write short texts for an impact-evidence product. Rules that are checked by code:",
    "1. Never write a digit (0–9) or a number word (one, two, dozen, hundred, first, twice…).",
    "2. Every number comes from a claim, written exactly as {{claim:<id>}} with an id from the list below. Use only listed ids.",
    "3. No other placeholders, no markdown, no hashtags unless asked.",
    "Claims (id: what it means):",
    ...claims.map((c) => `- ${c.id}: ${c.label}`),
  ].join("\n");
}

export class OpenAIProvider implements AIProvider {
  readonly kind = "real" as const;
  get models() {
    return { vision: this.options.modelFast, text: this.options.modelSmart, embed: this.options.embedModel };
  }

  constructor(
    readonly options: OpenAIOptions,
    private readonly deps: OpenAIDeps = {},
  ) {}

  private headers() {
    if (!this.options.apiKey) throw new Error("OPENAI_API_KEY is not set");
    return { authorization: `Bearer ${this.options.apiKey}`, "content-type": "application/json" };
  }

  /** The exact /v1/responses body for a call (contract tests assert it). */
  responsesRequest(model: string, input: unknown[], format?: { name: string; schema: Record<string, unknown> }) {
    return {
      model,
      input,
      store: false,
      ...(this.options.reasoningEffort ? { reasoning: { effort: this.options.reasoningEffort } } : {}),
      ...(format ? { text: { format: { type: "json_schema", name: format.name, schema: format.schema, strict: true } } } : {}),
    };
  }

  private async responses(operation: string, model: string, body: unknown, meta: { assetId?: string | null } = {}): Promise<ResponsesBody> {
    const { body: out } = await callWithRetry<ResponsesBody>(
      {
        provider: "openai",
        operation,
        model,
        url: `${API}/responses`,
        init: { method: "POST", headers: this.headers(), body: JSON.stringify(body) },
        timeoutMs: this.options.timeoutMs ?? 60_000,
        meter: responsesMeter(model),
        assetId: meta.assetId,
      },
      this.deps,
    );
    return out;
  }

  private async imageDataUrl(url: string): Promise<string> {
    if (url.startsWith("data:")) return url;
    const { bytes, contentType } = this.deps.loadImage
      ? await this.deps.loadImage(url)
      : await callWithRetry<Buffer>({ provider: "cloudinary", operation: "derived:ai-input", url, init: { method: "GET" }, as: "buffer", timeoutMs: 60_000 }, this.deps).then((r) => ({
          bytes: r.body,
          contentType: r.headers.get("content-type") ?? "image/jpeg",
        }));
    return `data:${contentType.split(";")[0]};base64,${bytes.toString("base64")}`;
  }

  async describePhotoRequest(imageUrl: string) {
    return this.responsesRequest(
      this.options.modelFast,
      [
        { role: "developer", content: PHOTO_PROMPT },
        {
          role: "user",
          content: [
            { type: "input_text", text: "Describe this photo." },
            { type: "input_image", image_url: await this.imageDataUrl(imageUrl), detail: this.options.imageDetail ?? "high" },
          ],
        },
      ],
      { name: "photo_analysis", schema: strictJsonSchema(PhotoAnalysisOutput) },
    );
  }

  async describePhoto(imageUrl: string): Promise<PhotoAnalysis> {
    const body = await this.responses("describe_photo", this.options.modelFast, await this.describePhotoRequest(imageUrl));
    const parsed = PhotoAnalysisOutput.parse(JSON.parse(responseText(body)));
    return { ...parsed, method: "ai_estimated", model: body.model ?? this.options.modelFast, providerMode: "real" };
  }

  /**
   * The Cloudinary AI Vision fallback: which taxonomy names apply and a yes/no per moderation
   * question, in ONE call. The fast model, detail "low" (a fixed small token cost whatever the
   * size), a short prompt and a small strict schema keep it near $0.0005 a photo.
   */
  async visionLabelsRequest(imageUrl: string, taxonomy: TaxonomyEntry[], questions: ModerationQuestion[]) {
    const list = [
      "Tags:",
      ...taxonomy.map((t) => `- ${t.name}: ${t.description}`),
      "Questions:",
      ...questions.map((q) => `- ${q.id}: ${q.text}`),
    ].join("\n");
    return this.responsesRequest(
      this.options.modelFast,
      [
        { role: "developer", content: VISION_FALLBACK_PROMPT },
        {
          role: "user",
          content: [
            { type: "input_text", text: list },
            { type: "input_image", image_url: await this.imageDataUrl(imageUrl), detail: "low" },
          ],
        },
      ],
      { name: "vision_labels", schema: strictJsonSchema(visionLabelsSchema(taxonomy, questions)) },
    );
  }

  async visionLabels(imageUrl: string, taxonomy: TaxonomyEntry[], questions: ModerationQuestion[], meta: { assetId?: string | null } = {}): Promise<VisionLabels> {
    const body = await this.responses("vision_fallback", this.options.modelFast, await this.visionLabelsRequest(imageUrl, taxonomy, questions), meta);
    // Lenient on tags (an unknown name is dropped, never an error), strict on the answers.
    const parsed = z
      .object({ tags: z.array(z.string()), answers: z.object(Object.fromEntries(questions.map((q) => [q.id, z.boolean()]))) })
      .parse(JSON.parse(responseText(body)));
    const names = new Set(taxonomy.map((t) => t.name));
    return { tags: [...new Set(parsed.tags.filter((t) => names.has(t)))], answers: parsed.answers as Record<string, boolean>, model: body.model ?? this.options.modelFast };
  }

  async writeWithPlaceholders(instruction: string, claims: ClaimRef[]): Promise<string> {
    const ids = new Set(claims.map((c) => c.id));
    const input: unknown[] = [
      { role: "developer", content: prosePrompt(claims) },
      { role: "user", content: instruction },
    ];
    for (let attempt = 1; attempt <= 3; attempt++) {
      const text = responseText(await this.responses("write_prose", this.options.modelSmart, this.responsesRequest(this.options.modelSmart, input))).trim();
      const unknown = [...text.matchAll(/\{\{claim:([a-z0-9_]+)\}\}/g)].map((m) => m[1]).filter((id) => !ids.has(id));
      const issues = [...findProseIssues(text).map((i) => `"${i.text}" (${i.kind})`), ...unknown.map((id) => `unknown claim id ${id}`)];
      if (!issues.length) return text;
      // Show the model what broke the rules and ask again (withGuards still validates the result).
      input.push({ role: "assistant", content: text }, { role: "user", content: `That breaks the rules: ${issues.join(", ")}. Rewrite it following every rule.` });
    }
    throw new Error("OpenAI prose kept breaking the placeholder rule after 3 attempts");
  }

  parseSearchRequest(query: string, vocabulary: SearchVocabulary) {
    return this.responsesRequest(
      this.options.modelFast,
      [
        { role: "developer", content: searchParserPrompt(vocabulary) },
        { role: "user", content: query },
      ],
      { name: "parsed_search", schema: strictJsonSchema(ParsedSearch) },
    );
  }

  async parseSearch(query: string, vocabulary?: SearchVocabulary): Promise<ParsedSearch> {
    const v = vocabulary ?? { projects: [], bands: ["VERIFIED", "NEEDS_REVIEW", "FLAGGED"], sources: ["witness", "upload", "archive", "planted_test"], activities: ["cleanup", "plantation", "school", "water", "other"], today: new Date().toISOString().slice(0, 10) };
    const body = await this.responses("parse_search", this.options.modelFast, this.parseSearchRequest(query, v));
    return ParsedSearch.parse(JSON.parse(responseText(body)));
  }

  embedRequest(text: string) {
    const model = this.options.embedModel;
    // The API rejects empty input.
    const input = text.trim() || "(no description)";
    return { model, input, ...(model.startsWith("text-embedding-3") ? { dimensions: EMBEDDING_DIMENSIONS } : {}), encoding_format: "float" };
  }

  async embed(text: string): Promise<number[]> {
    const model = this.options.embedModel;
    const { body } = await callWithRetry<{ data?: Array<{ embedding?: number[] }>; usage?: { prompt_tokens?: number } }>(
      {
        provider: "openai",
        operation: "embed",
        model,
        url: `${API}/embeddings`,
        init: { method: "POST", headers: this.headers(), body: JSON.stringify(this.embedRequest(text)) },
        timeoutMs: this.options.timeoutMs ?? 60_000,
        meter: (b) => {
          const t = (b as { usage?: { prompt_tokens?: number } }).usage?.prompt_tokens ?? 0;
          return { units: { input_tokens: t }, costUsd: openAiCost(model, t) };
        },
      },
      this.deps,
    );
    const v = body.data?.[0]?.embedding;
    if (!Array.isArray(v)) throw new Error("OpenAI embeddings response has no data[0].embedding");
    // Re-normalise: harmless for unit vectors, required if a model returns shortened ones.
    const norm = Math.hypot(...v) || 1;
    return v.map((x) => x / norm);
  }
}
