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

## Phase 5: before/after + monitoring
- Pure `lib/measure/pairing.ts` (same spot, ≤ 30 m or ≤ 150 m for approximate archive locations, time order, gap ≥ min_pair_gap_hours, not FLAGGED unless a reviewer approved, not rejected; ranked by stage hints, distance, pHash, embedding; greedy, one pair per photo) and `cover.ts` (mask % > 128, ExG > 0.05 at 256 px). Rules are never relaxed; `pnpm measure:pairs` prints every candidate and why each reject failed.
- `measure.ts`: masks on one shared frame (c_fill,g_auto,800×600; e_extract prompt lists with multiple_true), cached forever in `measurements`; litter cover plus AI item counts (ai_estimated), green cover plus an ExG check (> 15 pts apart → low confidence). New `measure` pipeline step (capped by MEASURE_MAX_PER_PROJECT) compares Witness check-ins with the spot baseline. `POST /api/comparisons` handles auto, manual (rules enforced, 422 with reasons) and remeasure. Composite: one signed Transform with an authenticated, face-blurred after-layer and date labels.
- Pages: `/projects/[id|slug]` compare cards (react-compare-slider, client-only for hydration; tinted mask; method, confidence, caveat, evidence links), public `/spots/[slug]` (map, recharts daily-median trend, baseline, latest, check-in link), `/spots/[slug]/poster` (one A4 page: headless Edge prints exactly 1 page at 595×842 pt).
- Demo data allows 2 pairs and the report says so: Tiruppur 2017-09-05 → 2020-03-30 revisit (the 2017 photos span 6 minutes, 168 gap rejects), Pimpri-Chinchwad planting Nov 2020 → Jan 2022 (green cover 3.6 → 32.5%, low confidence), Hyderabad none (one timestamp). The Pimpri-Chinchwad spot trend has 5 daily points. demo:stage works (0 h gap, 150 m spot).
- Tests: 307 passing (31 new: cover fixtures 0/50/100/noise, ExG, pairing cases, composite snapshot and render, same-frame masks, idempotent measurement, manual rules, check-in, cap, read models); lint, typecheck and build clean.
