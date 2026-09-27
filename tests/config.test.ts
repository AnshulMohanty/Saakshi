import { describe, expect, it } from "vitest";
import { EnvSchema, getCaptureTokenSecret, getMockMediaSigningKey, loadConfig, publicSecretLeaks, selectProviders } from "@/lib/config";

const env = (raw: Record<string, string | undefined>) => EnvSchema.parse(raw);

describe("selectProviders", () => {
  it("uses mocks for everything with an empty environment (geocoder defaults to real Nominatim)", () => {
    const p = selectProviders(env({}));
    expect(p.media.mode).toBe("mock");
    expect(p.analysis.mode).toBe("mock");
    expect(p.ai.mode).toBe("mock");
    expect(p.db.mode).toBe("mock");
    expect(p.queue.mode).toBe("mock");
    expect(p.geocoder.mode).toBe("real");
    expect(p.media.missingVars).toEqual(["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"]);
  });

  it("switches a provider to real only when all of its vars are set", () => {
    const partial = selectProviders(env({ CLOUDINARY_CLOUD_NAME: "demo", CLOUDINARY_API_KEY: "k" }));
    expect(partial.media.mode).toBe("mock");
    expect(partial.media.missingVars).toEqual(["CLOUDINARY_API_SECRET"]);
    expect(partial.media.note).toMatch(/Partially configured/);

    const full = selectProviders(
      env({ CLOUDINARY_CLOUD_NAME: "demo", CLOUDINARY_API_KEY: "k", CLOUDINARY_API_SECRET: "s", OPENAI_API_KEY: "sk", DATABASE_URL: "postgres://u@h/db", INNGEST_EVENT_KEY: "e", INNGEST_SIGNING_KEY: "s" }),
    );
    for (const name of ["media", "analysis", "ai", "db", "queue"] as const) expect(full[name].mode, name).toBe("real");
  });

  it("treats blank values as unset", () => {
    expect(selectProviders(env({ OPENAI_API_KEY: "   " })).ai.mode).toBe("mock");
  });

  it("forces the mock geocoder with GEOCODER=mock or under test", () => {
    expect(selectProviders(env({ GEOCODER: "mock" })).geocoder.mode).toBe("mock");
    expect(selectProviders(env({ NODE_ENV: "test" })).geocoder.mode).toBe("mock");
  });
});

describe("loadConfig", () => {
  it("applies model defaults (SMART falls back to FAST)", () => {
    const c = loadConfig({});
    expect(c.openai.modelFast).toBe("gpt-5.6-luna");
    expect(c.openai.modelSmart).toBe("gpt-5.6-luna");
    expect(c.openai.embedModel).toBe("text-embedding-3-small");
    expect(loadConfig({ OPENAI_MODEL_SMART: "big" }).openai.modelSmart).toBe("big");
    expect(c.appUrl).toBe("http://localhost:3000");
  });

  it("uses a dev capture secret with a warning, and refuses it in production", () => {
    const dev = loadConfig({});
    expect(dev.warnings.join()).toMatch(/CAPTURE_TOKEN_SECRET/);
    expect(getCaptureTokenSecret(dev)).toMatch(/dev-only/);
    expect(() => getCaptureTokenSecret(loadConfig({ NODE_ENV: "production" }))).toThrow(/must be set/);
    expect(getCaptureTokenSecret(loadConfig({ NODE_ENV: "production", CAPTURE_TOKEN_SECRET: "x".repeat(40) }))).toBe("x".repeat(40));
  });

  it("derives a stable mock signing key that differs from the capture secret", () => {
    const c = loadConfig({ CAPTURE_TOKEN_SECRET: "y".repeat(40) });
    expect(getMockMediaSigningKey(c)).toBe(getMockMediaSigningKey(c));
    expect(getMockMediaSigningKey(c)).not.toContain("yyyy");
  });

  it("rejects malformed values", () => {
    expect(() => loadConfig({ DATABASE_URL: "mysql://x" })).toThrow(/DATABASE_URL/);
    expect(() => loadConfig({ EXIF_DEFAULT_UTC_OFFSET: "IST" })).toThrow(/EXIF_DEFAULT_UTC_OFFSET/);
  });

  it("flags secret-looking NEXT_PUBLIC_ variables", () => {
    expect(publicSecretLeaks({ NEXT_PUBLIC_CLOUDINARY_API_SECRET: "x", NEXT_PUBLIC_APP_NAME: "y" })).toEqual(["NEXT_PUBLIC_CLOUDINARY_API_SECRET"]);
    expect(loadConfig({ NEXT_PUBLIC_OPENAI_API_KEY: "x" }).warnings.join()).toMatch(/NEXT_PUBLIC_OPENAI_API_KEY/);
  });
});
