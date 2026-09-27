# Trust Engine

`lib/trust` turns what we know about a photo into a **score (0–100)**, a **band** and a **ledger
of reasons**. It is pure TypeScript: no I/O, no AI, no server imports (a test walks its import
graph). The same code runs in the pipeline, in re-scoring and in the browser.

```
scoreAsset(signals, project, spot | null, duplicates, config = defaultTrustConfig)
  → { score, band, reasons[], hardFlags[], reviewFlags[] }
```

Every point added or removed is a reason `{code, signal, kind, points, detail}`, and so is every
flag. The ledger always adds up to the score. `describeReason()` turns a reason into a fixed
English sentence; no LLM writes any of it. All numbers live in `lib/trust/config.ts`.

## Rules

| Signal | Rule | Points | Code |
|---|---|---|---|
| Location (max 30) | Attested Witness Capture fix inside the site | +30 | `LOCATION_WITNESS` |
| | Witness fix inside, capture not attested | +20 | `LOCATION_WITNESS_UNATTESTED` |
| | Photo EXIF GPS inside | +25 | `LOCATION_EXIF` |
| | Archive (Commons API) GPS inside | +20 | `LOCATION_ARCHIVE` |
| | No location | 0 | `LOCATION_NONE` |
| | Outside the site (and outside its spot) | **hard** | `LOCATION_MISMATCH` |
| | EXIF and witness fix more than 1 km apart | review | `LOCATION_CONFLICT` |
| | Gallery uploader's browser location | info only | `UPLOADER_LOCATION` |
| Time (max 20) | Capture time inside the project dates (±14 h, any timezone) | +20 | `TIME_IN_WINDOW` |
| | Attested check-in at a spot after the dates | +20 | `TIME_CHECKIN` |
| | No capture time (upload time used) | +5 | `TIME_UPLOAD_ONLY` |
| | Outside the dates | −20 | `TIME_OUTSIDE` |
| Uniqueness (max 20) | No earlier copy anywhere | +20 | `UNIQUE` |
| | Same project, within 10 min: a burst | +10 | `BURST` |
| | Same spot, gap ≥ `min_pair_gap_hours`: a revisit | +20 | `REVISIT` |
| | Same project, otherwise similar | +10 | `SIMILAR_IN_PROJECT` |
| | Identical file (etag) already in this project | review | `POSSIBLE_DUPLICATE` |
| | Match of an **earlier** photo in another project | **hard** | `REUSED` |
| | A **later** copy exists in another project | info | `COPY_LATER_SUBMITTED` |
| Authenticity (max 15) | Moderation clear | +15 | `AUTH_CLEAR` |
| | Photo of a screen or a print | −10, review | `SCREEN_OR_PRINT` |
| | Looks composited or generated (never a hard flag) | −10, review | `COMPOSITED` |
| | Watermark or stock branding | **hard** | `STOCK_SUSPECTED` |
| Stamp | Burned-in GPS more than 1 km off, or date more than 1 day off | **hard** | `STAMP_MISMATCH` |
| Quality (max 10) | Quality ≥ 0.6 | +10 | `QUALITY_OK` |
| Provenance (max 5) | Camera make and model recorded | +5 | `PROVENANCE_CAMERA` |
| Privacy | Children visible (public outputs are face-blurred anyway) | info | `PRIVACY_CHILDREN` |

**Cap and bands.** Any hard flag caps the score at 40, recorded as a `HARD_FLAG_CAP` reason with
negative points so the ledger still adds up. **VERIFIED** is ≥ 75 with no flags.
**NEEDS_REVIEW** is 45–74, or any review flag. **FLAGGED** is below 45, or any hard flag.
Tests pin the boundaries at 44/45 and 74/75.

## Duplicates

Every upload gets a 64-bit DCT pHash (`lib/phash.ts`). Hamming distance ≤ 8 is a match, ≤ 4 is
strong, and an identical etag is exact. `findMatches` scans every other photo. That's fine at
demo scale (thousands); the scale-up path is a BK-tree over the hashes, which answers "all
within 8 bits" in roughly log time. Photos are ordered by capture time, then upload time, then
id, so `REUSED` always lands on the **later** photo; the original just gets an info note. Rows
are written to `duplicates` both ways (`match_is_later` records the direction). A match with a
photo that belongs to no project is ignored until that photo is assigned.

