# Before/after measurement

> Measured on photo pixels. Camera angle, framing, season and light affect the result.

This caveat appears on every comparison card, spot trend and report.

## Pairing (`lib/measure/pairing.ts`, pure)

A pair is two photos that are:

- in the same project and at the same spot, with **both photos inside the spot radius**: the
  spot's own radius, capped at **30 m**, or at **150 m** for projects labelled "approximate
  location" (demo archive projects with Commons GPS, and the indoor live stage);
- in time order, with a gap of at least the project's `min_pair_gap_hours` (cleanup/water 0.5,
  plantation 336, school 168, other 24; the live-stage project uses 0);
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

**Composite** (`lib/media/composite.ts`). The side-by-side is a single signed Transform on the
before photo. Each half is filled into the same frame and face-blurred, and the after photo is an
`l_authenticated:` layer with its own `e_blur_faces`. Date labels are text layers, delivered with
`f_auto,q_auto`. The Transform is stored with the comparison (`composite_transforms`).

## Pages

- `/projects/[id|slug]`: a comparison card per pair, with the slider, a "Show what was measured"
  toggle (the mask, tinted), values, delta, a method badge, confidence, the caveat and evidence
  links.
- `/spots/[slug]` (public): map with the radius, the trend (every measured photo at the spot,
  on a time axis), baseline, latest photos and a check-in link to `/capture?spot=<slug>`.
- `/spots/[slug]/poster`: one A4 sheet (210 × 297 mm, fixed size, overflow hidden) with a large QR
  code to the spot page, the spot name, the clean-up (or planting) date and one line of
  instructions. Headless Edge prints it as a single page with a MediaBox of 595 × 842 pt.

## Demo results (`pnpm demo:reset`, then `pnpm measure:pairs`)

| Project | Candidates | Pairs | Why the others failed |
|---|---|---|---|
| River clean-up, Tiruppur North (hero) | 190 | 1: 5 Sep 2017 → 30 Mar 2020, litter cover 0.1% → 6.0% | 168 `gap_too_short` (the 2017 photos span 6 minutes, 18:15–18:21 IST, under the 0.5 h cleanup gap), 3 `same_time`; 19 valid pairs all share the single 2020 photo, so only one can be used |
| Tree planting, Pimpri-Chinchwad | 190 | 1: 27 Nov 2020 → 20 Jan 2022, green cover 3.6% → 32.5% (ExG 8.8% → 54.1%, low confidence) | 171 `gap_too_short` (November 2020 photos are under 14 days apart); 19 valid pairs all share the 2022 photo |
| Lake clean-up, Hyderabad | 31 | 0 | 31 `gap_too_short`: every photo has the same timestamp |

The hero's only pair is a revisit 2.5 years later, not the cleanup day itself, because the
Commons photos of that day were taken within six minutes. The pairing is reported as it is rather
than loosened. The Pimpri-Chinchwad spot has a trend of 20 measured photos on 5 days over 14 months. The
Tiruppur spot also has 20, but on only 2 days (19 fall within six minutes). The live-stage project
(`pnpm demo:stage`, 0 h gap) produces a same-table before/after within minutes.
