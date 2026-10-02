# External APIs

Every external endpoint, parameter and transformation Saakshi uses, checked against the official
documentation on **2026-09-28**. The code follows these shapes exactly, and `tests/contracts.test.ts`
builds each outgoing request offline and asserts it.

- **VERIFIED**: the official docs state it (page linked).
- **UNVERIFIED — confirm in Phase 10**: the docs are silent, ambiguous or contradictory. Each item
  names the fallback the code already has and the `pnpm services:check` check that settles it with real
  keys.

Cloudinary pages are under `https://cloudinary.com/documentation/<page>`. OpenAI pages are under
`https://developers.openai.com/api/docs/…`: `platform.openai.com/docs/*` now answers 301 and
redirects there.

## Summary of UNVERIFIED items

| # | Item | Fallback in code | Settled by |
|---|------|------------------|-----------|
| C1 | Signed **on-the-fly** transformations of `authenticated` assets. `control_access_to_media` says they can't be made ("only … eager transformations"), while `delivery_url_signatures` shows exactly such a URL. | `CLD_DELIVERY_TYPE=private` (private + Strict Transformations: signed URLs only). `CLD_EAGER=1` pre-generates THUMB, PREVIEW and VIEW. | services:check: "On-the-fly signed transformation of an evidence asset" |
| C2 | `type=authenticated` sent as an Upload API **body** parameter. The reference says `type` is "part of the endpoint URL when using the REST API", yet the documented endpoint is `POST /:resource_type/upload`. The SDKs send it in the body. | none needed if the upload returns `type: authenticated`; otherwise upload through the SDK. | services:check: "Stored as delivery type authenticated" and "Unsigned evidence URL is refused" |
| C3 | In `e_extract` **mask mode, white = selected**. The docs only say "grayscale mask of the extracted area(s)". | `src/lib/measure/cover.ts` thresholds at `MASK_THRESHOLD`; if masks come back inverted, add `invert_true` to `maskTransform`. | Phase 10: view one real mask |
| C4 | Delivery URL for **raw authenticated** files (`/raw/authenticated/s--sig--/v1/<id>.pdf`). It follows the generic `<asset_type>/<delivery_type>` form, but the docs show no raw example. | `CLD_PDF_DELIVERY=download` (Download API URL). | services:check: "Raw PDF upload + signed delivery" |
| C5 | Exactly which parameters the **Download API** signs (only the SDK method is documented). | We sign every query parameter except `api_key`/`signature`, as for uploads. | services:check with `CLD_PDF_DELIVERY=download` |
| C6 | Whether the **Analyze API** can fetch a signed authenticated URL as `source.uri`. | `source.asset_id` is documented as the alternative (not wired yet: it needs the stored `cld_asset_id`). | services:check: the three Analyze checks |
| C7 | Where the Analyze **moderation and watermark** responses sit (`data.analysis.*` vs `analysis.*`). The docs are inconsistent, and three shapes are shown for token usage. | Readers accept both nestings and all three usage shapes. | doctor output + `provider_usage.units` |
| C8 | **Free-plan quotas** for the AI Vision and AI Content Analysis add-ons (Console only). | — | MANUAL_STEPS: read them in the Console |
| C9 | `f_auto` inside **eager** transformations (used only with `CLD_EAGER=1`). | Leave `CLD_EAGER=0` unless C1 fails. | services:check with `CLD_EAGER=1` |
| C10 | `asset_folder` on an account in legacy **fixed folder** mode. New accounts use dynamic folders, where it is documented. | The full path is always in `public_id` as well, so both modes place the asset. | Console: Settings → Upload |
| O1 | **Image token cost** of `gpt-6-luna` / `gpt-6-sol`: both are missing from the vision sizing and multiplier tables. | The default vision model is `gpt-5.6-luna` (documented multiplier 1.2). | — |
| O2 | A recommended request **timeout** (the docs give none; openai-node defaults to 10 min). | `OPENAI_TIMEOUT_MS` = 60 s, retried. | — |
| I1 | Manual Inngest sync with `curl -X PUT <app>/api/inngest` (shown only in `inngest.com/llm-context.md`). | The Vercel integration syncs on every deploy; the UI "Sync app" is documented. | MANUAL_STEPS step 5 |
| P1 | Playwright video needs `npx playwright install ffmpeg`. The docs never mention it; an official-repo issue shows the error. | `design:capture` skips video when ffmpeg is missing and prints the command. | MANUAL_STEPS |

