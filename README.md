# Saakshi · साक्षी

**Field photos in, verified proof of impact out.** Saakshi ("witness") ingests photos from NGOs
and community groups, checks them with a rule-based Trust Engine, measures before/after change,
and produces reports where every number links back to the photo it came from.

Code Cubicle 6.0 · PS02 · Cloudinary track.

## Quick start

No accounts or keys needed. Every external service has a local mock.

```bash
pnpm i
pnpm db:migrate   # creates ./.data/pglite (Postgres in WASM, with pgvector)
pnpm dev          # http://localhost:3000
```

- `/dev/status` shows which providers are mocked or real, and why.
- `/dev/upload-test` runs an upload end to end: pHash, EXIF, a signed derivative, and tampered URLs returning 401.

## Commands

| Command | What it does |
| --- | --- |
| `pnpm dev` | Dev server |
| `pnpm test` | Unit + integration tests (offline) |
| `pnpm lint` / `pnpm typecheck` | ESLint / TypeScript |
| `pnpm db:migrate` | Apply migrations to PGlite or `DATABASE_URL` |
| `pnpm db:studio` | Drizzle Studio (stop `pnpm dev` first when using PGlite) |
| `pnpm db:generate` | New migration from `lib/db/schema.ts` |

## Configuration

Copy `.env.example` to `.env.local` and fill in only what you want to make real: Cloudinary
(media + analysis), OpenAI (AI), `DATABASE_URL` (Postgres/Supabase) or Inngest (queue). A provider
becomes real only when all of its variables are set.

## Stack

Next.js 16 (App Router) · TypeScript · Tailwind v4 + shadcn/ui · Drizzle ORM · PGlite + pgvector
locally / Postgres in production · Zod · Vitest · sharp · exifr.

## Roadmap

1. **Foundation + mock mode** ← current
2. Open-data importer (Wikimedia Commons demo data)
3. Capture + ingest pipeline
4. Trust Engine + review
5. Before/after + monitoring
6. Search + outputs (reports, evidence pages)
7. Design system + demo mode
8. Real keys + deploy

Contributor and agent guide: [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md). Provider details: [docs/providers.md](docs/providers.md).
