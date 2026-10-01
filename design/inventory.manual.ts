/**
 * Hand-written inventory rows (design/INVENTORY.md is generated from these plus the mechanical
 * extraction in design/extracted/). Each row was checked against its source file; where the
 * Phase 8 brief's digest disagrees with the source, `note` says so and the source wins
 * (except where the note says the spec text wins because the prototype simply omits it).
 *
 * Sources: L = design/unpacked/saakshi-landing/template.html, GL = …/res/ecab9dae…(landing_gl.js),
 * KIT = …/res/8b72f710…(saakshi-kit.js), DH = developer-handoff/template.html,
 * LS = landing-handoff-spec/template.html, P2 = pass-2-handoff-spec/template.html,
 * WW = witness-wall/template.html, HW = how-it-works/template.html.
 */
export type Priority = "P0" | "P1";
export type ItemType = "layout" | "copy" | "token" | "effect" | "interaction" | "state" | "asset" | "data";
export interface ManualRow {
  page: string;
  section: string;
  type: ItemType;
  what: string;
  source: string;
  priority: Priority;
  route: string;
  component: string;
  binding?: string;
  note?: string;
  checklist?: string[];
}

const L = (section: string, type: ItemType, what: string, source: string, component: string, extra: Partial<ManualRow> = {}): ManualRow => ({
  page: "saakshi-landing",
  section,
  type,
  what,
  source,
  priority: "P0",
  route: "/",
  component,
  ...extra,
});

