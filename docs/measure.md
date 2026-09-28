# Before/after measurement

> Measured on photo pixels. Camera angle, framing, season and light affect the result.

This caveat appears on every comparison card, spot trend and report.

## Pairing (`lib/measure/pairing.ts`, pure)

A pair is two photos that are:

- in the same project and at the same spot, with **both photos inside the spot radius**: the
  spot's own radius, capped at **30 m**, or at **150 m** for projects labelled "approximate
  location" (demo archive projects with Commons GPS, and the indoor live stage);
- in time order, with a gap of at least the project's `min_pair_gap_hours` (cleanup/water 0.5,
  plantation 336, school 168, other 24; the live-stage project uses 0). The gap respects
  `captured_at_precision`: two day-precision photos on the same day have an **unknown gap** and
  never pair (`gap_unknown`); interval math applies when either side is day precision or coarser;
  with both times sub-day the point gap is used (docs/trust.md);
- not FLAGGED (unless a reviewer approved the photo) and not rejected.

Among valid pairs, ranking goes by stage hints (before → after scores 3, one hint 2, none 1,
contradictory 0), then the distance between the two photos, then pHash distance (same framing),
then embedding similarity.
Selection is greedy per spot, with up to 3 pairs per spot and each photo used once. **The rules are
never relaxed to produce a pair.** `pnpm measure:pairs [slug]` re-pairs every project and prints
every candidate with the reason each reject failed.

`POST /api/comparisons` supports three modes:

- `auto` re-pairs a project and drops auto pairs that are no longer chosen;
- `manual` measures a pair a person picked, which must still pass every rule, otherwise it
  returns 422 with the reasons;
- `remeasure` computes the pair again from fresh masks.

## Measuring (`lib/measure/measure.ts`, `cover.ts`)

Both photos are measured on the **same frame**: `c_fill,g_auto,w_800,h_600`. A mask and the view
the slider shows are the same crop, so the tinted mask lines up with the photo.

| Project | Primary (measured) | Secondary |
|---|---|---|
| cleanup, water | Litter cover: % of the mask from `e_extract:prompt_(litter;garbage;plastic waste;floating waste);multiple_true;mode_mask`, pixels > 128 | Items visible: the vision model's counts (`ai_estimated`, with confidence) |
| plantation | Green cover: mask from `prompt_(trees;plants;grass)` | Green cover from the ExG index (2g − r − b > 0.05 at 256 px); more than 15 points from the mask gives **low confidence** |

Measurements are cached forever in `measurements`, keyed by (asset, metric, frame). A photo's mask
for a given frame and prompt never changes, and Cloudinary caches the derived mask too. The
pipeline's `measure` step measures every eligible spot photo, up to `MEASURE_MAX_PER_PROJECT`
per project (default 40), to feed the spot's trend. Pairs are always measured.

**Check-ins.** A spot's baseline is its best "after" photo: eligible photos only, with stage
"after" first, then the highest trust score, then the latest; with no "after" photo, the latest
eligible one. Check-ins never replace an existing baseline. A Witness check-in at a spot is
compared with the baseline in the `measure` step, under the same pairing rules, and stored as a
`checkin` comparison. On the live stage, the first photo (the littered table) becomes the
baseline, and the second (cleaned, minutes later) is measured against it.

**Composite** (`lib/media/composite.ts`, built by `MediaProvider.composite()`). By default
(`CLD_COMPOSITE_MODE=layer`) the side-by-side is a single signed Transform on the before photo:

- each half is filled into the same frame and face-blurred;
- the after photo is an `l_authenticated:` layer (documented, as long as the whole URL is signed);
- the layer's `e_blur_faces` sits in its own component before `fl_layer_apply`, because effects
  aren't allowed inside `l_`;
- date labels are text layers, delivered with `f_auto,q_auto`.

