# Progress

Five-line checkpoints, newest last.

## Section 0: fixes from the Phase 2+3 review
- Audit log: one hash chain per asset plus a system chain. Deleting an asset removes its whole chain; no other chain is touched. The one-time rebuild (a TypeScript data migration, `data_migrations` marker) turned the local DB's 480 global rows into 60 chains, recorded as `audit.chains_rebuilt`.
- Reset keeps witness photos: demo projects and spots have UUIDv5 ids from config slugs; `--include-witness` / `includeWitness` (admin secret) for a full wipe. The capture-time anchor is the server's ticket time; tickets are stored server-side, so the browser can't alter the capture context after the shutter.
- `min_pair_gap_hours` (cleanup/water 0.5, plantation 336, school 168, other 24). The builder ranks clusters by pairability, then count, with a ≥ 8-photo floor and an event/exhibition exclusion. Hero unchanged (Tiruppur, 19 pairs). B → Bijalinagar, Pune (Cooch Behar was one morning, so no 14-day pairs). C stays Mundikunta.
- Wikimedia User-Agent: contact email, else repo URL, never invented. `pnpm demo:stage` creates the live-stage project (0 h gap, 150 m spot at STAGE_LAT/STAGE_LNG, no default location).
- Tests: 197 passing; lint, typecheck and build clean.

