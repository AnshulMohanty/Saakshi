/**
 * Landing motion constants, from the design source (landing_gl.js "GL:", the landing template
 * "L:", saakshi-kit.js "KIT:"). Each is commented with its design/INVENTORY.md id. Scroll
 * progress is 0–1 over a pinned chapter (ScrollTrigger scrub: true, start top top, end bottom
 * bottom). tests/motion-landing.test.ts pins these against the source values.
 */

/** D-0017: Lenis, driven from gsap.ticker with lagSmoothing(0). */
export const LENIS = { lerp: 0.12, smoothWheel: true } as const;

/** D-0018: every chapter scrubs 1:1. */
export const SCRUB = true;

/** D-0021: devicePixelRatio cap (low power never starts GL, so there is no lower cap). */
export const DPR_CAP = 2;

/** D-0022: layer art canvas size (where, fingerprint, AI, measured). */
export const LAYER_ART = { width: 1600, height: 1200 } as const;

/** D-0024: the still hero first; the 3D module after idle. */
export const STAGE_START = { idleTimeoutMs: 1200, idleFallbackMs: 200, stillHideAfterMs: 120, stillFadeMs: 300 } as const;

/** D-0033: fixed camera; the objects move. */
export const CAMERA = { z: 10, fov: 30, near: 0.1, far: 400 } as const;

/** D-0034: mobile layout below this innerWidth. */
export const MOBILE_BELOW = 1100;

/** D-0034: the hero card's size and offset, in view units. */
export const CARD = {
  desktop: { heightOfView: 0.36, maxWidthOfView: 0.3, x: 0.03, y: 0, sealShiftX: 0.16, sealY: 0.06 },
  mobile: { heightOfView: 0.24, maxWidthOfView: 0.6, x: 0, y: -0.06, sealShiftX: 0, sealY: 0.04 },
} as const;

/** D-0035: tilt (rotateX, radians) and spin (rotateZ, radians), scaled by a·(1−c). */
export const TILT = 1.02;
export const SPIN = 0.62;

/** D-0036: layer separation along local z (card heights) and the layer fade-in. */
export const GAP = { desktop: 0.42, mobile: 0.36 } as const;
export const LAYER_FADE = { gain: 2.2, step: 0.25 } as const;

/**
 * D-0037: chapter 1 windows: a cover → card + tilt, b separation, c recombine (cubic in-out).
 * Polish pass: recombined earlier, so the seal (each layer landing on the strip) gets its own
 * stretch of scroll instead of a bar that moves at the very end.
 */
export const CH1 = { a: [0.03, 0.24], b: [0.18, 0.42], c: [0.48, 0.58] } as const;

/** D-0038: layer labels (fade windows, box placement, mobile stacking). */
export const LABELS = { start: 0.1, end: 0.3, stagger: 0.14, fadeOutOfC: 0.5, boxWidth: 250, offsetX: 40, marginMin: 24, marginOfWidth: 0.05, leaderGap: 6, mobileInset: 16, mobileBottom: 20 } as const;

/** D-0039, D-0040: chapter 1 DOM timeline (position, duration in chapter progress). */
export const T1 = {
  tint: { at: 0, dur: 0.08 },
  copy: { at: 0, dur: 0.1, y: -80 },
  credit: { at: 0, dur: 0.05 },
  explainIn: { at: 0.17, dur: 0.06, y: 30 },
  explainOut: { at: 0.43, dur: 0.04, y: -20 },
  sealIn: { at: 0.5, dur: 0.05, y: 30 },
  sealStretch: { at: 0.5, dur: 0.1, from: "125%", to: "78%" },
  proofIn: { at: 0.57, dur: 0.04, y: 14 },
  rules: { at: 0.86, dur: 0.03, stagger: 0.012, x: -8 },
  /** The fixture (no seal data): the score counts in one go. */
  score: { at: 0.62, dur: 0.3 },
  /** Each layer lands: its row, then its chips on the strip, while the score counts by its points. */
  steps: { first: 0.61, every: 0.055, rowDur: 0.03, rowX: -18, chipAt: 0.012, chipDur: 0.025, countDur: 0.035 },
  total: { dur: 0.025 },
  hold: { at: 0.97, dur: 0.03 },
  proofGap: 14,
  proofMinWidth: 420,
  proofMaxWidth: 520,
} as const;