With `CLD_COMPOSITE_MODE=server`, the two face-blurred halves are joined with sharp and uploaded
as their own authenticated asset (`saakshi/composites/<hash>`, stored as
`detail.compositePublicId`), with the labels as an eager transformation. The Transform is stored
with the comparison (`composite_transforms`).

**Provenance.** Every measurement and comparison stores `provider_mode` (mock or real) and the
provider. Where the numbers appear:

| Where | Development | Production |
|---|---|---|
| comparison cards, spot trends, reports, claims, the Instagram kit, `/api/stats` | mock-derived numbers get a "Mock output" tag | mock-derived numbers are hidden ("Not available: computed with mock providers") |
| AI estimates below `AI_MIN_CONFIDENCE` (0.5) | "Not enough confidence to estimate" | "Not enough confidence to estimate" |

`pnpm demo:remeasure` measures again with whatever providers are configured.

## Pages

- `/projects/[id|slug]`: a comparison card per pair, with the slider, a "Show what was measured"
  toggle (the mask, tinted), values, delta, a method badge, confidence, the caveat and evidence
  links.
- `/spots/[slug]` (public): map with the radius, the trend (every measured photo at the spot,
  on a time axis), baseline, latest photos and a check-in link to `/capture?spot=<slug>`.
- `/spots/[slug]/poster`: one A4 sheet (210 × 297 mm, fixed size, overflow hidden) with a large QR
  code to the spot page, the spot name, the clean-up (or planting) date and one line of
  instructions. Headless Edge prints it as a single page with a MediaBox of 595 × 842 pt.

## Demo results (`pnpm demo:reset`, then `pnpm measure:pairs`, 2026-09-28, mock masks)

| Project | Candidates | Pairs (mock masks) | Why the others failed |
|---|---|---|---|
| River clean-up, Tiruppur North (hero) | 211 | 1: 30 Mar 2020 → 4 Apr 2020 (both check-ins at spot 1, 0 m apart, 118 h), litter cover 6 → 9.6 (+3.6); items 28 → 23, AI estimate at 0.38 confidence, so shown as "Not enough confidence to estimate" | 206 `gap_too_short`, 4 `same_time`. The 5 Sep 2017 clean-up photos span 6 minutes (12:45–12:51 UTC), under the 0.5 h gap. Left out: 2 not at a spot, 1 no time, 1 no location, 3 flagged (planted) |
| Tree planting, Pimpri-Chinchwad | 99 | 2: 20 Nov 2020 → 7 Dec 2020, green cover 50.6 → 6.1 (ExG 69.5 → 29.3); 8 Sep 2021 → 20 Jan 2022, green cover 38.1 → 32.5 (ExG 51.6 → 54.1). Both low confidence (0.4): the mask and ExG disagree | 66 `gap_too_short` (under 14 days) |
| Lake clean-up, Hyderabad | 23 | 0 | 22 `gap_too_short`, 1 `same_time`. The photos have distinct second-precision EXIF times, all within ten minutes (05:58–06:08 UTC), so the precision fix correctly changes nothing here |

The hero's event window is now the clean-up (29 Aug – 12 Sep 2017), so the 2020 photos count as
monitoring check-ins. The only valid pair is two check-ins five days apart, not the clean-up day
itself, because the Commons photos of that day were taken within six minutes. The pairing is
reported as it is rather than loosened. With mock masks these values are placeholders: Phase 10
re-measures with real `e_extract` masks (`pnpm demo:remeasure`) before the hero is final
(`DEMO_HERO`).

Spot trends (measured photos per spot):

| Spot | Points |
|---|---|
| Tiruppur spot 1 | 21 |
| Tiruppur spot 2 | 2 |
| Pimpri-Chinchwad spot 1 | 13 |
| Pimpri-Chinchwad spot 2 | 7 |
| Hyderabad spots 1–4 | 5, 4, 4, 2 |

The live-stage project (`pnpm demo:stage`, 0 h gap) produces a same-table before/after within
minutes.