export const MANUAL: ManualRow[] = [
  // ------------------------------------------------------------------------- global (landing)
  L("Global", "effect", "Lenis smooth scroll, lerp 0.12, wheelMultiplier 1 (default), smoothWheel true; Lenis.raf driven from gsap.ticker, lagSmoothing(0)", "L:1253-1255; LS Global/Scroll", "lib/motion/scroll.ts", { checklist: ["C01"] }),
  L("Global", "effect", "ScrollTrigger scrub: true (1:1, never a number); start 'top top', end 'bottom bottom'", "L:1258", "lib/motion/scenes/landing.ts", { checklist: ["C01"] }),
  L("Global", "layout", "Pins are CSS position:sticky 100vh inside tall sections (no pin-spacer)", "L:619,679,706,784,826,926", "components/landing/*", { checklist: ["C01"] }),
  L("Global", "effect", "One fixed WebGL canvas (#sk-gl, z 1, pointer-events none); render on demand (dirty flag), re-render from ScrollTrigger onUpdate via setHero/setStorm", "L:535,1271,1289; GL:19,177-181", "lib/scenes/landing-stage.ts", { checklist: ["C01", "C02"] }),
  L("Global", "effect", "DPR cap 2", "GL:14", "lib/scenes/landing-stage.ts", { note: "Digest adds 1.5 on low power. Source: low power never starts GL (stills instead), so the 1.5 cap never applies. Built as source.", checklist: ["C02"] }),
  L("Global", "asset", "Layer art canvases 1600×1200 (where, fingerprint, AI, measured); tile textures from photo files", "KIT:97; GL:42", "lib/scenes/layer-art.ts", { note: "Digest: tiles 420 px wide, hero 1600 px. Source draws layer art at 1600 and uses the photo files as they are; we request tile textures at w_420 and the hero at w_1600 (spec budget)." }),
  L("Global", "effect", "Draw calls under 90: 5 layer planes + storm tiles (one mesh each) + 1 points + 3 pins", "GL:30-58; LS Budget", "lib/scenes/landing-stage.ts", { checklist: ["C21"] }),
  L("Global", "asset", "Hero still <img> first; 3D module imported in requestIdleCallback (timeout 1200 ms, setTimeout 200 fallback); still hidden 120 ms after the stage exists (opacity 300 ms transition)", "L:620,1262-1270", "components/landing/hero.tsx", { note: "Digest/spec: fetchpriority=high; the prototype's <img> has none. Built with fetchpriority=high (not visible).", checklist: ["C02"] }),
  L("Global", "state", "Motion modes: low = !webgl2 || deviceMemory <= 4 || connection.saveData (or motion=low-power); reduced = prefers-reduced-motion (or motion=reduced) or no GSAP", "L:1239-1244", "lib/motion/detect.ts", { binding: "B5.11: prop becomes auto-detection + dev-only ?motion=full|low|reduced", checklist: ["C02", "C03"] }),
  L("Global", "state", "Reduced: no Lenis, no pins (sections height auto, sticky → relative), no GL/overlay, end states (ch3 list of 4 reasons, ch4 mask shown + final number, ch5 flat field + threads drawn, ch7 last check-in)", "L:1379-1397", "components/landing/*", { checklist: ["C03"] }),
  L("Global", "state", "Low power: ch1 → #ch1s static CSS 3D stack (rotateX 56 rotateZ −36, translateZ 70 px steps), ch2 → #ch2s static canvas map; DOM scrubs stay", "L:1399-1418,652-702", "components/landing/hero-still.tsx", { checklist: ["C02"] }),
  L("Global", "interaction", "Nav bar theme follows night sections: ScrollTrigger per [data-night] start 'top 40px' end 'bottom 40px' → dark glass (rgba(23,18,41,0.92), #EDEAF6, #2C2447) else white (0.94); 200 ms transition", "L:599,1450-1454", "components/landing/nav.tsx"),
  L("Global", "effect", "Fingerprint dust background on night stickies: 20 glyphs from archive hashes, 4 px cells, fill #9C7DFF at 0.07 (spec: 7%)", "L:1456-1465", "lib/scenes/dust.ts", { binding: "our pHash values of the photos on the page" }),
  L("Global", "effect", "ScrollTrigger.refresh on ResizeObserver (height change ≥ 2 px, 150 ms debounce), fonts.ready and load", "L:1371-1376", "lib/motion/scroll.ts"),
  L("Global", "layout", "Root: overflow-x clip, IBM Plex Sans / Plex Sans Devanagari, colour #0F1320, tabular nums; fixed sky #sk-sky (#EEF2F6) behind", "L:532-534", "app/(marketing)/page.tsx"),

  // ------------------------------------------------------------------------- tokens (handoff)
  { page: "developer-handoff", section: "Color tokens", type: "token", what: ":root (app light) OKLCH block, 24 tokens + --radius 0.625rem", source: "KIT:77; DH:452", priority: "P0", route: "app/globals.css", component: "globals.css", checklist: ["C19"] },
  { page: "developer-handoff", section: "Color tokens", type: "token", what: ".dark (app dark) OKLCH block, 24 tokens", source: "KIT:78", priority: "P0", route: "app/globals.css", component: "globals.css", checklist: ["C19"] },
  { page: "developer-handoff", section: "Color tokens", type: "token", what: ".night (story chapters + Witness Wall) OKLCH block, 16 tokens", source: "KIT:79", priority: "P0", route: "app/globals.css", component: "globals.css" },
  { page: "developer-handoff", section: "Color tokens", type: "token", what: "@theme inline: --color-verified/review/flagged/measured/estimated/glow → var(--…)", source: "DH:452", priority: "P0", route: "app/globals.css", component: "globals.css" },
  { page: "developer-handoff", section: "Type tokens", type: "token", what: "--font-display Anek Latin + Anek Devanagari; --font-sans IBM Plex Sans + Plex Sans Devanagari; --font-mono IBM Plex Mono (hashes, coords, URLs only)", source: "DH:358-360", priority: "P0", route: "app/globals.css", component: "globals.css + public/fonts" },
  { page: "developer-handoff", section: "Type tokens", type: "token", what: "--text-hero clamp(56px, 9.4vw, 156px) 700 wdth 88 lh 0.9", source: "DH:361; L:627", priority: "P0", route: "app/globals.css", component: "globals.css" },
  { page: "developer-handoff", section: "Type tokens", type: "token", what: "--text-chapter clamp(34px, 4.6vw, 70px) 700 wdth 92 lh 0.95", source: "DH:362; L:712", priority: "P0", route: "app/globals.css", component: "globals.css", note: "Chapters use their own clamps (ch2 clamp(38px,5vw,76px), ch4 clamp(36px,4.8vw,74px), ch5/6/7/8/10 clamp(34px,4.4vw,68px), ch9 clamp(44px,6vw,96px)). The rendered prototype wins for layout: each heading keeps its own clamp." },
  { page: "developer-handoff", section: "Type tokens", type: "token", what: "--text-title clamp(22px, 2.4vw, 32px) 650", source: "DH:363", priority: "P0", route: "app/globals.css", component: "globals.css" },
  { page: "developer-handoff", section: "Type tokens", type: "token", what: "--text-number clamp(32px, 5vw, 112px) 700 tabular", source: "DH:364", priority: "P0", route: "app/globals.css", component: "globals.css" },
  { page: "developer-handoff", section: "Type tokens", type: "token", what: "--text-body 15px, --text-ui 14px, --text-caption 12px; tabular-nums on body", source: "DH:365-366", priority: "P0", route: "app/globals.css", component: "globals.css" },
  { page: "developer-handoff", section: "Type tokens", type: "token", what: "Minimum type 12 px in the app, 15 px on the Witness Wall at 1080; sentence case; no all-caps labels, no middle-dot meta strings, no arrows on buttons", source: "DH:367", priority: "P0", route: "all", component: "lint: tests/design-rules.test.ts" },
  { page: "developer-handoff", section: "Motion tokens", type: "token", what: "--ease-reveal cubic-bezier(0.16, 1, 0.3, 1); --ease-move cubic-bezier(0.65, 0, 0.35, 1)", source: "DH:371-372", priority: "P0", route: "app/globals.css", component: "lib/motion/tokens.ts" },
  { page: "developer-handoff", section: "Motion tokens", type: "token", what: "--dur-micro 160ms, --dur-ui 240ms, --dur-reveal 800ms (600–900), --dur-drawer 320ms", source: "DH:373-376", priority: "P0", route: "app/globals.css", component: "lib/motion/tokens.ts" },
  { page: "developer-handoff", section: "Motion tokens", type: "token", what: "spring.ui {stiffness 420, damping 40, mass 1}; spring.press {stiffness 700, damping 22}", source: "DH:377-378", priority: "P0", route: "lib/motion/tokens.ts", component: "lib/motion/tokens.ts" },
  { page: "developer-handoff", section: "Motion tokens", type: "token", what: "prefers-reduced-motion: durations 0, no Lenis, no pins, no WebGL; end states; signature moments keep their result but not their travel", source: "DH:380", priority: "P0", route: "all", component: "lib/motion/detect.ts", checklist: ["C03"] },
  { page: "developer-handoff", section: "Fonts", type: "asset", what: "Anek Latin (wght 300–800, wdth 75–125%) vietnamese/latin-ext/latin woff2; Anek Devanagari; IBM Plex Sans 400/500/600 (+ Devanagari); IBM Plex Mono 400/500 — SIL OFL 1.1, self-hosted (B5.14)", source: "DH:14-313; L:77-515", priority: "P0", route: "public/fonts", component: "app/fonts.css", binding: "B5.14: self-host; verify Anek keeps the wdth axis" },

  // ------------------------------------------------------------------------- ch1 hero
  L("01 Hero", "layout", "Section 440vh; sticky 100vh (340vh of scroll)", "L:618-619", "components/landing/hero.tsx", { checklist: ["C01"] }),
  L("01 Hero", "effect", "Camera fixed z 10, fov 30, near 0.1, far 400; the object moves", "GL:17", "lib/scenes/landing-stage.ts"),
  L("01 Hero", "effect", "Card size: 36% of view height desktop (≤ 30% view width / aspect), 24% mobile (≤ 60% vw / aspect); card x +3% vw desktop, y −6% vh mobile; mobile = innerWidth < 1100", "GL:62,94-95", "lib/scenes/landing-stage.ts"),
  L("01 Hero", "effect", "Tilt rotateX −1.02 rad (−58.4°), spin rotateZ 0.62 rad (35.5°), scaled by tilt = a·(1−c)", "GL:96-99", "lib/scenes/landing-stage.ts", { note: "Digest: −58° and 35°; source values are radians 1.02 and 0.62." }),
  L("01 Hero", "effect", "Layer separation GAP 0.42 card heights (0.36 mobile) along local z; layer i opacity clamp(b·2.2 − (i−1)·0.25)·(1−c)", "GL:100-102", "lib/scenes/landing-stage.ts"),
  L("01 Hero", "effect", "Progress windows: a = eio(seg 0.03–0.30) cover→card+tilt; b = eio(seg 0.22–0.52) separation; c = eio(seg 0.66–0.84) recombine (eio = cubic in-out)", "GL:92", "lib/scenes/landing-stage.ts"),
  L("01 Hero", "effect", "Labels: opacity seg(b, 0.1+i·0.14, 0.3+i·0.14)·(1−seg(c,0,0.5)); x at the right-most projected corner; desktop box at max(x+40, W−max(24,5%W)−250) with a leader line; mobile stacked at bottom 20 px, crossfade to the next", "GL:124-128; L:1424-1439", "components/landing/hero-labels.tsx"),
  L("01 Hero", "effect", "Timeline t1: #h-tint opacity→0 (0, 0.08); #h-copy y −80 opacity 0 (0, 0.10); #h-credit (0, 0.05); #h-explain in at 0.22 (0.07 expo.out), out at 0.62 (0.05); #h-seal in at 0.68 (0.06 expo.out); #h-seal-t font-stretch 125%→78% at 0.68 over 0.16 power2.inOut; #h-proof-in at 0.84 (0.05 expo.out); [data-rule] x −8→0 stagger 0.012 at 0.86", "L:1271-1280", "lib/motion/scenes/landing.ts", { note: "Digest: headline out 0–0.08; source 0–0.10. Digest: Anek wdth eased cubic; source power2.inOut." }),
  L("01 Hero", "effect", "Score counts 0→score over 0.87–0.97 (duration 0.10); band text + colour follow; bar width = score%", "L:1281-1286", "components/trust-meter.tsx", { binding: "B5.1: hero's real score and band from lib/trust (design: 90 via SK.band 80/40)" }),
  L("01 Hero", "copy", "Headline 'Proof, not just photos.'; kicker 'साक्षी means witness.'; paragraph; buttons 'Open the live demo', 'Be a witness'; credit line", "L:626-634", "components/landing/hero.tsx", { binding: "credit line from the hero photo's DB credit (author, licence, date, place)" }),
  L("01 Hero", "copy", "'What Saakshi reads from one photo.' + 'Five layers, all from this one file…'; 'Sealed into one proof.' + 'Fixed rules turn the layers into a trust score with reasons…'", "L:637-642", "components/landing/hero.tsx"),
  L("01 Hero", "data", "Five layer labels: The photo (place, faces blurred); Where and when (lat/lng 5 dp, date time IST, 'From the camera file. Accuracy not recorded.'); Its fingerprint (hex); What the AI sees (AI-estimated badge, tags); What we measured (Measured badge, litter cover %)", "L:540-561", "components/landing/hero-labels.tsx", { binding: "B5.4: hero asset lat/lng/capturedAt/pHash/AI tags/cover from DB; B5.2 pHash hex; AI tags → 'AI reading pending' while mock (Part D)" }),
  L("01 Hero", "data", "Proof strip: score, band, bar, five rule chips ('Location recorded, 25' …)", "L:564-586", "components/proof-strip.tsx", { binding: "B5.1: chips from the hero's real reason ledger (lib/trust reasons, our sentences and points)" }),
  L("01 Hero", "asset", "Layer art: where (coords panel, dashed accuracy ring r150, green pin), fingerprint (8×8 glyph, lit cells glow #9C7DFF), AI boxes (5 labelled boxes), measured (mask tinted #3F7FE6, glow)", "KIT:95-145", "lib/scenes/layer-art.ts", { binding: "hero asset data; AI boxes only from real AI output (none while mock)" }),

  // ------------------------------------------------------------------------- ch2
  L("02 Chaos to order", "layout", "Section 420vh, sticky 100vh; ScrollTrigger start 'top bottom' (overlaps the hero release by 100vh)", "L:678,1289", "components/landing/chaos.tsx"),
  L("02 Chaos to order", "effect", "Tiles: e1 = expo-out(seg(q, st·0.6, 0.22+st)) rush from z −60−sz·40 with random spin; e2 = eio(seg 0.42+st/2 … 0.66+st/2) fly to coordinates; e3 = eio(seg 0.72+0.3st … 0.9+0.3st) settle into 5-column stacks; tumble (1−e2); st = d·0.12 per tile; seeded rng 11", "GL:36-46,140-162", "lib/scenes/landing-stage.ts", { note: "Digest ranges 0–0.22, 0.2–0.45, 0.42–0.7, 0.72–0.92 match with the per-tile stagger st ≤ 0.12." }),
  L("02 Chaos to order", "effect", "Hero card becomes tile 0 of the hero project: h1 0.02–0.2 to storm position (−18% vw, +22% vh, z 1.5), h2 0.42–0.7 onto the map, h3 0.74–0.92 into the stack; slerps to the map plane", "GL:108-119", "lib/scenes/landing-stage.ts"),
  L("02 Chaos to order", "effect", "Map group tilts rotateX −0.32 rad (−18.3°) over seg(q, 0.35, 0.7); dots opacity 0.6·eio(seg 0.3–0.55), colour #7B8494 → #8E7BD6 over 0.6–0.95; pins opacity eio(seg 0.55–0.7)", "GL:105,136-139", "lib/scenes/landing-stage.ts"),
  L("02 Chaos to order", "effect", "Timeline t2: #h-proof out (0, 0.04); #gl-labels out (0, 0.03); #c2-t1 in at 0.2 (0.06 expo.out), out at 0.44; sky → #2B2545 at 0.5 over 0.3; #c2-t2 in at 0.64 (0.07 expo.out); sky → #0E0B1A at 0.86 over 0.12; #gl-projects out at 0.97; canvas hidden on leave", "L:1289-1297", "lib/motion/scenes/landing.ts"),
  L("02 Chaos to order", "data", "Project labels over stacks: '{name}, {city}' + '{count} photos, {from} to {to}' (opacity eio(seg 0.84–0.96))", "L:588-595; GL:163-170", "components/landing/chaos.tsx", { binding: "B5.4: real demo projects (names, photo counts, year ranges) from the DB — design shows Versova 31, Pune 12, Chennai 13" }),
  L("02 Chaos to order", "data", "Land dot field (Natural Earth 50 m, 0.2°), edges dissolved (rng 5): LNG 68–89, LAT 7–23", "GL:48-51", "lib/geo/land-dots.ts", { binding: "B5.10: regenerate at 0.2° for lat 6–30 °N, lng 68–92 °E so Noida is on it; land dots only, never boundaries", note: "Source bounds lat 7–23 cut off North India (Noida 28.5 °N); the product widens them (B5.10 wins)." }),
  L("02 Chaos to order", "copy", "'Field photos arrive as a mess.' + 'WhatsApp forwards, phone galleries, shared drives. {n} photos from the demo archive, in no order at all.'; 'Saakshi sorts them by place, project and date before anyone opens a folder.' + pin note", "L:684-689", "components/landing/chaos.tsx", { binding: "{n} = real photo count shown" }),
  L("02 Chaos to order, still", "state", "Low-power/reduced: static canvas map (land rgba(169,163,194,0.55) 3 px squares, pins #4FCB8A r8, city labels 600 26px) + both sentences", "L:694-702,1411-1418", "components/landing/chaos-still.tsx"),

  // ------------------------------------------------------------------------- ch3
  L("03 The catch", "layout", "Section 520vh night (#0E0B1A), sticky with fingerprint dust; 6-column grid (max 600 px) of 24 tiles with 4 planted fakes at cells 3, 9, 14, 20; evidence slot (max 440 px)", "L:705-755,1130", "components/landing/catch.tsx"),
  L("03 The catch", "effect", "Title in 0–0.05 (expo.out); grid tiles opacity/scale 0.9→1 stagger 0.002 from 0.02 (0.04 each)", "L:1305-1306", "lib/motion/scenes/landing.ts", { note: "Digest: grid 0.02–0.06; with the stagger the last tile lands at ≈0.11." }),
  L("03 The catch", "effect", "Each fake k at t = 0.10 + 0.17k: flies from its cell (x,y,scale from the cell rect) over 0.07 power3.inOut; cell image → 0.15; Flagged mark at t+0.05; glitch at t+0.07: three clip-path slices (inset 18/58, 52/26, 80/6 %) with x 10, −8, 4 px, 0.006 each, fade 0.004 (0.022 total, < 3% of the chapter); reason card at t+0.08 (0.04 expo.out); previous fake fades at t+0.155", "L:1307-1325", "lib/motion/scenes/landing.ts"),
  L("03 The catch", "effect", "Close: #c3-main → 0.1 at 0.82 (0.05); #c3-close in at 0.84 (0.06 expo.out); hold to 1", "L:1326-1328", "lib/motion/scenes/landing.ts"),
  L("03 The catch", "data", "Four reasons: 'Same photo already used in {project}' + glyph diff '{n} of 64 cells differ. Same photo.'; 'Stock-site watermark'; 'Taken {km} km from the site'; 'The stamp says {stampPlace}. The camera says {cameraPlace}.'", "L:1118-1126", "components/landing/catch.tsx", { binding: "B5.4: the four planted inputs from the DB: REUSED (real hamming vs its original), STOCK_SUSPECTED, LOCATION_MISMATCH (haversine km), STAMP_MISMATCH (places from the cached reverse geocoder)" }),
  L("03 The catch", "data", "Closing ledger for 'A photo found on the internet': 50 Needs review + five rows", "L:760-776", "components/ledger.tsx", { binding: "B5.1: our scoreAsset for an internet image (no location, no capture time, no camera) — whatever the engine returns" }),
  L("03 The catch", "copy", "'Some photos aren't what they claim.' + 'Four fakes planted in the demo archive's Versova project…'; 'We don't detect fakes. We require proof.'; 'It stays at Needs review until someone confirms it with proof…'", "L:712-775", "components/landing/catch.tsx", { binding: "project name from the DB" }),
  L("03 The catch", "state", "Reduced: all four reason cards as a grid, Flagged marks on the cells, closing block shown", "L:1384-1388", "components/landing/catch.tsx", { checklist: ["C03"] }),

  // ------------------------------------------------------------------------- ch4
  L("04 Measured", "layout", "Section 420vh day; big number clamp(44px,7vw,112px) #1F5DBA with Measured badge; before/after figures 1024/685, max-height min(42vh,46vw)", "L:783-821", "components/landing/measured.tsx"),
  L("04 Measured", "effect", "Before scan line 0.12–0.40 (top 0→100%, glow 0 0 18px 4px rgba(110,162,255,0.8)); mask clip-path inset(0 0 100% 0)→0 in step; number 0→before; after scan 0.50–0.76, number → after, label 'before'→'after'; caveat at 0.80 (0.05 expo.out)", "L:1333-1346", "lib/motion/scenes/landing.ts"),
  L("04 Measured", "effect", "Mask: CSS mask-image of the mask PNG, background #2F6BEA at opacity 0.78, mask-size 100% 100%", "L:803", "components/mask-sweep.tsx", { note: "Digest: 'tinted Measured'; source tint #2F6BEA @0.78 (not the Measured token) — source wins, kept as --mask-tint." }),
  L("04 Measured", "data", "Before/after photos, their masks and covers; caveat copy", "L:800-819", "components/landing/measured.tsx", { binding: "A4 showcase: best measured pair across projects (|delta| ≥ 5, highest confidence), labelled with its project; empty state when none. Mock masks → 'Prototype measurement' badge in DEMO_PREVIEW (Part D)" }),

  // ------------------------------------------------------------------------- ch5
  L("05 Threads", "layout", "Section 420vh night; report card (max 460 px, #F6F8FB) in perspective 1400 with origin 50% 100%; tile field grid auto-fill minmax(52px,1fr) on a rotateX 46° floor (perspective 900, origin 50% 0)", "L:825-873", "components/landing/threads.tsx"),
  L("05 Threads", "effect", "Report card rotateX 38→12, y 80→0, opacity 0→1 over 0–0.14 expo.out; field opacity 0→1 at 0.06 (0.1)", "L:1354-1355", "lib/motion/scenes/landing.ts"),
  L("05 Threads", "effect", "Numbers k=0..3 light at 0.20 + 0.13k: border → #4B2B8F (0.03); their threads dashoffset 1→0 over 0.10 (stagger 0.001); tiles → 0.9 at +0.06; borders back at 0.78; threadsLit at 0.8", "L:1356-1364", "lib/motion/scenes/landing.ts"),
  L("05 Threads", "effect", "Thread = two SVG paths, pathLength 1: 5 px at alpha 0.18 under 1.2 px at 0.95; colours violet (156,125,255), flagged (255,111,97), measured (110,162,255); cubic from the number's bottom to the tile's top (dy = max(40, 0.55·Δy)); relayout on scroll and resize", "L:1511-1536", "components/thread.tsx"),
  L("05 Threads", "interaction", "Hover/focus a number: its threads opacity 1, others 0.06; its tiles opacity 1 with violet outline #9C7DFF, others 0.18; number border #4B2B8F + 0 0 0 3px rgba(156,125,255,0.45); 160 ms; keyboard reachable (buttons)", "L:844-859,1226-1231", "components/landing/threads.tsx"),
  L("05 Threads", "data", "Four numbers: photos verified, photos flagged with reasons, litter cover before, litter cover after", "L:843-859", "components/landing/threads.tsx", { binding: "B5.4: claims from lib/report/claims.ts for the hero project (verified count, flagged count) and the showcase pair's before/after cover; each number carries its photo ids" }),

  // ------------------------------------------------------------------------- ch6
  L("06 Faces stay blurred", "interaction", "Address-bar chips: signature s--…--, crop, blur faces, format, photo (not removable in design); remove → 'This link was edited, so the signature no longer matches.' / no signature → 'This link has no signature, so it is refused.'; 'Restore the original link'", "L:885-918,1163-1173", "components/landing/blur-link.tsx", { binding: "B5.6: /api/demo/tamper extended to remove any chip (signature, crop, blur_faces, format, public id) and return the real status of the edited URL" }),
  L("06 Faces stay blurred", "effect", "Chip remove 180 ms spring", "LS ch6", "components/landing/blur-link.tsx", { note: "The prototype removes chips with no motion; the pass 1 spec asks for a 180 ms spring. Built per spec (spring.ui, 180 ms)." }),
  L("06 Faces stay blurred", "state", "Status line '200: served, faces blurred' (#4FCB8A) / '401: signature does not match' (#FF6F61); overlay card '401 refused'", "L:905-917,1192-1193", "components/landing/blur-link.tsx", { binding: "real HTTP status from the tamper API" }),

  // ------------------------------------------------------------------------- ch7 (P1)
  L("07 It keeps watching", "layout", "Section 340vh (#E4E6F2); photo with QR poster tag; counters; SVG chart 560×240", "L:925-960", "components/landing/watching.tsx", { priority: "P1", checklist: ["C22"] }),
  L("07 It keeps watching", "effect", "0.10–0.85: step k = floor((p−0.1)/0.75·(n−1)); line dashoffset 1→0 linear over 0.75; marker, photo label, count and value follow", "L:1566-1571", "lib/motion/scenes/landing.ts", { priority: "P1", checklist: ["C22"] }),
  L("07 It keeps watching", "data", "Check-ins (clean-up day + 5 samples) with dates and litter cover", "L:1538-1552", "components/landing/watching.tsx", { priority: "P1", binding: "B5.4: the hero spot's real check-ins (measured covers, dates) — empty state when none; never samples", checklist: ["C22"] }),

  // ------------------------------------------------------------------------- ch8 (P1)
  L("08 Try to fool it", "interaction", "Drop zone + file input + 'Use a photo from the internet for me'; ledger appears with score, band, headline, glyph, hex, rows", "L:963-1005,1205-1224", "components/landing/try.tsx", { priority: "P1", binding: "B5.7: /api/demo/try (real pipeline, sandbox project at the stage venue), not a browser hash", checklist: ["C23"] }),

  // ------------------------------------------------------------------------- ch9
  L("09 Be a witness", "effect", "Mini map canvas: land dots rgba(156,125,255,0.32), pins #4FCB8A r·3, city labels; ripple 1.8 s ease-out cubic radius r·(4→44) (r = W/420), alpha (1−k)·0.9, centre dot; loop only while visible (IntersectionObserver)", "L:1475-1509", "components/landing/witness-map.tsx", { binding: "B5.8: arrivals from /api/live (real), no simulation outside operator mode" }),
  L("09 Be a witness", "asset", "QR (qrcode-generator, level M) of the witness URL, #0E0B1A on white, 14 px padding", "L:1018,1467-1473", "components/qr.tsx", { binding: "APP_URL + /capture (real witness URL)" }),
  L("09 Be a witness", "copy", "'Be a witness.' + 'Scan with your phone. Take a photo. Watch it land here.' + URL + note; latest-arrival line", "L:1015-1027", "components/landing/witness.tsx", { binding: "latest real arrival (place from reverse geocoder); 'Simulated arrivals in this prototype' is removed" }),

  // ------------------------------------------------------------------------- ch10 + footer
  L("10 Built on Cloudinary", "interaction", "Five pipeline nodes on a glowing thread (#9C7DFF, 0 0 16px, 0.55); hover/focus/tap selects (bg #2A2150, border #9C7DFF), 160 ms; detail panel with name, what, code, preview", "L:1042-1063,1175-1183", "components/landing/cloudinary.tsx"),
  L("10 Built on Cloudinary", "data", "Node code snippets and previews", "L:1176-1180", "components/landing/cloudinary.tsx", { binding: "B5.5: parameters from docs/external-apis.md (media_metadata, phash, faces, quality_analysis, Analyze API ai_vision_tagging/moderation, e_extract:prompt_(…);mode_mask, e_blur_faces + signed URL, versioned public ids), not image_metadata/detection/auto_tagging" }),
  L("11 Footer", "data", "Credits: every photo shown on the page (title, author, licence, Commons page, planted marks)", "L:1079-1087,1146-1151", "components/landing/footer.tsx", { binding: "B5.3/4: credits from the DB for exactly the photos rendered", checklist: ["C17"] }),
  L("11 Footer", "copy", "Logo + 'Built for Code Cubicle 6.0…'; GitHub link; Swachhata Hi Seva note", "L:1072-1077", "components/landing/footer.tsx", { binding: "repo URL from APP_REPO_URL/package.json; team names placeholder removed" }),


];