/** D-0048: the hero card becomes cell 0 of the hero project's grid on the map (size: × the cell). */
export const HERO_TO_TILE = { h1: [0.02, 0.2], h2: [0.42, 0.66], h3: [0.68, 0.82], storm: { x: -0.18, y: 0.22, z: 1.5 }, tiltX: 0.3, spinZ: -0.18, size: { site: 0.7 } } as const;

/**
 * D-0047: storm tiles (seeded rng 11). Polish pass: photos are large (a share of the view's height)
 * and mostly face the viewer (tumble ±0.35 rad, the prototype's ±2.5 rad turned many edge-on);
 * they keep `avoidMarginPx` clear of the headline; at `handoff` the DOM grid on the map takes over.
 */
export const STORM = {
  seed: 11,
  stagger: 0.12,
  e1: { from: 0, to: 0.22, staggerFrom: 0.6 },
  e2: { from: 0.42, to: 0.66, staggerFrom: 0.5, staggerTo: 0.5 },
  e3: { from: 0.66, to: 0.8, staggerFrom: 0.3, staggerTo: 0.3 },
  handoff: [0.88, 0.94],
  start: { spread: 2.2, z: -60, zRandom: 40 },
  swirl: { speed: 2.2, phase: 6, radius: 0.25 },
  ring: { desktop: 0.78, mobile: 0.6, xStretch: 1.22, z: -1.5, zRandom: 3 },
  spin: { x: 0.7, y: 0.7, z: 0.8, tumble: 0.25 },
  size: { storm: 0.15, stormMobile: 0.1, pin: 0.6 },
  avoidMarginPx: 24,
  /** The photo grid on the map: columns, gap and cell size (px, clamped to the map's width share). */
  grid: { cols: 5, gapPx: 3, cellOfWidth: 0.034, minPx: 12, maxPx: 30 },
} as const;

/** D-0049: the map (dot field, pins) and its tilt. */
export const MAP = {
  tilt: 0.32,
  tiltWindow: [0.35, 0.7],
  dots: { opacity: 0.6, fade: [0.3, 0.55], recolour: [0.6, 0.95], size: 1.7, seed: 5, edge: { lat: 3, lng: 2 } },
  pins: { fade: [0.55, 0.7], size: 0.22 },
  labels: { fade: [0.84, 0.96], gap: 8 },
  aspectSquash: 0.96,
  desktop: { widthOfView: 0.6, heightOfView: 0.86, x: 0.17, y: -0.02 },
  mobile: { widthOfView: 1.05, heightOfView: 0.62, x: 0, y: -0.18 },
} as const;

/**
 * D-0052 (B5.10): the map frame. The dot field covers lat 6–30, lng 68–92 so every site and North
 * India are on it; the frame follows it.
 */
export const FRAME = { lng0: 68, lng1: 92, lat0: 6, lat1: 30 } as const;
/** D-0052: the prototype's frame (GL:48), used by the /dev/parity fixture with the design's own dots. */
export const DESIGN_FRAME = { lng0: 68, lng1: 89, lat0: 7, lat1: 23 } as const;

