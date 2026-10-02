/**
 * Evidence layer art (browser only): the design's SK.drawLayers (saakshi-kit.js:95-145), ported
 * with our data (B5.1, B5.2): [where, fingerprint, AI, measured] canvases at 1600×1200, used as
 * WebGL textures (lib/scenes/landing-stage.ts) and as the still stack's images.
 *
 * Changes from the prototype, all data-driven: the where panel prints the hero's own coordinates
 * and capture time; the AI layer draws the model's boxes when it returned any, else its tags as
 * chips (the vision model returns counts, not boxes); the mask is read by luminance, so both the
 * design's alpha PNGs and our greyscale masks (e_extract mode_mask) tint the same way.
 */
import { LAYER_ART, LAYER_COLORS as C, LAYER_GEOMETRY as G } from "../motion/scenes/landing";
import type { AiBox } from "../landing/types";

export interface LayerInput {
  bits: string;
  lat: number | null;
  lng: number | null;
  when: string;
  extra: string | null;
  aiBoxes: AiBox[];
  aiTags: string[];
}

type Ctx = CanvasRenderingContext2D;

function canvas(W: number, H: number, draw: (x: Ctx, W: number, H: number) => void): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  draw(c.getContext("2d")!, W, H);
  return c;
}

function rr(x: Ctx, X: number, Y: number, w: number, h: number, r: number) {
  x.beginPath();
  x.roundRect(X, Y, w, h, r);
}

/**
 * The selected area as alpha: an image with transparency is already an alpha mask (the
 * design's PNGs); an opaque one is read by luminance (our greyscale masks, white = selected).
 */
function maskAlpha(img: CanvasImageSource, W: number, H: number): HTMLCanvasElement {
  return canvas(W, H, (x) => {
    x.drawImage(img, 0, 0, W, H);
    const d = x.getImageData(0, 0, W, H);
    const p = d.data;
    let transparent = false;
    for (let i = 3; i < p.length && !transparent; i += 4) transparent = p[i] < 255;
    if (transparent) return;
    for (let i = 0; i < p.length; i += 4) {
      p[i + 3] = Math.round(p[i] * 0.2126 + p[i + 1] * 0.7152 + p[i + 2] * 0.0722);
      p[i] = p[i + 1] = p[i + 2] = 255;
    }
    x.putImageData(d, 0, 0);
  });
}

const fmt = (v: number, dir: [string, string]) => `${Math.abs(v).toFixed(5)}° ${v >= 0 ? dir[0] : dir[1]}`;