const W = (section: string, type: ItemType, what: string, source: string, component: string, extra: Partial<ManualRow> = {}): ManualRow => ({
  page: "witness-wall",
  section,
  type,
  what,
  source,
  priority: "P0",
  route: "/witness",
  component,
  checklist: ["C04"],
  ...extra,
});

MANUAL.push(
  W("Stage", "layout", "Stage 1920×1080 letterboxed (fit = min(w/1920, h/1080), centred); map 1300 px left, aside 620 px right (#120E22, 48/52 px padding)", "WW:411-447,526-527", "components/witness/wall.tsx"),
  W("Stage", "token", "Headline 64 px (Anek 700 wdth 88), counters 64 px, min type 15 px", "WW:449,460-462,479; P2", "components/witness/wall.tsx"),
  W("Map", "effect", "Dot-field plane: #ww-cam rotateX 54° rotateZ −10° (drift −8° overview, −14° at a spot), perspective 1500 px (origin 50% 30%); dots rgba(156,125,255,0.34) r 2.2 on 1400×1067, edges dissolved", "WW:414-418,529-531", "components/witness/wall.tsx", { binding: "B5.10: regenerated dot field (lat 6–30, lng 68–92)" }),
  W("Map", "effect", "Idle drift loop: overview then each spot; 7 s sine.inOut move (plane x/y, cam rotateZ/scale 1 → 1.7), 3 s hold, repeat −1; 'Now watching' name follows", "WW:549-566", "lib/motion/scenes/witness-wall.ts"),
  W("Map", "effect", "Fingerprint dust at 7% under the map; Live dot pulses opacity 1↔0.25, 0.9 s sine.inOut yoyo", "WW:532-538", "components/witness/wall.tsx"),
  W("Arrival", "effect", "0 s drift pauses, fly to spot 1.4 s sine.inOut + zoom 1.7; 0.1 s card drops (x 450, y −420 → 250, rotate −4 → 0) 0.8 s expo.out; 1.5 s card flies to the pin (+24, −150), scale 0.62, 0.9 s power3.inOut; three ripples 1.8 s power3.out, 0.25 s apart (scale 0.3 → 7, 3 px #9C7DFF ring); steps at 2.3, 2.9, 3.6, 4.4 s (Uploading, Reading, Checking, Scored); score counts 0.7 s power2.out then band + reason; 7.4 s card → Latest arrivals (scale 1.3, fade) 0.7 s power3.in; 8.0 s list (top 5) + counters update, drift restarts", "WW:580-619", "lib/motion/scenes/witness-wall.ts"),
  W("Arrival", "state", "Queue: one arrival at a time; more than 3 waiting → skip the flight and ripple straight onto the map", "P2 Queueing", "lib/motion/scenes/witness-wall.ts", { note: "Prototype drops arrivals while busy; built per spec (queue)." }),
  W("Arrival", "state", "Reduced motion: no drift, no flight; card fades in beside the pin; single ring instead of three ripples", "P2 Fallback", "components/witness/wall.tsx", { note: "Not in the prototype; built per spec.", checklist: ["C04", "C03"] }),
  W("Feed", "state", "Feed drop → Live badge 'Reconnecting', last state kept", "P2 Fallback", "components/witness/wall.tsx", { note: "Not in the prototype; built per spec." }),
  W("Feed", "data", "Arrivals: blurred thumbnail, place, first reason, score, band; counters photos today / verified / flagged since midnight IST from the database", "WW:459-477,605-608; P2 Side panel", "components/witness/wall.tsx", { binding: "B5.8: /api/live (SSE) real arrivals; counters from DB aggregates (rule 1)" }),
  W("Operator", "interaction", "Operator bar: 'Simulate an arrival' button + A key; label 'Press A. Arrivals here are simulated.'", "WW:439-443,540-541", "components/witness/wall.tsx", { binding: "B5.8: only with ?operator=1 + DEMO_ADMIN_SECRET; labelled 'Rehearsal: simulated arrival'; autoSimulate off in production" }),
  W("Side panel", "asset", "QR 260×260 (16 px padding, radius 16) of the witness URL, level M", "WW:451,537", "components/qr.tsx", { binding: "APP_URL + /capture" }),
  W("Side panel", "copy", "'Scan to be a witness', 'Take a photo of anything around you.', 'Watch it land on the map.', URL, 'Latest arrivals', empty 'No witness photos yet. The first one lands on the map with a ripple.', 'Faces are blurred before any photo appears here.'", "WW:449-479", "components/witness/wall.tsx"),
);

