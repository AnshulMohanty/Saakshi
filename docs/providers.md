# Providers

Each provider lives in `lib/providers/<name>/`: `index.ts` (interface + factory), `mock.ts`,
`real.ts`. `lib/config.ts` picks the real implementation only when every variable it needs is
set. `/dev/status` shows the current selection.

| Provider | Real (needs) | Mock |
| --- | --- | --- |
| media | Cloudinary (`CLOUDINARY_CLOUD_NAME`, `_API_KEY`, `_API_SECRET`) | Files in `.data/media`, served by `/api/media/mock` with sharp |
| analysis | Cloudinary Analyze API (same three) | Keyword/synonym matching on filename, tags, context |
| ai | OpenAI (`OPENAI_API_KEY`) | Deterministic captions/counts, rule-based search parsing, hashed embeddings |
| db | Postgres (`DATABASE_URL`) | PGlite + pgvector in `.data/pglite` |
| queue | Inngest (`INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`) | Inline runner (handlers awaited in-process) |
| geocoder | Nominatim, default (no key; `APP_CONTACT_EMAIL` recommended) | Nearest of ~30 Indian cities (`GEOCODER=mock`, and always in tests) |

## Status of real implementations (Phase 1)

- Cloudinary media: `url()` (signed/unsigned, verified against the official SDK) and
  `extractMask()` are implemented. `upload`, `updateMetadata`, `setModeration` throw
  `NotConfiguredError` until Phase 8.
- Cloudinary analysis, OpenAI and Inngest: stubs that throw `NotConfiguredError`.
- Nominatim and Postgres: implemented.

## What the mocks do (and don't)

**Media.** Real pHash (`lib/phash.ts`), real EXIF (`lib/media/exif.ts`), real dimensions, MD5
etag. Face count is derived from people-related words in the filename, tags or context (no face
detection). Quality score is a heuristic from resolution, entropy and sharpness.
Delivery applies the same `Transform` objects with sharp:

- `fill`/`fit`/`limit`/`scale`/`pad`/`crop`; `g_auto` and `g_face` use sharp's attention strategy.
- Blur, pixelate, sharpen, grayscale, improve, text layers (SVG), image layers, rotation.
- `f_auto` gives WebP when the browser accepts it.
- `blur_faces` / `pixelate_faces` apply to the **whole image**, because there's no face detection.
- `e_extract` uses colour-index masks (`lib/media/mask.ts`): ExG for vegetation, and
  saturated or near-white non-green pixels for litter. This is a proxy that also flags sky, clothing and signs.
- Unknown steps are ignored and logged.

Only **signed** URLs are served. Unsigned URLs, and any edit to a signed URL's transformation,
version, public id or signature, return 401. This is stricter than a default Cloudinary account;
in production, enable Strict Transformations to match.

**Analysis / AI.** Outputs depend only on the asset's filename, tags and context (or the query
text), so tests and demos are stable. All AI output passes through `withGuards()`: zod validation,
`validateProse` on captions and prose, and an embedding length check. Mock embeddings are
feature-hashed bags of words, so texts that share words really are closer.

**Geocoder.** Results, including "no place", are cached in `geocache` by coordinates rounded to
3 dp (≈110 m). Provider failures are logged and not cached.
