/**
 * Environment config and provider selection.
 *
 * Every external service has a mock and a real implementation. A provider is "real" only when
 * all of its variables are set; otherwise the mock is used, so the app runs with no .env at all.
 */
import "server-only";
import { createHmac } from "node:crypto";
import { z } from "zod";

const blankToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const optionalString = () => z.preprocess(blankToUndefined, z.string().trim().optional());
const stringWithDefault = (d: string) => z.preprocess(blankToUndefined, z.string().trim().default(d));

export const EnvSchema = z.object({
  NODE_ENV: z.preprocess(blankToUndefined, z.enum(["development", "production", "test"]).default("development")),
  PORT: z.preprocess(blankToUndefined, z.coerce.number().int().positive().optional()),
  APP_URL: z.preprocess(blankToUndefined, z.url().optional()),
  APP_CONTACT_EMAIL: z.preprocess(blankToUndefined, z.email().optional()),
  /** Project URL, used in User-Agents when there is no contact email. */
  APP_REPO_URL: z.preprocess(blankToUndefined, z.url().optional()),
  CAPTURE_TOKEN_SECRET: optionalString(),

  CLOUDINARY_CLOUD_NAME: optionalString(),
  CLOUDINARY_API_KEY: optionalString(),
  CLOUDINARY_API_SECRET: optionalString(),

  OPENAI_API_KEY: optionalString(),
  OPENAI_MODEL_FAST: stringWithDefault("gpt-5.6-luna"),
  OPENAI_MODEL_SMART: optionalString(),
  OPENAI_EMBED_MODEL: stringWithDefault("text-embedding-3-small"),

  DATABASE_URL: z.preprocess(blankToUndefined, z.string().regex(/^postgres(ql)?:\/\//, "must be a postgres:// URL").optional()),
  PGLITE_DIR: stringWithDefault("./.data/pglite"),

  INNGEST_EVENT_KEY: optionalString(),
  INNGEST_SIGNING_KEY: optionalString(),
  /** inline (default) | inngest-dev (local Inngest Dev Server, no account). Keys → Inngest cloud. */
  QUEUE: z.preprocess(blankToUndefined, z.enum(["inline", "inngest-dev"]).default("inline")),

  GEOCODER: z.preprocess(blankToUndefined, z.enum(["nominatim", "mock"]).optional()),

  MEDIA_MOCK_DIR: stringWithDefault("./.data/media"),
  /** Commons API responses and downloaded files, so demo re-imports run offline. */
  ARCHIVE_CACHE_DIR: stringWithDefault("./.data/archive-cache"),
  /** Minimum cosine similarity for assigning an asset to a project by content alone. */
  ASSIGN_SIMILARITY_THRESHOLD: z.preprocess(blankToUndefined, z.coerce.number().min(0).max(1).default(0.45)),
  /** "1" enables /dev/* pages and APIs in production. */
  DEV_TOOLS: z.preprocess(blankToUndefined, z.enum(["0", "1"]).optional()),
  /** Required (header x-demo-admin-secret) for POST /api/demo/reset in production. */
  DEMO_ADMIN_SECRET: optionalString(),
  /** UTC offset assumed for EXIF timestamps that carry none (most phones omit it). */
  EXIF_DEFAULT_UTC_OFFSET: z.preprocess(blankToUndefined, z.string().regex(/^[+-]\d{2}:\d{2}$/).default("+05:30")),
});
export type Env = z.infer<typeof EnvSchema>;

// ---------------------------------------------------------------------------------------------
// Provider selection (pure: takes a parsed env, returns what would be used and why)

export type ProviderName = "media" | "analysis" | "ai" | "db" | "queue" | "geocoder";

export interface ProviderStatus {
  name: ProviderName;
  mode: "mock" | "real";
  implementation: string;
  /** Variables the real implementation needs. */
  requiredVars: string[];
  /** Required variables that are not set (empty when real). */
  missingVars: string[];
  note?: string;
}

const CLOUDINARY_VARS = ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"] as const;
const OPENAI_VARS = ["OPENAI_API_KEY"] as const;
const DB_VARS = ["DATABASE_URL"] as const;
const INNGEST_VARS = ["INNGEST_EVENT_KEY", "INNGEST_SIGNING_KEY"] as const;

function byVars(
  env: Env,
  name: ProviderName,
  vars: ReadonlyArray<keyof Env>,
  real: string,
  mock: string,
): ProviderStatus {
  const missing = vars.filter((v) => env[v] === undefined).map(String);
  const isReal = missing.length === 0;
  return {
    name,
    mode: isReal ? "real" : "mock",
    implementation: isReal ? real : mock,
    requiredVars: vars.map(String),
    missingVars: missing,
    note: !isReal && missing.length < vars.length ? `Partially configured: set ${missing.join(", ")} to enable ${real}.` : undefined,
  };
}

export function selectProviders(env: Env): Record<ProviderName, ProviderStatus> {
  const forcedMockGeocoder = env.GEOCODER === "mock" || env.NODE_ENV === "test";
  return {
    media: byVars(env, "media", CLOUDINARY_VARS, "Cloudinary", "Local files (.data/media) + sharp"),
    analysis: byVars(env, "analysis", CLOUDINARY_VARS, "Cloudinary Analyze API", "Deterministic (filename/tags/context)"),
    ai: byVars(env, "ai", OPENAI_VARS, `OpenAI (${env.OPENAI_MODEL_FAST} / ${env.OPENAI_MODEL_SMART ?? env.OPENAI_MODEL_FAST})`, "Deterministic mock + hash embeddings"),
    db: byVars(env, "db", DB_VARS, "Postgres (DATABASE_URL)", `PGlite + pgvector (${env.PGLITE_DIR})`),
    queue: queueStatus(env),
    geocoder: {
      name: "geocoder",
      mode: forcedMockGeocoder ? "mock" : "real",
      implementation: forcedMockGeocoder ? "Nearest-city mock" : "Nominatim (OpenStreetMap), 1 req/s, cached",
      requiredVars: [],
      missingVars: [],
      note: forcedMockGeocoder
        ? env.GEOCODER === "mock"
          ? "Forced by GEOCODER=mock."
          : "Always mocked under test."
        : env.APP_CONTACT_EMAIL
          ? undefined
          : "No key needed. Set APP_CONTACT_EMAIL so the Nominatim User-Agent identifies you (usage policy).",
    },
  };
}

function queueStatus(env: Env): ProviderStatus {
  const cloud = byVars(env, "queue", INNGEST_VARS, "Inngest cloud", "Inline runner (concurrency 4)");
  if (cloud.mode === "real" || env.QUEUE !== "inngest-dev") return cloud;
  return {
    ...cloud,
    mode: "real",
    implementation: "Inngest Dev Server (QUEUE=inngest-dev, no account)",
    missingVars: [],
    note: "Run `npx inngest-cli@latest dev` and open http://localhost:8288.",
  };
}

// ---------------------------------------------------------------------------------------------
// Runtime config

const DEV_CAPTURE_SECRET = "saakshi-dev-only-capture-secret-do-not-use-in-production";

/** Env vars that look secret but are exposed to the browser via NEXT_PUBLIC_. */
export function publicSecretLeaks(raw: Record<string, string | undefined>): string[] {
  return Object.keys(raw).filter((k) => k.startsWith("NEXT_PUBLIC_") && /SECRET|PASSWORD|PRIVATE|API_KEY|DATABASE|SIGNING/i.test(k));
}

export interface Config {
  env: Env;
  providers: Record<ProviderName, ProviderStatus>;
  appUrl: string;
  isProduction: boolean;
  warnings: string[];
  openai: { apiKey?: string; modelFast: string; modelSmart: string; embedModel: string };
  cloudinary: { cloudName?: string; apiKey?: string; apiSecret?: string };
}

let cached: Config | undefined;
// Shared across Next's module graphs (pages vs route handlers) so warnings print once per process.
const g = globalThis as typeof globalThis & { __saakshiConfigWarned?: boolean };

export function loadConfig(raw: Record<string, string | undefined> = process.env): Config {
  const parsed = EnvSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Invalid environment:\n${z.prettifyError(parsed.error)}`);
  }
  const env = parsed.data;
  const warnings: string[] = [];
  if (!env.CAPTURE_TOKEN_SECRET) {
    warnings.push("CAPTURE_TOKEN_SECRET is not set; using an insecure development default.");
  } else if (env.CAPTURE_TOKEN_SECRET.length < 32) {
    warnings.push("CAPTURE_TOKEN_SECRET is shorter than 32 characters.");
  }
  for (const k of publicSecretLeaks(raw)) warnings.push(`${k} looks like a secret but is exposed to the browser (NEXT_PUBLIC_).`);

  return {
    env,
    providers: selectProviders(env),
    appUrl: (env.APP_URL ?? `http://localhost:${env.PORT ?? 3000}`).replace(/\/$/, ""),
    isProduction: env.NODE_ENV === "production",
    warnings,
    openai: {
      apiKey: env.OPENAI_API_KEY,
      modelFast: env.OPENAI_MODEL_FAST,
      modelSmart: env.OPENAI_MODEL_SMART ?? env.OPENAI_MODEL_FAST,
      embedModel: env.OPENAI_EMBED_MODEL,
    },
    cloudinary: {
      cloudName: env.CLOUDINARY_CLOUD_NAME,
      apiKey: env.CLOUDINARY_API_KEY,
      apiSecret: env.CLOUDINARY_API_SECRET,
    },
  };
}

/** Process-wide config, parsed once. Logs warnings on first use. */
export function getConfig(): Config {
  if (!cached) {
    cached = loadConfig();
    if (!g.__saakshiConfigWarned && cached.warnings.length && cached.env.NODE_ENV !== "test") {
      g.__saakshiConfigWarned = true;
      for (const w of cached.warnings) console.warn(`[saakshi] ${w}`);
    }
  }
  return cached;
}

/** /dev/* pages and APIs: always in development; in production only with DEV_TOOLS=1. */
export function devToolsEnabled(config: Config = getConfig()): boolean {
  return !config.isProduction || config.env.DEV_TOOLS === "1";
}

/** Secret for signing capture tokens. Refuses the dev default in production. */
export function getCaptureTokenSecret(config: Config = getConfig()): string {
  if (config.env.CAPTURE_TOKEN_SECRET) return config.env.CAPTURE_TOKEN_SECRET;
  if (config.isProduction) throw new Error("CAPTURE_TOKEN_SECRET must be set in production.");
  return DEV_CAPTURE_SECRET;
}

/** A purpose-specific key derived from the capture secret (domain separation). */
export function deriveKey(purpose: string, config: Config = getConfig()): string {
  return createHmac("sha256", getCaptureTokenSecret(config)).update(`saakshi:${purpose}`).digest("hex");
}

/** Key for mock media URL signatures. */
export function getMockMediaSigningKey(config: Config = getConfig()): string {
  return deriveKey("mock-media-url:v1", config);
}