const H = (section: string, type: ItemType, what: string, source: string, component: string, extra: Partial<ManualRow> = {}): ManualRow => ({
  page: "how-it-works",
  section,
  type,
  what,
  source,
  priority: "P0",
  route: "/how-it-works",
  component,
  ...extra,
});

MANUAL.push(
  H("Trust simulator", "interaction", "Segmented radio groups drive the score; presets 'Real witness photo', 'Google image', 'Reused photo' set every control", "HW:366-384,486-491,530-548", "components/how/simulator.tsx", { binding: "B5.1: controls map to our signals — location source (witness | camera file | archive | none), inside the site, time (event window | monitoring check-in | outside | missing), duplicate (none | burst | revisit | other project), watermark, screen photo, composited, quality, camera info; presets run lib/trust scoreAsset and show whatever it returns" }),
  H("Trust simulator", "effect", "TrustMeter number and bar tween to the new score, expo.out 0.6 s (overwrite); ledger rows update instantly", "HW:502-508", "components/trust-meter.tsx"),
  H("Trust simulator", "layout", "Meter sticky (top 76 px) beside the controls on desktop; stacks below on mobile (flex-wrap)", "HW:385", "components/how/simulator.tsx"),
  H("Trust simulator", "data", "Bar ticks and band legend", "HW:392-397", "components/trust-meter.tsx", { binding: "B5.1: ticks at 45 and 75 with our bands ('Flagged, below 45', 'Needs review, 45 to 74', 'Verified, 75+'), not 40/80" }),
  H("Trust simulator", "state", "Hard fails in a red panel above the ledger ('Flagged regardless of score' + reasons)", "HW:399-404", "components/ledger.tsx", { binding: "our hard flags (REUSED, STOCK_SUSPECTED, LOCATION_MISMATCH, STAMP_MISMATCH); screen photo is a review flag, not a hard fail" }),
  H("Measurement", "interaction", "Threshold slider 10–90 (0.10–0.90) redraws the mask and percentage live; 'Back to the fixed threshold, 0.50' resets", "HW:426-431,518-526", "components/how/threshold.tsx", { binding: "the showcase before photo and its mask; mask pixels > threshold tinted (47,107,234) at 0.8" }),
  H("Pipeline", "data", "Five stage cards: name, what, code, 'Writes: …'", "HW:453-463,553-559", "components/how/pipeline.tsx", { binding: "B5.5: parameters from docs/external-apis.md" }),
  H("The rule", "copy", "'The model never writes a number.' + three steps + Measured / AI-estimated badges", "HW:467-478", "app/(marketing)/how-it-works/page.tsx"),
  H("Header", "layout", "Sticky header: logo, nav (Trust score, Measurement, Pipeline), 'Open the live demo' → /demo", "HW:351-355", "components/site-header.tsx"),
);

