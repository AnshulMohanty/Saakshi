# Progress

Five-line checkpoints, newest last.

## Section 0: fixes from the Phase 2+3 review
- Audit log: one hash chain per asset plus a system chain. Deleting an asset removes its whole chain; no other chain is touched. The one-time rebuild (a TypeScript data migration, `data_migrations` marker) turned the local DB's 480 global rows into 60 chains, recorded as `audit.chains_rebuilt`.
- Reset keeps witness photos: demo projects and spots have UUIDv5 ids from config slugs; `--include-witness` / `includeWitness` (admin secret) for a full wipe. The capture-time anchor is the server's ticket time; tickets are stored server-side, so the browser can't alter the capture context after the shutter.
- `min_pair_gap_hours` (cleanup/water 0.5, plantation 336, school 168, other 24). The builder ranks clusters by pairability, then count, with a ≥ 8-photo floor and an event/exhibition exclusion. Hero unchanged (Tiruppur, 19 pairs). B → Bijalinagar, Pune (Cooch Behar was one morning, so no 14-day pairs). C stays Mundikunta.
- Wikimedia User-Agent: contact email, else repo URL, never invented. `pnpm demo:stage` creates the live-stage project (0 h gap, 150 m spot at STAGE_LAT/STAGE_LNG, no default location).
- Tests: 197 passing; lint, typecheck and build clean.

## Phase 4: Trust Engine + review queue
- `lib/trust` (pure, browser-safe; an import-graph test proves it): `scoreAsset` → score, band, reason ledger (sums to the score; the cap is its own `HARD_FLAG_CAP` reason). Also `parseStamp` (12+ formats, malformed input rejected) and `findMatches` (hamming ≤ 8, ≤ 4 strong, etag exact; BK-tree documented as the scale-up path). Rules and choices: docs/trust.md.
- Pipeline `score` step: duplicates written both ways in the step transaction, Cloudinary metadata plus one band tag (`removeTags` added to `updateMetadata`), status ready/flagged, audit row, then the matched photos are re-scored, so REUSED lands on the later copy whichever arrives first. Re-scoring also runs on project edits (`PATCH /api/projects/[id]`) and settles demo runs.
- `/review` (reason filters, J/K/A/R, required note), `POST /api/review/[assetId]` (score and band never change; sets status, moderation and Cloudinary moderation; audit row with the note), `GET /api/audit/verify`, "History intact" in the drawer and the review page.
- `pnpm demo:reset`: all 55 archive photos VERIFIED, 0 hard flags (top non-positive reasons: PROVENANCE_NONE 15, COPY_LATER_SUBMITTED 1). Planted: reused→REUSED 30, stock→STOCK_SUSPECTED 35, location_mismatch→LOCATION_MISMATCH 25, stamp_mismatch→STAMP_MISMATCH 40. 60 chains intact. Fixed: stale demo projects are retired before import (one had been catching the hero's photos). The reused crop went from 4% to 2% to stay within 8 bits.
- Tests: 276 passing (79 new); lint, typecheck and build clean.
