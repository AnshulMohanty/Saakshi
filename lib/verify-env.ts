/**
 * `pnpm verify:env [--prod]` (pure): what a deployment is missing. Development needs nothing
 * (every provider has a mock), so without --prod only mistakes are reported. With --prod every
 * real service is required, because production never shows mock-derived numbers: a deployment
 * on mocks would show "Not available" everywhere.
 */
import { EnvSchema, publicSecretLeaks, selectProviders } from "./config";

export interface EnvCheck {
  level: "error" | "warning" | "ok";
  name: string;
  message: string;
}

const has = (raw: Record<string, string | undefined>, k: string) => (raw[k] ?? "").trim() !== "";

export function verifyEnv(raw: Record<string, string | undefined>, { prod = false } = {}): { ok: boolean; checks: EnvCheck[] } {
  const checks: EnvCheck[] = [];
  const add = (level: EnvCheck["level"], name: string, message: string) => checks.push({ level, name, message });

  const parsed = EnvSchema.safeParse(raw);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) add("error", String(issue.path[0] ?? "env"), issue.message);
    return { ok: false, checks };
  }
  const env = parsed.data;
  for (const k of publicSecretLeaks(raw)) add("error", k, "Looks like a secret but has a NEXT_PUBLIC_ prefix, so it would ship to the browser.");

  const providers = selectProviders(env);
  for (const p of Object.values(providers)) {
    if (p.note && p.missingVars.length) add(prod ? "error" : "warning", p.missingVars.join(", "), p.note);
  }
  if (!prod) {
    if (!checks.length) add("ok", "env", "Development: every missing provider falls back to its mock.");
    return { ok: !checks.some((c) => c.level === "error"), checks };
  }

  const need = (k: string, why: string) => (has(raw, k) ? add("ok", k, "set") : add("error", k, why));
  need("APP_URL", "Public https URL: Cloudinary notification_url, QR codes, report links.");
  if (env.APP_URL && !env.APP_URL.startsWith("https://")) add("error", "APP_URL", "Must be https in production (camera and geolocation need a secure origin).");
  need("CAPTURE_TOKEN_SECRET", "Signs capture tokens; the dev default is refused in production.");
  if (env.CAPTURE_TOKEN_SECRET && env.CAPTURE_TOKEN_SECRET.length < 32) add("error", "CAPTURE_TOKEN_SECRET", "Use 32+ random characters.");
  for (const k of ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"]) need(k, "Cloudinary: media, analysis, masks (production shows no mock numbers).");
  need("OPENAI_API_KEY", "OpenAI: photo understanding, prose, search, embeddings.");
  need("DATABASE_URL", "Postgres (Supabase transaction pooler). PGlite can't run on a serverless filesystem.");
  if (env.DATABASE_URL) {
    const port = /:(\d+)\//.exec(env.DATABASE_URL)?.[1];
    if (port && port !== "6543" && port !== "5432") add("warning", "DATABASE_URL", `Port ${port}: Supabase's pooler listens on 6543 (transaction) or 5432 (session).`);
    if (/\bdb\.[a-z0-9]+\.supabase\.co\b/.test(env.DATABASE_URL)) add("warning", "DATABASE_URL", "Direct connection (db.<ref>.supabase.co) is IPv6-only unless you buy the IPv4 add-on; use the pooler URL.");
  }
  for (const k of ["INNGEST_EVENT_KEY", "INNGEST_SIGNING_KEY"]) need(k, "Inngest cloud (the Vercel integration sets both).");
  need("DEMO_ADMIN_SECRET", "Guards demo reset, report generation, pairing overrides and project edits.");
  if (!has(raw, "APP_CONTACT_EMAIL")) add("warning", "APP_CONTACT_EMAIL", "Wikimedia and Nominatim User-Agents should carry a contact (usage policies).");
  if (!has(raw, "STAGE_LAT") || !has(raw, "STAGE_LNG")) add("warning", "STAGE_LAT/STAGE_LNG", "No stage venue: the try-to-fool-it sandbox says nothing can be verified.");
  if (env.DEV_TOOLS === "1") add("warning", "DEV_TOOLS", "/dev/* is enabled in production.");
  if (env.QUEUE === "inngest-dev") add("error", "QUEUE", "inngest-dev is the local Dev Server; unset QUEUE in production.");
  if (env.GEOCODER === "mock") add("warning", "GEOCODER", "Place names come from the nearest-city mock.");
  return { ok: !checks.some((c) => c.level === "error"), checks };
}