// Sources (continued): DE = demo-entry, EV = evidence-page, SP = spot-page, RP = report-page,
// QP = qr-poster, CA = capture, AP = saakshi-app (all design/unpacked/<page>/template.html).
const R = (page: string, route: string) => (section: string, type: ItemType, what: string, source: string, component: string, extra: Partial<ManualRow> = {}): ManualRow => ({ page, section, type, what, source, priority: "P0", route, component, ...extra });
const DE = R("demo-entry", "/demo");
const EV = R("evidence-page", "/e/[assetId]");
const SP = R("spot-page", "/spots/[slug]");
const RP = R("report-page", "/r/[reportId]");
const QP = R("qr-poster", "/spots/[slug]/poster");
const CA = R("capture", "/capture");
const AP = R("saakshi-app", "/library");

MANUAL.push(
  // ------------------------------------------------------------------------- demo entry
  DE("Demo entry", "layout", "Header (logo, How it works), h1 'How do you want to see it?' clamp(40px,6vw,88px) 700 wdth 88, three cards grid auto-fit minmax(300px,1fr); each card: 300 px scene + body with CTA", "DE:361-441", "app/(marketing)/demo/page.tsx"),
  DE("Demo entry", "interaction", "Whole card is the link; hover/focus: border #4B2B8F + 0 0 0 3px rgba(75,43,143,0.18), 160 ms", "DE:372,394,410", "components/demo/role-card.tsx", { binding: "links: volunteer → /capture, manager → /library, funder → the hero's latest report /r/[id]" }),
  DE("Demo entry", "effect", "Volunteer loop (≈4.5 s + repeatDelay 1.2): frame in (scale 1.12→1, 0.7 s expo.out), shutter press (0.12 yoyo) + flash 0.9→0 (0.4), sheet up (0.6 expo.out), score 0→100 (0.8 power2.out), hold 1.6", "DE:456-464", "lib/motion/scenes/demo-entry.ts", { binding: "score = our engine's score for an attested witness photo inside the site" }),
  DE("Demo entry", "effect", "Manager loop (≈5 s + repeatDelay 1): 12 tiles scattered with random rotate, fly into three stacks (0.9 power3.inOut, 0.05 stagger), labels in at 2.4; the planted copy keeps a red outline", "DE:466-474", "lib/motion/scenes/demo-entry.ts", { binding: "tiles and stack labels from the demo projects (counts); the planted REUSED input outlined" }),
  DE("Demo entry", "effect", "Funder loop (≈4.5 s + repeatDelay 1): five threads draw (0.9 power2.inOut, stagger 0.08) from '27 photos verified' to five tiles; tiles light 0.35→1", "DE:476-481", "lib/motion/scenes/demo-entry.ts", { binding: "B5.4: verified count claim from the hero report" }),
  DE("Demo entry", "state", "Loops play only while their card is on screen (IntersectionObserver); reduced motion: each loop paused at progress 0.7", "DE:483-485", "lib/motion/scenes/demo-entry.ts", { note: "Spec says 'paused on its final frame'; source uses progress(0.7): source wins.", checklist: ["C03"] }),
  DE("Demo entry", "copy", "Card titles/bodies/CTAs and the footnote about the demo archive", "DE:388-440", "app/(marketing)/demo/page.tsx"),

  // ------------------------------------------------------------------------- evidence page
  EV("Evidence page", "layout", "Header (logo, '{project}, evidence' link to the spot, Copy link); title block (code, h1 place clamp(32px,5vw,56px), taken time) + score card; viewer + right column (proof strip, ledger, fingerprint); grid auto-fit minmax(320px,1fr) of Facts, Edits, Audit; footer credit", "EV:351-460", "app/(designed)/e/[assetId]/page.tsx", { checklist: ["C14"] }),
  EV("Evidence page", "layout", "Mobile first single column at 390; two columns from ~800 px; three cards across from ~1000 px", "P2 Evidence/Layout; EV:371,421", "app/(designed)/e/[assetId]/page.tsx", { checklist: ["C14"] }),
  EV("Evidence page", "effect", "Explode toggle: #ev-stack rotateX 0→56°, y 0→12%, scale 1.28→0.92; #ev-spin rotateZ 0→−34°; layers z 0→46 px·i; opacity (collapsed: photo + picked layer); 0.8 s expo.out; instant on first placement", "EV:496-511", "components/evidence-viewer.tsx", { checklist: ["C14"] }),
  EV("Evidence page", "interaction", "Viewer is a button (aria-pressed, 'Tap to take it apart' / 'Tap to put it back together'); five layer chips pick a layer (detail text below)", "EV:373-391,532-536", "components/evidence-viewer.tsx"),
  EV("Evidence page", "data", "Score/band, proof strip chips, ledger with total, glyph + hex + nearest distance, facts (spot, project, coordinates, altitude, taken, location source, distance from site centre, litter cover), edits with signed URL, audit timeline, credit", "EV:365-458,512-557", "app/(designed)/e/[assetId]/page.tsx", { binding: "B5.1/2/4: lib/evidence.ts view model (real ledger, pHash, hamming to the nearest asset, measurements); edits from the asset's real signed delivery URL" }),
  EV("Evidence page", "state", "'History intact' / 'History broken' / 'Checking history' badge; each entry's hash shown (16 chars)", "EV:440-452,479-486", "components/audit-timeline.tsx", { binding: "B5.9: GET /api/audit/chain?assetId= + browser Web Crypto SHA-256 recompute with lib/hashchain.ts's canonical format; server chain authoritative" }),
  EV("Evidence page", "interaction", "Copy link → 'Link copied' 1.6 s", "EV:355,556-557", "components/evidence/evidence-page.tsx"),
  EV("Evidence page", "state", "Reduced motion: explode switches without transition", "P2 Evidence/Fallback", "components/evidence-viewer.tsx", { checklist: ["C03"] }),
  EV("Evidence page", "effect", "Evidence loupe on desktop (150 px lens with the fingerprint or measured layer; follows the pointer; hidden on touch and reduced motion)", "DH scenes 'Evidence loupe'; AP:997-1006", "components/evidence-loupe.tsx", { priority: "P1", checklist: ["C25"] }),

  // ------------------------------------------------------------------------- spot page
  SP("Spot page", "layout", "Header (logo, 'Spot', QR poster link); title (project, h1 spot name clamp(34px,5.4vw,64px), mono coords + radius); three counters; photo + scrubber + mask toggle | trend card; Latest check-ins grid; fixed bottom CTA 'Add a check-in photo'", "SP:319-387", "app/(designed)/spots/[slug]/page.tsx", { checklist: ["C14"] }),
  SP("Spot page", "data", "Counters: check-ins since the clean-up; days since the last check-in (from today); litter before and now (Measured)", "SP:331-335,412", "app/(designed)/spots/[slug]/page.tsx", { binding: "B5.4: real check-ins and measurements from lib/measure/views.ts spotView; empty state when none (never samples)" }),
  SP("Spot page", "interaction", "Time scrubber (range over before, after, each check-in): photo, value label and chart marker follow; mask toggle (#2F6BEA @ 0.75)", "SP:339-356,413-417", "components/time-scrubber.tsx"),
  SP("Spot page", "effect", "Trend line draws up to the chosen point; dots filled up to it, current r 8 else 4", "SP:359-367,416-417", "components/spot-trend.tsx", { note: "The design spaces points by index; Phase 8 A3 (user) requires an adaptive time axis with breaks: x positions from lib/charts/time-axis.ts, visual style from the design." }),
  SP("Spot page", "state", "Sample badge 'Check-in photos and values after the clean-up day are samples in this prototype.' (showSample)", "SP:336", "(not built)", { binding: "B5.11: never ships" }),
  SP("Spot page", "data", "Framing instruction", "B5.13", "app/(designed)/spots/[slug]/page.tsx", { binding: "B5.13: spots.framing_note ('from this pole, facing the sea'); archive spots without one show 'Stand where this photo was taken' with the baseline thumbnail" }),

  // ------------------------------------------------------------------------- report page
  RP("Report page", "layout", "Header (logo, 'Report', Download PDF); title (period, h1 project clamp(34px,5.4vw,64px), intro); number buttons grid auto-fit minmax(160px,1fr); photo tiles auto-fill minmax(64px,1fr); flagged with reasons; Method", "RP:350-399", "app/(designed)/r/[reportId]/page.tsx", { checklist: ["C14"] }),
  RP("Report page", "interaction", "Number buttons (hover/focus/tap): threads draw to its photos (two paths 5 px @0.16 + 1.3 px @0.9, pathLength 1, stroke-dashoffset 600 ms cubic-bezier(0.16,1,0.3,1)); linked tiles outlined, others opacity 0.3, 160 ms; tiles open their evidence page", "RP:365-379,436-460", "components/report/numbers.tsx"),
  RP("Report page", "data", "Numbers: verified, flagged, litter cover before/after, spots monitored, check-ins, days since last check-in", "RP:463-471", "components/report/numbers.tsx", { binding: "B5.4: report claims (SQL, lib/report/claims.ts); only allowed metrics; each carries its photo ids" }),
  RP("Report page", "data", "Method text (weights, bands, threshold, caveats, credits)", "RP:393-398", "app/(designed)/r/[reportId]/page.tsx", { binding: "B5.1: our weights and bands from lib/trust/config.ts (75/45), MASK_THRESHOLD" }),
  RP("Report page", "interaction", "Download PDF", "RP:354; P2 Report/PDF", "app/(designed)/r/[reportId]/page.tsx", { priority: "P1", binding: "wire to the existing server-side PDF (/api/reports/[id]/pdf)", checklist: ["C27"] }),

  // ------------------------------------------------------------------------- QR poster
  QP("QR poster", "layout", "One A4 portrait page, full bleed, sized in container units (cqw): 7cqw padding; logo row; h1 'Be a witness at this spot.' 11.5cqw 700 wdth 86 + Hindi line 6.4cqw #4B2B8F; QR 46cqw (≈9 cm) with 0.6cqw border; three steps; footer with spot name, coords, short URL, privacy line", "QP:422-449", "app/(print)/spots/[slug]/poster/page.tsx", { checklist: ["C15"] }),
  QP("QR poster", "asset", "QR error level Q, black (#0F1320) on white", "QP:461-466", "components/qr.tsx", { binding: "the spot page URL (APP_URL/spots/<slug>)" }),
  QP("QR poster", "copy", "English + Hindi: '1. Scan' / '2. Photograph the beach' (instruction 2 fixes the framing) / '3. Watch it count'", "QP:434-438", "app/(print)/spots/[slug]/poster/page.tsx", { binding: "B5.13: instruction 2 from spots.framing_note; fallback 'Stand where this photo was taken'" }),

  // ------------------------------------------------------------------------- capture
  CA("Capture", "layout", "The phone screen only (390×844 on a phone; the device frame and state list are not built): feed, top HUD (place, coords, accuracy dot), 96 px spot mini-map, centre GPS ring + horizon, glyph grid, bottom bar (tray, shutter 76 px, spot short name), sheet", "CA:333-422; brief B2", "app/(app)/capture/capture-screen.tsx", { checklist: ["C05"] }),
  CA("Capture", "effect", "Shutter: flash 0.9→0 350 ms; glyph grid in at 0.1, 64 cells stagger 12 ms from 0.15; fly photo to the tray 600 ms power3.inOut (from 1.05); sheet up 600 ms expo.out at 1.7; steps every 450 ms from 1.9; score 800 ms power2.out at 3.3; done at 4.1", "CA:460-485", "lib/motion/scenes/capture.ts", { checklist: ["C05"] }),
  CA("Capture", "interaction", "Vibrate 18 ms on shutter, [12, 40, 12] on score (Android)", "CA:464,484", "lib/motion/scenes/capture.ts", { priority: "P1", checklist: ["C05", "C28"], note: "P1 item 'Android vibration tuning' refines these." }),
  CA("Capture", "effect", "GPS ring sampled every 450 ms: size 40 + acc·1.6 px (0.45 s power2.out); colour ≤10 m #4FCB8A, ≤25 m #E3AE45, else #FF6F61; horizon rotates with level (0.45 s)", "CA:439-448,491", "components/capture-hud.tsx", { binding: "navigator.geolocation.watchPosition accuracy; DeviceOrientation for level (iOS: requestPermission from the user gesture)", checklist: ["C05"] }),
  CA("Capture", "state", "States: permission prompt, location denied (+ continue without location), low accuracy banner, offline banner + 'Queued', done (chips + Take another + See it), live", "CA:359-421,498", "app/(app)/capture/capture-screen.tsx", { checklist: ["C06"] }),
  CA("Capture", "data", "Sheet: steps (Uploading/Reading/Checking/Scored or Queued), score, band, note, fingerprint glyph, rule chips", "CA:380-403,509-512", "components/pipeline-sheet.tsx", { binding: "B5.2: on-device preview glyph from a browser port of lib/phash.ts, then the server pHash when scored; score/band/reasons from the real pipeline" }),
  CA("Capture", "state", "Offline capture: queue in IndexedDB with device time and fix; unattested ('Taken offline: time from your phone')", "B5.12; DH Offline", "lib/client/offline-queue.ts", { binding: "B5.12", checklist: ["C06"] }),

  // ------------------------------------------------------------------------- app shell
  AP("App shell", "layout", "Demo bar (accent) 'Demo workspace…' + Reset demo; offline banner under it; rail 220 px / 60 px (width 200 ms ease-reveal) with Capture button, Library/Review/Projects/Studio (Review count badge), theme toggle, collapse; top bar with title + ⌘K search button; content scroll area", "AP:415-454", "components/app-shell.tsx", { checklist: ["C07"] }),
  AP("App shell", "state", "Mobile (≤ 760 px): rail collapsed", "AP:844", "components/app-shell.tsx"),
  AP("App shell", "interaction", "Theme toggle light/dark (tokens applied to body)", "AP:443,862-865", "components/app-shell.tsx", { checklist: ["C19"] }),
  AP("App shell", "state", "demoState normal | loading | empty | error | offline per screen, with copy per screen", "AP:1041-1046,455-479", "components/state-block.tsx", { binding: "B5.11: dev-only ?state=loading|empty|error|offline override; real states from data fetching", checklist: ["C20"] }),
  AP("App shell", "state", "Loading skeletons in the final layout, skpulse 1.4 s ease-in-out opacity 1↔0.5, no shimmer; shown after 150 ms", "AP:409,455-463; DH States", "components/state-block.tsx", { note: "The 150 ms delay is in the handoff, not the prototype.", checklist: ["C20"] }),
  AP("App shell", "state", "Error: says what failed, 'Nothing was lost…', request id, Try again", "AP:472-479", "components/state-block.tsx", { binding: "real failing route, status and x-request-id", checklist: ["C20"] }),
  AP("App shell", "interaction", "Command palette: ⌘/Ctrl+K toggles; arrows move, Enter runs, Esc closes; pages, actions (Capture, theme), photo hits by title/code/band", "AP:813-826,918-922,1130-1137,1171-1173", "components/command-palette.tsx"),
  AP("App shell", "effect", "Palette 160 ms fade + 4 px rise", "DH scenes 'Command palette'", "components/command-palette.tsx", { note: "The prototype opens instantly; the handoff specifies the motion: built per handoff." }),
  AP("App shell", "interaction", "Toasts 2.6 s ('Approved and sealed…', 'Demo reset…', '… photos sorted into 3 projects…')", "AP:828-830,866", "components/toast.tsx"),

  // ------------------------------------------------------------------------- library
  AP("Library", "interaction", "Search chips: Enter or comma makes a chip (band, project, year, no location, text), Backspace on empty input removes the last; band segmented filter; Live import", "AP:485-496,901-912,1141-1144", "components/search-chips.tsx", { binding: "chips feed the existing search (lib/search validateFilters/runSearch); Hinglish/typo rewrites kept", checklist: ["C07"] }),
  AP("Library", "effect", "Map: projected dot field with mild perspective (s = 0.8 + 0.2·ny), clusters with count + band bar + label card, single pins by band shape; zoom to a project (bbox ±0.42°/±0.3°) 0.9 s expo.out; 'All projects' returns", "AP:499-525,950-976,1069-1085", "components/library-map.tsx", { note: "Digest: zoom 900 ms + 350 ms correction; source has no correction: built as source.", binding: "B5.10 dot field; no boundaries", checklist: ["C07"] }),
  AP("Library", "effect", "Live import: tiles from above (y −300…−600, random x/rotate) 0.9 s expo.out stagger 0.02; pins pop scale 0→1 0.5 s back.out(1.6) stagger 0.1 delay 0.5; toast", "AP:977-985", "components/library-grid.tsx", { binding: "real demo import (pipeline) progress via /api/live", checklist: ["C08"] }),
  AP("Library", "layout", "Grid auto-fill minmax(150px,1fr); tile: photo, hover glyph overlay (160 ms), score badge with band shape, select checkbox; selected outline", "AP:538-549", "components/photo-tile.tsx", { checklist: ["C07"] }),
  AP("Library", "interaction", "Checkbox select → bulk bar 'n selected' with Add to report / Send to review / Clear", "AP:529-536,1148-1151", "components/bulk-bar.tsx", { checklist: ["C07"] }),
  AP("Library", "asset", "Map pins: Verified circle, Needs review diamond (rotated square), Flagged triangle (clip-path); cluster band bar; legend", "AP:504-523,882-884", "components/band-pin.tsx", { checklist: ["C07"] }),

  // ------------------------------------------------------------------------- review
  AP("Review", "layout", "Queue list (flagged first, '{n} waiting, flagged first') + Decided; current: photo (+ duplicate original side by side), glyph diff row, proof strip, score card with reason, required note, Approve (A) / Reject (R), key hints", "AP:553-620", "app/(app)/review/review-client.tsx", { checklist: ["C10", "C11"] }),
  AP("Review", "effect", "Approve: strip scale 0.97 (90 ms power2.out) + seal fill scaleX 0→1 (280 ms expo.out), spring back (350 ms back.out(2.2)), 'Sealed' fades in; then decision saved + toast", "AP:936-943", "lib/motion/scenes/review.ts", { checklist: ["C10"] }),
  AP("Review", "effect", "Reject: grayscale 250 ms, then x 60 px + opacity 0.3 + scale 0.94 over 350 ms power3.in", "AP:944-946", "lib/motion/scenes/review.ts", { checklist: ["C10"] }),
  AP("Review", "interaction", "J/K move, A approves, R rejects, ⌘/Ctrl+Enter approves from the note; empty note: field shakes (x −6→0, 0.4 s elastic.out(1,0.35)) + 'Add a note so the decision can be audited.'", "AP:918-933,1156", "app/(app)/review/review-client.tsx", { binding: "decisions go to POST /api/review/[assetId] (audit chain)", checklist: ["C10"] }),
  AP("Review", "data", "Duplicate side by side: this photo | original ('Original, filed in {project}'), glyphs A, diff, B, '{n} of 64 cells differ. Same photo.'", "AP:582-596,1094", "components/review/duplicate.tsx", { binding: "B5.2: real pHash glyphs and hamming distance from the duplicates table", checklist: ["C11"] }),

  // ------------------------------------------------------------------------- projects
  AP("Projects", "layout", "Project tabs; KPI cards grid; tile strip; Before and after card (+ Replay sweep); Flagged with reasons; spots table with sparklines", "AP:623-681", "app/(app)/projects/[id]/page.tsx", { route: "/projects/[id]", checklist: ["C12"] }),
  AP("Projects", "interaction", "Hover/focus a KPI: threads 600 ms dash to its photos (colour by kind), other tiles dim to 28%, linked tiles outlined", "AP:1013-1026,1100-1102", "components/kpi-card.tsx", { route: "/projects/[id]", checklist: ["C12"] }),
  AP("Projects", "effect", "Mask sweep 1.4 s power2.inOut (clip-path + scan line) on open and on Replay", "AP:1008-1012,859", "components/mask-sweep.tsx", { route: "/projects/[id]", checklist: ["C12"] }),
  AP("Projects", "data", "KPIs: verified, flagged, spots monitored, litter before/after (Measured), check-ins; spots table (photos, trend sparkline, last check-in)", "AP:1098-1104", "app/(app)/projects/[id]/page.tsx", { route: "/projects/[id]", binding: "B5.4: DB aggregates and comparisons for the selected project; 'no data' where nothing is measured", checklist: ["C12", "C18"] }),

  // ------------------------------------------------------------------------- studio
  AP("Studio", "layout", "A4 report preview (210/297, 7% padding) with threads drawn on open; Instagram 4:5 templates Stat | Before and after | Verified photo; caption editor (2,200 limit, count turns flagged over); Export 1080 × 1350 + URL", "AP:684-745", "app/(app)/studio/page.tsx", { route: "/studio", checklist: ["C13"] }),
  AP("Studio", "data", "Template contents and export", "AP:1106-1110", "app/(app)/studio/page.tsx", { route: "/studio", binding: "existing campaign kit (lib/report/campaign.ts): Cloudinary layers (l_text, image layers, e_blur_faces), 1080×1350; claims from the report", checklist: ["C13"] }),

  // ------------------------------------------------------------------------- drawer
  AP("Evidence drawer", "layout", "Right drawer min(760px,100%), backdrop rgba(14,11,26,0.4); header (code, place, score, close); viewer; tabs Trust, Facts, History, Duplicates, Credits", "AP:751-810", "components/evidence-drawer.tsx", { checklist: ["C09"] }),
  AP("Evidence drawer", "effect", "Drawer 320 ms; explode: rotateX 56°, y 10%, scale 1.2→0.9, rotateZ −34°, 44 px per layer, 0.8 s expo.out (instant on first open); Esc closes", "AP:986-992,921; DH", "components/evidence-drawer.tsx", { checklist: ["C09"] }),

  // ------------------------------------------------------------------------- whole-site rules
  { page: "all", section: "Privacy", type: "data", what: "Signed URLs with e_blur_faces on every public image", source: "DH checklist; docs/DEVELOPMENT.md rule 5", priority: "P0", route: "all", component: "lib/media/transform.ts", checklist: ["C16"] },
  { page: "all", section: "Metrics", type: "data", what: "Only allowed metrics; samples removed or marked", source: "DH checklist", priority: "P0", route: "all", component: "lib/provenance.ts", binding: "B5.4 + B5.11: no sample values ship; missing data → designed empty state", checklist: ["C18"] },
  { page: "all", section: "Performance", type: "effect", what: "60 fps desktop, 30+ fps mid-range Android", source: "DH checklist; LS Budget", priority: "P0", route: "/, /witness", component: "scripts/quality-gates.ts", checklist: ["C21"] },
  { page: "saakshi-landing", section: "Intro", type: "effect", what: "Ink-drop intro, 1.2 s, first visit, skippable", source: "DH checklist P1", priority: "P1", route: "/", component: "components/landing/ink-intro.tsx", checklist: ["C24"] },
  { page: "saakshi-landing", section: "Dust", type: "effect", what: "Fingerprint dust resolving into thumbnails near the cursor", source: "DH checklist P1", priority: "P1", route: "/", component: "components/landing/dust-reveal.tsx", checklist: ["C26"] },
);

