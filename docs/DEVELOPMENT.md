# Saakshi: developer guide

Saakshi (साक्षी, "witness") turns field photos from NGOs and community groups into verified,
measured, traceable proof of impact: capture → Cloudinary ingest (metadata, pHash) → AI
understanding → rule-based Trust Engine (score + reasons) → measured before/after → reports where
every number links to its source photo. Hero use case: cleanup drives (litter before/after, then
community check-ins at the same spot). Hackathon project: Code Cubicle 6.0, PS02, Cloudinary track.

## Commands

```bash
pnpm dev          # Next.js dev server (Turbopack), http://localhost:3000
pnpm test         # Vitest, offline and deterministic (all providers mocked)
pnpm lint         # ESLint (flat config)
pnpm typecheck    # next typegen && tsc --noEmit
pnpm db:migrate   # apply drizzle/ migrations (PGlite in .data/pglite, or DATABASE_URL)
pnpm db:studio    # Drizzle Studio (serves PGlite over a local socket; stop `pnpm dev` first)
pnpm db:generate  # generate a migration after editing lib/db/schema.ts
pnpm fixtures     # regenerate tests/fixtures (synthetic images)
```

Local PGlite supports **one process at a time**: `db:migrate` / `db:studio` refuse to run while
`pnpm dev` holds `.data/pglite.lock`. The app also migrates PGlite on first connection.

## Folder conventions

- `app/(marketing)` landing · `app/(app)` product pages · `app/e/[assetId]` public evidence ·
  `app/spots/[id]` spot pages · `app/dev/*` dev-only tools (404 in production) · `app/api/*` routes.
- `lib/providers/<name>/` — `index.ts` (interface + factory), `mock.ts`, `real.ts`.
- `lib/media/transform.ts` — structured transforms, Cloudinary URL compiler/parser, signing.
- `lib/db/` — `schema.ts` (Drizzle), `client.ts` (PGlite | Postgres), `search.ts` (hybrid search).
- Pure, tested modules: `lib/geo.ts`, `lib/phash.ts`, `lib/hashchain.ts`, `lib/claims.ts`
  (later `lib/trust`, `lib/measure`). Tests live in `tests/*.test.ts`; fixtures in `tests/fixtures`.
- `drizzle/` generated SQL migrations (commit them) · `scripts/` CLI scripts (run with tsx) · `docs/`.
- UI: shadcn/ui (base-nova) with defaults only until Phase 7. Colours, radii and fonts are CSS
  variables in `app/globals.css`; never hard-code them.

## Providers: mock first

Every external service (media, analysis, ai, db, queue, geocoder) sits behind an interface with a
mock and a real implementation. `lib/config.ts` selects **real only when all of a provider's env
vars are set**; otherwise the mock. The app and tests must always run with no `.env`, no accounts
and no keys. Get providers from the factories (`getMediaProvider()`, `getAIProvider()`, …), never
by constructing a real class directly. Mocks are deterministic (same input → same output). Real
methods that aren't built yet throw `NotConfiguredError`. `/dev/status` shows what is active.
Details and mock limitations: `docs/providers.md`.

## Rules

1. Totals and KPIs are database aggregates, never LLM output.
2. The LLM never writes digits; prose references numbers only as {{claim:id}};
   lib/claims.ts validates every generated text.
3. Trust scores come only from lib/trust (pure, tested). The LLM may only rephrase reasons.
4. Every AI-produced value carries method "ai_estimated" and a confidence.
5. All Cloudinary URLs are built via lib/media/transform.ts. Public images are always signed
   and face-blurred; original URLs are never sent to the client.
6. Pipeline steps are idempotent, keyed by asset id.
7. Pure modules (lib/trust, lib/measure, lib/geo, lib/phash, lib/hashchain, lib/claims)
   need tests for every change.
8. Secrets never get a NEXT_PUBLIC_ prefix.

## Gotchas

- Modules that read secrets import `server-only`. Scripts therefore run with
  `tsx --conditions=react-server`, and Vitest aliases `server-only` to a stub.
- Mock media serves **signed URLs only** (like Cloudinary Strict Transformations): unsigned or
  edited URLs return 401. The route reads the raw encoded path because signatures cover it exactly.
- Transforms are the `Transform` zod type; store them in `assets.transforms` as edit history.
- The audit log is append-only and hash-chained: write via `appendAudit()`, never update rows.
- EXIF times without an offset are read with `EXIF_DEFAULT_UTC_OFFSET` (default +05:30), never
  the server's local timezone.
- Next 16: `params`/`searchParams` are Promises (`PageProps<"/route">`), `next lint` is gone (use
  `pnpm lint`), and pages that read env or DB call `await connection()`.

