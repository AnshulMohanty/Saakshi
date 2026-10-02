# Final stage handoff (Phase 8, then the push)

A working note for resuming without any prior context. Written 2026-10-01, when work was stopped
on request in the middle of the report page port. It is not part of the product: keep it out of
the pushed history unless the user says otherwise.

---

## 0. Read these first, in this order

1. **This file.**
2. `docs/planning/phase-8-prompt.md`: the full Phase 8 brief, verbatim, with the machine note appended. It is the source of truth for scope and the definition of done.
3. `CLAUDE.md` and `AGENTS.md`: project rules. Next 16 is not the Next.js you know; read `node_modules/next/dist/docs/` before using a new API.
4. `ENGINEERING.md`, section **Journal** (end of the file): what was done and the evidence, newest last. The latest entry covers the Witness Wall, How it works, Demo entry, Evidence and Spot pages, plus issues G3–G7.
5. `design/INVENTORY.md`:
   - checklist C01–C28 near the top;
   - B5 bindings (B5.1–B5.14);
   - one section per design page (`grep -n "^### " design/INVENTORY.md`), each listing items D-xxxx with a status column. **Every status is still `todo`**; updating them is pending work.
6. Memory notes:
   - `C:\Users\anshu\.claude\projects\d--Saakhi-CC06\memory\push-plan.md`
   - `C:\Users\anshu\.claude\projects\d--Saakhi-CC06\memory\low-memory-machine.md`

---

## 1. Standing constraints (from the user and the project)

- **Order:** Part A fixes → Part B inventory → Part C build to parity → Part D preview video. A and B are done; C is in progress; D has not started.
- **"Port, don't reinterpret."** Copy the design's markup and styles. Bind data to our DB; never ship the prototype's samples (B5.3, B5.4).
- **Secrets and accounts:**
  - "Do not ask me to create accounts or paste keys."
  - "Never put a secret behind NEXT_PUBLIC_."
  - From env files, list variable names only, never values.
- **Docs:**
  - Numbers in ENGINEERING.md, README and docs come only from real command output.
  - Anything that needs a human goes into `docs/MANUAL_STEPS.md`.
  - **After every phase or fix, append to the ENGINEERING.md Journal** what changed, why, the evidence and any new issue. The last issue id used is **G7**; the next new issue is **G8**.
