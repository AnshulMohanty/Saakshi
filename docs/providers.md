# Providers

Each provider lives in `lib/providers/<name>/`: `index.ts` (interface + factory), `mock.ts`,
`real.ts`. `lib/config.ts` picks the real implementation only when every variable it needs is
set. `/dev/status` shows the current selection.

| Provider | Real (needs) | Mock |
| --- | --- | --- |
| media | Cloudinary (`CLOUDINARY_CLOUD_NAME`, `_API_KEY`, `_API_SECRET`) | Files in `.data/media`, served by `/api/media/mock` with sharp |
| analysis | Cloudinary Analyze API (same three) | Keyword/synonym matching on the photo's filename, title, description and tags |
| ai | OpenAI (`OPENAI_API_KEY`) | Deterministic captions/counts, rule-based search parsing, hashed embeddings |
| db | Postgres (`DATABASE_URL`) | PGlite + pgvector in `.data/pglite` |
| queue | Inngest cloud (`INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`), or the local Inngest Dev Server with `QUEUE=inngest-dev` | Inline runner, concurrency 4 |
| geocoder | Nominatim, default (no key; `APP_CONTACT_EMAIL` recommended) | Nearest of ~30 Indian cities (`GEOCODER=mock`, and always in tests) |

## Status of real implementations (after Phase 6)

- **Cloudinary media.** Implemented:
  - `url()`: signed URLs use the `authenticated` delivery type, and are verified against the official SDK.
  - `fetchDerived()` and `extractMask()` (prompt lists, `multiple_true`, on a shared `frame` crop).
  - `rawUrl()`: signed `raw/authenticated` delivery for report PDFs.
  - Direct-upload tickets, and upload-response and webhook signature verification (`lib/ingest/verify.ts`, with known-vector tests).

  Still `NotConfiguredError` until Phase 8: server-side `upload`, `uploadRaw` (PDFs), `exists` (QR once per asset), `updateMetadata` (with `removeTags`) and `setModeration`. So `demo:import`, reports and evidence pages in real mode wait for Phase 8. To check with keys: overlays of authenticated images as `l_authenticated:<folder>:<id>`, used by the composite, the split template and the proof strip.
- **Inngest.** Implemented, as `lib/pipeline/inngest.ts` served at `/api/inngest`. It has been verified against the local Dev Server.
- **Nominatim and Postgres.** Implemented.
- **Cloudinary analysis and OpenAI.** Stubs that throw `NotConfiguredError`. The search parser prompt is ready (`lib/ai/prompts.ts`).

## Browser uploads

`/api/uploads/ticket` returns provider-specific, server-signed parameters, including the capture context:
- **Cloudinary:** a direct upload with type `authenticated`, folder `saakshi/evidence`, `media_metadata`, `phash`, `quality_analysis`, `faces` and `notification_url`.
- **Mock:** `/api/uploads/mock`, HMAC-signed, answering with a Cloudinary-shaped response.

The browser then posts the provider's response to `/api/uploads/confirm`, which verifies the signature and ingests it. `/api/webhooks/cloudinary` feeds the same idempotent path; it only receives notifications once deployed.

## What the mocks do (and don't)

**Media.** Real pHash (`lib/phash.ts`), real EXIF (`lib/media/exif.ts`), and Cloudinary-style
`media_metadata` strings. Real dimensions and an MD5 etag. Face count is derived from
people-related words (there's no face detection). Quality score is a heuristic from resolution,
entropy and sharpness. HEIC is rejected with a clear message, because sharp's prebuilt binaries
can't decode HEVC. Delivery applies the same `Transform` objects with sharp:

- `fill`/`fit`/`limit`/`scale`/`pad`/`crop`; `g_auto` and `g_face` use sharp's attention strategy.
- Blur, pixelate, sharpen, grayscale, improve, text layers (SVG), image layers, rotation.
- `f_auto` gives WebP when the browser accepts it.
- `blur_faces` / `pixelate_faces` blur the **whole image** when the asset has faces, and do nothing when it has none (as Cloudinary does).
- `e_extract` uses colour-index masks (`lib/media/mask.ts`): ExG for vegetation, and
  saturated or near-white non-green pixels for litter. This is a proxy that also flags sky, clothing and signs.
- Unknown steps are ignored and logged.

Only **signed** URLs are served, and they're relative (`/api/media/mock/…`), so they work on any
host, including an HTTPS tunnel. Unsigned URLs, and any edit to a signed URL's transformation,
version, public id or signature, return 401.

**Analysis / AI.** Outputs depend only on content-describing text: filename, title and
description context, and non-system tags. Bookkeeping such as `source`, `test_case` and project
hints is ignored, so tests and demos stay stable.
- All AI output passes through `withGuards()`: zod validation, `validateProse` on captions and prose, and an embedding length check.
- Mock embeddings are feature-hashed bags of words, so texts that share words really are closer.
- In mock mode only, `textInImage` comes from a `burned_text` context value (the planted stamp test). The real model reads pixels.

**Geocoder.** Results, including "no place", are cached in `geocache` by coordinates rounded to
3 dp (≈110 m). Provider failures are logged and not cached. Demo resets keep the cache, so they
make no Nominatim calls.