/** D-0050: chapter 2 DOM timeline. */
export const T2 = {
  proofOut: { at: 0, dur: 0.04 },
  labelsOut: { at: 0, dur: 0.03 },
  t1In: { at: 0.2, dur: 0.06, y: 30 },
  t1Out: { at: 0.44, dur: 0.05, y: -20 },
  dusk: { at: 0.5, dur: 0.3 },
  t2In: { at: 0.64, dur: 0.07, y: 30 },
  night: { at: 0.86, dur: 0.12 },
  /** The India map layer under the canvas, and the DOM photo grids that take over from the tiles. */
  mapIn: { at: 0.3, dur: 0.18 },
  gridsIn: { at: 0.87, dur: 0.06 },
  /** Leaving: while chapter 3 slides up over the fixed map, the map and its grids rise (this share of the viewport) and fade with chapter 2. */
  exit: { lift: 0.35 },
} as const;

/**
 * D-0056, D-0057, D-0058: chapter 3, the catch. Polish pass: the heading and grid arrive while the
 * chapter scrolls in (`entry`, its own trigger: no dark screen before it pins); the fakes
 * come sooner; the grid leaves completely before the close (never text over text); the close's
 * ledger rows land one by one while its score counts.
 */
export const T3 = {
  entry: { start: "top 92%", end: "top 12%", y: 40, scale: 0.92, stagger: 0.012 },
  title: { at: 0, dur: 0.05, y: 30 },
  grid: { at: 0.02, dur: 0.04, stagger: 0.002, scale: 0.9 },
  fake: { first: 0.04, every: 0.14, fly: 0.06, cellDim: 0.15, cellDimDur: 0.02, markAt: 0.045, markDur: 0.02, glitchAt: 0.06, reasonAt: 0.065, reasonDur: 0.035, reasonY: 12, outAt: 0.13, outDur: 0.01 },
  glitch: [
    { opacity: 0.85, x: 10, clip: "inset(18% 0 58% 0)", dur: 0.006 },
    { x: -8, clip: "inset(52% 0 26% 0)", dur: 0.006 },
    { x: 4, clip: "inset(80% 0 6% 0)", dur: 0.006 },
    { opacity: 0, dur: 0.004 },
  ],
  close: { mainDim: 0, mainAt: 0.6, mainDur: 0.04, in: 0.645, inDur: 0.05, y: 24, rowsAt: 0.68, rowsStagger: 0.022, rowDur: 0.03, scoreAt: 0.68, scoreDur: 0.16, holdAt: 0.9, holdDur: 0.1 },
} as const;

/** D-0064, D-0065: chapter 4, measured. */
export const T4 = {
  before: { at: 0.12, dur: 0.28, scanOffAt: 0.41 },
  after: { at: 0.5, dur: 0.26, scanOffAt: 0.77 },
  caveat: { at: 0.8, dur: 0.05, y: 12 },
  hold: { at: 0.88, dur: 0.12 },
  maskOpacity: 0.78,
} as const;

/** D-0068, D-0069, D-0070, D-0071: chapter 5, threads. */
export const T5 = {
  /** Polish pass: the card and the wall arrive while the chapter scrolls in. */
  entry: { start: "top 90%", end: "top 10%", stagger: 0.008 },
  report: { at: 0, dur: 0.14, rotateFrom: 38, rotateTo: 12, y: 60 },
  field: { at: 0.06, dur: 0.1 },
  numbers: { first: 0.08, every: 0.16, border: 0.03, draw: 0.11, stagger: 0.001, tilesAt: 0.05, tilesDur: 0.04, tileOpacity: 1 },
  release: { at: 0.74, dur: 0.03, litAt: 0.76, holdAt: 0.86, holdDur: 0.14 },
  thread: { underWidth: 5, underAlpha: 0.18, overWidth: 1.2, overAlpha: 0.95, minBend: 40, bend: 0.55 },
  hover: { others: 0.06, tilesOther: 0.18, tileIdle: 0.55, tileLit: 0.9, ringWidth: 3, ringAlpha: 0.45, ms: 160 },
} as const;

/** D-0074: removing a chip from the link (pass 1 spec; the prototype had no motion). */
export const CHIP_REMOVE = { type: "spring", durationMs: 180, bounce: 0 } as const;

