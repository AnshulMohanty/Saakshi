import { defineConfig } from "drizzle-kit";

// Used by `pnpm db:generate` (no DB connection needed). Migrations are applied by
// scripts/db-migrate.ts, which loads PGlite with the pgvector extension.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  strict: true,
  verbose: true,
  ...(process.env.DATABASE_URL ? { dbCredentials: { url: process.env.DATABASE_URL } } : {}),
});
