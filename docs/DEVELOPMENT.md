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
pnpm archive:discover  # Commons search → data/archive-candidates.json (cached; --offline)
pnpm demo:import  # 3 auto-built projects from the candidates; pipeline runs in-process
pnpm demo:plant   # 4 planted test inputs
pnpm demo:reset   # wipe demo data and rebuild offline from .data/archive-cache (--online)
pnpm tunnel       # cloudflared quick tunnel for phone testing
```

Local PGlite supports **one process at a time**: `db:*` and `demo:*` scripts refuse to run while
`pnpm dev` holds `.data/pglite.lock`. While dev is running, use "Run demo import" on /dev/status.
The app also migrates PGlite on first connection.

## Folder conventions

- `app/(marketing)` landing · `app/(app)` product pages (library, capture, …) · `app/(public)`
  shareable pages with a minimal layout (`/e/[assetId]`, `/spots/[slug]`, later `/r/[reportId]`) ·
  `app/(print)` chrome-free print pages (`/spots/[slug]/poster`, one A4 sheet) ·
  `app/dev/*` dev tools (404 in production unless `DEV_TOOLS=1`) · `app/api/*` routes.
- `lib/providers/<name>/`: `index.ts` (interface + factory), `mock.ts`, `real.ts`.
- `lib/media/transform.ts`: structured transforms, Cloudinary URL compiler/parser, signing.
- `lib/db/`: `schema.ts` (Drizzle), `client.ts` (PGlite | Postgres), `search.ts` (hybrid search).
- `lib/archive/`: Commons client (`commons.ts`, network + cache) and pure `parse.ts`,
  `cluster.ts`, `build.ts`. `data/demo-dataset.config.ts` holds the queries and rules.
- `lib/pipeline/`: evidence pipeline. `steps.ts` (one function per step), `runner.ts`
  (idempotency, step records, audit), pure `assign.ts` and `metadata.ts`, `inngest.ts`.
- `lib/capture/token.ts` (capture tokens, pure `validateCapture`) · `lib/ingest/` (upload
  tickets, provider response verification, the shared ingest path) · `lib/demo/` (import, plant,
  reset) · `lib/library.ts` (library queries) · `lib/review.ts` (review queue, decisions) ·
  `lib/pipeline/score.ts` (Trust Engine against the DB: write-back, re-scoring) · `lib/measure/`
  (pure `cover.ts`, `pairing.ts`; `measure.ts` masks, comparisons, baselines; `views.ts` read
  models) · `lib/media/composite.ts` (side-by-side Transform) · `lib/client/` (browser-only helpers).
- Pure, tested modules: `lib/geo.ts`, `lib/phash.ts`, `lib/hashchain.ts`, `lib/claims.ts`,
  `lib/archive/{parse,cluster,build}.ts`, `lib/pipeline/{assign,metadata}.ts`, `lib/capture/token.ts`,
  `lib/trust/*` (browser-safe: a test walks its imports), `lib/measure/{cover,pairing}.ts`. Tests live in `tests/*.test.ts`; fixtures in `tests/fixtures`
  (`tests/fixtures/commons/` are trimmed real API responses). `tests/helpers.ts` builds an
  in-memory PGlite + mock-provider context.
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
- The audit log is append-only: one hash chain per asset plus a system chain (asset_id null).
  Write via `appendAudit()`; never update or re-hash rows. Deleting an asset deletes its chain
  (FK cascade) and nothing else. Check with `verifyChain(assetId)`, `verifySystem()`,
  `verifyAllChains()`. Data migrations that SQL can't express live in `lib/db/data-migrations.ts`.
- EXIF times without an offset are read with `EXIF_DEFAULT_UTC_OFFSET` (default +05:30), never
  the server's local timezone, and set `captured_at_tz_assumed = true`.
- Next 16: `params`/`searchParams` are Promises (`PageProps<"/route">`), `next lint` is gone (use
  `pnpm lint`), and pages that read env or DB call `await connection()`. The React Compiler lint
  forbids synchronous `setState` in effects: fetch in the effect and set state in `.then`.

## Pipeline

- `asset.uploaded` runs `STEP_ORDER` in `lib/pipeline/steps.ts`: parseMetadata → analyze →
  understand → embed → assign → score → measure → finalize. `score` runs the Trust Engine and
  re-scores the photo's near-duplicates; `measure` measures spot photos (cached, capped by
  MEASURE_MAX_PER_PROJECT) and compares Witness check-ins with the spot's baseline.
- Steps return `{ output, patch, apply? }` (`apply` writes side tables inside the step
  transaction) and never write the asset row themselves. The runner skips steps already `done`, and
  writes patch + step record + one audit row in a transaction. Add a step by adding it to
  `STEPS` and `STEP_ORDER`, never by writing to `assets` elsewhere.
- Inline queue (default) runs in-process with concurrency 4; `QUEUE=inngest-dev` uses the local
  Inngest Dev Server via `/api/inngest`. Scripts always run the pipeline in-process.
- Inside a DB transaction use only the `tx` handle. PGlite is single-connection, and a top-level
  query would deadlock.
- Ingest inputs live in `assets.pipeline.ingest`: `commons` (archive), `mediaMetadata`
  (provider EXIF strings), `hint` (project/spot). Archive metadata is always
  `exif_source = commons_api`; Commons thumbnails have no EXIF.
- Uploads: `/api/uploads/ticket` (stored in `upload_tickets`: context + server issue time, the
  capture-time anchor) → provider upload → `/api/uploads/confirm` → `lib/ingest/upload.ts`, which
  trusts only the stored ticket. The Cloudinary webhook uses the same idempotent path.
- Demo projects/spots have stable UUIDv5 ids from config slugs (`lib/demo/common.ts`).
- Mocks key on content only (filename, title, description, non-system tags), never on our
  bookkeeping (`source`, `test_case`, hints). Negated description words ("no visible litter")
  are exclusions.
- Restart `pnpm dev` after changing pipeline or provider code: the inline queue and provider
  singletons live on `globalThis` and survive hot reload, so they keep running the old code.