Items the earlier plan listed as uncertain that are now **settled**:
- Multi-prompt `e_extract:prompt_(a;b)` is documented. The per-prompt union (`CLD_EXTRACT_MODE=union`) stays as a switch.
- `l_authenticated:` layers are documented, provided the whole URL is signed. The server-side sharp composite (`CLD_COMPOSITE_MODE=server`) stays as a switch.
- Indic shaping in react-pdf is not documented, but this repo verified it: `tests/pdf-fonts.test.ts`, plus a visual check of Tamil, Devanagari, Bengali and Telugu names.

---

## Cloudinary

### Upload API (`image_upload_api_reference_upload`, `upload_parameters`, `authentication_signatures`)

| Use | Request | Status |
|-----|---------|--------|
| Server upload (`CloudinaryMediaProvider.upload`) | `POST https://api.cloudinary.com/v1_1/<cloud>/image/upload`, multipart | VERIFIED |
| Signature | sha1 of every body param except `file`, `cloud_name`, `resource_type`, `api_key` (the timestamp is included). The `k=v` pairs are sorted and joined with `&`, the secret is appended with no separator, and the result is hex. Timestamps are valid for 1 h. `tests/contracts.test.ts` checks the result equals the official SDK's `api_sign_request`, arrays included. | VERIFIED |
| `public_id` with full path + `asset_folder` | `asset_folder` is dynamic-folder mode; `folder` is "fixed folder mode only". | VERIFIED (C10 for fixed mode) |
| `type` | `authenticated` (evidence), `private` (fallback), `upload` (QR codes, logos) | UNVERIFIED (C2) |
| `tags` comma list, `context` `k=v|k2=v2` | `=` and `|` escaped with `\`, no empty keys or values, values ≤ 1024 characters (`image_upload_api_reference_context`) | VERIFIED |
| `media_metadata`, `phash`, `quality_analysis`, `faces` = true | The response carries `image_metadata` (for `media_metadata=true`), `phash` (a hex string), `faces` `[[x,y,w,h]]` and `quality_analysis.focus` (0–1). | VERIFIED |
| `moderation=manual` | The asset joins the manual queue, so `/review` decisions can set `moderation_status`. | VERIFIED |
| Browser tickets: `overwrite=false`, `allowed_formats=jpg,jpeg,png,webp,heic,heif` | Signed into every direct-upload ticket, so a ticket can't replace a photo after it was scored and only takes images (`upload_parameters`: overwrite, allowed_formats). | VERIFIED |
| `overwrite=true`, `invalidate=true` | Replace a probe/QR/composite and invalidate the CDN copy. The docs warn that overwriting may clear tags and metadata. | VERIFIED (`upload_parameters` "Replacing existing assets") |
| `file` as a remote https URL | Commons originals upload by reference. | VERIFIED (`upload_parameters` "Upload from a remote URL") |
| `eager` (pipe list) | `CLD_EAGER=1`: THUMB, PREVIEW, VIEW. Server composites: the labels. | VERIFIED; `f_auto` in eager is C9 |
| `notification_url` | On browser tickets and the preset → `/api/webhooks/cloudinary` | VERIFIED |
| `destroy()` (sandbox sweep) | `POST …/image/destroy` signed, with `public_id`, `type` and `invalidate=true`; answers `{"result":"ok"|"not found"}` (`image_upload_api_reference` destroy). | VERIFIED |
| Raw upload | `POST …/raw/upload`; the public id keeps its extension. | VERIFIED |
| Limits | Free plan: images ≤ 10 MB and 25 MP, raw ≤ 10 MB. The Upload API has no rate limit. | VERIFIED |

### Upload API asset methods

| Use | Request | Status |
|-----|---------|--------|
| Tags | `POST …/image/tags` with `command=add|remove`, `tag`, `public_ids[]=…` (REST array form, as in the docs' curl example). A comma-separated `tag` is documented for assigning; removals go one per call. | VERIFIED (`image_upload_api_reference_tags`) |
| Context | `POST …/image/context` with `command=add`, `context`, `public_ids[]` | VERIFIED |
| Structured metadata values | `POST …/image/metadata` with `metadata=id=value|…` and `public_ids[]`. Date fields take `yyyy-mm-dd`; enum values are datasource external ids. | VERIFIED (`image_upload_api_reference_metadata`) |

### Admin API (`admin_api_overview` and per-method pages)

HTTP Basic `api_key:api_secret` on `https://api.cloudinary.com/v1_1/<cloud>/…`. Free plan: 500 requests per hour.

