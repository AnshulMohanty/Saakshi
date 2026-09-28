/**
 * `pnpm services:check [--no-extract] [--full]` (alias `pnpm run doctor`; plain `pnpm doctor` is
 * pnpm's own built-in command):
 * what is configured and, for every service with keys, a live check of each call Saakshi depends
 * on, including the ones the docs leave unclear:
 *   - on-the-fly signed transformations of authenticated assets (the docs contradict each other)
 *   - l_authenticated layers, e_extract masks (75 transformations; --no-extract skips), raw PDF delivery
 *   - the Analyze API add-ons, structured metadata, OpenAI models and embeddings
 * Without keys it lists what is missing for each real service. Probe assets live under
 * saakshi/services-check/ and are overwritten on every run. Exit code 1 when a live check fails.
 */
import "./_env";
import sharp from "sharp";
import { getConfig, type ProviderStatus } from "../lib/config";
import { openPostgres, rowsOf } from "../lib/db/client";
import { buildCloudinaryUrl } from "../lib/media/transform";
import { getAIProvider } from "../lib/providers/ai";
import { getAnalysisProvider } from "../lib/providers/analysis";
import { PRESET_NAME, STRUCTURED_FIELD_IDS } from "../lib/providers/cloudinary/setup";
import { callWithRetry } from "../lib/providers/http";
import { getMediaProvider } from "../lib/providers/media";
import { CloudinaryMediaProvider } from "../lib/providers/media/real";
import { flushUsage } from "../lib/usage";

type Status = "ok" | "fail" | "warn" | "skip";
const results: Array<{ group: string; name: string; status: Status; detail: string }> = [];
const mark: Record<Status, string> = { ok: "✓", fail: "✗", warn: "!", skip: "–" };
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/\s+/g, " ").slice(0, 300);

async function check(group: string, name: string, fn: () => Promise<string | { warn: string }>, hint?: string) {
  try {
    const out = await fn();
    results.push(typeof out === "string" ? { group, name, status: "ok", detail: out } : { group, name, status: "warn", detail: out.warn });
  } catch (e) {
    results.push({ group, name, status: "fail", detail: `${errText(e)}${hint ? ` → ${hint}` : ""}` });
  }
  const r = results.at(-1)!;
  console.log(`  ${mark[r.status]} ${r.name}: ${r.detail}`);
}
const skip = (group: string, name: string, detail: string) => {
  results.push({ group, name, status: "skip", detail });
  console.log(`  ${mark.skip} ${name}: ${detail}`);
};

async function get(url: string, headers: Record<string, string> = {}) {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(60_000) });
  return { status: res.status, type: res.headers.get("content-type") ?? "", bytes: Buffer.from(await res.arrayBuffer()) };
}

/** A small test pattern (no people, nothing personal). */
const probeImage = () =>
  sharp({ create: { width: 320, height: 240, channels: 3, background: "#5a7d4f" } })
    .composite([{ input: { create: { width: 160, height: 120, channels: 3, background: "#c9b37e" } }, left: 80, top: 60 }])
    .jpeg()
    .toBuffer();

const MINIMAL_PDF = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n",
);