/** D-0077: chapter 7, one spot many visits: visit k shows over [from + k·span/n, from + (k+1)·span/n). */
export const T7 = { from: 0.06, span: 0.84, holdAt: 0.9, holdDur: 0.1 } as const;

/** D-0080: chapter 9 mini map. */
export const C9_MAP = { dotAlpha: 0.32, pinRadius: 3, labelSize: 11, ripple: { ms: 1800, from: 4, grow: 40, width: 2, alpha: 0.9, centre: 2.4 }, unit: 420 } as const;

/** D-0029: fingerprint dust on night stickies. */
export const DUST = { glyphs: 20, cell: 5, size: 4, radius: 0.8, alpha: 0.07, width: 560, height: 360, cols: 5, colStep: 112, rowStep: 90, x0: 26, y0: 20, rowShift: 40 } as const;

/** D-0028: nav theme switches over night sections. */
export const NAV = { start: "top 40px", end: "bottom 40px", ms: 200 } as const;

/** D-0030: ScrollTrigger.refresh after layout changes. */
export const REFRESH = { minHeightChange: 2, debounceMs: 150 } as const;

/** Scene colours drawn in canvas/GL (CSS variables can't reach a texture). */
export const COLORS = {
  dotDay: "#7B8494", // D-0049
  dotNight: "#8E7BD6", // D-0049
  pin: "#4FCB8A", // D-0049: night verified
  staticLand: "rgba(169,163,194,0.55)", // D-0054
  staticPin: "#4FCB8A", // D-0054
  staticLabel: "#EDEAF6", // D-0054
  c9Land: "rgba(156,125,255,0.32)", // D-0080
  c9Ripple: "156,125,255", // D-0080
  c9Centre: "237,234,246", // D-0080
  dust: "#9C7DFF", // D-0029
  threadViolet: "156,125,255", // D-0070
  threadFlagged: "255,111,97", // D-0070
  threadMeasured: "110,162,255", // D-0070
} as const;

/** D-0045: layer art (saakshi-kit drawLayers), 1600×1200. */
export const LAYER_COLORS = {
  where: { wash: "rgba(238,242,246,0.16)", frame: "rgba(15,19,32,0.55)", ring: "rgba(255,255,255,0.95)", pinGlow: "rgba(79,203,138,0.9)", pin: "#1B7A4B", pinStroke: "#fff", panel: "rgba(15,19,32,0.84)", text: "#fff", muted: "rgba(255,255,255,0.72)" },
  finger: { wash: "rgba(75,43,143,0.06)", frame: "rgba(75,43,143,0.7)", glow: "rgba(156,125,255,0.9)", on: "rgba(92,58,170,0.92)", off: "rgba(255,255,255,0.8)" },
  ai: { frame: "rgba(15,19,32,0.4)", boxHalo: "rgba(15,19,32,0.5)", box: "#fff", chip: "#5A6678", chipText: "#fff" },
  measured: { wash: "rgba(31,93,186,0.07)", frame: "rgba(31,93,186,0.8)", tint: "#3F7FE6", glow: "rgba(110,162,255,1)" },
} as const;

/** D-0045: layer art geometry. */
export const LAYER_GEOMETRY = {
  frameWidth: 5,
  where: { pin: { x: 0.5, y: 0.86, r: 26, glow: 40, stroke: 6 }, ring: { r: 150, dash: [18, 14] }, panel: { x: 56, y: 56, w: 820, h: 250, r: 18 }, text: { x: 96, coords: 140, time: 210, extra: 272, big: 54, small: 46 } },
  finger: { size: 0.78, cellInset: 0.1, cellSize: 0.8, radius: 0.16, glow: 30, stroke: 4 },
  ai: { source: { width: 1920, height: 1440 }, halo: 9, line: 5, radius: 10, chip: { font: 36, pad: 16, h: 50, lift: 58, below: 8, baseline: 36 } },
  measured: { glow: 18 },
} as const;