/** Developer_Handoff ship checklist (DH:460-461): 21 P0, 7 P1. */
export const CHECKLIST: Array<{ id: string; priority: Priority; label: string }> = [
  "Landing chapters 1 to 6, 9, 10 and footer",
  "Hero still first, 3D after idle, low-power fallback",
  "Reduced-motion end states on every page",
  "Witness Wall with realtime feed and queue",
  "Witness capture: HUD, shutter moment, pipeline sheet",
  "Capture states: permission, denied, low accuracy, offline, done",
  "Library: map with band pins and clusters, grid, search chips, filters, bulk select",
  "Live import sorting",
  "Evidence drawer with layers and five tabs",
  "Review queue: J, K, A, R, required note, seal and reject motion",
  "Duplicate side by side with glyph diff",
  "Project overview: KPI threads, mask sweep, spots table, flagged summary",
  "Studio: A4 report preview, three 4:5 templates, caption, export",
  "Public evidence, spot and report pages",
  "QR poster per spot",
  "Signed URLs with e_blur_faces on every public image",
  "Credits for every demo photo",
  "Only allowed metrics; samples removed or marked",
  "Light and dark themes",
  "Empty, loading, error, offline states",
  "60 fps desktop, 30+ fps mid-range Android",
  "Landing chapter 7, it keeps watching",
  "Landing chapter 8, try to fool it, on the live pipeline",
  "Ink-drop intro, 1.2 s, first visit, skippable",
  "Evidence loupe on desktop",
  "Fingerprint dust resolving into thumbnails near the cursor",
  "Server-side PDF for reports",
  "Android vibration tuning on capture",
].map((label, i) => ({ id: `C${String(i + 1).padStart(2, "0")}`, priority: (i < 21 ? "P0" : "P1") as Priority, label }));

