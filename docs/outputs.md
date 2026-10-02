# Search, evidence pages, reports and the Phase 7 APIs

## Search (`POST /api/search {q}`)

1. `AIProvider.parseSearch` reads the query into free text plus raw filters (project, band,
   source, activity, from, to) and a list of **rewrites**: Hinglish ("paudhe" → saplings, "nadi ke
   kinare ka kachra" → river bank garbage) and typos ("sapplings" → saplings, within 1–2 edits).
   The mock uses `src/lib/search/normalize.ts`; the real model gets the same rules and the allowed
   values in its prompt (`src/lib/ai/prompts.ts`).
2. `src/lib/search` **validates every filter** against the allowed values. Unknown values (a project
   slug that doesn't exist, a band like "PLATINUM", a date like "2021-13-45", or `to` before
   `from`) are rejected and shown as "Ignored …" chips, never silently used.
3. Ranking: with a real model, cosine distance on the embedding (pgvector). With the mock, Postgres
   full-text search over caption, tags, place and the archive title, where each word may match
   its synonyms ("garbage" finds "litter"). All words must match first; if nothing does, any word.
4. The response carries "Understood as" chips (rewrites, filters, the free text, rejections),
   which the library shows above the results. Rate limit: 30 per minute per IP.

## Evidence page (`/e/[assetId]`, public)

- The signed, face-blurred photo with a **proof strip** built as Cloudinary layers: a QR code
  (PNG uploaded once to `saakshi/qr/<assetId>`) back to this page, plus the place, date and trust
  band as text layers.
- The trust ledger, and facts: capture time with a timezone note, device, distance to the spot
  and to the site, place, metadata source and pHash.
- Capture attestation with the three anchored times: device shutter, server ticket, server
  receipt.
- Near-duplicates (linked), before/after comparisons it belongs to, and **every edit made to this
  photo**. That covers the edits stored on it (planted inputs record theirs) and every derivative
  Saakshi delivers, each step in plain words next to its URL segment (`src/lib/media/describe.ts`),
  with a note that signed URLs make edits unforgeable.
- The audit timeline with "History intact" (the chain is re-walked on every view), credits for
  archive photos, and a "Test input" tag for planted inputs.

## Claims ledger and Impact Report

`src/lib/report/claims.ts` builds claims **only from SQL** for a project and period (default: the
project's dates). Each claim is `{id, label, value, unit, method, asset_ids, confidence?, detail?}`:

| Claim | How |
|---|---|
| `photos_verified` | band VERIFIED, not rejected |
| `photos_flagged` | band FLAGGED, not approved; top reason codes; planted inputs listed as test inputs |
| `spots_monitored` | spots with at least one verified photo |
| `litter_cover_change` / `green_cover_change` | median of measured deltas (percentage points), with the pairs' asset ids; omitted without pairs |
| `items_visible_change` | median AI-counted delta, `ai_estimated` with confidence |
| `checkins_after_cleanup`, `days_since_last_checkin` | only with check-ins in the last 90 days. Otherwise a note: "Archive project: no recent check-ins." (no number) |

Prose goes through `writeWithPlaceholders` (numbers only as `{{claim:id}}`), then `validateProse`,
and is stored with its placeholders; `renderClaims` fills them on display, so every number in the
text links to its claim. The **PDF** (`@react-pdf/renderer`, A4) has six sections:

1. cover;
2. key numbers, each with value, method badge, "from N photos" and a QR to `/r/<id>#claim-<id>`;
3. before/after composites with values and the caveat, or the spot trend when there are no pairs;
4. a gallery of verified, face-blurred photos, each with its band and a QR to its evidence page;
5. flagged and excluded photos, each with its reason;
6. the method note, and credits for every archive photo.

The PDF is uploaded as a raw authenticated file (`saakshi/reports/<id>.pdf`, `reports.pdf_public_id`)
and served only through a signed URL (`/api/reports/<id>/pdf` redirects). `/r/[reportId]` shows each
claim with its evidence thumbnails, the rendered prose, the PDF link and the campaign kit.

**Campaign kit.** Three Instagram 4:5 (1080×1350) templates built only from Transforms, all signed
and face-blurred:

- a stat card from one claim, with its method label;
- a before/after split, with the after photo as an authenticated layer;
- a verified photo with its proof strip.

The caption comes from `writeWithPlaceholders`, and the alt text names each stat's method.
`/api/campaign/<reportId>/<stat|split|proof>` fetches the signed derivative server-side and streams
a PNG.

## APIs for Phase 7

| Route | What |
|---|---|
| `GET /api/live` | SSE of Witness photo arrivals and status/band changes (DB-polled, so it works whichever process runs the pipeline); resumes from `Last-Event-ID`. `?since=<ISO>` is the polling fallback: `{events, cursor}` |
| `GET /api/stats` | photos, verified, flagged, spots, witness photos today (IST), projects, pairs |
| `GET /api/assets/[id]/layers` | signed photo, capture facts and attestation, pHash hex and 64 bits, AI tags (regions: none yet), mask URL, trust result, proof-strip URL and data |
| `GET /api/demo/tamper?assetId=&remove=blur_faces` | signs the preview URL, removes one step but keeps the signature, fetches both: `{originalStatus: 200, tamperedStatus: 401, urls}` |
| `POST /api/demo/try` (P1) | multipart image goes into the "Try to fool it" sandbox; the pipeline runs and the ledger comes back. 5 per 10 minutes per IP; photos deleted after 24 h |
| `GET /api/evidence/[projectId]/zip` (P1) | `manifest.json` (id, etag, pHash, capture times, GPS, trust, credits) plus face-blurred JPEGs; never originals |
