/**
 * `pnpm cld:setup [--dry-run]`: makes sure the Cloudinary account has what Saakshi writes to
 * (structured metadata fields, the signed upload preset). Idempotent: reads first, creates what
 * is missing, updates the preset only when its settings differ, never deletes. --dry-run prints
 * the requests without sending them (works with no keys). Plan: lib/providers/cloudinary/setup.ts.
 */
import "./_env";
import { getConfig } from "../lib/config";
import { CloudinaryClient } from "../lib/providers/cloudinary/client";
import { PRESET_NAME, planSetup, type ExistingState } from "../lib/providers/cloudinary/setup";
import { ProviderHttpError } from "../lib/providers/http";

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const config = getConfig();
  const { cloudName, apiKey, apiSecret, deliveryType } = config.cloudinary;
  const configured = !!(cloudName && apiKey && apiSecret);
  if (!configured && !dryRun) {
    console.error("Cloudinary is not configured: set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET (docs/MANUAL_STEPS.md), or run with --dry-run.");
    process.exitCode = 1;
    return;
  }
  const client = configured ? new CloudinaryClient({ cloudName: cloudName!, apiKey: apiKey!, apiSecret: apiSecret! }) : null;

  const existing: ExistingState = {};
  if (client) {
    const fields = await client.adminApi<{ metadata_fields?: Array<{ external_id: string; type: string }> }>("GET", "metadata_fields", undefined, { operation: "admin:metadata_fields" });
    existing.fields = fields.metadata_fields ?? [];
    try {
      existing.preset = await client.adminApi<NonNullable<ExistingState["preset"]>>("GET", `upload_presets/${PRESET_NAME}`, undefined, { operation: "admin:upload_preset" });
    } catch (err) {
      if (!(err instanceof ProviderHttpError && err.status === 404)) throw err;
      existing.preset = null;
    }
  }

  const actions = planSetup(existing, { appUrl: config.env.APP_URL ?? null, deliveryType });
  console.log(`cld:setup${dryRun ? " --dry-run" : ""} · cloud ${cloudName ?? "<CLOUDINARY_CLOUD_NAME>"}${client ? "" : " (not configured: showing every request)"}\n`);
  for (const a of actions) {
    const mark = a.kind.endsWith("_ok") ? "✓" : a.kind === "field_conflict" || a.kind === "note" ? "!" : dryRun ? "→" : "+";
    console.log(`${mark} ${a.note}`);
    if (!a.request) continue;
    const { method, path, body, json } = a.request;
    if (dryRun) {
      console.log(`    ${method} https://api.cloudinary.com/v1_1/${cloudName ?? "<cloud>"}/${path} (${json ? "JSON" : "form"}) ${JSON.stringify(body)}`);
      continue;
    }
    if (json) await client!.adminJson(method, path, body, { operation: `admin:${path.split("/")[0]}` });
    else await client!.adminApi(method, path, body as Record<string, string>, { operation: `admin:${path.split("/")[0]}` });
  }
  console.log("\nNamed transformations: none needed (every delivery URL is signed; Strict Transformations always allows signed URLs).");
  console.log("Console-only settings (docs/MANUAL_STEPS.md): Strict Transformations on; \"Allow delivery of PDF and ZIP files\" on (Free plan); AI Vision + AI Content Analysis add-ons registered.");
  if (actions.some((a) => a.kind === "field_conflict")) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
