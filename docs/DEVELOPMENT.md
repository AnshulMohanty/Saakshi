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
pnpm db:generate  # generate a migration after editing src/lib/db/schema.ts
pnpm fixtures     # regenerate tests/fixtures (synthetic images)
pnpm archive:discover  # Commons search → data/archive-candidates.json (cached; --offline)
pnpm demo:import  # 3 auto-built projects from the candidates; pipeline runs in-process
pnpm demo:plant   # 4 planted test inputs
pnpm demo:reset   # wipe demo data and rebuild offline from .data/archive-cache (--online)
pnpm tunnel       # cloudflared quick tunnel for phone testing
pnpm measure:pairs [slug]  # re-pair by the rules; every candidate and why it failed
pnpm demo:remeasure        # measure the demo again with the configured providers
pnpm verify:env --prod     # what a deployment is missing
pnpm cld:setup --dry-run   # Cloudinary metadata fields + signed preset (idempotent)
pnpm services:check        # live checks with keys; what's missing without (alias: pnpm run doctor)
pnpm check:bundle          # canary-secret build, browser bundles scanned
pnpm design:capture        # design parity: also parity:capture <route>, parity:report, parity:summary
pnpm design:verify         # inventory statuses from evidence (--collect: fixture texts, needs /dev/parity)
pnpm quality               # quality gates vs a running build → docs/quality-gates.md (--only, --headed for fps)
pnpm video:final           # preview videos: build, record (frame-stepped), cleanup, render, description
```

**After every phase or fix, append to docs/ENGINEERING.md what changed, why, the evidence (test counts,
command output) and any new issue found.** Numbers in ENGINEERING.md, README and docs come only
from real command output. Anything that needs a human (accounts, keys, console settings) goes into
docs/MANUAL_STEPS.md.

Local PGlite supports **one process at a time**: `db:*` and `demo:*` scripts refuse to run while
`pnpm dev` holds `.data/pglite.lock`. While dev is running, use "Run demo import" on /dev/status.
The app also migrates PGlite on first connection.

## Repository layout

```
src/          the application: app/ (Next.js routes), components/, lib/ (domain logic, providers, db), assets/ (PDF fonts)
tests/        Vitest suites (*.test.ts), fixtures, stubs
scripts/      CLI scripts run with tsx (demo, db, ops, design parity, quality, video)
drizzle/      SQL migrations and the drizzle-kit configs
public/       static files (self-hosted fonts, media)
data/         the demo dataset config and Commons candidates
docs/         ENGINEERING.md (journal), DEVELOPMENT.md (this guide), provider, trust, measure and API docs, media/
design/       design inventory, parity record, tokens and tooling notes (exports stay local)
video/        preview video descriptions, captions and the launch-film plan (renders are not committed)
```

The import alias `@/` points at `src/`. Scripts import with relative paths (`../src/lib/…`).

## Folder conventions

- `src/app/(marketing)` landing, how it works, demo · `src/app/(app)` product pages (library, review, …) ·
  `src/app/(designed)` pages ported from the design, each with its own chrome (`/e/[assetId]`,
  `/spots/[slug]`, `/r/[reportId]`, `/capture` full-bleed; `?state=` review states in dev only) · `src/app/(stage)` the Witness Wall · `src/app/(print)` chrome-free print pages (`/spots/[slug]/poster`, one A4 sheet) ·
  `src/app/s/[code]` poster short links (`src/lib/short-link.ts`) → the spot page ·
  `src/app/dev/*` dev tools (404 in production unless `DEV_TOOLS=1`) · `src/app/api/*` routes.
- `src/lib/providers/<name>/`: `index.ts` (interface + factory), `mock.ts`, `real.ts`.
- `src/lib/media/transform.ts`: structured transforms, Cloudinary URL compiler/parser, signing.
- `src/lib/db/`: `schema.ts` (Drizzle), `client.ts` (PGlite | Postgres), `search.ts` (hybrid search).
- `src/lib/archive/`: Commons client (`commons.ts`, network + cache) and pure `parse.ts`,
  `cluster.ts`, `build.ts`. `data/demo-dataset.config.ts` holds the queries and rules.
- `src/lib/pipeline/`: evidence pipeline. `steps.ts` (one function per step), `runner.ts`
  (idempotency, step records, audit), pure `assign.ts` and `metadata.ts`, `inngest.ts`.
- `src/lib/capture/token.ts` (capture tokens, pure `validateCapture`) · `src/lib/ingest/` (upload
  tickets, provider response verification, the shared ingest path) · `src/lib/demo/` (import, plant,
  reset) · `src/lib/library.ts` (library queries) · `src/lib/review.ts` (review queue, decisions) ·
  `src/lib/pipeline/score.ts` (Trust Engine against the DB: write-back, re-scoring) · `src/lib/measure/`
  (pure `cover.ts`, `pairing.ts`; `measure.ts` masks, comparisons, baselines; `views.ts` read
  models) · `src/lib/media/composite.ts` (side-by-side Transform), `proof.ts` (proof strip),
  `describe.ts` (Transforms in words) · `src/lib/search/` (parse → validate → rank, Hinglish/typos,
  synonyms) · `src/lib/evidence.ts` (/e page model, QR once) · `src/lib/report/` (SQL claims, sections,
  react-pdf, generate, campaign, view) · `src/lib/live.ts` (SSE) · `src/lib/demo-apis.ts` (stats, layers,
  tamper, sandbox) · `src/lib/evidence-pack.ts` (zip) · `src/lib/client/` (browser-only helpers: upload, pHash
  preview, offline queue) · `src/lib/app/` (the app shell's data: `view.ts` from the DB, `fixture.ts` for
  parity, pure `chips.ts` and `map.ts`) with `src/components/app/` (shell, screens, drawer) ·
  `src/lib/capture/` (`token.ts`, pure `hud.ts`, `screen-data.ts`) with `src/components/capture/`.
- Real services: `src/lib/providers/http.ts` (the one HTTP layer: timeouts, retries, usage records) ·
  `src/lib/providers/cloudinary/` (`client.ts` REST + signing, `setup.ts` cld:setup plan) ·
  `src/lib/providers/ai/json-schema.ts` (zod → strict JSON Schema) · `src/lib/usage.ts` (`provider_usage`) ·
  `src/lib/pricing.ts` (documented prices) · `src/lib/provenance.ts` + `src/lib/display-policy.ts` (mock
  numbers tagged in dev, hidden in production) · `src/lib/verify-env.ts` · `src/lib/bundle-secrets.ts`.
  Every external call and its doc status: `docs/external-apis.md`; update it with any new call.
- Pure, tested modules: `src/lib/geo.ts`, `src/lib/phash-core.ts` (browser-safe; `src/lib/phash.ts` adds sharp), `src/lib/hashchain.ts`, `src/lib/claims.ts`,
  `src/lib/archive/{parse,cluster,build}.ts`, `src/lib/pipeline/{assign,metadata}.ts`, `src/lib/capture/{token,hud}.ts`,
  `src/lib/trust/*` (browser-safe: a test walks its imports), `src/lib/measure/{cover,pairing,timeline}.ts`,
  `src/lib/charts/{time-axis,trend-svg}.ts`, `src/lib/report/numbers.ts`, `src/lib/short-link.ts`, `src/lib/app/{chips,map}.ts`,
  `src/lib/search/normalize.ts`, `src/lib/media/{describe,proof,composite,derivatives}.ts`, `src/lib/report/sections.ts`,
  `src/lib/dates.ts`, `src/lib/provenance.ts`, `src/lib/pricing.ts`, `src/lib/verify-env.ts`. Tests live in `tests/*.test.ts`; fixtures in `tests/fixtures`
  (`tests/fixtures/commons/` are trimmed real API responses). `tests/helpers.ts` builds an
  in-memory PGlite + mock-provider context.
- `drizzle/` generated SQL migrations (commit them) · `scripts/` CLI scripts (run with tsx; each
  imports `./_env` first so `.env*` files load like `next dev`) · `docs/` · `design/` (exports,
  handoff notes, parity output; design/README.md).
- UI: shadcn/ui (base-nova) with defaults only until Phase 7. Colours, radii and fonts are CSS
  variables in `src/app/globals.css`; never hard-code them.

## Providers: mock first

Every external service (media, analysis, ai, db, queue, geocoder) sits behind an interface with a
mock and a real implementation. `src/lib/config.ts` selects **real only when all of a provider's env
vars are set**; otherwise the mock. The app and tests must always run with no `.env`, no accounts
and no keys. Get providers from the factories (`getMediaProvider()`, `getAIProvider()`, …), never
by constructing a real class directly. Mocks are deterministic (same input → same output). Every
real method is implemented and goes through `src/lib/providers/http.ts` (never bare `fetch`), and
every new or changed outgoing request gets a case in `tests/contracts.test.ts` and a row in
`docs/external-apis.md` (VERIFIED with a doc link, or "UNVERIFIED — confirm in Phase 10" with a
fallback). Every derived value stores `provider_mode`; production never shows mock-derived
numbers (`src/lib/provenance.ts`). `/dev/status` and `pnpm services:check` show what is active.
Details, mock limitations and the `CLD_*` fallback switches: `docs/providers.md`.

## Rules

1. Totals and KPIs are database aggregates, never LLM output.
2. The LLM never writes digits; prose references numbers only as {{claim:id}};
   src/lib/claims.ts validates every generated text.
3. Trust scores come only from src/lib/trust (pure, tested). The LLM may only rephrase reasons.
4. Every AI-produced value carries method "ai_estimated" and a confidence.
5. All Cloudinary URLs are built via src/lib/media/transform.ts. Public images are always signed
   and face-blurred; original URLs are never sent to the client.
6. Pipeline steps are idempotent, keyed by asset id.
7. Pure modules (src/lib/trust, src/lib/measure, src/lib/geo, src/lib/phash, src/lib/hashchain, src/lib/claims)
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
  `verifyAllChains()`. Data migrations that SQL can't express live in `src/lib/db/data-migrations.ts`.
- EXIF times without an offset are read with `EXIF_DEFAULT_UTC_OFFSET` (default +05:30), never
  the server's local timezone, and set `captured_at_tz_assumed = true`.
- Next 16: `params`/`searchParams` are Promises (`PageProps<"/route">`), `next lint` is gone (use
  `pnpm lint`), and pages that read env or DB call `await connection()`. The React Compiler lint
  forbids synchronous `setState` in effects: fetch in the effect and set state in `.then`.

## Pipeline

- `asset.uploaded` runs `STEP_ORDER` in `src/lib/pipeline/steps.ts`: parseMetadata → analyze →
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
  capture-time anchor) → provider upload → `/api/uploads/confirm` → `src/lib/ingest/upload.ts`, which
  trusts only the stored ticket. The Cloudinary webhook uses the same idempotent path.
- Demo projects/spots have stable UUIDv5 ids from config slugs (`src/lib/demo/common.ts`).
- Mocks key on content only (filename, title, description, non-system tags), never on our
  bookkeeping (`source`, `test_case`, hints). Negated description words ("no visible litter")
  are exclusions.
- Restart `pnpm dev` after changing pipeline or provider code: the inline queue and provider
  singletons live on `globalThis` and survive hot reload, so they keep running the old code.

