# Progress

Five-line checkpoints, newest last.

## Section 0: fixes from the Phase 2+3 review
- Audit log: one hash chain per asset plus a system chain. Deleting an asset removes its whole chain; no other chain is touched. The one-time rebuild (a TypeScript data migration, `data_migrations` marker) turned the local DB's 480 global rows into 60 chains, recorded as `audit.chains_rebuilt`.
- Reset keeps witness photos: demo projects and spots have UUIDv5 ids from config slugs; `--include-witness` / `includeWitness` (admin secret) for a full wipe. The capture-time anchor is the server's ticket time; tickets are stored server-side, so the browser can't alter the capture context after the shutter.
- `min_pair_gap_hours` (cleanup/water 0.5, plantation 336, school 168, other 24). The builder ranks clusters by pairability, then count, with a ≥ 8-photo floor and an event/exhibition exclusion. Hero unchanged (Tiruppur, 19 pairs). B → Bijalinagar, Pune (Cooch Behar was one morning, so no 14-day pairs). C stays Mundikunta.
- Wikimedia User-Agent: contact email, else repo URL, never invented. `pnpm demo:stage` creates the live-stage project (0 h gap, 150 m spot at STAGE_LAT/STAGE_LNG, no default location).
- Tests: 197 passing; lint, typecheck and build clean.