## Phase 4: Trust Engine + review queue
- `src/lib/trust` (pure, browser-safe; an import-graph test proves it): `scoreAsset` → score, band, reason ledger (sums to the score; the cap is its own `HARD_FLAG_CAP` reason). Also `parseStamp` (12+ formats, malformed input rejected) and `findMatches` (hamming ≤ 8, ≤ 4 strong, etag exact; BK-tree documented as the scale-up path). Rules and choices: docs/trust.md.
- Pipeline `score` step: duplicates written both ways in the step transaction, Cloudinary metadata plus one band tag (`removeTags` added to `updateMetadata`), status ready/flagged, audit row, then the matched photos are re-scored, so REUSED lands on the later copy whichever arrives first. Re-scoring also runs on project edits (`PATCH /api/projects/[id]`) and settles demo runs.
- `/review` (reason filters, J/K/A/R, required note), `POST /api/review/[assetId]` (score and band never change; sets status, moderation and Cloudinary moderation; audit row with the note), `GET /api/audit/verify`, "History intact" in the drawer and the review page.
- `pnpm demo:reset`: all 55 archive photos VERIFIED, 0 hard flags (top non-positive reasons: PROVENANCE_NONE 15, COPY_LATER_SUBMITTED 1). Planted: reused→REUSED 30, stock→STOCK_SUSPECTED 35, location_mismatch→LOCATION_MISMATCH 25, stamp_mismatch→STAMP_MISMATCH 40. 60 chains intact. Fixed: stale demo projects are retired before import (one had been catching the hero's photos). The reused crop went from 4% to 2% to stay within 8 bits.
- Tests: 276 passing (79 new); lint, typecheck and build clean.

## Phase 5: before/after + monitoring
- Pure `src/lib/measure/pairing.ts` (same spot, ≤ 30 m or ≤ 150 m for approximate archive locations, time order, gap ≥ min_pair_gap_hours, not FLAGGED unless a reviewer approved, not rejected; ranked by stage hints, distance, pHash, embedding; greedy, one pair per photo) and `cover.ts` (mask % > 128, ExG > 0.05 at 256 px). Rules are never relaxed; `pnpm measure:pairs` prints every candidate and why each reject failed.
- `measure.ts`: masks on one shared frame (c_fill,g_auto,800×600; e_extract prompt lists with multiple_true), cached forever in `measurements`; litter cover plus AI item counts (ai_estimated), green cover plus an ExG check (> 15 pts apart → low confidence). New `measure` pipeline step (capped by MEASURE_MAX_PER_PROJECT) compares Witness check-ins with the spot baseline. `POST /api/comparisons` handles auto, manual (rules enforced, 422 with reasons) and remeasure. Composite: one signed Transform with an authenticated, face-blurred after-layer and date labels.
- Pages: `/projects/[id|slug]` compare cards (react-compare-slider, client-only for hydration; tinted mask; method, confidence, caveat, evidence links), public `/spots/[slug]` (map, recharts daily-median trend, baseline, latest, check-in link), `/spots/[slug]/poster` (one A4 page: headless Edge prints exactly 1 page at 595×842 pt).
- Demo data allows 2 pairs and the report says so: Tiruppur 2017-09-05 → 2020-03-30 revisit (the 2017 photos span 6 minutes, 168 gap rejects), Pimpri-Chinchwad planting Nov 2020 → Jan 2022 (green cover 3.6 → 32.5%, low confidence), Hyderabad none (one timestamp). The Pimpri-Chinchwad spot trend has 5 daily points. demo:stage works (0 h gap, 150 m spot).
- Tests: 307 passing (31 new: cover fixtures 0/50/100/noise, ExG, pairing cases, composite snapshot and render, same-frame masks, idempotent measurement, manual rules, check-in, cap, read models); lint, typecheck and build clean.

## Phase 4/5 follow-ups, then Phase 6: search, evidence page, reports, campaign kit, Phase 7 APIs
- Follow-ups from re-reading the spec: pairs held to the spot radius (30 m, or 150 m for approximate-location projects, including the indoor stage); baseline = best "after" photo (fixed a baseline reset on check-in); the spot trend plots every measured photo; the poster QR goes to the spot page, with the clean-up date and one line; review is newest first, with the closest duplicate side by side.
- Search: parse → validate every filter (unknown values become "Ignored" chips) → semantic (real) or full-text (mock) over caption, tags, place and Commons title with synonym groups; Hinglish and typo rewrites become chips ("nadi ke kinare ka kachra" → 24 results). Evidence page `/e/[id]`: proof strip (QR uploaded once + text layers), ledger, facts, three anchored times, duplicates, comparisons, every edit in words plus its URL segment (planted inputs record their edits), audit with "History intact", credits.
- Report: SQL-only claims (archive → "no recent check-ins" note, no number) → placeholder prose → six-section A4 PDF (react-pdf; WinAnsi glyph mapping) uploaded raw+authenticated → `/r/[id]` with evidence per number. Hero PDF: 7 pages, 5 claims (20 verified, 2 flagged test inputs, 1 spot, litter cover +5.9 points, items ≈+19 at 38%). Campaign kit: stat, split and proof templates as 1080×1350 PNG downloads.
- Phase 7 APIs respond on the dev server: `/api/live` (SSE + `?since=`), `/api/stats`, `/api/assets/[id]/layers`, `/api/demo/tamper` (200 → 401), `/api/demo/try` (24 h sandbox), `/api/evidence/[id]/zip` (4.2 MB for the hero).
- Tests: 338 passing (claims fixture incl. the archive no-check-ins case, validateProse on generated text, section builder, proof-strip snapshot, filter validation, FTS fallback, tamper 200→401, SSE event on a scored witness photo); lint, typecheck and build clean.

## Phase 7: finish the build
- Section 2 decisions:
  - `DEMO_HERO`, plus broader cached discovery (1014 → 1254 candidates);
  - event window vs monitoring period (Tiruppur window 29 Aug – 12 Sep 2017; its 2020 photos are check-ins);
  - `captured_at_precision` with interval gaps (`gap_unknown`);
  - `AI_MIN_CONFIDENCE` 0.5;
  - demo-mode reviews as "Demo visitor", reverted by reset, never on witness photos;
  - bundled Noto fonts per script run;
  - the stage venue as the sandbox site;
  - Cloudinary fallbacks.
- `provider_mode` on every derived value. Production hides mock-derived numbers (reports, PDF, claims, Instagram kit, /api/stats, public pages); development tags them.
- Every provider method is real, on one HTTP layer:
  - timeouts;
  - retries honouring Retry-After, none on quota errors;
  - `provider_usage` with tokens, units, cost and asset.
  - 23 contract tests; signing matches the SDK. docs/external-apis.md lists 14 UNVERIFIED items with fallbacks.
- Scripts:
  - `cld:setup --dry-run` (4 fields + 1 preset);
  - `pnpm run doctor` (no keys: the missing list);
  - `verify:env --prod` (10 errors, 2 warnings with no keys);
  - `demo:remeasure` (116 measurements kept, 6 comparisons);
  - `check:bundle` (32 browser files, no canary);
  - `design:capture` (16 exports + fixture), `parity:capture`, `parity:report` (spot page 13.5% / 28%).
- Demo (`pnpm demo:reset`):
  - archive photos: VERIFIED 58; planted inputs: REUSED 30, STOCK_SUSPECTED 35, LOCATION_MISMATCH 25, STAMP_MISMATCH 40; 64 chains intact.
  - Pairs: Tiruppur 1/211, Pimpri-Chinchwad 2/99, Hyderabad 0/23.
- Tests: 403 passing; lint, typecheck and build clean.
