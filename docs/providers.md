# Providers

Each provider lives in `src/lib/providers/<name>/`: `index.ts` (interface + factory), `mock.ts`,
`real.ts`. `src/lib/config.ts` picks the real implementation only when every variable it needs is
set. `/dev/status` shows the current selection.

| Provider | Real (needs) | Mock |
| --- | --- | --- |
| media | Cloudinary (`CLOUDINARY_CLOUD_NAME`, `_API_KEY`, `_API_SECRET`) | Files in `.data/media`, served by `/api/media/mock` with sharp |
| analysis | Cloudinary Analyze API (same three); tags and moderation fall back to OpenAI vision when OpenAI is real too (`CLD_AI_VISION`) | Keyword/synonym matching on the photo's filename, title, description and tags |
| ai | OpenAI (`OPENAI_API_KEY`) | Deterministic captions/counts, rule-based search parsing, hashed embeddings |
| db | Postgres (`DATABASE_URL`) | PGlite + pgvector in `.data/pglite` |
| queue | Inngest cloud (`INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`), or the local Inngest Dev Server with `QUEUE=inngest-dev` | Inline runner, concurrency 4 |
| geocoder | Nominatim, default (no key; `APP_CONTACT_EMAIL` recommended) | Nearest of ~30 Indian cities (`GEOCODER=mock`, and always in tests) |

## Status of real implementations (after Phase 7)

Every provider method has a real implementation. No `NotConfiguredError` remains. Request and
response shapes, and what is still UNVERIFIED, are in [external-apis.md](external-apis.md). The
contract tests (`tests/contracts.test.ts`) build each outgoing request offline.