| Use | Request | Status |
|-----|---------|--------|
| `exists()` | `GET resources/image/<type>/<public_id>`. A missing asset returns 404 `{"error":{"message":"Resource not found - …"}}` (not retried). | VERIFIED |
| Review decision | `POST resources/image/<type>/<public_id>` with `moderation_status=approved|rejected` | VERIFIED |
| `resource()` (upload confirm) | `GET resources/image/<type>/<public_id>?media_metadata=true&phash=true&faces=true&quality_analysis=true`: the stored image's pHash, size, faces, quality and metadata, read server-side so confirm never trusts the browser's copy (`admin_api` "Get details of a single resource"). 404 means none. | VERIFIED |
| `cld:setup` fields | `GET metadata_fields`; `POST metadata_fields` (JSON: `external_id`, `label`, `type` string/integer/date/enum, `datasource.values[{external_id,value}]`) | VERIFIED |
| `cld:setup` preset | `GET upload_presets/<name>`; `POST upload_presets` (`name`, `unsigned=false`, upload params); `PUT upload_presets/<name>` | VERIFIED |
| services:check | `GET usage` → `plan`, `credits.{usage,limit,used_percent}` | VERIFIED (`admin_api_usage`) |

### Delivery URLs and transformations (`delivery_url_signatures`, `transformation_reference`, `layers`)

| Use | Syntax | Status |
|-----|--------|--------|
| Signed URL | `/s--<first 8 chars of URL-safe base64 sha1(<transformation>/<public_id> + secret)>--/`; SHA-256 is also accepted | VERIFIED |
| Authenticated delivery | `https://res.cloudinary.com/<cloud>/image/authenticated/s--sig--/<t>/v1/<id>` | VERIFIED; on-the-fly is C1 |
| Strict Transformations | New derivatives only via eager, signed URLs, allowed named transformations or allowed referrers; anything else 404. Signed URLs are always allowed. | VERIFIED |
| Masks | `e_extract:prompt_(<p1>;<p2>)[;multiple_true];mode_mask`. It counts as **75 transformations**, is not available in the **Asia Pacific** data center, and not on fetched images. It may answer **423** while generating (retried with backoff). Images are downscaled to 2048² for processing. | VERIFIED; C3 for white = selected |
| Image layer | `l_authenticated:<id with / as :>/<layer transformations>/fl_layer_apply,g_east`. It works only when the whole URL is signed. Effects such as `e_blur_faces` go in their own component before `fl_layer_apply`, not inside `l_`. | VERIFIED |
| Text layer | `l_text:Arial_28_bold:<text>` with `co_rgb:`, `b_rgb:`. Commas, slashes and `%` are double-encoded. | VERIFIED |
| `e_blur_faces[:1–2000]`, `c_fill`/`c_pad`/`c_limit`, `g_auto`, `f_auto`, `q_auto` | as compiled by `src/lib/media/transform.ts` | VERIFIED |
| Raw authenticated URL | `/raw/authenticated/s--sig--/v1/<id>.pdf` | UNVERIFIED (C4) |
| Download API | `https://api.cloudinary.com/v1_1/<cloud>/<resource_type>/download?public_id&format&type&timestamp&expires_at&api_key&signature`. `type` defaults to private and `expires_at` to 1 h. Not CDN-cached, and billed at twice the bandwidth. | VERIFIED shape; signed params are C5 |
| Free plan PDFs | "Allow delivery of PDF and ZIP files" must be on (Settings → Security) | VERIFIED |