/** Developer_Handoff components (DH:469-491) → our component files. */
export const COMPONENTS: Array<{ name: string; states: string; where: string; file: string }> = [
  { name: "AppShell, Rail", states: "expanded, collapsed, mobile sheet; Review count badge", where: "App", file: "components/app-shell.tsx" },
  { name: "DemoBanner", states: "default, resetting", where: "App", file: "components/demo-banner.tsx" },
  { name: "CommandPalette", states: "closed, open, empty results, keyboard highlight", where: "App, ⌘K", file: "components/command-palette.tsx" },
  { name: "TrustMeter", states: "checking, counting, Verified, Needs review, Flagged; hard-fail panel", where: "Landing, How it works, Capture, Wall", file: "components/trust-meter.tsx" },
  { name: "ProofStrip", states: "unsealed, sealing (press + fill), sealed", where: "Landing, Evidence, Review", file: "components/proof-strip.tsx" },
  { name: "Ledger", states: "full, partial, zero, bad; total row", where: "Evidence, Review, Drawer", file: "components/ledger.tsx" },
  { name: "Glyph", states: "plain, night, diff (cells lit), building cell by cell", where: "Everywhere", file: "components/glyph.tsx" },
  { name: "BandPin, Cluster", states: "Verified circle, Needs review diamond, Flagged triangle; cluster with band bar; focus", where: "Library map, Wall", file: "components/band-pin.tsx" },
  { name: "PhotoTile", states: "default, hover (glyph), selected, flagged outline, rejected (desaturated), loading skeleton", where: "Library, Review, Projects", file: "components/photo-tile.tsx" },
  { name: "SearchChips", states: "empty, typing, chips (band, project, year, no location, text), backspace removes last", where: "Library", file: "components/search-chips.tsx" },
  { name: "BulkBar", states: "hidden, n selected, action pending", where: "Library", file: "components/bulk-bar.tsx" },
  { name: "EvidenceViewer", states: "collapsed, exploded, single layer, loupe (P1)", where: "Drawer, Evidence page", file: "components/evidence-viewer.tsx" },
  { name: "EvidenceDrawer", states: "Trust, Facts, History, Duplicates, Credits; loading; error", where: "App", file: "components/evidence-drawer.tsx" },
  { name: "ReviewItem", states: "current, queued, note missing (error), approving, rejecting, decided", where: "Review", file: "components/review-item.tsx" },
  { name: "Thread", states: "hidden, drawing, lit, dimmed", where: "Landing, Report, Projects, Studio", file: "components/thread.tsx" },
  { name: "KpiCard", states: "default, hover (threads), sample value, no data", where: "Projects, Report", file: "components/kpi-card.tsx" },
  { name: "MaskSweep", states: "idle, sweeping, shown; threshold (How it works)", where: "Landing, Projects, How it works", file: "components/mask-sweep.tsx" },
  { name: "TimeScrubber", states: "before, after, check-in n, latest", where: "Spot page, landing ch. 7", file: "components/time-scrubber.tsx" },
  { name: "CaptureHUD", states: "acquiring, good fix, low accuracy, no location; level, tilted; inside, near edge", where: "Capture", file: "components/capture-hud.tsx" },
  { name: "PipelineSheet", states: "Uploading, Reading, Checking, Scored; Queued offline; done", where: "Capture, Wall card", file: "components/pipeline-sheet.tsx" },
  { name: "TemplateCanvas", states: "stat, split, photo; exporting; exported URL", where: "Studio", file: "components/template-canvas.tsx" },
  { name: "StateBlock", states: "empty, loading, error, offline banner", where: "All app screens", file: "components/state-block.tsx" },
];

