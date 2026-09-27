import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": r("./"),
      // `server-only` throws outside React Server Components; tests run in plain Node.
      "server-only": r("./tests/stubs/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 30_000,
    // Tests must never reach real services, whatever is in the developer's shell.
    env: {
      GEOCODER: "mock",
      CLOUDINARY_CLOUD_NAME: "",
      CLOUDINARY_API_KEY: "",
      CLOUDINARY_API_SECRET: "",
      OPENAI_API_KEY: "",
      DATABASE_URL: "",
      INNGEST_EVENT_KEY: "",
      INNGEST_SIGNING_KEY: "",
      CAPTURE_TOKEN_SECRET: "test-capture-secret",
    },
  },
});
