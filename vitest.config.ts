import { availableParallelism, totalmem } from "node:os";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

/**
 * Workers sized by memory, not CPU count. Each worker holds about 0.7 GB (PGlite + pgvector WASM,
 * sharp, the app modules). Vitest's default (CPUs − 1 = 11 here) on an 8 GB machine swapped: a
 * PGlite open that takes 1.3 s alone took 13–27 s, and once crossed the 30 s test timeout (the
 * intermittent failure, ENGINEERING.md issue F). One worker per 2.5 GB: 3 on 8 GB, which ran the
 * suite in 30 s instead of 50 s with the slowest test at 5 s.
 */
const MAX_WORKERS = Math.max(1, Math.min(availableParallelism() - 1, Math.floor(totalmem() / 2.5e9)));

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
    maxWorkers: MAX_WORKERS,
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