- **One HTTP layer** (`src/lib/providers/http.ts`), used by every real provider:
  - timeout per call;
  - up to 3 retries on network errors, 408, 409, 423 and 5xx, with exponential backoff and jitter;
  - `Retry-After` is honoured;
  - no retry on errors that need a human (OpenAI `insufficient_quota` and other billing errors, Cloudinary's AI Vision token quota `MA_00008`).
  - Every call is logged to `provider_usage`: provider, operation, model, tokens or units, latency, cost where documented (`src/lib/pricing.ts`), attempts, and the asset it served. The pipeline runner and the report/search routes flush it.
- **Cloudinary media** (`src/lib/providers/media/real.ts` on `src/lib/providers/cloudinary/client.ts`):
  - signed server upload: full-path `public_id` + `asset_folder`; evidence is `authenticated` with `moderation=manual`; QR codes and logos are `upload`;
  - `exists` via the Admin API;
  - metadata write-back: structured fields + context + tags;
  - `setModeration`;
  - raw PDFs;
  - masks, derived fetches (423 retried) and before/after composites.
- **Cloudinary analysis** (`src/lib/providers/analysis/real.ts`): Analyze API `ai_vision_tagging` (≤ 10 definitions per call, tag names sent hyphenated), `ai_vision_moderation` and `watermark_detection`, on a signed, size-limited derivative. Tagging and moderation can fall back to OpenAI vision (below).
- **OpenAI** (`src/lib/providers/ai/real.ts`):
  - Responses API with a base64 `input_image` (`detail: high`, faces blurred first);
  - strict `json_schema` built from the zod schemas (`src/lib/providers/ai/json-schema.ts`);
  - prose re-asked with the issues when a draft breaks the placeholder rule;
  - search parsing with the live vocabulary;
  - embeddings with `dimensions: 1536`.
- **Inngest:** cloud mode with `checkpointing.maxRuntime = 240s` (Vercel's 300 s limit); `/api/inngest` exports `maxDuration = 300`.
- **Postgres:** `prepare: false`, `max 5`, short idle and connect timeouts (Supabase transaction pooler).

### Switches for what the docs leave unclear

| Variable | Default | Alternative | When |
| --- | --- | --- | --- |
| `CLD_DELIVERY_TYPE` | `authenticated` | `private` | services:check: on-the-fly signed transformations of authenticated assets fail |
| `CLD_EAGER` | `0` | `1` | pre-generate THUMB, PREVIEW, VIEW at upload |
| `CLD_EXTRACT_MODE` | `multi` (`e_extract:prompt_(a;b)`) | `union` | one mask per prompt, joined with sharp |
| `CLD_COMPOSITE_MODE` | `layer` (`l_authenticated`) | `server` | halves joined with sharp and stored as their own asset, labels as eager |
| `CLD_PDF_DELIVERY` | `signed` | `download` | Download API URL (1 h) if raw authenticated delivery fails |
| `CLD_AI_VISION` | `auto` | `on` / `off` | who answers tags and moderation; see below |
| `OPENAI_IMAGE_DETAIL` | `high` | `low` | cheaper vision calls |
| `OPENAI_REASONING_EFFORT` | `low` | `none`/`medium`/`high`/`omit` | `omit` for models without reasoning |

### AI Vision fallback (`CLD_AI_VISION`)

Cloudinary's AI Vision add-on (tagging and moderation) has a free quota counted in **tokens**, not
photos. At the 1600 px analysis copy it lasts for roughly 30 to 40 photos a month. When it is used
up, the Analyze API answers HTTP 429 with code `MA_00008` and no photo can be scored. Watermark
detection is a different add-on (AI Content Analysis) with its own quota, so it always stays on
Cloudinary.

| Value | Tags and moderation |
| --- | --- |
| `auto` (default) | Cloudinary AI Vision. On the first 429 `MA_00008`, OpenAI vision for the rest of the process, logged once. Any other error behaves as before (the step fails and is retried). |
| `on` | Cloudinary AI Vision only. No fallback. |
| `off` | OpenAI vision only. |

How it works (`src/lib/providers/analysis/fallback.ts`):

- The fallback exists only when Cloudinary and OpenAI are both real. Mock mode is unchanged.
- It makes **one** OpenAI call per photo (`OpenAIProvider.visionLabels`, operation `vision_fallback`):
  - Structured Outputs return the TAXONOMY names that apply and true/false for every moderation question;
  - `tag()` and `moderate()` run in parallel in the analyze step, and they share that call;
  - unknown tag names are dropped; a missing answer is an error.
- Settings:
  - model `OPENAI_MODEL_FAST`, `detail: "low"` (a fixed small image cost), the configured reasoning effort and `store: false`;
  - a three-line prompt and a small strict schema.
- Cost estimate: about **$0.0005 per photo** extra, from the documented prices in `src/lib/pricing.ts`.
  `pnpm services:check --full` makes one fallback call and prints its real tokens and cost. Every
  call is metered in `provider_usage`.
- The image is the same signed analysis copy (`ANALYZE_SOURCE`, long side ≤ 1600 px) that
  Cloudinary AI Vision reads, sent as a data URL. It is **not** face-blurred, because "are
  children's faces clearly visible?" can't be answered on a blurred copy. `describePhoto` still
  gets the blurred `UNDERSTAND_TRANSFORM` copy.
- Provenance: `provenance.analysis.provider` is `openai-vision-fallback` for a photo the fallback
  answered (`cloudinary-analyze` otherwise). The evidence page says which service answered;
  How it works and the landing show the configured path.
- OpenAI billing errors (`insufficient_quota` and similar) are never retried. Other errors keep
  the usual retry rules.
- `pnpm services:check` probes AI Vision on Cloudinary directly, never through the fallback, and
  prints the active path. Only `--full` makes the one fallback call.

### Checking with real keys

- `pnpm services:check` (alias `pnpm run doctor`) runs a live check of each call.
- `pnpm cld:setup` creates the metadata fields and the signed preset.
- `pnpm verify:env --prod` lists what a deployment is missing.
- `pnpm demo:remeasure` measures the demo again with the configured providers.

## Browser uploads

`/api/uploads/ticket` returns provider-specific, server-signed parameters, including the capture context:
- **Cloudinary:** a direct upload with type `authenticated` (or `CLD_DELIVERY_TYPE`), public id `saakshi/evidence/<id>`, `asset_folder`, `moderation=manual`, `media_metadata`, `phash`, `quality_analysis`, `faces` and `notification_url`.
- **Mock:** `/api/uploads/mock`, HMAC-signed, answering with a Cloudinary-shaped response.

The browser then posts the provider's response to `/api/uploads/confirm`, which verifies the signature and ingests it. `/api/webhooks/cloudinary` feeds the same idempotent path; it only receives notifications once deployed.

## What the mocks do (and don't)

**Media.** Real pHash (`src/lib/phash.ts`), real EXIF (`src/lib/media/exif.ts`), and Cloudinary-style
`media_metadata` strings. Real dimensions and an MD5 etag. Face count is derived from
people-related words (there's no face detection). Quality score is a heuristic from resolution,
entropy and sharpness. HEIC is rejected with a clear message, because sharp's prebuilt binaries
can't decode HEVC. Delivery applies the same `Transform` objects with sharp:

- `fill`/`fit`/`limit`/`scale`/`pad`/`crop`; `g_auto` and `g_face` use sharp's attention strategy.
- Blur, pixelate, sharpen, grayscale, improve, text layers (SVG), image layers, rotation.
- `f_auto` gives WebP when the browser accepts it.
- `blur_faces` / `pixelate_faces` blur the **whole image** when the asset has faces, and do nothing when it has none (as Cloudinary does).
- `e_extract` uses colour-index masks (`src/lib/media/mask.ts`): ExG for vegetation, and
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