async function cloudinaryChecks(noExtract: boolean) {
  const media = getMediaProvider();
  if (!(media instanceof CloudinaryMediaProvider)) return;
  const g = "Cloudinary";
  const probe = "saakshi/services-check/probe";
  await check(g, "Admin API (usage)", async () => {
    const u = await media.client.adminApi<{ plan?: string; credits?: { usage?: number; limit?: number; used_percent?: number } }>("GET", "usage", undefined, { operation: "admin:usage" });
    return `plan ${u.plan ?? "?"}, credits ${u.credits?.usage ?? "?"} of ${u.credits?.limit ?? "?"} used`;
  });
  await check(g, "Structured metadata fields", async () => {
    const r = await media.client.adminApi<{ metadata_fields?: Array<{ external_id: string }> }>("GET", "metadata_fields");
    const missing = STRUCTURED_FIELD_IDS.filter((id) => !r.metadata_fields?.some((f) => f.external_id === id));
    if (missing.length) throw new Error(`missing ${missing.join(", ")}`);
    return STRUCTURED_FIELD_IDS.join(", ");
  }, "run pnpm cld:setup");
  await check(g, `Upload preset ${PRESET_NAME}`, async () => {
    const p = await media.client.adminApi<{ unsigned?: boolean; settings?: { notification_url?: string } }>("GET", `upload_presets/${PRESET_NAME}`);
    return p.settings?.notification_url ? `signed, notifies ${p.settings.notification_url}` : { warn: "exists, but has no notification_url (set APP_URL and run pnpm cld:setup)" };
  }, "run pnpm cld:setup");

  let uploaded = false;
  await check(g, `Signed server upload (${media.evidenceType})`, async () => {
    const a = await media.upload({ file: await probeImage(), folder: "saakshi/services-check", publicId: probe, tags: ["saakshi", "doctor"], context: { filename: "doctor-probe.jpg" } });
    uploaded = true;
    return `phash ${a.phash || "MISSING"}, quality ${a.qualityScore ?? "n/a"}, faces ${a.facesCount}`;
  });
  if (!uploaded) return skip(g, "Delivery checks", "no probe asset");
  // docs/external-apis.md C2: is `type` honoured as a body parameter over REST?
  await check(g, `Stored as delivery type ${media.evidenceType}`, async () => {
    if (!(await media.exists(probe))) throw new Error(`not found under resources/image/${media.evidenceType}/`);
    return "yes";
  }, "the type body parameter was ignored: upload evidence through the Cloudinary SDK instead");

  await check(g, "On-the-fly signed transformation of an evidence asset", async () => {
    const b = await media.fetchDerived(probe, [{ width: 64, crop: "limit" }, { effect: "blur_faces" }, { format: "jpg" }]);
    return `${b.length} bytes (the docs disagree on whether this works for authenticated assets: it does here)`;
  }, "set CLD_DELIVERY_TYPE=private (signed URLs only with Strict Transformations) or CLD_EAGER=1, then re-upload");
  await check(g, "Unsigned evidence URL is refused", async () => {
    const r = await get(buildCloudinaryUrl({ cloudName: media.client.creds.cloudName, publicId: probe, transforms: [{ width: 65, crop: "limit" }], deliveryType: media.evidenceType }));
    if (r.status < 400) throw new Error(`HTTP ${r.status}: an unsigned URL was served`);
    return `HTTP ${r.status}`;
  }, "turn on Strict Transformations (Console → Settings → Security)");
  await check(g, "Before/after layer (l_authenticated, whole URL signed)", async () => {
    const c = await media.composite({ publicId: probe, label: "check" }, { publicId: probe, label: "check" });
    const r = await get(c.url);
    if (r.status !== 200) throw new Error(`HTTP ${r.status} (${c.mode} mode)`);
    return `${c.mode} mode, ${r.bytes.length} bytes`;
  }, "set CLD_COMPOSITE_MODE=server");
  if (noExtract) skip(g, "e_extract mask", "--no-extract");
  else
    await check(g, "e_extract mask (2 prompts, counts as 75 transformations)", async () => {
      const m = await media.extractMask(probe, ["litter", "plants"], { multiple: true });
      const meta = await sharp(m.buffer).metadata();
      return `${meta.width}×${meta.height} ${meta.format}`;
    }, "e_extract is unavailable in the Asia Pacific region; or set CLD_EXTRACT_MODE=union");

  await check(g, "Raw PDF upload + signed delivery", async () => {
    await media.uploadRaw({ publicId: "saakshi/services-check/probe.pdf", bytes: MINIMAL_PDF, contentType: "application/pdf" });
    const r = await get(media.rawUrl("saakshi/services-check/probe.pdf"));
    if (r.status !== 200 || !r.bytes.subarray(0, 5).equals(Buffer.from("%PDF-"))) throw new Error(`HTTP ${r.status}`);
    return `HTTP 200, ${r.bytes.length} bytes`;
  }, `Free plan: enable "Allow delivery of PDF and ZIP files" (Settings → Security), or set CLD_PDF_DELIVERY=download`);
  await check(g, "Metadata write-back (structured + context + tags)", async () => {
    await media.updateMetadata(probe, { trust_score: "0", trust_band: "FLAGGED", source: "services-check" }, { tags: ["services-check"] });
    return "ok";
  }, "run pnpm cld:setup");

  const analysis = getAnalysisProvider();
  await check(g, "Analyze API: AI Vision tagging", async () => `tags: ${(await analysis.tag(probe, [{ name: "pattern", description: "a flat test pattern of rectangles" }])).join(", ") || "none"}`, "register the AI Vision add-on (Console → Add-ons)");
  await check(g, "Analyze API: AI Vision moderation", async () => JSON.stringify(await analysis.moderate(probe, [{ id: "people", text: "Are people visible?" }])), "register the AI Vision add-on");
  await check(g, "Analyze API: watermark detection", async () => `watermark: ${await analysis.detectWatermark(probe)}`, "register the AI Content Analysis add-on");
}

