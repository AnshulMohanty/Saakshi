# Design

design exports and the tooling that checks the app against them.

| Folder | What goes in it | In git |
| --- | --- | --- |
| `export/` | The design exports, **file names kept as exported** (`Saakshi Landing.html`, `Spot Page.html`, …). The parity record, inventory and tokens in this folder were made from them | no (kept with the team) |
| `handoff/` | Handoff notes: specs, tokens, decisions, anything a designer tells us | yes |
| `reference/` | `pnpm design:capture` output: `<page>/<width>/<step>.png`, `<page>/manifest.json`, `<page>/video.webm` | no (regenerate) |
| `actual/` | `pnpm parity:capture <route>` output, same layout | no |
| `parity/` | `pnpm parity:report` output: `report.html`, `summary.json` | no |
| `parity.json` | Optional map from design page to app capture: `{ "pairs": [{ "design": "saakshi-landing", "actual": "index" }] }` | yes |

## Workflow

1. Drop new exports into `export/`. Keep the names: page slugs come from them ("Saakshi Landing.html" → `saakshi-landing`).
2. `pnpm design:capture` (or `--page landing` for one; `--no-video` to skip video) captures the reference.
3. Start the app (`pnpm dev`), then `pnpm parity:capture / --name saakshi-landing` for each route.
4. `pnpm parity:report` → open `design/parity/report.html`.

## How the capture works (scripts/_capture.ts)

- Viewports **1440×900** (desktop) and **390×844** (phone, touch).
- Waits for `document.fonts.ready` and network idle. If the page has a `<canvas>`, it also waits for WebGL: 60 animation frames plus 1.5 s.
- Visits the bottom once, so lazy sections load and GSAP pin-spacers reach their final size.
- Scrolls the page, or, in app shells where the document doesn't scroll, the largest scrollable element (at least half the viewport tall).
- Steps every **half viewport**, plus start/¼/½/¾/end of every **pinned section** (`.pin-spacer`, or a `position: sticky` element inside a tall parent). Near-duplicate positions (under 24 px apart) are merged. At most 160 steps.
- Per step: `scrollTo`, two frames, 350 ms for scroll-driven animations, then a viewport screenshot.
- A short **video** per page at desktop width, scrolled with the mouse wheel for at most 20 s. It needs `npx playwright install ffmpeg` once; without ffmpeg the video is skipped and the manifest says why.
- Browser: the installed **Microsoft Edge** (`channel: "msedge"`), else Chrome, else Playwright's Chromium. Override with `PLAYWRIGHT_CHANNEL`.

With `export/` empty (or with `--fixture`), `design:capture` captures `tests/fixtures/design/fixture.html` (a WebGL canvas and a pinned section), so the tooling can always be checked.
