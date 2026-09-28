# Saakshi · साक्षी

**Field photos in, verified proof of impact out.** Saakshi ("witness") ingests photos from NGOs
and community groups, checks them with a rule-based Trust Engine, measures before/after change,
and produces reports where every number links back to the photo it came from.

Code Cubicle 6.0 · PS02 · Cloudinary track.

## Quick start

No accounts or keys needed. Every external service has a local mock.

```bash
pnpm i
pnpm db:migrate    # creates ./.data/pglite (Postgres in WASM, with pgvector)
pnpm demo:import   # 58 real Wikimedia Commons photos → 3 auto-built projects (a few minutes the first time)
pnpm demo:plant    # 4 labelled test inputs (reused, stock, location mismatch, stamp mismatch)
pnpm dev           # http://localhost:3000
```

- `/library`: every photo on a map or grid, with filters. Click one for provenance, AI output, pipeline steps and audit trail.
- `/review`: photos the Trust Engine did not verify, with its reasons. Approve or reject with a note (keys J/K/A/R).
- `/projects/<slug>`: before/after cards (slider, the measured mask, values, method, confidence).
- `/spots/<slug>`: a spot's public page with its trend and a check-in link. `/spots/<slug>/poster` is a printable A4 QR poster.
- `/capture?project=<slug>`: Witness Capture (live camera and GPS, capture token, attestation).
- `/e/<assetId>`: a photo's public evidence page (proof strip, ledger, every edit, audit chain). `/r/<reportId>`: a public Impact Report, where every number links to its photos, with the PDF and an Instagram campaign kit (generate one from a project page).
- Search in `/library`: natural language, Hinglish and typos (“verified paudhe in 2021”), with “Understood as” chips.
- `/dev/status`: which providers are mocked or real, and a **Run demo import** button that works while `pnpm dev` is running.

PGlite allows one process at a time, so run the `demo:*` scripts with `pnpm dev` stopped, or use the button.

## Commands

| Command | What it does |
| --- | --- |
| `pnpm dev` | Dev server |
| `pnpm test` | Unit and integration tests (offline) |
| `pnpm lint` / `pnpm typecheck` / `pnpm build` | ESLint / TypeScript / production build |
| `pnpm db:migrate` / `pnpm db:studio` / `pnpm db:generate` | Migrations / Drizzle Studio / new migration |
| `pnpm archive:discover` | Search Wikimedia Commons and print candidate stats and clusters → `data/archive-candidates.json` |
| `pnpm demo:import` | Build the 3 demo projects and import their photos (idempotent) |
| `pnpm demo:plant` | Add the 4 planted test inputs |
| `pnpm demo:reset` | Rebuild archive + planted photos **offline** from the cache; witness photos are kept (`--online`, `--include-witness` for a full wipe) |
| `pnpm measure:pairs [slug]` | Re-pair projects by the rules, measure, and print every candidate with why rejects failed |
| `pnpm demo:stage` | Create the "Live stage demo" project at `STAGE_LAT`/`STAGE_LNG` (0 h pair gap) |
| `pnpm tunnel` | HTTPS quick tunnel for phone testing (needs `cloudflared`) |
| `pnpm demo:remeasure` | Measure the demo again with the configured providers (`--all`, `--reanalyze`) |
| `pnpm verify:env [--prod]` | What a deployment is missing (production needs every real service) |
| `pnpm cld:setup [--dry-run]` | Create the Cloudinary metadata fields and the signed upload preset (idempotent) |
| `pnpm services:check` | Live check of every real call with keys; what's missing without (alias `pnpm run doctor`) |
| `pnpm check:bundle` | Build with canary secrets and scan the browser bundles for them |
| `pnpm design:capture` / `pnpm parity:capture <route>` / `pnpm parity:report` | Design parity screenshots and the side-by-side report (design/README.md) |

## Demo data

`data/demo-dataset.config.ts` defines the Commons searches and the rules. `pnpm archive:discover`
found these projects (details in [docs/demo-data.md](docs/demo-data.md)):

| Project | Type | Photos | Spots |
| --- | --- | --- | --- |
| River clean-up, Tiruppur North | cleanup | 20 | 1 |
| Sapling planting, Cooch Behar | plantation | 20 | 1 |
| Lake clean-up, Hyderabad | water | 15 | 3 |