/** Phase 8 brief B5: design vs product truth. The product wins; each is a binding. */
export const BINDINGS: Array<{ id: string; rule: string; resolution: string }> = [
  { id: "B5.1", rule: "Trust rules", resolution: "SK.score weights (10/25/25/25/15, bands 80/40, screen photo = hard fail) are placeholders. Every TrustMeter, ledger, band, simulator and preset uses lib/trust (bands 75/45, ticks at 45 and 75, our reason sentences, screen photo = review flag)." },
  { id: "B5.2", rule: "Fingerprint", resolution: "Glyphs render from our pHash hex; 'N of 64 cells differ' is the real hamming distance; capture previews a browser port of lib/phash.ts, then the server value." },
  { id: "B5.3", rule: "Data", resolution: "SAAKSHI_ARCHIVE never enters the product DB or public routes (only /dev/parity). Real routes bind to our DB; credits from our DB." },
  { id: "B5.4", rule: "Numbers and names", resolution: "Every number/name in design copy binds to data (hero facts, project names/counts/years, report claims, reason templates with the cached reverse geocoder). Missing data → designed empty state, never a sample." },
  { id: "B5.5", rule: "Chapter 10 parameters", resolution: "From docs/external-apis.md (what we really call), not image_metadata/detection/auto_tagging." },
  { id: "B5.6", rule: "Chapter 6", resolution: "/api/demo/tamper extended to remove any chip (signature, crop, blur_faces, format, public id) and return the real status for each." },
  { id: "B5.7", rule: "Chapter 8", resolution: "/api/demo/try (real pipeline, sandbox at the stage venue), not a browser hash." },
  { id: "B5.8", rule: "Live arrivals", resolution: "Chapter 9 and the Wall use /api/live. Simulation only in operator mode (?operator=1 + DEMO_ADMIN_SECRET), labelled 'Rehearsal: simulated arrival'; autoSimulate off in production." },
  { id: "B5.9", rule: "History intact", resolution: "GET /api/audit/chain?assetId=; the browser recomputes with Web Crypto SHA-256 in lib/hashchain.ts's canonical format; the server chain stays authoritative." },
  { id: "B5.10", rule: "Map dot field", resolution: "Regenerated from Natural Earth 50 m land at 0.2° for lat 6–30 °N, lng 68–92 °E; land dots only, never boundaries; any MapLibre view strips boundary layers and stays at zoom ≥ 10." },
  { id: "B5.11", rule: "Review annotations", resolution: "'Chapter N, P0' marks, sample labels and showMarks/showSample/showP1 never ship; motion → auto-detection (+ dev ?motion=); demoState → dev ?state=." },
  { id: "B5.12", rule: "Offline capture", resolution: "IndexedDB queue with device time and fix; unattested ('Taken offline: time from your phone')." },
  { id: "B5.13", rule: "Spots framing", resolution: "Optional spots.framing_note; archive spots without one show 'Stand where this photo was taken' with the baseline thumbnail." },
  { id: "B5.14", rule: "Fonts", resolution: "Self-hosted (OFL) instead of Google Fonts; the Anek files must keep the wdth axis." },
];