## Burned-in stamps

`parseStamp` reads GPS-camera overlays from the OCR'd text (`ai.textInImage`). It handles
Lat/Long labels, DMS with straight or typographic primes, decimal degrees with hemispheres, bare
pairs, ISO, `dd/mm/yyyy` (month-first only when unambiguous), month names, 12/24 h clocks and
`GMT+05:30` offsets. Malformed values (latitude 123, 31 February, 1985, null island) are rejected,
never guessed. Without an offset, the date check accepts any timezone. Without a capture
location, the stamp is checked against the site centre. The tests cover 12+ formats.

## Where it runs

- **Pipeline step `score`** (`lib/pipeline/score.ts`): gathers signals, finds duplicates, scores,
  and writes the result back:
  - the asset row: `trust_score`, `trust_band`, `trust_reasons`, `scored_at`, and `status`
    (`ready` for VERIFIED, `flagged` otherwise);
  - duplicates both ways, inside the step transaction;
  - Cloudinary: `trust_score` and `trust_band` metadata plus exactly one `trust_*` tag;
  - one audit row.

  It then re-scores the matched photos, because a newly arrived original turns an already-scored
  later copy into `REUSED`, whichever order they arrive in.
- **Re-scoring** (`rescoreAsset`, `rescoreProject`, `rescoreAll`) runs when a project's centre,
  radius, dates or pair gap change (`PATCH /api/projects/[id]`, or a demo site that moved), and
  once at the end of a demo run to settle photos that were scored concurrently. It writes an
  audit row and metadata only when the result actually changed.
- **Review** (`/review`, `POST /api/review/[assetId]`): a person approves or rejects, and a note
  is required. **The score and band never change.** The decision sets status, moderation and
  Cloudinary's moderation status, and adds an audit row with the note. Re-scoring keeps it.
- **History** (`GET /api/audit/verify?assetId=`): re-walks the photo's hash chain and returns
  `{intact, entries, firstBrokenAt}`. The drawer and the review page show "History intact".

## Choices beyond the spec

1. **Unattested witness inside the site: +20.** It's still the device's own fix, but the token
   checks failed, so it scores between EXIF (+25) and archive (+20), not the attested +30.
2. **`SIMILAR_IN_PROJECT` +10.** A same-project match that is neither a burst (≤ 10 min) nor a
   revisit (same spot, gap ≥ `min_pair_gap_hours`), for example the same spot re-shot before the
   pair gap has passed. It's not suspicious, but it's not new evidence either.
3. **`POSSIBLE_DUPLICATE` (review) for an identical file already in the same project.** It's not
   reuse across projects, but a person should see it.
4. **`TIME_CHECKIN` +20.** An attested Witness check-in at a spot after the project ended is
   monitoring, which is the point of spots, not an old photo.
5. **Burst beats revisit** when a photo has both kinds of match (the conservative reading).
6. **±14 h slack on project dates.** Dates have no timezone, so any timezone is allowed at
   either end.
7. **The stamp check falls back to the site centre** when a photo has no capture location.
8. **The planted "reused" crop is 2% per side** (it was 4%). On smooth scenes a 4% crop drifted up
   to 14 bits, past the match threshold of 8; 2% stays within 8 while still being a different,
   re-encoded file.

## Demo results (`pnpm demo:reset`, mock AI, real Commons photos)

```
Trust (archive photos): VERIFIED 55, NEEDS_REVIEW 0, FLAGGED 0
  Top reasons: PROVENANCE_NONE 15, COPY_LATER_SUBMITTED 1
  Archive photos with a hard flag: none
  Planted location_mismatch  FLAGGED  score 25  LOCATION_MISMATCH   (716 km from the Tiruppur site)
  Planted reused             FLAGGED  score 30  REUSED              (94% match of a Tiruppur photo)
  Planted stamp_mismatch     FLAGGED  score 40  STAMP_MISMATCH      (stamp says Delhi, 1947 km away)
  Planted stock              FLAGGED  score 35  STOCK_SUSPECTED
Audit: all chains intact
```

With real Cloudinary moderation and a real vision model, the authenticity and stamp signals come
from real answers instead of the deterministic mocks, so the archive histogram will likely
spread out. The engine and its thresholds stay the same.
