# Demo data

The demo uses real, openly licensed photos from Wikimedia Commons. There's no API key; requests
follow the [API etiquette](https://www.mediawiki.org/wiki/API:Etiquette).

## Pipeline

1. **Discover** (`pnpm archive:discover`). This runs the queries in `data/demo-dataset.config.ts`.
   - Sources: CirrusSearch terms restricted to geotagged files near India (`nearcoord:1800km,22.5,79`), plus Commons categories.
   - Parsing: each file's `imageinfo`, `extmetadata` and `commonmetadata` go through `src/lib/archive/parse.ts`.
   - Filter: JPEG or PNG, at least 1024 px wide, licensed CC0, public domain, CC BY or CC BY-SA.
   - Output: usable files are written to `data/archive-candidates.json`, one per line. The file is committed, so imports are reproducible.
2. **Build** (pure, `src/lib/archive/build.ts`), per project rule:
   - Keep geotagged files whose title or description matches the rule's relevance pattern.
   - DBSCAN at 1.5 km, then pick the largest cluster. Ties go to more spots, then the tighter cluster.
   - Centre = the cluster centroid.
   - Radius = the distance covering 90% of the cluster, clamped to 300 m–3 km. Only photos inside it are eligible.
   - Spots = DBSCAN at 40 m, keeping the densest 3–5.
   - Selection is round-robin across spots, preferring photos with a date and a camera make, so every photo belongs to a spot.
   - Window = capture dates ± 7 days, and `min_pair_gap_days` = 1.
3. **Import** (`pnpm demo:import`). Downloads the ~1920 px thumbnail rather than the original, uploads it, and inserts an `archive` asset.
   - Metadata comes from the Commons API and is stored with `exif_source = commons_api`. Thumbnails carry no EXIF, and we never pretend they do.
   - Idempotent on `external_id = "commons:<pageid>"`.
   - The pipeline then assigns each photo to its project by GPS and date (`geo_time`).
4. **Plant** (`pnpm demo:plant`). Adds four labelled inputs (`source = planted_test`, `test_case` set) that keep their original attribution:
   - `reused`: a project A photo, re-cropped by 4% and re-encoded without EXIF, uploaded into project C.
   - `stock`: a clean-up photo with a tiled semi-transparent "© STOCKIMAGES" watermark, rendered with our Transform objects, uploaded into A.
   - `location_mismatch`: a geotagged clean-up photo from more than 500 km away (Hyderabad), uploaded into A.
   - `stamp_mismatch`: a project A photo with a burned-in GPS-camera stamp pointing to New Delhi.
     In mock mode only, the stamp text is also stored in context so the mock AI can "read" it. Real mode reads the pixels.
5. **Reset** (`pnpm demo:reset`, or `POST /api/demo/reset`). Wipes demo projects and their assets, spots, comparisons, reports and audit rows, then rebuilds offline from `./.data/archive-cache`.
   - The remaining audit rows are re-chained, and an `audit.demo_reset` row records what was removed.

## Discovered projects (current candidates file)

| Key | Project | Type | Photos | Spots | Window |
| --- | --- | --- | --- | --- | --- |
| A | River clean-up, Tiruppur North (Noyyal River, plastic on the banks) | cleanup | 20 of 21 (1 held back for the stamp test) | 1 | 2017-08-29 → 2017-09-12 |
| B | Sapling planting, Cooch Behar (Panchavati Van) | plantation | 20 of 69 | 1 | 2025-11-23 → 2025-12-07 |
| C | Lake clean-up, Hyderabad (Mundikunta Lake) | water | 15 of 21 | 3 | 2025-10-26 → 2025-11-09 |

Why these are smaller than the 25 / 20 / 15 target:
- Geotagged clean-up photos from India are rare on Commons. The densest relevant cluster had 21 photos.
- The builder warns rather than padding with irrelevant photos.
- Most clusters are one photographer's series at a single spot, so A and B have one spot each.