### Analyze API, beta (`analyze_api_reference`, `cloudinary_ai_vision_addon`, `cloudinary_ai_content_analysis_image_analysis`)

`POST https://api.cloudinary.com/v2/analysis/<cloud>/analyze/<model>`, Basic auth, JSON body `{ source: { uri } | { asset_id }, … }`. Needs an active add-on.

| Use | Body → response | Status |
|-----|-----------------|--------|
| `tag()` | `ai_vision_tagging`: `tag_definitions[{name,description}]` (≤ 10, so chunked) → `data.analysis.tags[{name}]`, **no confidence** | VERIFIED |
| `moderate()` | `ai_vision_moderation`: `rejection_questions[]` (≤ 10) → `responses[{prompt, value: yes|no|unknown}]`. "unknown" counts as no. | VERIFIED; nesting is C7 |
| `detectWatermark()` | `watermark_detection` → `analysis.detections[{name, confidence}]`; counted at confidence ≥ 0.5 | VERIFIED; nesting is C7 |
| Source image | a signed `c_limit,w_1600,h_1600/f_jpg` derivative (not face-blurred: moderation must see what is there) | C6 |
| Usage | `limits.addons_quota[{type, used_by_request, remaining}]` (also shown as `limits.items` and `limits.usage`) | C7 |

### Webhooks (`notification_signatures`)

`X-Cld-Signature` = hex SHA-1 (or SHA-256) of `<raw body><X-Cld-Timestamp><api_secret>`, verified
with the SDK's `verifyNotificationSignature` and valid for 2 h. **VERIFIED**.

### Plans (`billing_and_plans`, `developer_onboarding_faq_free_plan`)

25 credits per month; 1 credit = 1,000 transformations, 1 GB storage or 1 GB bandwidth. Paid
add-on tiers need a paid base plan. **VERIFIED**. Cost estimates in `src/lib/pricing.ts` count
transformations; they don't convert to dollars.

---

## OpenAI

Auth: `Authorization: Bearer <key>` (the `OpenAI-Organization`/`OpenAI-Project` headers are optional). **VERIFIED** (`/api/reference/overview`).