All photos keep their Commons author, license and source link, shown in the library drawer.
Downloads and API responses are cached in `./.data/archive-cache`, so resets work offline. Set
`APP_CONTACT_EMAIL` before discovering: Wikimedia asks for contact details in the User-Agent and
throttles anonymous clients harder.

## Phone testing (camera and GPS need HTTPS)

1. Install `cloudflared`. It needs no account: `winget install --id Cloudflare.cloudflared`
   (Windows) or `brew install cloudflared` (macOS).
2. Run `pnpm dev` in one terminal and `pnpm tunnel` in another. The tunnel is equivalent to
   `cloudflared tunnel --url http://localhost:3000`.
3. Open the printed `https://….trycloudflare.com/capture?project=<slug>` on your phone and allow camera and location.

Media URLs are relative and `*.trycloudflare.com` is in `allowedDevOrigins`, so everything works
through the tunnel. Photos taken there land in `/library` as `witness` assets. They're attested
when the capture token is valid, the clock is within 2 minutes, and the GPS fix is within 100 m.

## Configuration

Copy `.env.example` to `.env.local` and fill in only what you want to make real: Cloudinary
(media and analysis), OpenAI (AI), `DATABASE_URL` (Postgres/Supabase), or Inngest (queue). A
provider becomes real only when all of its variables are set.

To try real Inngest functions locally, with no account:

```bash
npx inngest-cli@latest dev -u http://localhost:3000/api/inngest
QUEUE=inngest-dev pnpm dev
```

## Trust Engine

Rule-based and deterministic (`lib/trust`, pure and browser-safe). Every point is a reason with a
fixed sentence. Hard flags (reused, stock, location mismatch, stamp mismatch) cap the score at 40.
Bands: VERIFIED ≥ 75 with no flags, NEEDS_REVIEW 45–74 or any review flag, FLAGGED otherwise.
Rules, choices and demo results: [docs/trust.md](docs/trust.md). After `pnpm demo:reset`, all 58
archive photos are VERIFIED with no hard flag, and each planted input is FLAGGED for its own reason.

```
$ pnpm test
 Test Files  34 passed (34)
      Tests  403 passed (403)
```

## Before/after

Pairs follow fixed rules: same spot, ≤ 30 m apart (≤ 150 m for approximate archive locations),
in time order, a gap of at least the project's `min_pair_gap_hours`, and neither photo flagged.
They are never loosened to produce a pair. Both photos are masked on the same 800×600 frame, and
measurements are cached forever. Details and demo results: [docs/measure.md](docs/measure.md).

## Outputs

Search, evidence pages, the claims ledger, the Impact Report PDF, the campaign kit and the APIs
for Phase 7 (`/api/live` SSE, `/api/stats`, `/api/assets/[id]/layers`, `/api/demo/tamper`,
`/api/demo/try`, the evidence-pack zip) are described in [docs/outputs.md](docs/outputs.md).

## Stack

Next.js 16 (App Router) · TypeScript · Tailwind v4 + shadcn/ui · Drizzle ORM · PGlite + pgvector
locally / Postgres in production · Inngest · Zod · Vitest · sharp · exifr · Leaflet + OpenStreetMap.

## Roadmap

1. Foundation + mock mode ✓
2. Open-data importer (Wikimedia Commons) ✓
3. Witness Capture + ingest pipeline ✓
4. Trust Engine + review ✓
5. Before/after + monitoring ✓
6. Search + outputs (reports, evidence pages) ✓
7. Finish the build: real-service code checked against the docs, provenance guard, ops scripts, parity tooling ✓
8. Build the design exports 1:1 ← next
9. Accounts, keys, deploy ([docs/MANUAL_STEPS.md](docs/MANUAL_STEPS.md))
10. Fix whatever breaks on real services (`pnpm services:check`)

Engineering journal (decisions, issue log, evidence): [ENGINEERING.md](ENGINEERING.md). Every
external call and its status: [docs/external-apis.md](docs/external-apis.md). Contributor and
agent guide: [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md). Providers: [docs/providers.md](docs/providers.md).
