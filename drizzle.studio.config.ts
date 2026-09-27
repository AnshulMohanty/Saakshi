/**
 * drizzle-kit config used by `pnpm db:studio` (scripts/db-studio.ts) for local PGlite.
 * drizzle-kit can't load PGlite extensions, so the script serves PGlite (with pgvector) over the
 * Postgres wire protocol and points Studio at it via STUDIO_DATABASE_URL.
 */
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.STUDIO_DATABASE_URL ?? "postgres://postgres@127.0.0.1:5432/postgres" },
});