| Use | Request | Status |
|-----|---------|--------|
| Endpoint | `POST https://api.openai.com/v1/responses`. The migration guide recommends Responses for new projects. | VERIFIED |
| `describePhoto` | `input: [{role:"developer", content}, {role:"user", content:[{type:"input_text"}, {type:"input_image", image_url:"data:image/jpeg;base64,…", detail:"high"}]}]`. The image goes as a data URL (whether a signed Cloudinary URL can be fetched is undocumented, and base64 sidesteps it). Faces are blurred before sending. | VERIFIED |
| Structured output | `text.format = {type:"json_schema", name, schema, strict:true}`. The root must be an object, every property listed in `required`, and `additionalProperties:false` everywhere. Optional values are `["type","null"]`. No `allOf`/`not`/`if`. `src/lib/providers/ai/json-schema.ts` enforces this and a test walks the schema. | VERIFIED |
| `detail` | `low` fits 512², `high` fits 2048² with 2,500 patches, and `auto` behaves like `original` on GPT-5.6 models (large and expensive), so `auto` is never sent. Cost is ceil(w/32)·ceil(h/32) patches × 1.2 for gpt-5.6-*. | VERIFIED; gpt-6-* cost is O1 |
| `reasoning.effort` | `none`/`low`/`medium` (default)/`high`/… on gpt-5.6-luna; we send `low` (`OPENAI_REASONING_EFFORT`). | VERIFIED |
| `store: false` | Opts out of response storage | VERIFIED |
| Reading output | Find `output[]` with `type:"message"`, then `content[]` with `type:"output_text"`. `output_text` on the root is **SDK-only**. A `refusal` part is thrown as `OpenAIRefusalError`, and a `status` other than `completed` is an error. | VERIFIED |
| Usage | `usage.input_tokens`, `input_tokens_details.cached_tokens`, `output_tokens` → `provider_usage` with the cost | VERIFIED |
| `embed` | `POST /v1/embeddings` with `{model:"text-embedding-3-small", input, dimensions:1536, encoding_format:"float"}` → `data[0].embedding`. `dimensions` works only on text-embedding-3 and later. Empty input is rejected (we send "(no description)"). ≤ 8192 tokens per input. | VERIFIED |
| services:check | `GET /v1/models/{model}` | VERIFIED (`/api/reference/resources/models/methods/retrieve`) |
| Models | `gpt-5.6-luna` (default, vision + structured outputs), `gpt-5.6-terra`, `gpt-6-luna`/`sol`/`astra`, `text-embedding-3-small`. `gpt-5-mini`/`gpt-5-nano` are deprecated. | VERIFIED |
| Errors | 429 rate limit: follow `Retry-After`, else exponential backoff with jitter. `insufficient_quota`/`billing_hard_limit_reached`/`credit_balance_exhausted`: **never retried**. 5xx: retried. Branch on `error.code`. | VERIFIED (`/guides/rate-limits`, `/guides/error-codes`) |
| Timeout | 60 s (`OPENAI_TIMEOUT_MS`) | O2 |

Standard prices per 1M tokens (input / cached input / output), from `/api/docs/pricing`, **VERIFIED**:

| Model | Input | Cached | Output |
|---|---|---|---|
| gpt-6-luna | $0.10 | $0.01 | $0.50 |
| gpt-5.6-luna | $0.20 | $0.02 | $1.20 |
| gpt-5.6-terra | $2.00 | $0.20 | $12.00 |
| gpt-6-sol | $2.00 | $0.20 | $10.00 |
| gpt-5.6-sol | $4.00 | $0.40 | $20.00 (promotional, "at least through November 21, 2026") |
| text-embedding-3-small | $0.02 | – | – |

Batch and Flex cost 50% of Standard; the $0.10/$0.60 figure a search snippet gives for gpt-5.6-luna is that price, not Standard.

---

## Inngest (TS SDK v4.21)

| Item | Status |
|------|--------|
| `serve({ client, functions })` from `inngest/next`, exporting GET, POST and PUT in `src/app/api/inngest/route.ts` | VERIFIED |
| `new Inngest({ id, isDev, checkpointing })`: v4 defaults to **cloud mode**, so local dev needs `isDev`/`INNGEST_DEV=1` | VERIFIED |
| `createFunction({ id, triggers:[{event}], concurrency }, handler)` (the two-argument v4 form) | VERIFIED |
| `step.run(id, fn)`: return values are JSON-serialized; each step has its own retry counter | VERIFIED |
| Env: `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`, `INNGEST_SIGNING_KEY_FALLBACK`, `INNGEST_DEV` | VERIFIED |
| Checkpointing: on by default in v4. Set `maxRuntime` a little below the platform limit: we use `240s` with `maxDuration = 300` on the route. | VERIFIED |
| Vercel integration sets both keys and syncs on every deploy; Deployment Protection must be off or bypassed | VERIFIED |
| Manual `curl -X PUT` sync | I1 |