- **Wikimedia User-Agent:** APP_CONTACT_EMAIL if set, else the repo URL. Never invent an email. The user's email may only identify them and is never sent to any service.
- **Machine note (verbatim):** "Machine note: Windows, 8 GB RAM, often under 1 GB free. Keep memory low: stop the dev server and any Playwright browsers before rendering; render one clip at a time with a single worker; stream frames to ffmpeg instead of keeping them in memory; if a render fails for memory, retry at 1280×720 and upscale only if that succeeds. Don't use Docker. Voiceover and music-generation tools aren't installed: keep voiceover off and use brag's bundled music (use /brag --full if /brag-slim needs extra tools)."
- **After Phase 8 ends, and not before** (user's words, mid-session): push to https://github.com/AnshulMohanty/Saakshi "without mention of claude, do from my acc (AnshulMohanty) … not at once but in phases explaining each", and "create a crazy visual and proper professional readme which impresses the judges … mindfully push after the previous prompt ends". Details are in §7.
- **Commit messages:** no co-author or tool attribution lines. The style is one long lowercase line, `area: what changed (evidence)`; see `git log`.

---

## 2. Repository state when work stopped

- **Branch:** `main`. The last commit is `985148c` (spot page). No remote is configured for pushing yet; see §7.
- **Uncommitted work: the report page port, nearly finished** (finish it first, §4.1):

  | Status | Path | What it is |
  |---|---|---|
  | `D` | `app/(public)/layout.tsx` | the `(public)` route group is gone |
  | `D` | `app/(public)/r/[reportId]/page.tsx` | the old report page |
  | new | `app/(designed)/r/[reportId]/page.tsx` | new route; uses `reportPageData` → `<ReportPage>` |
  | new | `components/report/report-page.tsx` | the client component |
  | new | `lib/report-page.ts` | server model |
  | new | `lib/report/numbers.ts` | pure: `numberCards`, `periodLabel`, `methodLines` |
  | new | `app/dev/parity/report-page/page.tsx` | fixture on the prototype's archive and numbers |
  | `M` | `scripts/parity-capture.ts` | `report-page` preset (default, hover-verified) |
  | `M` | `lib/claims.ts` | `formatClaimValue` reads units singular for exactly 1, via a `SINGULAR` map ("1 spots" → "1 spot") |
  | `M` | `tests/claims.test.ts` | a test for that change (Rule 7) |
  | `??` | `scripts/_look.ts` | untracked screenshot helper; **never commit it** |

- **A dev server may still be running** as a background task, writing to `C:\Users\anshu\AppData\Local\Temp\claude\d--Saakhi-CC06\da0fd8e6-a077-4b50-8a36-9c172069b51e\scratchpad\dev.log`. If port 3000 is busy, free it (§6).
- **Local dev DB (PGlite, `.data/pglite`):**
  - Migration `0012_spot_framing_note` is applied.
  - A report was generated for the hero project, `3b75bc04-df5e-5a9a-b80b-5067f9426ba2` (River clean-up, Tiruppur North), through `POST /api/reports {projectId}`. It is at `/r/1805487d-0e4f-479f-8adc-75192ba7a2cd`.
  - Demo spot slugs: `demo-hero-cleanup-spot-1` and `demo-hero-cleanup-spot-2`.
  - Project ids are UUIDv5 of the slug: `lib/demo/common.ts` `demoProjectId("demo-hero-cleanup")`.
- **Tests:** at the last full run (before the report work), `pnpm test` gave 489 passing in 47 files; lint and typecheck were clean. Since then, `tests/claims.test.ts`, `report.test.ts` and `pdf-fonts.test.ts` pass (27 tests), and typecheck is clean with the report files.

---

## 3. What is done (Phase 8)

### Part A (all done; see the Journal)
- `pnpm services:check`, with `pnpm run doctor` kept as an alias.
- The flaky test is fixed (workers sized by memory; issue F-flake).
- Spot trend adaptive time axis: `lib/charts/time-axis.ts`.
- Showcase selection: `lib/showcase.ts`.
- Playwright Chromium, Firefox and WebKit are installed, with ffmpeg-1011.

### Part B (done)
- `design/INVENTORY.md`: 1,859 items, stable ids in `design/inventory.ids.json`. Hand-written rows are in `design/inventory.manual.ts`; the generator is `scripts/design-inventory.ts`.
- Reference capture: `pnpm design:capture` → `design/reference/<page>/<variant>/<width>/NNN.png` plus `manifest.json` (16 exports, 804 frames).

### Part C: tokens, fonts and tooling (done)
- **Tokens and colours:**
  - `app/tokens.css` (generated: `pnpm design:tokens`) defines light, dark and night modes, with `--l-*`, `--d-*` and `--n-*` aliases.
  - Extra variables live in `app/globals.css`.
  - The colour rule is `lib/color/oklch.ts reconcile`: ΔE < 2.3 maps to a token; a tint is kept exact if the token would shift its hue by more than 45°.
- **Fonts:** self-hosted in `app/fonts.css` and `public/fonts/*`, with `app/font-preloads.ts` (B5.14).
- **`.design-root`** in `app/globals.css` restores browser defaults inside ported pages (`all: revert`, except SVG) and re-applies the design's `a` and `button` globals. Every ported page's root div has `className="design-root"`.
- **Parity tooling (scripts/):**
  - `pnpm design:port <page> --lines <a-b>`: template → JSX with token mapping. Copy its output, then bind the data.
  - `pnpm parity:capture --preset <page> --fixture --no-video [--variant id] [--width 1440]` → `design/actual/<page>/…`. Presets are in `scripts/parity-capture.ts preset()`.
  - `pnpm parity:report`: pixelmatch per step, gate 1.5% → `design/parity/report.html`.
  - `pnpm parity:boxes <page> <route> --width 1440|390 [--text]`: ±2 px at 1440, ±1 px at 390. `--text` (new) also pairs leaf text elements, climbing out of the prototype runtime's `{{ }}` wrappers.
  - `pnpm parity:inspect steps|strip|crop`, and `pnpm parity:motion` (Witness Wall only).
- **Fixtures:**
  - `app/dev/parity/<page>/page.tsx` renders the shared component with the design's own data.
  - Design images are served by `/dev/parity/asset/<page>/<uuid>`, through `lib/parity/archive.ts` (`designArchive(page)` and `designSrc(page)`).
  - `tests/design-boundary.test.ts` allows design data only under `app/dev`, `lib/parity`, `lib/*/fixture.ts` and `components/*/design.tsx` (B5.3).
- **Motion:** GSAP 3.12.5, ScrollTrigger, Lenis 1.1.14, three 0.168.0, motion 13.4.4. Modes come from `lib/motion/mode.ts` (reduced, low and full, with a `?motion=` override in dev).

### Part C: pages ported (commit, route, parity on the fixture)

| Page | Commit | Route | Parity |
|---|---|---|---|
| Landing | `7179cdf` | `/` | 0% mean in all 6 runs (full, low-power, reduced × 1440, 390); worst 0.6%; boxes 144/144 within tolerance |
| Witness Wall | `9073712` | `/witness`, `app/(stage)` | idle 0.1–0.2%; arrival at 1920 is 2.2% mean, worst 7.9% (**open G5**, frame-phase jitter) |
| How it works | `117082f` | `/how-it-works` | 0% in all 6 runs; boxes 0 over |
| Demo entry | `349873e` | `/demo` | loops on the fake clock 1.3% mean; default 6.1% at 1440 and 1.8% at 390 (**open G6**: a scroll capture with loops running in real time) |
| Evidence | `a44872f` | `/e/[assetId]`, `app/(designed)` | 0% in all 4 runs |
| Spot | `985148c` | `/spots/[slug]`, `app/(designed)` | 0.2% at 1440 and 390 (the trend chart places points by time, per A3); boxes `--text` 40/41, the one over being a key collision |
| **Report** | **uncommitted** | `/r/[reportId]`, `app/(designed)` | **0% in all 4 runs** (default and hover-verified × 1440, 390); boxes not run yet |

Details per page are in the Journal and the commit messages. Main modules:

- **Landing:** `lib/landing/{view,copy,types,fixture}.ts`, `lib/scenes/{landing-stage,landing-dom,layers}.ts`, `lib/motion/scenes/landing.ts`, `components/landing/*`.
- **Wall:** `lib/wall/{view,types,fixture}.ts`, `lib/scenes/witness-wall.ts`, `components/witness/wall.tsx`, `app/api/witness/today`.
- **How it works:** `components/how/*`, `lib/trust/simulate.ts`, `lib/measure/demo-mask.ts`, `lib/how/view.ts`.
- **Demo entry:** `components/demo/demo-entry.tsx`, `lib/demo-entry/view.ts`.
- **Evidence:** `components/evidence/evidence-page.tsx`, `components/evidence-viewer.tsx`, `lib/evidence-page.ts`, `lib/hashchain-web.ts`, `app/api/audit/chain`.
- **Spot:** `components/spot/{spot-page,spot-map}.tsx`, `lib/spot-page.ts`, `lib/measure/timeline.ts`, `lib/charts/trend-svg.ts`; `spotView` is extended in `lib/measure/views.ts`.
- **Shared:** `components/glyph.tsx` (with `lib/glyph.ts`), `components/trust-meter.tsx`, `lib/trust/labels.ts` (`ruleChips`, `ledgerRows`), `lib/qr.ts`, `lib/media/link-chips.ts`.

### B5 bindings
- **Done:** B5.1, B5.3, B5.4, B5.5, B5.6, B5.7, B5.8, B5.9, B5.10, B5.13 (`spots.framing_note`, migration `0012`, spot page fallback) and B5.14.
- **Not done:**
  - B5.2: browser pHash port for the capture preview.
  - B5.11: `?state=` and `?theme=` dev overrides for the app screens.
  - B5.12: IndexedDB offline capture queue.
  - B5.13 on the poster: instruction 2 from `framing_note`, falling back to "Stand where this photo was taken".

---

## 4. What is left, in order

### 4.1 Finish the report page (first thing)
1. **Tests:**
   - New `tests/report-numbers.test.ts` (pure `lib/report/numbers.ts`):
     - `numberCards`: design order; singular and plural labels; a hidden claim gives value "–" with the hidden text as its tag; a mock claim gets the tag "Mock output" (review tone); `ai_estimated` gets "AI estimate, confidence N%"; the change sign uses "−".
     - `periodLabel`: same day, same month ("14 to 27 Sep 2026"), same year, different years.
     - `methodLines`: values come from `defaultTrustConfig` (30, 20, 20, 15, 10, 5; Verified 75, Needs review 45); planted count in words ("Two fakes were planted"); the non-archive line.
   - A binding test for `reportPageData` in `tests/report.test.ts`, after `generateReport`:
     - numbers are keyed by claim id;
     - tiles carry the claim ids they support;
     - flags' reasons come from `flagTitle(decisiveReason(...))`;
     - production hides mock numbers (value "–") and shows no banner;
     - dev shows the banner.
2. Run `pnpm parity:boxes report-page /dev/parity/report-page --width 1440 --text`, then the same with `--width 390`.
3. Update `CLAUDE.md`'s folder conventions. The `(public)` group no longer exists: `/r/[reportId]` is in `app/(designed)`. Also update `scripts/design-inventory.ts` (route component path) and the inventory rows that point at `app/(public)/...`; regenerate if the script writes INVENTORY.md.
4. Run `pnpm lint`, `pnpm typecheck` and `pnpm test`.
5. Add a Journal entry with the parity numbers above, the claims singular-unit fix, and the `id="claim-<id>"` anchors kept on number buttons (the PDF links to `/r/<id>#claim-<id>`).
6. Commit, excluding `scripts/_look.ts`.

How the report page works:
- Number buttons are keyed by claim id (`data-num`, `id=claim-…`). Hover, focus or click sets `hi`, and `draw()` adds two SVG paths per linked tile in `#rp-threads`.
- Thread colours follow RP:442: flagged red, measured blue, else primary. Outlines follow RP:460.
- Tiles are every photo behind the shown claims, sorted by capture time.
- Below the design: Summary (prose with claim buttons) and the Campaign kit.
- "Download PDF" links to `/api/reports/<id>/pdf`, or falls back to `window.print()`.
- The fixture keeps the prototype's keys (`verified`, `flagged`, …) and its Method text, which reads "Verified at 80". The product uses our config (75/45).

### 4.2 QR poster: `/spots/[slug]/poster` (`app/(print)/spots/[slug]/poster/page.tsx` exists)
- Port `design/unpacked/qr-poster/template.html` (inventory section `qr-poster`, D-1156…D-1160 or so):
  - one A4 portrait sheet in cqw units;
  - h1 "Be a witness at this spot." plus a Hindi line in `var(--font-deva)`;
  - QR at error level Q, `#0F1320`, through `lib/qr.ts`, encoding APP_URL/spots/<slug>;
  - three steps; step 2 from `spots.framing_note` (B5.13 fallback);
  - footer with spot name, coords, short URL and the privacy line.
- Fixture `app/dev/parity/qr-poster`, preset `qr-poster` (design-capture variant `default`, mode `single`), then parity and a commit.

### 4.3 Capture: `/capture` (design `capture`)
- HUD, shutter, pipeline sheet, and six states: live-flow, permission-prompt, location-denied, low-accuracy, offline, done. Each state also has a `-screen` variant (the `#cam` element only) and there is a `shutter` timeline on the fake clock. See `scripts/design-capture.ts` `case "capture"`.
- The parity preset already uses `?state=<id>` (B5.11 must make that work in dev only).
- B5.2: browser pHash for the preview. B5.12: IndexedDB offline queue.

### 4.4 App shell and screens (design `saakshi-app`, about a 1,180-line template)
- Library with map, pins, clusters, search chips and bulk bar.
- Review queue with J/K/A/R keys; projects; studio.
- Evidence drawer with five tabs, sharing `EvidenceViewer`; ⌘K palette; DemoBanner.
- Light and dark themes; empty, loading, error and offline states.
- The parity preset already exists (`saakshi-app`): states × themes × screens, plus `palette`. It needs B5.11 `?state=` and `?theme=` dev overrides.
- C12: the project overview (KPI threads, mask sweep, spots table, flagged summary) is a checklist item. Find its design page via `grep -n "^### " design/INVENTORY.md`.
- Check every export is ported: `ls design/export`. The parity report said 11 design pages were unpaired before the report page.

### 4.5 Open parity issues
- **G5:** Wall arrival frame-phase jitter, 2.2% mean.
- **G6:** demo-entry `default` at 6.1%. Probably capture default on the fake clock in both design-capture and parity-capture, or accept it with a note, since the `loops` variant is the comparable run.

### 4.6 Verification and quality gates (none run yet)
- Computed-style parity and motion parity on more pages (`parity:motion` exists only for the wall).
- LCP ≤ 2.5 s; 60 fps on desktop and 30+ fps on mid-range Android; reduced-motion and low-power versions.
- three.js only on /, /witness and the evidence viewer.
- axe clean.
- Lighthouse: ≥ 85 performance and ≥ 95 accessibility on /, ≥ 90 on app pages.
- Chromium, WebKit, Firefox, plus Pixel 7 and iPhone 14 emulation.
- Update every INVENTORY.md status to `verified` or `verified-with-note`, and all 28 checklist items (21 P0 C01–C21, 7 P1 C22–C28).
- Commit the parity report (check `.gitignore` for `design/actual` and `design/parity`).

### 4.7 Part D: preview video (not started)
- Check Node, ffmpeg (Playwright's ffmpeg-1011 is installed) and hyperframes. Anything missing goes into `docs/MANUAL_STEPS.md`.
- `DEMO_PREVIEW=1` (`lib/config.ts`, default "0"): computed values badged "Prototype measurement", simulated values "AI reading pending".
- `scripts/video/record.ts`: frame-stepped recording streamed to ffmpeg → `video/preview/footage/`.
- A /brag launch film of 60–90 s (voiceover off, brag's bundled music; `/brag --full` if `/brag-slim` needs tools).
- A 3-minute walkthrough with `.srt` and a clean audio track.
- `video/preview/DESCRIPTION.md`; a `pnpm video:final` script.
- **Memory:** stop the dev server and Playwright first; one clip at a time; if a render fails, retry at 1280×720.

### 4.8 Docs and wrap-up
- **ENGINEERING.md:** B5 resolutions, inventory counts, parity numbers, quality-gate numbers, video data policy.
- **README:** screenshots, a GIF and video links. Combine this with the striking README for the judges (§7).
- **Definition of done:**
  - test, lint, typecheck and `pnpm build` clean;
  - parity report committed;
  - every inventory item verified or verified-with-note;
  - a final summary under 60 lines.

---

## 5. Recipe: porting one design page (what worked)

1. Read `design/unpacked/<page>/template.html`: markup after `</helmet>`, logic in `class Component`. Look at `design/reference/<page>/default/1440/000.png` and the capture variants in `scripts/design-capture.ts`.
2. Run `pnpm -s design:port <page> --lines <start>-<end>` and copy its JSX into `components/<area>/<page>.tsx`, using inline styles with `var(--…)` tokens. The root div gets `className="design-root"` and the page background token: for example `var(--background)` for #EEF2F6, or `var(--secondary)` for #E4E6F2.
3. Define a `XxxPageData` interface. Build it in a server module `lib/<page>.ts` (with `import "server-only"`) from existing view models. Put pure logic in tested modules, and use signed, face-blurred URLs only (THUMB, VIEW or PREVIEW from `lib/media/derivatives.ts`).
4. Put the route in `app/(designed)/…/page.tsx`: `await connection()`, call `displayPolicy()`, then `notFound()` if there is no data.
5. Add a fixture at `app/dev/parity/<page>/page.tsx` that uses the design's own data, and a preset in `scripts/parity-capture.ts`.
6. Run, in order:
   - `pnpm parity:capture --preset <page> --fixture --no-video`
   - `pnpm parity:report`
   - `pnpm parity:boxes <page> /dev/parity/<page> --width 1440 --text`, then with `--width 390`
   - look at the real route with `npx tsx --conditions=react-server scripts/_look.ts <url> <scratch prefix> <width> <scroll fractions>`
7. Add tests, run lint, typecheck and the full tests, write the Journal entry, and commit.

---

## 6. Gotchas learned the hard way

- **Escaping:**
  - Heredocs and `node -e` strip backslashes in regexes. Use the Edit or Write tools for anything with regexes or quotes.
  - Inside a JS template literal, write `\\s`, not `\s`.
  - Python isn't installed.
- **Moving files:** `git mv` fails because the editor locks files. Use copy, then `git rm -r --cached <old>`, then `rm -rf <old>`. After moving routes, run `rm -rf .next/dev/types`.
- **Restarting dev:**
  1. Stop the background task.
  2. Free the port in PowerShell: `Get-NetTCPConnection -LocalPort 3000 -State Listen | Select -Expand OwningProcess -Unique | % { Stop-Process -Id $_ -Force }`.
  3. Start `pnpm dev > <scratchpad>/dev.log 2>&1` in the background.
  Restart after schema, pipeline or provider changes: the app migrates PGlite on first connection, and provider singletons survive hot reload. A stale `.data/pglite.lock` after a kill was fine.
- **Single process:** PGlite takes one process. `db:*` and `demo:*` scripts refuse to run while dev holds the lock. `db:generate` works.
- **Preflight:** Tailwind's preflight breaks ported layouts; always use `.design-root`. Leaflet inside a ported page needs `isolation: isolate`, or its panes paint over fixed bars.
- **Masks:** the product's masks are greyscale, so use `maskMode: "luminance"`. The prototype's masks are alpha.
- **Motion:**
  - GSAP can't tween `var()` or `oklch()`; resolve to hex first (`tok()` in `lib/scenes/landing-dom.ts`).
  - SSE events are named: use `addEventListener("arrival")`, not `onmessage`.
- **React Compiler:** no synchronous `setState` in effects. Defer it (Promise or requestAnimationFrame).
- **Fake-clock captures:** triggers are aligned to 16 ms, with a MessageChannel flush and image decode before each frame.
- **Prototype runtime:** it wraps `{{ }}` interpolations in inline elements, which matters for box matching.

---

## 7. After Phase 8: the phased push and README (do not start before Phase 8 is done)

- **Target:** `https://github.com/AnshulMohanty/Saakshi`, from the user's own account (git user `AnshulMohanty`). Check credentials with `gh auth status` and git credential manager, without asking for keys. If push access is missing, say so and put the step in `docs/MANUAL_STEPS.md`.
- **No mention of the assistant or tool anywhere in what is pushed:**
  - no co-author or attribution lines in commits;
  - grep tracked files for the tool's name before pushing. For example, `app/fonts.css`'s generated header says the fonts came from "… Design exports", and `scripts/design-fonts.ts` writes that header.
  - `CLAUDE.md` and `AGENTS.md` are tracked instruction files named after the tool. **Ask the user** before renaming, removing or rewriting history for them.
  - Keep this handoff file out of the push.
- **Push in phases, not at once,** and explain each phase to the user: for example foundation, then pipeline and trust, then measurement and reports, then the design port, then video and docs. That may mean pushing existing commit ranges in steps (`git push origin <sha>:refs/heads/main` progressively); ask before rewriting history.
- **README:** "crazy visual and proper professional", to impress the judges. Use real screenshots and a GIF from the parity and video captures, a pipeline diagram, the Cloudinary features used, the trust engine, the measurement, and video links. Every number in it must come from real command output.

---

## 8. Quick command reference

```bash
pnpm dev                       # http://localhost:3000 (run in background, log to scratchpad)
pnpm test | pnpm lint | pnpm typecheck | pnpm build
pnpm db:generate --name <x>    # after editing lib/db/schema.ts (dev server can stay up)
pnpm -s design:port <page> --lines a-b
pnpm parity:capture --preset <page> --fixture --no-video [--variant v] [--width w]
pnpm parity:report
pnpm parity:boxes <page> <route> --width 1440|390 --text
npx tsx --conditions=react-server scripts/_look.ts <url> <outPrefix> <width> 0,0.5
curl -X POST -H 'content-type: application/json' -d '{"projectId":"<uuid>"}' localhost:3000/api/reports
```
