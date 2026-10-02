/**
 * On-device preview fingerprint (B5.2): the captured frame drawn small on a canvas, then the same
 * pHash as the server (lib/phash-core.ts). Shown on the capture screen until the server's hash
 * arrives; within a few bits of it, not equal (different resampling). Browser only.
 */
import { grayscale32, phashFromPixels } from "../phash-core";

/** Long edge of the intermediate canvas: big enough that area averaging, not the canvas, decides. */
const EDGE = 256;

export function previewPhash(source: CanvasImageSource, width: number, height: number): string | null {
  if (!width || !height) return null;
  const scale = Math.min(1, EDGE / Math.max(width, height));
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext("2d", { willReadFrequently: true });
  if (!g) return null;
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = "high";
  g.drawImage(source, 0, 0, w, h);
  return phashFromPixels(grayscale32(g.getImageData(0, 0, w, h).data, w, h));
}