## Supabase Postgres

| Item | Status |
|------|--------|
| Transaction pooler `postgresql://postgres.<ref>:<pw>@<pooler-host>:6543/postgres` (IPv4 on every plan); session mode on 5432; the direct host is IPv6-only unless you buy the IPv4 add-on | VERIFIED |
| Transaction mode does not support prepared statements → `postgres(url, { prepare: false })` | VERIFIED |
| Warning: postgres.js pipelining over the transaction pooler "can hang queries or return mismatched rows"; `max_pipeline: 0` breaks `sql.begin()` | VERIFIED. Fallback: point `DATABASE_URL` at the session pooler (5432). |
| `create extension vector with schema extensions` | VERIFIED (our migration creates `vector`) |

## Vercel / Next.js 16.3.6

| Item | Status |
|------|--------|
| Fluid compute (default): max duration 300 s on Hobby, up to 800 s on Pro. `export const maxDuration = 300` in a route. | VERIFIED |
| Env vars per environment; changes apply to new deployments only; production values are "sensitive" (write-only) | VERIFIED |
| `runtime = 'edge'` deprecated (unused) | VERIFIED |

## Wikimedia Commons API and Nominatim

| Item | Status |
|------|--------|
| User-Agent `<client>/<version> (<contact>) <library>/<version>`; generic UAs may get 403 | VERIFIED (foundation.wikimedia.org/wiki/Policy:User-Agent_policy) |
| `maxlag=5`, then honour `Retry-After` (≥ 5 s); serial requests; gzip; local cache | VERIFIED |
| `generator=search` (`gsrnamespace=6`), `prop=imageinfo` (`iiurlwidth`, ≤ 50 scaled per request; the thumbnail may be wider than asked), `coordinates`, `geosearch` (10–10000 m, `gsnamespace=6`) | VERIFIED |
| Nominatim: ≤ 1 request/s, an identifying UA, results must be cached, ODbL attribution, no bulk autocomplete | VERIFIED (operations.osmfoundation.org/policies/nominatim) |

The Wikimedia UA uses `APP_CONTACT_EMAIL`, else `APP_REPO_URL` or the package.json repository.
Neither is set in this repo yet (MANUAL_STEPS step 0).

## Natural Earth (build time only)

| Item | Status |
|------|--------|
| `pnpm land:dots` downloads `ne_50m_land.geojson` once from the tagged repo (`nvkelso/natural-earth-vector` **v5.1.2**, raw.githubusercontent.com) through `src/lib/providers/http.ts`, caches it in `.data/geo/` and writes `data/land-dots.json` (7,660 dots). The app never calls it at runtime. | VERIFIED: public domain (naturalearthdata.com/about/terms-of-use), file shape is a GeoJSON FeatureCollection of Polygon/MultiPolygon land features |

## Rendering and tooling

| Item | Status |
|------|--------|
| react-pdf `Font.register({ family, fonts:[{src, fontWeight}] })`; **TTF/WOFF only**; variable fonts don't work properly | VERIFIED (react-pdf.org/fonts) |
| Noto Sans + Devanagari/Tamil/Bengali/Telugu static TTFs, SIL OFL 1.1 (`assets/fonts/OFL.txt`) | VERIFIED |
| Indic shaping (fontkit) | Undocumented, but VERIFIED in this repo (tests/pdf-fonts.test.ts plus a visual check). The PDF text layer of Indic runs is not searchable. |
| Playwright `channel: "msedge"` (installed Edge), `recordVideo: { dir, size }` saved on context close, `screenshot({ fullPage })`, `mouse.wheel` doesn't wait, `document.fonts.ready` | VERIFIED |
| Playwright video needs ffmpeg | P1 |
