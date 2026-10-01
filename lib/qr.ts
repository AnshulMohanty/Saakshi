/**
 * Inline QR code SVG (no quiet zone: the container pads it), dark modules in a CSS variable so
 * the page theme owns the colour (landing chapter 9, the evidence page, the poster). Level M by
 * default; the poster uses Q (D-1157). The designs used qrcode-generator, which chose mask 5 for
 * its sample URL at M and mask 6 for the poster's at Q; `maskPattern` pins one for parity.
 */
import QRCode from "qrcode";

export type QrLevel = "L" | "M" | "Q" | "H";

export async function qrSvg(text: string, { color = "var(--n-background)", maskPattern, level = "M" }: { color?: string; maskPattern?: number; level?: QrLevel } = {}): Promise<string> {
  const svg = await QRCode.toString(text, { type: "svg", errorCorrectionLevel: level, margin: 0, color: { dark: "#000000", light: "#0000" }, ...(maskPattern !== undefined ? { maskPattern: maskPattern as QRCode.QRCodeMaskPattern } : {}) });
  return svg
    .replace("<svg ", '<svg width="100%" height="100%" aria-hidden="true" ')
    .replace(/<path fill="#00000000"[^>]*\/>/, "")
    .replace(/stroke="#000000"/, `style="stroke:${color}"`);
}
