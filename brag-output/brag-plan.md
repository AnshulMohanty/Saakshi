# Saakshi: launch film plan (/brag-slim)

Built with the /brag-slim workflow (this model runs the slim variant), with the Phase 8 direction in place of its 15–25 s default: a documentary launch film of 60–90 s, real footage only.

## The questions

- **What is it?** Saakshi (साक्षी, "witness") turns field photos from NGOs and community groups into verified, measured, traceable proof of impact.
- **Who is it for?** Clean-up drives and the funders, CSR teams and city partners who pay for them. It replaces "trust us, here are photos" with a report where every number opens the photos behind it.
- **What sets it apart?** The trust score comes from fixed, published rules, not a model. Measurements come from mask pixels. Faces stay blurred on signed links that can't be edited.
- **Most impressive claim:** edit a public photo link to remove the blur and the server refuses it.
- **Visual hook:** one field photo taken apart into its evidence layers (where, when, fingerprint, what the AI sees, what was measured), then sealed with its score.
- **Real UI to show:** the landing's chapters (all live), the Witness Wall, capture on a phone, review, the public report.
- **Tone:** documentary launch film: real field photos and the real product, quiet confidence, one idea per shot, cuts on the beat.
- **Share caption:** see share-copy.txt.

## Direction

- Real footage only. Every clip is recorded from the production build in preview mode (`DEMO_PREVIEW=1`), frame-stepped (`pnpm video:record`, video/preview/footage/manifest.json).
- No stock footage, no AI-generated images, no invented numbers or testimonials. Captions carry no number that isn't on screen.
- Captions in sentence case, in Anek Latin (lines) and IBM Plex Sans (kickers), the app's own fonts.
- Voiceover off. Music: "Happy Beats / Business Moves, Vol. 11" (ende.app), bundled with brag; cuts land on its beat grid (114.84 BPM, first beat 1.60 s).
- The end card says what is real and what is a prototype.

## Storyboard (87.6 s, the track's length)

| # | Beats | Shot (footage) | Caption |
|---|---|---|---|
| 1 | 3 | intro: first visit, the ink-drop intro, then the hero still | (none) |
| 2 | 16 | hero-layers: the photo taken apart into its layers, then sealed | "A field photo arrives." / "It reads where and when it was taken, what is in it, and its fingerprint." |
| 3 | 14 | chaos-to-order: the archive flies onto the map, stacks by project | "Every photo in the archive finds its place and its project." |
| 4 | 20 | the-catch: four planted fakes, each with its reason; the fingerprint diff | "Some photos aren't what they claim." / "Each one is caught by a fixed rule, with its reason." |
| 5 | 14 | measured: the mask sweeps before and after | "Change is measured from the pixels, before and after." |
| 6 | 14 | threads: a report number draws its threads | "Every number has a thread to its photos." |
| 7 | 12 | report: the public report's numbers | "Reports a funder can check, number by number." |
| 8 | 12 | edited-link: signature removed, the server answers 401 | "Faces stay blurred. Edit the link and the server refuses it." |
| 9 | 16 | capture: the phone at the spot, HUD, shutter, pipeline sheet | "Be a witness: stand at the spot and take the photo." |
| 10 | 16 | wall-arrival: the check-in lands on the Witness Wall (operator rehearsal, labelled) | "It lands on the Witness Wall with its score." |
| 11 | 8 | review-seal: a reviewer's note, approve, the seal | "A person settles what the rules can't." |
| 12 | to the end | end card | "Proof, not just photos." + the preview note |

Story beats from the brief: a field photo arrives → Saakshi reads it → fakes get caught → change gets measured → every number has a thread → faces stay blurred even if you edit the link → be a witness → "Proof, not just photos."

## Build

`pnpm video:record` (footage) → `pnpm video:render` (cards in Chromium, cuts and mix in ffmpeg) → video/preview/saakshi-launch-preview.mp4, with the poster (a settled frame of the catch) baked in as frame 0. `pnpm video:final` does both from a fresh production build.