export async function drawLayers(D: LayerInput, maskImg: CanvasImageSource | null): Promise<HTMLCanvasElement[]> {
  try {
    await document.fonts.ready;
  } catch {
    /* fonts are optional for the art */
  }
  const { width: W, height: H } = LAYER_ART;
  const fw = G.frameWidth;

  const where = canvas(W, H, (x) => {
    const g = G.where;
    x.fillStyle = C.where.wash;
    x.fillRect(0, 0, W, H);
    x.strokeStyle = C.where.frame;
    x.lineWidth = fw;
    x.strokeRect(3, 3, W - 6, H - 6);
    const px = W * g.pin.x;
    const py = H * g.pin.y;
    if (D.lat !== null && D.lng !== null) {
      x.setLineDash(g.ring.dash);
      x.lineWidth = fw;
      x.strokeStyle = C.where.ring;
      x.beginPath();
      x.arc(px, py, g.ring.r, 0, 7);
      x.stroke();
      x.setLineDash([]);
      x.shadowColor = C.where.pinGlow;
      x.shadowBlur = g.pin.glow;
      x.fillStyle = C.where.pin;
      x.beginPath();
      x.arc(px, py, g.pin.r, 0, 7);
      x.fill();
      x.shadowBlur = 0;
      x.strokeStyle = C.where.pinStroke;
      x.lineWidth = g.pin.stroke;
      x.stroke();
    }
    rr(x, g.panel.x, g.panel.y, g.panel.w, g.panel.h, g.panel.r);
    x.fillStyle = C.where.panel;
    x.fill();
    x.fillStyle = C.where.text;
    x.font = `500 ${g.text.big}px "IBM Plex Mono", monospace`;
    x.fillText(D.lat !== null && D.lng !== null ? `${fmt(D.lat, ["N", "S"])}, ${fmt(D.lng, ["E", "W"])}` : "No location recorded", g.text.x, g.text.coords);
    x.font = `400 ${g.text.small}px "IBM Plex Mono", monospace`;
    x.fillText(D.when, g.text.x, g.text.time);
    if (D.extra) {
      x.fillStyle = C.where.muted;
      x.fillText(D.extra, g.text.x, g.text.extra);
    }
  });

  const finger = canvas(W, H, (x) => {
    const g = G.finger;
    x.fillStyle = C.finger.wash;
    x.fillRect(0, 0, W, H);
    x.strokeStyle = C.finger.frame;
    x.lineWidth = fw;
    x.strokeRect(3, 3, W - 6, H - 6);
    const size = H * g.size;
    const c = size / 8;
    const ox = (W - size) / 2;
    const oy = (H - size) / 2;
    for (let i = 0; i < 64; i++) {
      const r = Math.floor(i / 8);
      const k = i % 8;
      rr(x, ox + k * c + c * g.cellInset, oy + r * c + c * g.cellInset, c * g.cellSize, c * g.cellSize, c * g.radius);
      if (D.bits[i] === "1") {
        x.shadowColor = C.finger.glow;
        x.shadowBlur = g.glow;
        x.fillStyle = C.finger.on;
        x.fill();
        x.shadowBlur = 0;
      } else {
        x.lineWidth = g.stroke;
        x.strokeStyle = C.finger.off;
        x.stroke();
      }
    }
  });

  const ai = canvas(W, H, (x) => {
    const g = G.ai;
    x.strokeStyle = C.ai.frame;
    x.lineWidth = fw;
    x.strokeRect(3, 3, W - 6, H - 6);
    const chip = (t: string, X: number, ty: number) => {
      x.font = `500 ${g.chip.font}px "IBM Plex Sans", sans-serif`;
      const tw = x.measureText(t).width;
      rr(x, X, ty, tw + g.chip.pad * 2, g.chip.h, g.radius);
      x.fillStyle = C.ai.chip;
      x.fill();
      x.fillStyle = C.ai.chipText;
      x.fillText(t, X + g.chip.pad, ty + g.chip.baseline);
      return tw + g.chip.pad * 2;
    };
    for (const b of D.aiBoxes) {
      const X = b.x0 * W;
      const Y = b.y0 * H;
      const w = (b.x1 - b.x0) * W;
      const hh = (b.y1 - b.y0) * H;
      rr(x, X, Y, w, hh, g.radius);
      x.lineWidth = g.halo;
      x.strokeStyle = C.ai.boxHalo;
      x.stroke();
      x.lineWidth = g.line;
      x.strokeStyle = C.ai.box;
      x.stroke();
      chip(b.label, X, Y - g.chip.lift < 0 ? Y + g.chip.below : Y - g.chip.lift);
    }
    if (!D.aiBoxes.length) {
      // No regions from the model: its tags, as the same chips, along the top edge.
      let X = 56;
      let Y = 56;
      for (const t of D.aiTags.slice(0, 8)) {
        x.font = `500 ${g.chip.font}px "IBM Plex Sans", sans-serif`;
        const w = x.measureText(t).width + g.chip.pad * 2;
        if (X + w > W - 56) {
          X = 56;
          Y += g.chip.h + 14;
        }
        X += chip(t, X, Y) + 14;
      }
    }
  });

  const measured = canvas(W, H, (x) => {
    x.fillStyle = C.measured.wash;
    x.fillRect(0, 0, W, H);
    x.strokeStyle = C.measured.frame;
    x.lineWidth = fw;
    x.strokeRect(3, 3, W - 6, H - 6);
    if (maskImg) {
      const tinted = canvas(W, H, (y) => {
        y.drawImage(maskAlpha(maskImg, W, H), 0, 0);
        y.globalCompositeOperation = "source-in";
        y.fillStyle = C.measured.tint;
        y.fillRect(0, 0, W, H);
      });
      x.shadowColor = C.measured.glow;
      x.shadowBlur = G.measured.glow;
      x.drawImage(tinted, 0, 0);
      x.shadowBlur = 0;
    }
  });

  return [where, finger, ai, measured];
}

/** Loads an image (null on error), for the mask and textures. */
export function loadImage(src: string | null): Promise<HTMLImageElement | null> {
  if (!src) return Promise.resolve(null);
  return new Promise((r) => {
    const i = new Image();
    i.crossOrigin = "anonymous";
    i.onload = () => r(i);
    i.onerror = () => r(null);
    i.src = src;
  });
}
