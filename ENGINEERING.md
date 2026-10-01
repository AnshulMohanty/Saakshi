# Saakshi: engineering journal

What we built, why, and the evidence for each claim. Every number here comes from a command run in
this repo (test runs, demo runs, scripts); section 10 lists the commands. Kept current: after every
phase or fix, we append what changed, why, the evidence and any new issue found (rule in
docs/DEVELOPMENT.md).

## Contents

1. [Summary](#1-summary)
2. [Timeline](#2-timeline)
3. [Starting point: the v1 plan and what was wrong with it](#3-starting-point-the-v1-plan-and-what-was-wrong-with-it)
4. [Architecture decisions](#4-architecture-decisions)
5. [Phase-by-phase log](#5-phase-by-phase-log)
6. [Issue log](#6-issue-log)
7. [Trust Engine and measurement](#7-trust-engine-and-measurement)
8. [Data provenance](#8-data-provenance)
9. [Cloudinary usage](#9-cloudinary-usage)
10. [Verification](#10-verification)
11. [Known limitations](#11-known-limitations)
12. [Pending manual steps and next work](#12-pending-manual-steps-and-next-work)

---

## 1. Summary

**What it is.** Saakshi (साक्षी, "witness") turns field photos from NGOs and community groups into
verified, measured, traceable proof of impact:

1. capture;
2. Cloudinary ingest (EXIF, pHash, faces, quality);
3. AI understanding;
4. a rule-based Trust Engine (score + reasons);
5. before/after measured on photo pixels;
6. reports where every number links to its source photo.

The hero use case is a clean-up drive: litter before and after, then community check-ins at the
same spot through a QR poster.

**The brief.** Code Cubicle 6.0, PS02 (Cloudinary track): an AI media-intelligence platform that
understands field media, organises it by project, place and time, compares before and after,
generates reports and campaign content, makes media searchable, and preserves traceability to the
original assets and transformations. Four of the brief's key words are about trust (verifying,
reliable, measurable, traceability), so Saakshi leads with those: the AI gathers evidence, fixed
rules decide, and every claim shows its evidence. The LLM never writes a number.

**How we worked.**
1. Plan. The GPT-written "Build Document v1" was reviewed, and v2 was written as the master build plan.
2. Critique the plan before building (issue log A).
3. Build in phases, each from a written phase brief.
4. After every phase, review its summary, then fix what the review found before moving on. Each phase brief starts with the previous review's decisions: "section 0" of Phases 4–6, and "section 2" of Phase 7.

Everything runs on mock providers until real keys exist. The code for real services is written and
contract-tested, and is exercised in Phase 10.

## 2. Timeline

All times IST (+05:30), from `git log`. Test counts were re-run in a clean worktree at each
phase's closing commit (section 10).

| Phase | When | Commits | Closing commit | Tests |
|---|---|---|---|---|
| 1: foundation + mock mode | 27 Sep 23:43 → 28 Sep 00:21 | 13 | `4e92530` | **115** |
| 2+3: Commons importer, Witness Capture, pipeline | 28 Sep 01:21 → 02:30 | 11 | `80f17c7` | **184** |
| Section 0: fixes from the 2+3 review | 28 Sep 03:00 | 1 | `57978f5` | **197** |
| 4: Trust Engine + review | 28 Sep 03:31 | 4 | `9233e43` | **276** |
| 5: before/after + monitoring | 28 Sep 03:36 → 04:00 | 6 | `0fdea31` | 307 |
| 5, follow-ups from re-reading the spec | 28 Sep 04:11 | 4 | `6c0660d` | **312** |
| 6: search, evidence page, reports, campaign kit, Phase 7 APIs | 28 Sep 04:17 → 04:51 | 5 | `571f924` | **338** |
| 7: finish the build (this phase) | 28 Sep 12:53 → | see `git log` | | **403** |

## 3. Starting point: the v1 plan and what was wrong with it

The v1 plan (GPT "Build Document v1") was a 7-day plan with a plantation hero and EXIF GPS as the
top trust signal. It was reviewed on 27 Sep with 3.5 days left. Every finding and its fix is in
**issue log A** (section 6). The main changes, from the planning doc's decision log:

| v1 | v2 (built) | Why |
|---|---|---|
| Hero = tree plantation with self-shot potted saplings | Hero = clean-up with Wikimedia Commons data; live on-stage capture | "6% → 41% green cover" on potted saplings looks staged; no time to collect photos by hand |
| EXIF GPS is the top trust signal (+30) | Witness Capture (live GPS + server token) is the top signal | Android browsers strip GPS from uploaded photos |
| Browser location at upload can score and hard-flag | Uploader location is information only | Upload location ≠ capture location |
| Public transformed URLs with `e_blur_faces` | Authenticated uploads, signed URLs, Strict Transformations | Anyone could delete `e_blur_faces` from a URL |
| ExG green-pixel threshold only | `e_extract` masks → pixel %, ExG as a cross-check, mask shown | Works for litter too; showing what was counted makes the number credible |
| A validator scans report text for numbers | The LLM never writes digits; `{{claim:id}}` placeholders filled by code | Robust; dates and SDG numbers no longer break the validator |
| Plain audit table | Hash-chained audit log, "History intact" | Tamper-evident |
| Same-project near-duplicates lose points | Same spot + time gap = revisit (full points) | Monitoring depends on revisits |
| "Looks AI-generated?" costs points | Review flag only | Compressed WhatsApp photos cause false positives |
| — | STAMP_MISMATCH hard flag | GPS-stamp camera apps are common and easy to fake |
| — | Spot monitoring + QR poster + check-ins | One-day proof becomes ongoing proof |
| Anthropic API | OpenAI (gpt-5.6-luna, text-embedding-3-small) | No Anthropic API key; one OpenAI key covers vision, text, embeddings |
| Build against real services | Mock-first providers, PGlite, keys later | Building was blocked on accounts |
| "15 Cloudinary features" | "Cloudinary does five jobs" (section 9) | Depth over count |

## 4. Architecture decisions

Each ADR gives the context, the decision, the alternatives considered and the consequences.

**ADR-1: Mock-first providers and PGlite.**
- *Context:* building was blocked on accounts and keys, and tests must be deterministic.
- *Decision:* every external service (media, analysis, ai, db, queue, geocoder) sits behind an interface with a mock and a real implementation. `lib/config.ts` picks real only when **all** of a provider's env vars are set. PGlite (Postgres in WASM with pgvector) is the local database.
- *Alternatives:* build against live services; SQLite locally.
- *Consequences:* the app and tests run with no `.env`. Mocks are deterministic and key on content only. PGlite is single-connection, so scripts refuse to run while `pnpm dev` holds the lock. Real code paths need contract tests (`tests/contracts.test.ts`) and a live check (`pnpm run doctor`), because running on mocks can hide integration bugs.

**ADR-2: Witness Capture over EXIF.**
- *Context:* Android browsers strip GPS from uploaded photos, so EXIF GPS rarely survives for the real user.
- *Decision:* an in-app camera records a live GPS fix and its accuracy, plus a server-signed capture token. An attested fix inside the site scores +30, EXIF +25, archive GPS +20. The uploader's browser location is information only.
- *Alternatives:* EXIF-first scoring (v1).
- *Consequences:* the strongest evidence needs the app on site. Gallery uploads still work, with less evidence.

**ADR-3: Signed delivery + Strict Transformations.**
- *Context:* a public URL with `e_blur_faces` can be edited to remove the blur.
- *Decision:* evidence is uploaded as `authenticated` and delivered only through signed URLs built by `lib/media/transform.ts`. Strict Transformations are on. QR codes and logos are public (`upload`).
- *Alternatives:* public URLs; a proxy that re-renders images.
- *Consequences:* editing a URL breaks its signature (the mock returns 401, and `/api/demo/tamper` shows 200 → 401). The docs contradict each other on on-the-fly transformations of authenticated assets, so `CLD_DELIVERY_TYPE=private` and `CLD_EAGER=1` exist as fallbacks (docs/external-apis.md C1).

**ADR-4: `e_extract` masks with an ExG cross-check.**
- *Context:* a number needs to be credible and explainable.
- *Decision:* Cloudinary `e_extract:prompt_(…);multiple_true;mode_mask` on a shared 800×600 frame; the number is the pixel share of the mask, which the UI shows. For vegetation, an ExG index is computed too, and more than 15 points of disagreement marks the value low-confidence.
- *Alternatives:* ExG alone (v1); asking an LLM for a percentage.
- *Consequences:* masks cost 75 transformations each, so they are cached forever and capped per project. The number carries the caveat "Measured on photo pixels…".

**ADR-5: Claims ledger with placeholders.**
- *Context:* LLM prose invents or mangles numbers.
- *Decision:* totals come from SQL (`lib/report/claims.ts`). Prose references them only as `{{claim:id}}`. `lib/claims.ts validateProse` rejects digits, number words and non-ASCII numerals in generated text. The real provider re-asks when a draft breaks the rule.
- *Alternatives:* post-hoc number checking (v1).
- *Consequences:* the report PDF and `/r/[id]` link every number to its evidence.

**ADR-6: Per-asset hash chains.**
- *Context:* one global chain meant a demo reset rewrote history (issue D).
- *Decision:* one chain per asset plus a system chain, append-only, written with `appendAudit()`. Deleting an asset deletes its chain and nothing else.
- *Alternatives:* one global chain; plain rows.
- *Consequences:* a reset leaves every other chain intact (latest run: 64 chains, all intact). A data migration rebuilt 480 global rows into 60 chains.

**ADR-7: Wikimedia Commons demo data, not stock.**
- *Context:* no time to collect photos by hand; stock photos would contradict the product.
- *Decision:* a polite Commons client (User-Agent with contact, `maxlag`, serial requests, offline cache), a relevance filter, DBSCAN clustering and a pure builder that picks the densest pairable clusters. Photos carry author and license.
- *Alternatives:* stock sites; self-shot photos; Mapillary.
- *Consequences:* the photos are real but sparse: geotagged Indian clean-up photos are rare, and some clusters were shot within minutes (section 7).

**ADR-8: OpenAI instead of the Anthropic API.**
- *Context:* no Anthropic API key was available.
- *Decision:* one OpenAI key for vision (`gpt-5.6-luna`, Responses API, strict JSON schema), prose and search (`OPENAI_MODEL_SMART`), and embeddings (`text-embedding-3-small`, 1536 dimensions).
- *Consequences:* one bill, one budget limit. Model ids are configurable.

**ADR-9: Pair gaps by activity.**
- *Context:* a clean-up is before/after within an evening; a plantation needs weeks.
- *Decision:* `min_pair_gap_hours`: cleanup and water 0.5, plantation 336, school 168, other 24, live stage 0.
- *Consequences:* same-evening clean-up pairs count, and potted-sapling-style instant "growth" can't pair.

**ADR-10: REUSED lands on the later copy.**
- *Context:* photos arrive in any order.
- *Decision:* order by capture time, then upload time, then id. The later copy of a cross-project match gets the hard flag; the original gets an info note (`COPY_LATER_SUBMITTED`). Matched photos are re-scored when a new one arrives.
- *Consequences:* the result doesn't depend on arrival order (tested both ways).

**ADR-11: Witness-safe reset.**
- *Context:* a demo reset deleted witness photos (issue D).
- *Decision:* demo projects and spots get stable UUIDv5 ids from config slugs, and a reset deletes only archive and planted assets. A full wipe needs `--include-witness` or the admin secret. Demo review decisions on archive and planted photos are reverted by the reset, never those on witness photos.

**ADR-12: Capture time anchored at the shutter.**
- *Context:* attestation timed at confirm could reject slow uploads.
- *Decision:* the browser asks for an upload ticket at the shutter. The server stores the ticket (context + issue time), and confirm and the webhook trust only the stored ticket.
- *Consequences:* slow networks don't fail attestation, and the browser can't change the context after the shutter.

**ADR-13: Event window vs monitoring period.**
- *Context:* the hero's project window stretched 2017–2020 because of one 2020 photo, and its only pair was 2.5 years apart.
- *Decision:* the event window is the densest run of capture dates (gaps ≤ 7 days), padded by 7 days. After it, the monitoring period runs until `monitoring_ends_at` (open-ended by default). A photo in the window scores +20. A photo in the monitoring period at a monitored spot scores +20 as "Check-in after the activity". Anything else scores −20.
- *Consequences:* the Tiruppur window is now 29 Aug – 12 Sep 2017, and its 2020 photos are check-ins.

**ADR-14: Date precision.**
- *Context:* coarse timestamps can't be compared like exact ones (seen while investigating Hyderabad).
- *Decision:* `captured_at_precision` (second … year). Capture times are intervals, and `gapBetween` gives the minimum and maximum gap. Bursts use the maximum, revisits the minimum. Two same-day day-precision photos have an unknown gap and can't pair (`gap_unknown`). The UI shows "date only".

**ADR-15: Design direction v1 → v2 → v3.** Issue log B. v3 "Every claim has a thread": every
visual effect maps to a product truth (a thread from a number to its photo), and no metric is
shown that the product doesn't measure.

**ADR-16: Rejected options.**
- Mapillary, satellite imagery, or Wikimedia as the *main* pipeline: they add no Cloudinary depth and break the "field proof" thesis.
- Switching to MongoDB: stack churn with no gain over Postgres + pgvector.
- The "15 Cloudinary features" checklist: depth over count.
- The potted-sapling demo: it looks staged.

## 5. Phase-by-phase log

**Phase 1: foundation + mock mode** (13 commits, 115 tests)
- *Built:*
  - Next 16.3 + TS strict + Tailwind 4 + shadcn.
  - Pure tested modules: `geo`, `phash`, `hashchain`, `claims`, `media/transform` (signed URLs match the official SDK).
  - 9 tables with pgvector (HNSW), hybrid search, the hash-chained audit log.
  - Five providers with deterministic mocks; `/dev/status`, `/dev/upload-test`, docs/DEVELOPMENT.md, README.
- *Deviations:*
  - TS 5.9 / ESLint 9 / React 19.2 (the versions Next's template pins).
  - PGlite 0.5 with the separate `@electric-sql/pglite-pgvector` package.
  - A database lockfile.
  - Unsigned mock URLs return 401.
  - `validateProse` also rejects spelled-out and non-ASCII numerals.
- *Evidence:* tampered, unsigned, blur-removed, resized and swapped URLs all return 401.

**Phases 2+3: Commons importer, Witness Capture, pipeline** (11 commits, 184 tests)
- *Built:*
  - Commons client with offline cache; pure parser, license filter, clustering and builder.
  - `archive:discover`, `demo:import`/`plant`/`reset`.
  - Witness Capture: 15-minute capture tokens, signed upload tickets, a verified confirm step and the Cloudinary webhook, all on one idempotent ingest path.
  - Inngest-style pipeline (inline queue with concurrency 4; `QUEUE=inngest-dev` tested).
  - Library with map, grid, filters, live mode and a provenance drawer.
- *Deviations:*
  - 55 archive photos, not 60.
  - A relevance filter on titles and descriptions.
  - Hero = densest cluster.
- *Evidence:* tested in headless Chrome with a fake camera and spoofed GPS. **Not yet on a real phone.**

**Section 0: fixes from the 2+3 review** (1 commit, 197 tests)
- Per-asset audit chains; a data migration turned 480 global rows into 60 chains.
- Witness-safe reset with stable ids.
- Capture time anchored at ticket issue.
- `min_pair_gap_hours` and pairability ranking.
- User-Agent contact rule.
- `pnpm demo:stage`.

**Phase 4: Trust Engine + review** (4 commits, 276 tests)
- *Built:*
  - Pure, browser-safe `lib/trust`; a test walks its import graph.
  - A reason ledger that always sums to the score.
  - `parseStamp`, which reads 12+ stamp formats.
  - pHash duplicates both ways, with REUSED on the later copy.
  - The pipeline `score` step with Cloudinary write-back.
  - `/review` (J/K/A/R keys, a required note) and `/api/audit/verify`.
- *Bugs fixed:*
  - A stale demo project caught the hero's photos: stale projects are now retired before import.
  - The planted "reused" crop drifted to 14 bits at 4% per side, past the match threshold of 8, so it was cut to 2% per side.
  - Both in `49c6207`.

**Phase 5: before/after + monitoring** (6 + 4 commits, 307 → 312 tests)
- *Built:*
  - Pure `pairing.ts` and `cover.ts`.
  - Masks on a shared frame, cached; composite Transform with an authenticated, face-blurred layer.
  - The `measure` step, with check-ins compared against the spot baseline.
  - `/projects/[id]` compare cards, public `/spots/[slug]` with trend, a one-page A4 QR poster.
- *Follow-ups from re-reading the spec:*
  - Pairs held to the spot radius (30 m, 150 m for approximate locations).
  - Baseline = the best "after" photo.
  - Trend plots every measured photo.
  - Poster QR points to the spot page.
- *Bug fixed:* a new check-in reset the spot baseline (caught by a test; `2ae8f99`).

**Phase 6: search, evidence page, reports, campaign kit** (5 commits, 338 tests)
- *Built:*
  - Validated search: "Ignored" chips and Hinglish/typo rewrites. "nadi ke kinare ka kachra" finds 24 photos.
  - `/e/[id]` evidence page: proof strip, ledger, three anchored times, duplicates, every edit in words, audit.
  - SQL claims → placeholder prose → a six-section A4 PDF (the hero's: 7 pages), uploaded as raw + authenticated.
  - `/r/[id]`, three Instagram PNGs.
  - `/api/live` (SSE), `/api/stats`, layers, tamper (200 → 401), a sandbox, and the evidence-pack zip (4.2 MB for the hero).

**Phase 7: finish the build** (this phase)

*Section 2 decisions, each with tests:*
- `DEMO_HERO` config (default Tiruppur), plus a polite discovery pass with broader terms:
  - 1014 → 1254 candidates in 20 requests, with one 429 retry;
  - added within 3 km: Tiruppur 53, Pimpri-Chinchwad 12, Mundikunta 118.
- Event window vs monitoring period (ADR-13) and `captured_at_precision` (ADR-14). The hero was re-scored and re-paired (section 7).
- AI estimates under confidence 0.5 (`AI_MIN_CONFIDENCE`) show "Not enough confidence to estimate".
- Demo mode:
  - anyone may review, rate-limited, recorded as "Demo visitor";
  - a reset reverts demo decisions on archive and planted photos, never on witness photos;
  - report generation, pairing overrides and project edits need `DEMO_ADMIN_SECRET` in production.
- Bundled Noto Sans + Devanagari, Tamil, Bengali, Telugu (OFL), with a font chosen per script run. Tested with Tamil and Devanagari author names and checked visually.
- The sandbox uses the stage venue (300 m, today ± 1 day) as its site. With no venue it says "No site set, so nothing here can be verified". A genuine venue photo verifies; an internet image can't.
- Cloudinary fallbacks:
  - QR codes and logos as public `upload` assets;
  - a server-side sharp composite;
  - Download API URLs for PDFs;
  - a per-prompt mask union.

*Section 1, real not synthetic:*
- `provider_mode` and the provider or model id on every AI output, analysis, measurement, comparison, report and claim.
- A production guard hides mock-derived numbers in reports, the PDF, claims, the Instagram kit, `/api/stats` and public pages. Development shows a "Mock output" tag, and the PDF a "Generated with mock providers" banner.

*Section 3, real-service readiness:*
- Every provider method is implemented. No `NotConfiguredError` remains.
- One HTTP layer: timeouts; retries with backoff that honour `Retry-After`, with no retry on quota errors; a `provider_usage` table with tokens or units, latency, cost and the asset served.
- 23 contract tests build each request offline. The signature matches the official SDK.
- New scripts:
  - `cld:setup` (idempotent, `--dry-run`);
  - `pnpm run doctor` (live checks, including every UNVERIFIED item it can settle; renamed `pnpm services:check` in Phase 8);
  - `verify:env --prod`;
  - `demo:remeasure`;
  - `check:bundle`: a build with canary secrets, whose 32 browser files contain no secrets.
- Inngest checkpointing under Vercel's 300 s; Postgres pooler settings.

*Sections 4–6:*
- docs/external-apis.md (every endpoint checked on 2026-09-28) and docs/MANUAL_STEPS.md.
- Design parity tooling: `design:capture`, `parity:capture`, `parity:report`.
  - All 16 exports captured: 408 s with video, 271 s without.
  - The fixture page (a sticky section at 0/25/50/75/100%): 10 steps per width.
  - The app's hero spot page against the "Spot Page" export: a mean pixel difference of 13.5% at 1440 and 28% at 390. The UI is still functional shadcn; the design comes in Phase 8.
- This journal.

*Bugs found and fixed in Phase 7:* issue log F.

## 6. Issue log

### A. Plan review (27 Sep)

| Issue | Impact | Fix | Commit |
|---|---|---|---|
| A 7-day plan with 3.5 days left | Nothing would ship | Phased P0/P1 scope, cut order agreed | planning doc v2 |
| Android browsers strip GPS from uploaded photos | The top trust signal would almost never fire | Witness Capture: live GPS + server token | `9b0a538`, `1ed403e` |
| Upload location ≠ capture location | Coordinators uploading from the office would be flagged | Uploader location is information only | `1ddc56a` |
| Editable Cloudinary URLs could un-blur faces | Children's faces exposed | Authenticated uploads, signed URLs, Strict Transformations | `07bcf5f`, `b7c97f8` |
| Free-tier fine print: watermark detection needs the AI Content Analysis add-on; AI Vision has a free token quota; the Analyze API is beta; the Asia Pacific region lacks `e_extract` and transcription; no paid add-on top-ups on the free plan | Quota exhaustion or missing features at the final | Region choice, caching every result, usage logging | `e6aa31f`, `5023251`, MANUAL_STEPS |
| Staged-looking demo (self-shot potted saplings, "6% → 41% green cover") | Credibility | Real open-archive data; measured masks with caveats | `d70a83f`, `a130df5` |
| Fragile number validator | Dates and SDG numbers break it; invented numbers slip through | `{{claim:id}}` placeholders; the LLM writes no digits | `5353a2e` |
| Editable audit table | History could be rewritten silently | Hash chain | `4155b77` |
| Revisits penalised as duplicates | Monitoring would score badly | Revisit rule (same spot + gap) | `1ddc56a` |
| "AI-generated?" costing points | False positives on compressed photos | Review flag only | `1ddc56a` |
| Fake GPS-stamp apps | Easy forgery | `STAMP_MISMATCH` hard flag | `1ddc56a` |
| One-day proof | Nothing shows the spot stayed clean (Swachhata Hi Seva 2026 stresses sustained cleanliness) | Spot monitoring, QR posters, check-ins | `a130df5`, `3a2f1c7` |
| Mapillary, satellite imagery, MongoDB proposed | Scope and stack churn | Rejected (ADR-16) | — |
| No Anthropic API key | The AI plan was blocked | OpenAI | `b7c97f8` |
| No manual photo collection possible | No demo data | Wikimedia Commons, not stock sites | `d70a83f` |
| Build blocked on accounts | No progress until keys existed | Mock-first providers | `b7c97f8` |

### B. Design reviews

| Version | Problem | Change |
|---|---|---|
| v1 | The default AI look, and invented metrics (m² cleared, volunteer counts) | Honest-metrics rule: show only what the product measures |
| v2 | Clean but lifeless, because its brief asked for quiet surfaces | v3 "Every claim has a thread": every effect maps to a product truth |
| v3 | Current. The exports (16 pages) are in `design/export/` and captured by `pnpm design:capture` | Built 1:1 in Phase 8 |

### C. Phase 1

| Issue | Fix | Commit |
|---|---|---|
| The toolchain the plan asked for didn't match Next's template | Pinned to what Next's template supports (TS 5.9, ESLint 9, React 19.2) | `b55fb83` |
| PGlite 0.5 moved pgvector to a separate package | `@electric-sql/pglite-pgvector` | `b55fb83`, `19e8a25` |
| Two processes on one PGlite directory can corrupt it | A database lockfile; scripts refuse to run while dev holds it | `19e8a25` |
| Stripping the signature from a mock URL could bypass the blur | Unsigned mock URLs return 401 | `b7c97f8` |
| The prose validator missed "twenty" and "٣" | Rejects spelled-out and non-ASCII numerals | `5353a2e` |
| EXIF times without an offset would be read in the server's timezone | `EXIF_DEFAULT_UTC_OFFSET` (+05:30) and `captured_at_tz_assumed` | `a1cf064`, `939154d` |
| `/dev` tools reachable in production | 404 unless `DEV_TOOLS=1` | `6f3298f` |

### D. Phases 2+3

| Issue | Impact | Fix | Commit |
|---|---|---|---|
| Few geotagged Indian clean-up photos on Commons | 55 photos, not 60 | Accepted; later a broader discovery pass (Phase 7) | `61ec636`, `5684adc` |
| 15th-century temple photos matched "lake" | Irrelevant demo photos | Relevance filter on titles and descriptions | `61ec636` |
| Demo reset rewrote audit hashes | History broken on every reset | Per-asset chains | `57978f5` |
| Reset deleted witness photos | Real field evidence lost | Stable ids, witness-safe reset | `57978f5` |
| Attestation timed at confirm could reject slow uploads | Genuine photos lose attestation | Anchored at ticket issue | `57978f5` |
| Single-evening clusters | No before/after pairs | Pair gaps by activity | `57978f5` |
| Clusters chosen by size alone | Unpairable hero | Pairability ranking | `57978f5` |
| Wikimedia User-Agent had no contact | Policy breach, throttling | `APP_CONTACT_EMAIL`, else the repo URL; never invented | `57978f5` |
| No live before/after for the final | Weak demo moment | `demo:stage` live-stage project | `57978f5` |
| Mock tagger matched "no visible litter" as litter | Wrong tags | Negated words are exclusions | `80f17c7` |

### E. Phases 4–6

| Issue | Impact | Fix | Commit |
|---|---|---|---|
| The planted "reused" crop drifted to 14 bits at 4% per side, past the match threshold of 8 | The planted test would not flag | 2% per side | `49c6207` |
| A stale demo project caught the hero's photos | Wrong assignment | Retire stale demo projects before import | `49c6207` |
| A new check-in reset the spot baseline | Trends measured against the wrong photo | Keep the current baseline; check-ins never become it (caught by a test) | `2ae8f99` |
| The hero's only pair was 2.5 years apart, and one 2020 photo stretched the project window | Misleading "event" | Event window vs monitoring period | `5582469` |
| Identical-looking timestamps in Hyderabad | Suspected coarse dates | `captured_at_precision`. The Hyderabad times turned out to be distinct second-precision EXIF times within 05:58–06:08 UTC, so pairing correctly still finds none | `5582469` |
| Report numbers came from mock providers | Mock numbers could be shown publicly | `provider_mode` on everything plus a production guard | `e6aa31f` |
| A low-confidence AI estimate (38%) in the report | An unreliable number shown | `AI_MIN_CONFIDENCE` 0.5 → "Not enough confidence to estimate" | `e6aa31f`, `f411b76` |
| The PDF couldn't print Tamil credits (WinAnsi fonts) | Author credit missing, breaking the license | Bundled Noto fonts, per-script runs | `c01444e` |
| The sandbox couldn't verify genuine photos (no site) | The demo contradicted the pitch | Stage venue as its site | `8cb524b` |
| Open review in the demo | Vandalism, confusion | Labelled "Demo visitor", rate-limited, reverted by reset | `f411b76` |

### F. Phase 7 (new issues found while finishing the build)

| Issue | Impact | Fix | Commit |
|---|---|---|---|
| Layer effects were inside the `l_` component; the docs allow them only as their own component before `fl_layer_apply` | Real composites would fail or be unblurred | Separate component | `02f6b22` |
| CLI scripts didn't load `.env*` | `doctor` and demo scripts would ignore keys in `.env.local` | `@next/env` loader in every script | `dc3a715` |
| `pnpm doctor` is pnpm's own built-in command | The script never runs | Documented as `pnpm run doctor` | `dc3a715` |
| Upload signing sorted keys; the SDK sorts `k=v` strings | Signatures could differ for some key pairs | Mirror the SDK; a test compares with `api_sign_request` | `5023251` |
| Browser tickets used `folder` (fixed-folder mode only) | Wrong placement on new (dynamic-folder) accounts | Full-path `public_id` + `asset_folder`, `moderation=manual` | `5023251` |
| The vision step sent unblurred faces to the model | Unnecessary personal data to a third party | `e_blur_faces` in `UNDERSTAND_TRANSFORM`; `store: false` | `5023251` |
| Context encoding escaped `\` and allowed empty values (the docs: escape only `=` and `\|`; no empty values) | Corrupted or rejected context | Encoder per the docs | `891438f` |
| `demo:remeasure --all` re-measured only pair photos | Spot trends lost (116 → 12 measurements) | Re-measure every eligible spot photo (back to 116) | `dc3a715` |
| App-shell design exports scroll an inner element | Captured as a single step | Scroller detection; step cap 80 → 160 | `52af530` |
| tsx's `__name` helper broke `page.evaluate` | Capture crashed | In-page init script | `52af530` |
| Git Bash rewrites a `/route` argument into `C:/Program Files/Git/route` | `parity:capture` captured a 404 page | The script undoes the MSYS rewrite | `52af530` |
| One full `pnpm test` run (14:31) reported 1 failure of 403; the name was lost with the session | Intermittent red suite | **Fixed in Phase 8** (issue F-flake below): Vitest workers are sized by memory | `a996df3` |

### F-flake. The intermittent test failure (found Phase 7, fixed Phase 8)

- **Symptom.** One full run in Phase 7 reported 1 failure of 403, and four reruns passed.
- **Hunt.** Ten more full runs with verbose and JUnit reporters: 9 clean. The tenth failure was an unfinished new test of mine, not the flake. The JUnit durations explained it:
  - The slowest tests were each file's **first PGlite open**: the geocoder cache test at 15–27 s, the usage-log test at 13–26 s, against a 30 s timeout.
  - The same open takes **1.3 s** alone (measured: create + migrate 1.26 s).
  - One Vitest worker holds about **734 MB** (PGlite + pgvector WASM, sharp, app modules). Vitest's default here is 11 workers (12 CPUs − 1) on a 7.9 GB machine, so the machine swapped. The Phase 7 failure came right after the dev server and screenshot runs, when even less memory was free.
- **Fix.** `vitest.config.ts` sizes workers by memory: one per 2.5 GB, so 3 here. No retries were added.
- **Evidence.** With 3 workers the suite ran in **29–30 s instead of 50 s**, the slowest test took **5.3 s instead of 27 s** (the geocoder test 2.8 s), and 412/412 passed.

## 7. Trust Engine and measurement

Rules: [docs/trust.md](docs/trust.md). Measurement: [docs/measure.md](docs/measure.md). The latest
demo run (`pnpm demo:reset`, offline from the archive cache, 47.8 s):

```
Hero (DEMO_HERO=demo-hero-cleanup): River clean-up, Tiruppur North
  River clean-up, Tiruppur North       cleanup     26 photos  r=300 m  2017-08-29 → 2017-09-12
  Tree planting, Pimpri-Chinchwad      plantation  20 photos  r=1126 m  2020-11-13 → 2020-11-29
  Lake clean-up, Hyderabad             water       16 photos  r=1365 m  2025-10-25 → 2025-11-09
Trust (archive photos): VERIFIED 58, NEEDS_REVIEW 0, FLAGGED 0
  Top reasons: PROVENANCE_NONE 23, COPY_LATER_SUBMITTED 1
  Archive photos with a hard flag: none
  Planted location_mismatch  FLAGGED  score 25  LOCATION_MISMATCH
  Planted reused             FLAGGED  score 30  REUSED
  Planted stamp_mismatch     FLAGGED  score 40  STAMP_MISMATCH
  Planted stock              FLAGGED  score 35  STOCK_SUSPECTED
Assets by status: ready 58, flagged 4
Audit: all chains intact (64 chains, 589 rows)
```

**Bands.**
- Archive photos: VERIFIED 58, NEEDS_REVIEW 0, FLAGGED 0.
- Planted test inputs: 4 of 4 FLAGGED, each for the intended reason.
- The archive histogram is narrow because authenticity and stamp signals come from deterministic
  mocks. With real moderation and vision it will likely spread out.

**Pairs** (`pnpm measure:pairs`; values from mock masks):

| Project | Candidates | Pairs | Rejected |
|---|---|---|---|
| Tiruppur (hero) | 211 | 1: 30 Mar → 4 Apr 2020 (two check-ins, 118 h), litter cover 6 → 9.6 | 206 `gap_too_short` (the 5 Sep 2017 photos span 6 minutes), 4 `same_time` |
| Pimpri-Chinchwad | 99 | 2: Nov → Dec 2020 and Sep 2021 → Jan 2022, both low confidence (mask and ExG disagree) | 66 `gap_too_short` (< 14 days) |
| Hyderabad | 23 | 0 | 22 `gap_too_short`, 1 `same_time` (all within ten minutes) |

**Trend spots** (measured photos per spot):
- Tiruppur: 21 and 2.
- Pimpri-Chinchwad: 13 and 7.
- Hyderabad: 5, 4, 4 and 2.

The rules are never loosened to produce a pair. The hero has no clean-up-day pair because its
Commons photos of that day were taken within six minutes.

## 8. Data provenance

| Kind | What | Marked as |
|---|---|---|
| **Real** | Commons photos (thumbnails), their titles, descriptions, authors, licenses, coordinates and dates (`exif_source = commons_api`); OSM place names (Nominatim, cached) | Credited on every public page and in the PDF |
| **Mock until Phase 10** | AI captions, counts, stages; Cloudinary tags, moderation and watermark results; segmentation masks and every measurement derived from them | `provider_mode = mock` on the asset (`provenance`), measurement, comparison, report and claim. In development: "Mock output" tag and PDF banner. In production: hidden |
| **Synthetic by design** | The four planted test inputs (a reused crop, a stock-like watermark, a location mismatch, a stamp mismatch) and the test fixtures | Always labelled "Test input"; `source = planted_test` |

Commons thumbnails carry no EXIF, which is why `PROVENANCE_NONE` (no camera recorded) is the most
common non-positive reason (23).

## 9. Cloudinary usage

Five jobs. Every parameter's status and doc link is in
[docs/external-apis.md](docs/external-apis.md) (checked 2026-09-28).

| Job | What we send | Status |
|---|---|---|
| 1. Forensics at intake | Signed upload (`upload_parameters`): full-path `public_id` + `asset_folder`; `type=authenticated`; `media_metadata`, `phash`, `faces`, `quality_analysis`; `context`; `tags`; `moderation=manual`; `etag` from the response. Browser uploads use server-signed tickets; the webhook signature is verified (`notification_signatures`). | VERIFIED, except `type` over REST (C2) and `asset_folder` on fixed-folder accounts (C10) |
| 2. Perception | Analyze API (`analyze_api_reference`): `ai_vision_tagging` (10-category taxonomy, ≤ 10 per call), `ai_vision_moderation` (yes/no questions), `watermark_detection` | VERIFIED endpoints; source URI and response nesting UNVERIFIED (C6, C7); free quotas in the Console only (C8) |
| 3. Measurement | `c_fill,g_auto,w_800,h_600/e_extract:prompt_(litter;garbage;plastic waste;floating waste);multiple_true;mode_mask/f_png`; pixel share counted in `lib/measure/cover.ts` | VERIFIED syntax and cost (75 transformations, not in Asia Pacific); mask polarity UNVERIFIED (C3) |
| 4. Privacy | `e_blur_faces` on every public derivative and on each layer; signed URLs (`delivery_url_signatures`); Strict Transformations | VERIFIED; on-the-fly for authenticated assets UNVERIFIED (C1) with fallbacks |
| 5. Provenance | Composites with `l_authenticated:` + `fl_layer_apply`; proof strip with `l_text` + a public QR image layer; structured metadata `project_id`, `trust_score`, `trust_band`, `captured_at` (`image_upload_api_reference_metadata`); `moderation_status` from reviews (Admin API); raw authenticated PDFs | VERIFIED; raw authenticated delivery UNVERIFIED (C4), Download API fallback |

`pnpm cld:setup` creates the metadata fields and the signed preset `saakshi_evidence`.
`pnpm services:check` checks each job live.

## 10. Verification

| Claim | Command |
|---|---|
| Tests, lint, types, build | `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm build` |
| No secrets in browser bundles | `pnpm check:bundle` (builds with canary secrets, scans `.next/static`) |
| Demo data, bands, planted results, chains | `pnpm demo:reset` (offline) |
| Every pair candidate and why it failed | `pnpm measure:pairs [slug]` |
| Re-measure with the configured providers | `pnpm demo:remeasure [--all] [--reanalyze]` |
| Production env readiness | `pnpm verify:env --prod` |
| Cloudinary account setup | `pnpm cld:setup --dry-run`, then `pnpm cld:setup` |
| Every real call, live | `pnpm services:check [--no-extract] [--full]` |
| Tamper → 401 | `GET /api/demo/tamper` on the dev server |
| Audit chains | `GET /api/audit/verify` (all chains, or `?assetId=`) |
| Test counts per phase | `git worktree add ../wt <commit>`, `pnpm install --offline`, `pnpm exec vitest run` (the commits in section 2) |
| Design parity | `pnpm design:capture`, `pnpm parity:capture <route> --name <page>`, `pnpm parity:report` → `design/parity/report.html` |

Test suites that guard the rules:
- `trust-*` (engine, stamps, DB write-back);
- `measure-*` (cover fixtures, pairing cases, DB);
- `dates`, `claims`, `provenance`;
- `report` (production mode renders no mock-derived number);
- `contracts` (every outgoing request);
- `bundle-secrets`, `ops`, `pdf-fonts`, `transform` (SDK parity), `capture` (tickets, tokens).

## 11. Known limitations

- **Real services not yet exercised.** Every AI output, analysis and mask is mock-derived. The real providers are contract-tested offline only. Fourteen items are UNVERIFIED (docs/external-apis.md), each with a fallback and a doctor check.
- **Mock masks are colour-index proxies.** They also flag sky, clothing and signs. The measured values in sections 7 and docs/measure.md are placeholders until `pnpm demo:remeasure` runs on real masks.
- **The hero pair is not the clean-up day.** Tiruppur's clean-up photos span six minutes, so its only pair is two 2020 check-ins five days apart. Hyderabad has no pair.
- **The mock blurs the whole image** when a photo "has faces" (no face detection), and face counts come from words.
- **Different pHash algorithms:** the mock uses our DCT pHash, and real mode uses Cloudinary's. They are consistent within one deployment, not across.
- **Search** is full-text in mock mode (hashed embeddings aren't semantic). Semantic ranking needs the real embedding model.
- **The PDF text layer of Indic runs isn't searchable:** the glyphs render correctly, but copied text is garbled.
- **Witness Capture has not been tested on a real phone yet** (headless Chrome with a fake camera only). This is MANUAL_STEPS step 7.
- **No user accounts.** Demo mode lets anyone review (rate-limited, labelled, reverted by reset). Admin actions need `DEMO_ADMIN_SECRET` in production.
- **Local PGlite is single-process:** scripts can't run while `pnpm dev` does.
- **Design not applied yet.** The UI is functional shadcn; Phase 8 builds the exports 1:1. Parity scores are pixel differences, which timing-based animations make approximate.
- **Wikimedia etiquette:** no contact email or repo URL is set yet, so the User-Agent is anonymous until someone sets one (MANUAL_STEPS step 0).

## 12. Pending manual steps and next work

Manual steps (accounts, keys, console settings, deploy, phone test):
[docs/MANUAL_STEPS.md](docs/MANUAL_STEPS.md).

Next:
- **Phase 8.** Build the design exports 1:1, checked with `design:capture` / `parity:capture` / `parity:report`.
- **Phase 9.** Manual setup (MANUAL_STEPS).
- **Phase 10.** Run `pnpm services:check` with real keys and fix what fails: first the UNVERIFIED items C1–C7 (via the switches in docs/providers.md). Then:
  - `pnpm demo:reset --online` and `pnpm demo:remeasure` on real masks;
  - check one mask's polarity (C3);
  - choose the final `DEMO_HERO`;
  - phone-test `/capture` on the production URL.

---

## Journal

Newest last. After every phase or fix: what changed, why, the evidence, any new issue.

- **2026-09-28, Phase 7.** See section 5 ("Phase 7") and issue log F. Evidence:
  - `pnpm test`: 403 passing, in 34 files (one earlier run had 1 unexplained failure that four reruns didn't reproduce; issue log F);
  - lint, typecheck and build clean;
  - `pnpm check:bundle`: 32 browser files, no secrets;
  - `pnpm demo:reset` and `pnpm measure:pairs` as in section 7;
  - `pnpm run doctor` (no keys) lists the missing variables;
  - `pnpm cld:setup --dry-run` prints 4 field creations and 1 preset creation;
  - `pnpm verify:env --prod`: 10 errors, 2 warnings without keys, as expected;
  - `pnpm design:capture`: 16 exports.

- **2026-09-28, Phase 8 Part A (fixes from Phase 7).**
  - `pnpm doctor` → **`pnpm services:check`**. pnpm's built-in `doctor` shadowed the script; `pnpm run doctor` stays as an alias, and the docs are updated (`33022a2`).
  - **Flaky test fixed** by sizing Vitest workers by memory (issue F-flake; `a996df3`).
  - **Spot trend chart:** an adaptive time axis (`lib/charts/time-axis.ts`, pure, 9 tests, `97d9099`).
    - Runs split at gaps over a quarter of the range and over a day, and a labelled break ("2.6 years later") separates them.
    - Each run gets ticks in its own unit (minutes to years) in the site's time zone (IST).
    - Hover shows the full date and time, or "(date only)" for coarse captures.
    - Tiruppur spot 1 (six minutes) now reads 18:16 / 18:18 / 18:20 instead of "Sep 2017" at every tick.
  - **Showcase selection** (`lib/showcase.ts`, 4 tests). One-project chapters use `DEMO_HERO`. The measurement chapter takes the best measured pair across projects: primary metric, |delta| ≥ 5, highest confidence then |delta|, and never a mock pair in production. It is labelled with its own project.
    - With today's mock data that is Pimpri-Chinchwad's green-cover pair (−44.5 points, confidence 0.4). The hero's +3.6 is under 5.
  - **Playwright browsers:** Chromium 153, Firefox 155 and WebKit 26.6 launch; ffmpeg-1011 is installed.
  - Tests: 416 passing.

- **2026-09-28, Phase 8 Part B (inventory) and Part C, first page (landing).**
  - **Inventory** (`2586eef`): `design/INVENTORY.md` has 1,859 items (181 hand-checked, 1,678 extracted). Counts per type, P0/P1:
    layout 147/5, copy 566/13, token 16/0, effect 232/6, interaction 128/6, state 65/0, asset 96/0, data 578/1.
    Ids are now stable (`design/inventory.ids.json`), because code comments cite them.
  - **Reference capture (B3):** `pnpm design:capture --no-video` captured 16 pages in 154 variant×width runs and 804 frames, in 772.7 s, with no failed variant. The runs cover every demo state, theme and screen of the app, every capture state, the Witness Wall arrival on the fake clock (1920×1080 too), and the landing's full, low-power and reduced modes.
  - **Tokens and fonts** (`ad9218a`, `9e4e0ea`):
    - `app/tokens.css` is generated from the handoff's `SK.tokens` (`pnpm design:tokens`), with `--l-*`, `--d-*` and `--n-*` aliases for one mode's colour used inside another.
    - Colour reconciliation keeps a prototype colour exact when ΔE ≥ 2.3 from every token, or when it is a tint (chroma ≥ 0.012) that a token would shift by more than 45° in hue. The rule is in `lib/color/oklch.ts reconcile`, with tests.
    - Of 46 hex colours, 29 become tokens and 17 extra variables. Canvas and GL colours live in the scene constants.
    - 46 @font-face rules and 34 OFL woff2 files are self-hosted (wdth axis kept; B5.14).
  - **Port tooling:**
    - `pnpm design:port` converts a template to JSX, mapping each colour, font and radius to a variable.
    - `parity:capture --preset <page> [--fixture]` captures the design's states on our routes.
    - `parity:report` gives pixelmatch per step with diff images; the gate is 1.5%.
    - `parity:boxes` compares bounding boxes with the export (±2 px at 1440, ±1 px at 390).
    - `parity:inspect` looks into a report.
    - Design resources are served only by `/dev/parity/asset/*`. `tests/design-boundary.test.ts` fails if anything outside `app/dev` imports a fixture (B5.3).
  - **Landing** (`7179cdf`):
    - The markup was ported through `design:port`.
    - `landing_gl.js` became `lib/scenes/landing-stage.ts` (three 0.168.0, near-verbatim, the prototype's seeds). `drawLayers` became `lib/scenes/layers.ts`, and `setup()` became `lib/scenes/landing-dom.ts` (GSAP 3.12.5, ScrollTrigger scrub, Lenis 1.1.14, `gsap.context` cleanup). The constants are in `lib/motion/scenes/landing.ts`, one comment per inventory id.
    - Data comes from `lib/landing/view.ts`:
      - the hero photo is the hero project's best verified, located, measured photo;
      - chapter 3 shows the four planted fakes, titled by the rule that caught them;
      - chapter 4 shows the showcase pair, and chapter 5 the hero project's SQL counts;
      - chapter 6 shows the real signed link as chips, with every removal checked server-side (`/api/demo/tamper?chips=`, B5.6);
      - chapter 8 runs `/api/demo/try` (B5.7), and chapter 9 shows `/api/live` arrivals (B5.8);
      - chapter 10 shows our own compiled transforms (B5.5);
      - the credits cover every photo on the page (C17).
    - Production withholds mock-derived numbers. `DEMO_PREVIEW=1` shows them, badged "Prototype measurement".
    - **Parity on `/dev/parity/saakshi-landing`** (the design's own sample data):
      - pixelmatch mean 0.0% in all six variant×width runs (full, low-power, reduced × 1440, 390);
      - worst step 0.1% (full at 1440), 0.6% (full at 390), 0.1% and 0.6% (low-power), 0.0% (reduced);
      - bounding boxes: 144 compared at each width, 0 over tolerance.
  - **New issue G1 (found and fixed):** Tailwind's preflight changed the prototypes' layout.
    - The prototypes run on browser defaults, where `max-width` bounds the content box, and they inherit `line-height: normal`.
    - Under preflight the hero headline wrapped and chapters 3–5 were offset by 13 px, giving 4.4% mean and 12.3% worst at 1440.
    - `.design-root` in `app/globals.css` now reverts every element inside a ported page to the browser's styles. SVG is excluded, so its presentation attributes survive, apart from `display`. The design's own globals are then re-applied.
  - **New issue G2 (found and fixed):** the stage's first frame projected points before `renderer.render` had set the camera's world-inverse matrix. SVG leader lines got `Infinity`, 20 console errors. The prototype has the same first-frame error; `cam.updateMatrixWorld()` after positioning fixes it.
  - Tests: 462 passing in 43 files; lint and typecheck clean.

- **2026-10-01, Phase 8 Part C: Witness Wall, How it works, demo entry, evidence and spot pages.** Parity is from `pnpm parity:report` on the `/dev/parity/<page>` fixtures, which use the design's own data.
  - **Witness Wall** (`9073712`), `/witness`:
    - The 1920×1080 stage is ported: drift loop, arrival, ripples, queue, reduced motion and "Reconnecting".
    - Arrivals are real (`/api/live`, with place and first reason), and the counters are refetched from SQL. Rehearsals run only with `?operator=` (B5.8).
    - The map plane keeps equal px per degree on B5.10's frame (lat 6–30, lng 68–92).
    - Parity: idle 0.2% at 1440, 0.1% at 390 and 0.2% at 1920. Arrival at 1920: 2.2% mean, worst 7.9% (open issue G5).
  - **How it works** (`117082f`):
    - The simulator runs our Trust Engine (`lib/trust/simulate.ts`, bands 45/75; B5.1).
    - The threshold demo is the prototype's colour heuristic (`lib/measure/demo-mask.ts`) on a real demo photo, labelled as such.
    - Pipeline stages show our real calls (B5.5).
    - Parity: 0% in all six variant×width runs; bounding boxes 0 over tolerance.
  - **Demo entry** (`349873e`), `/demo`:
    - The three role cards and their loops are ported.
    - Each card is bound to the demo projects: real place, time, score, SQL verified count, the planted fake outlined, and the latest report.
    - Parity: loops on the fake clock 1.3% mean (worst 3.5%); default 6.1% at 1440 and 1.8% at 390 (open issue G6).
  - **Evidence page** (`a44872f`), `/e/[assetId]`:
    - The layers viewer (`components/evidence-viewer.tsx`, shared with the drawer) is ported, with the proof strip, ledger, and fingerprint with the nearest photo in any project.
    - Edits are read off the real signed link (`lib/media/link-chips.ts`).
    - The audit timeline is recomputed in the browser with Web Crypto from `GET /api/audit/chain`, in `lib/hashchain.ts`'s canonical form (`lib/hashchain-web.ts`; B5.9).
    - Parity: 0% in all four runs (default and exploded × 1440, 390).
  - **Spot page**, `/spots/[slug]`, moved to `app/(designed)`:
    - Counters, the photo with its mask, the scrubber through every measured photo, the trend card, the latest check-ins and the fixed check-in bar (SP:319-387).
    - The trend keeps the design's look on the adaptive time axis (`lib/charts/trend-svg.ts`, A3). Breaks are drawn and labelled, ticks fall on round local times, and hovering a point shows its full date and time.
    - Photo labels come from stored facts only (`lib/measure/timeline.ts`): photos before the spot's baseline are "Earlier", then "Baseline" and "Later", and Witness check-ins are numbered. The AI's stage guess is never used.
    - B5.13: new column `spots.framing_note` (migration `0012`). Without a note the page shows "Stand where this photo was taken" with the baseline thumbnail.
    - The map of photo locations is kept below the design's sections.
    - Parity: 0.2% at 1440 and at 390, all of it in the trend chart, where the points sit by time (A3) instead of the design's index spacing.
    - Boxes with the new `parity:boxes --text`: 41 compared at each width, 1 over tolerance. That one is a key collision, not a layout difference: the prototype's runtime wraps each `{{ }}` in an inline element, so "Check-in 5" appears twice there.
    - Tests: `tests/spot-timeline.test.ts` (10) and a spot-page model test in `tests/measure-db.test.ts`.
  - **New issues:**
    - **G3 (fixed):** the landing listened with `onmessage`, so named `arrival` SSE events never reached it. It now uses `addEventListener("arrival")`.
    - **G4 (fixed):** the Wall's idle reference was contaminated by the prototype's autoSimulate. It is now captured on the fake clock, with triggers aligned to 16 ms frames and a MessageChannel flush before each frame.
    - **G5 (open):** Wall arrival frames vary by frame phase between runs (2.2% mean).
    - **G6 (open):** the demo entry's `default` variant is a scroll capture with the loops running in real time (6.1%). The fake-clock `loops` variant is the comparable run.
    - **G7 (fixed):** the spot map's Leaflet panes (z-index 400+) painted over the fixed bar; the map now isolates its stacking context. The product's masks are greyscale, so the page reads them by luminance; the prototype's are alpha.

- **2026-10-02, Phase 8 Part C: report page** (`/r/[reportId]`, moved to `app/(designed)`; the `(public)` group is gone).
  - Port of RP:350-399:
    - every number is a button keyed by its claim id;
    - hover, focus or tap draws threads to the photos it was counted from (RP:436-460, two paths per tile, a 600 ms dash draw), and the other tiles fade to 0.3;
    - then the flagged photos with the rule that caught them, and the Method.
  - Below the design: the summary prose (its numbers are claim buttons too, with the same threads) and the campaign kit.
  - **Data:**
    - Numbers are the report's SQL claims only (`lib/report/numbers.ts`, pure). The design's "litter cover before" and "after" become our median change claim; nothing is invented.
    - Tiles are every photo behind a shown number, in capture order. Flag reasons come from `flagTitle(decisiveReason(...))`.
    - The Method is built from `defaultTrustConfig` (Verified 75, Needs review 45; B5.1) and `MASK_THRESHOLD`.
    - "Download PDF" opens `/api/reports/<id>/pdf` (D-1086), with `window.print()` as the fallback.
    - Number buttons keep `id="claim-<id>"`, because the PDF links each number there.
  - **Fix in `lib/claims.ts`:** units read singular for exactly 1 ("1 spots" → "1 spot"), through an explicit map. It has a test (Rule 7).
  - **Parity** on `/dev/parity/report-page`: pixelmatch 0% in all four runs (default and hover-verified × 1440, 390). `parity:boxes --text` compared 76 boxes at each width, 0 over tolerance.
  - Tests: `tests/report-numbers.test.ts` (7) and a report-page model test in `tests/report.test.ts`. `pnpm test`: 498 passing in 48 files; lint and typecheck clean.
  - The inventory's component paths now point at `app/(designed)` and `components/witness/wall.tsx` (`pnpm design:inventory`: 1,859 items, ids unchanged).

- **2026-10-02, Phase 8 Part C: QR poster** (`/spots/[slug]/poster`).
  - Port of QP:422-449 (`components/poster/qr-poster.tsx`): one A4 sheet sized in container units.
  - On screen it sits on the prototype's `<doc-page>` desk: 48 × 24 px padding, `--desk`, a 210 mm card with a 7 px radius and its shadow. In print it is one full-bleed A4 page. A PDF from Chromium at 390 px is 1 page, MediaBox 595 × 842 pt.
  - The sheet is always light (paper).
  - **QR** at level Q (D-1157; `qrSvg` gained a `level` option). It encodes a new short link, `/s/<first 8 hex of the spot id>` (`lib/short-link.ts`, `app/s/[code]/route.ts`, 307 to the spot page; unknown or ambiguous codes give 404). The design prints and encodes a short URL; this one is real and keeps the QR small.
  - **Step 2 (B5.13):** from `spots.framing_note`; without a note, "Stand where this photo was taken" with the baseline thumbnail. Step 3 is worded by project type.
  - **New issue G8 (found and fixed):** two styles the prototype gets from outside its markup.
    - Its print shell injects `h1–h6 { text-wrap: balance }` and `p, li { text-wrap: pretty }` document-wide. Without them the headline broke "Be a witness at this / spot."
    - A ported root inherits the app body's `font-variant-numeric: tabular-nums` and `text-rendering`, because `.design-root`'s `all: revert` leaves inherited properties inheriting. A tabular "1." widened the step titles by 6 px.
    - The poster sets the shell's defaults and resets those inherited properties. The other ported pages set tabular-nums themselves, as their designs do.
  - **Parity** on `/dev/parity/qr-poster`: 0% at 1440 and 0.1% at 390. The 390 remainder is the logo: the prototype's own 390 capture shows a broken image there. Boxes `--text`: 15 compared at each width, 0 over tolerance.
  - Tests: `tests/short-link.test.ts` (2) and a poster model test in `tests/measure-db.test.ts`. `pnpm test`: 501 passing in 49 files; lint and typecheck clean.
