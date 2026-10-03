/**
 * The shared India map (components/map/india-map.tsx): canvas colours per theme and its motion.
 * Colours drawn in canvas live here (CSS variables can't reach a canvas); everything in the DOM
 * (pins, labels, glows) uses tokens.
 */
export type MapTheme = "night" | "day" | "dark";

export const INDIA_MAP_COLORS: Record<MapTheme, { dot: string; side: string; outline: string; shadow: string }> = {
  // Night chapters (landing): violet dots over the night background, the extrusion a deeper violet.
  night: { dot: "rgba(156,125,255,0.62)", side: "rgba(74,52,150,0.55)", outline: "rgba(186,166,255,0.55)", shadow: "rgba(8,5,22,0.55)" },
  // The light app.
  day: { dot: "rgba(96,86,150,0.42)", side: "rgba(96,86,150,0.16)", outline: "rgba(75,43,143,0.45)", shadow: "rgba(40,30,80,0.10)" },
  // The dark app.
  dark: { dot: "rgba(178,166,232,0.42)", side: "rgba(110,96,180,0.22)", outline: "rgba(186,166,255,0.5)", shadow: "rgba(0,0,0,0.35)" },
};

export const INDIA_MAP_MOTION = {
  /** Resting tilt of the map plane (degrees), so it reads as a slab, not a sheet. */
  baseTilt: { stage: 22, panel: 14, interactive: 0 },
  /** Pointer parallax: degrees at the box edge, and the follow factor per frame. */
  pointer: { rotX: 5, rotY: 7, follow: 0.08 },
  /** Scroll parallax: extra tilt from the box's position in the viewport (degrees at ±1). */
  scroll: { rotX: 6 },
  /** The dotted look: at least this many pixels from one dot to the next (sparser grid when small). */
  minCellPx: 6.5,
  /** Zoomed in: past this many pixels per cell the grid halves its step (lib/map/india.ts gridStep); finer grids draw flat and lighter. */
  maxCellPx: 12,
  fineAlpha: 0.5,
  /** Extrusion: layers drawn under the top dots, and the offset of the deepest (px at k = 20). */
  depth: { layers: 3, px: 4 },
  /** Interactive: zoom per button press / wheel notch, the closest view (degrees of latitude), the fly-to duration. */
  zoom: { step: 0.6, wheel: 0.85, minSpan: 0.18, flyMs: 700 },
} as const;