async function openAiChecks(full: boolean) {
  const { openai } = getConfig();
  if (!openai.apiKey) return;
  const g = "OpenAI";
  for (const model of [...new Set([openai.modelFast, openai.modelSmart, openai.embedModel])]) {
    await check(g, `Model ${model}`, async () => {
      const { body } = await callWithRetry<{ id?: string; owned_by?: string }>({ provider: "openai", operation: "models:retrieve", url: `https://api.openai.com/v1/models/${model}`, init: { headers: { authorization: `Bearer ${openai.apiKey}` } }, retries: 1 });
      return `available (${body.owned_by ?? "?"})`;
    }, "check the model id, the key's project and its model access");
  }
  const ai = getAIProvider();
  await check(g, "Embeddings", async () => `${(await ai.embed("services check")).length} dimensions`, "check credits and the budget limit");
  if (!full) return skip(g, "Vision + structured output", "run with --full (one image call)");
  const media = getMediaProvider();
  await check(g, "Vision + structured output", async () => {
    const a = await ai.describePhoto(media.url("saakshi/services-check/probe", [{ width: 320, crop: "limit" }, { format: "jpg" }], { signed: true }));
    return `activity ${a.activity}, stage ${a.stage}, confidence ${a.confidence}`;
  });
}

async function databaseChecks() {
  const { env } = getConfig();
  const g = "Database";
  if (!env.DATABASE_URL) return skip(g, "Postgres", "DATABASE_URL not set: local PGlite (not checked here, so this works while pnpm dev runs)");
  const h = await openPostgres(env.DATABASE_URL).catch((e) => {
    results.push({ group: g, name: "Connect", status: "fail", detail: errText(e) });
    return null;
  });
  if (!h) return;
  try {
    await check(g, "Connect", async () => String(rowsOf<{ v: string }>(await h.db.execute("select version() as v"))[0]?.v).split(",")[0]);
    await check(g, "pgvector", async () => {
      const r = rowsOf<{ v: string }>(await h.db.execute("select extversion as v from pg_extension where extname = 'vector'"));
      if (!r.length) throw new Error("extension vector is not installed");
      return `vector ${r[0].v}`;
    }, "run pnpm db:migrate (it creates the extension)");
    await check(g, "Migrations", async () => {
      const r = rowsOf<{ n: number }>(await h.db.execute("select count(*)::int as n from drizzle.__drizzle_migrations"));
      const journal = (await import("../drizzle/meta/_journal.json", { with: { type: "json" } })).default as { entries: unknown[] };
      if (r[0].n < journal.entries.length) throw new Error(`${r[0].n} of ${journal.entries.length} applied`);
      return `${r[0].n} of ${journal.entries.length} applied`;
    }, "run pnpm db:migrate with DATABASE_URL set");
    await flushUsage(h.db).catch(() => 0);
  } finally {
    await h.close();
  }
}

async function appChecks() {
  const { env, providers } = getConfig();
  const g = "App";
  if (!env.APP_URL) return skip(g, "APP_URL", "not set");
  await check(g, `GET ${env.APP_URL}`, async () => `HTTP ${(await get(env.APP_URL!)).status}`);
  if (providers.queue.mode === "real" && env.INNGEST_SIGNING_KEY) {
    await check(g, "Inngest endpoint /api/inngest", async () => {
      const r = await get(`${env.APP_URL}/api/inngest`);
      if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
      return "serving";
    }, "deploy, then sync the app in Inngest (the Vercel integration syncs on every deploy)");
  }
}

async function main() {
  const config = getConfig();
  const noExtract = process.argv.includes("--no-extract");
  const full = process.argv.includes("--full");
  console.log("Saakshi services:check\n\nProviders:");
  for (const p of Object.values(config.providers) as ProviderStatus[]) {
    console.log(`  ${p.mode === "real" ? "●" : "○"} ${p.name.padEnd(9)} ${p.mode.padEnd(5)} ${p.implementation}${p.missingVars.length ? `  (for real: ${p.missingVars.join(", ")})` : ""}`);
  }
  for (const w of config.warnings) console.log(`  ! ${w}`);
  const real = Object.values(config.providers).filter((p) => p.mode === "real" && p.requiredVars.length);
  if (!real.length) {
    console.log("\nNo keys are set, so there is nothing to check live. Everything runs on mocks.");
    console.log("Missing for real mode:");
    for (const p of Object.values(config.providers) as ProviderStatus[]) if (p.missingVars.length) console.log(`  ${p.name.padEnd(9)} ${p.missingVars.join(", ")}`);
    console.log("How to get each key: docs/MANUAL_STEPS.md. Production readiness: pnpm verify:env --prod.");
    return;
  }
  for (const [title, fn] of [
    ["Cloudinary", () => cloudinaryChecks(noExtract)],
    ["OpenAI", () => openAiChecks(full)],
    ["Database", databaseChecks],
    ["App", appChecks],
  ] as const) {
    console.log(`\n${title}:`);
    await fn();
  }
  const failed = results.filter((r) => r.status === "fail");
  console.log(`\n${results.filter((r) => r.status === "ok").length} ok, ${results.filter((r) => r.status === "warn").length} warning(s), ${failed.length} failed, ${results.filter((r) => r.status === "skip").length} skipped.`);
  if (failed.length) process.exitCode = 1;
}

main().catch((err) => {
  console.error(errText(err));
  process.exitCode = 1;
});
