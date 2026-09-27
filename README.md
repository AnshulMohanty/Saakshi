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
pnpm demo:import   # ~55 real Wikimedia Commons photos → 3 auto-built projects (a few minutes the first time)
pnpm demo:plant    # 4 labelled test inputs (reused, stock, location mismatch, stamp mismatch)
pnpm dev           # http://localhost:3000
```

- `/library`: every photo on a map or grid, with filters. Click one for provenance, AI output, pipeline steps and audit trail.
- `/capture?project=<slug>`: Witness Capture (live camera and GPS, capture token, attestation).
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
| `pnpm demo:stage` | Create the "Live stage demo" project at `STAGE_LAT`/`STAGE_LNG` (0 h pair gap) |
| `pnpm tunnel` | HTTPS quick tunnel for phone testing (needs `cloudflared`) |

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

## Stack

Next.js 16 (App Router) · TypeScript · Tailwind v4 + shadcn/ui · Drizzle ORM · PGlite + pgvector
locally / Postgres in production · Inngest · Zod · Vitest · sharp · exifr · Leaflet + OpenStreetMap.

## Roadmap

1. Foundation + mock mode ✓
2. Open-data importer (Wikimedia Commons) ✓
3. Witness Capture + ingest pipeline ✓
4. Trust Engine + review ← next
5. Before/after + monitoring
6. Search + outputs (reports, evidence pages)
7. Design system + demo mode
8. Real keys + deploy

Contributor and agent guide: [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md). Providers: [docs/providers.md](docs/providers.md).
