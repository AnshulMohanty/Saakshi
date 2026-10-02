/** verify:env and cld:setup (pure parts): what a deployment is missing, and what setup would change. */
import { describe, expect, it } from "vitest";
import { METADATA_FIELDS, planSetup, presetSettings, structuredValue } from "@/lib/providers/cloudinary/setup";
import { verifyEnv } from "@/lib/verify-env";

const PROD = {
  NODE_ENV: "production",
  APP_URL: "https://saakshi.example",
  CAPTURE_TOKEN_SECRET: "x".repeat(40),
  CLOUDINARY_CLOUD_NAME: "c",
  CLOUDINARY_API_KEY: "k",
  CLOUDINARY_API_SECRET: "s",
  OPENAI_API_KEY: "sk-x",
  DATABASE_URL: "postgresql://postgres.ref:pw@aws-0-ap-south-1.pooler.supabase.com:6543/postgres",
  INNGEST_EVENT_KEY: "e",
  INNGEST_SIGNING_KEY: "signkey-prod-x",
  DEMO_ADMIN_SECRET: "d",
  WALL_OPERATOR_SECRET: "w",
  APP_CONTACT_EMAIL: "team@saakshi.example",
  STAGE_LAT: "12.97",
  STAGE_LNG: "77.59",
};

describe("verifyEnv", () => {
  it("development needs nothing", () => {
    expect(verifyEnv({}).ok).toBe(true);
  });

  it("a complete production env passes with no warnings", () => {
    const r = verifyEnv(PROD, { prod: true });
    expect(r.ok).toBe(true);
    expect(r.checks.filter((c) => c.level !== "ok")).toEqual([]);
  });

  it("production requires every real service; a partial provider is an error", () => {
    const r = verifyEnv({ NODE_ENV: "production", CLOUDINARY_CLOUD_NAME: "c" }, { prod: true });
    expect(r.ok).toBe(false);
    const errors = r.checks.filter((c) => c.level === "error").map((c) => c.name);
    for (const k of ["APP_URL", "CAPTURE_TOKEN_SECRET", "CLOUDINARY_API_SECRET", "OPENAI_API_KEY", "DATABASE_URL", "INNGEST_SIGNING_KEY", "DEMO_ADMIN_SECRET"]) expect(errors).toContain(k);
  });

  it("catches http APP_URL, short secrets, NEXT_PUBLIC_ secrets, the dev queue and direct Supabase URLs", () => {
    const r = verifyEnv(
      { ...PROD, APP_URL: "http://saakshi.example", CAPTURE_TOKEN_SECRET: "short", NEXT_PUBLIC_OPENAI_API_KEY: "sk", QUEUE: "inngest-dev", DATABASE_URL: "postgresql://postgres:pw@db.abcd.supabase.co:5432/postgres" },
      { prod: true },
    );
    const msgs = r.checks.filter((c) => c.level !== "ok").map((c) => `${c.level}:${c.name}`);
    expect(msgs).toEqual(expect.arrayContaining(["error:APP_URL", "error:CAPTURE_TOKEN_SECRET", "error:NEXT_PUBLIC_OPENAI_API_KEY", "error:QUEUE", "warning:DATABASE_URL"]));
  });
});

describe("cld:setup plan", () => {
  it("unknown state (dry run without keys): every field and the preset, as 'if missing'", () => {
    const plan = planSetup({}, { appUrl: null });
    expect(plan.filter((a) => a.kind === "create_field").map((a) => (a.request!.body as { external_id: string }).external_id)).toEqual(["project_id", "trust_score", "trust_band", "captured_at"]);
    expect(plan.find((a) => a.kind === "create_preset")!.request).toMatchObject({ method: "POST", path: "upload_presets", json: false, body: { name: "saakshi_evidence", unsigned: "false", type: "authenticated", moderation: "manual" } });
    expect(plan.some((a) => a.kind === "note")).toBe(true); // no https APP_URL → no notification_url yet
  });

  it("is idempotent: nothing to do when everything matches", () => {
    const settings = presetSettings({ appUrl: "https://saakshi.example" });
    const plan = planSetup(
      { fields: METADATA_FIELDS.map((f) => ({ external_id: f.external_id, type: f.type })), preset: { name: "saakshi_evidence", unsigned: false, settings: { ...settings, phash: true, faces: true } } },
      { appUrl: "https://saakshi.example" },
    );
    expect(plan.every((a) => a.kind.endsWith("_ok"))).toBe(true);
    expect(plan.some((a) => a.request)).toBe(false);
  });

  it("updates a preset whose settings drifted, never touches a field of another type", () => {
    const plan = planSetup(
      { fields: [{ external_id: "trust_score", type: "string" }], preset: { name: "saakshi_evidence", unsigned: false, settings: { type: "upload" } } },
      { appUrl: "https://saakshi.example", deliveryType: "private" },
    );
    expect(plan.find((a) => a.kind === "field_conflict")?.note).toMatch(/trust_score exists as string/);
    const upd = plan.find((a) => a.kind === "update_preset")!;
    expect(upd.request).toMatchObject({ method: "PUT", path: "upload_presets/saakshi_evidence" });
    expect((upd.request!.body as Record<string, string>).type).toBe("private");
    expect((upd.request!.body as Record<string, string>).notification_url).toBe("https://saakshi.example/api/webhooks/cloudinary");
  });

  it("date fields take yyyy-mm-dd", () => {
    expect(structuredValue("captured_at", "2025-03-14T04:00:00.000Z")).toBe("2025-03-14");
    expect(structuredValue("trust_band", "VERIFIED")).toBe("VERIFIED");
  });
});
