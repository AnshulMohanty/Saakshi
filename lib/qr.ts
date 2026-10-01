/**
 * Inline QR code SVG (level M, no quiet zone: the container pads it), dark modules in a CSS
 * variable so the page theme owns the colour (landing chapter 9, the poster). The design used
 * qrcode-generator, which chose mask 5 for its sample URL; `maskPattern` pins one for parity.
 */
import QRCode from "qrcode";

export async function qrSvg(text: string, { color = "var(--n-background)", maskPattern }: { color?: string; maskPattern?: number } = {}): Promise<string> {
  const svg = await QRCode.toString(text, { type: "svg", errorCorrectionLevel: "M", margin: 0, color: { dark: "#000000", light: "#0000" }, ...(maskPattern !== undefined ? { maskPattern: maskPattern as QRCode.QRCodeMaskPattern } : {}) });
  return svg
    .replace("<svg ", '<svg width="100%" height="100%" aria-hidden="true" ')
    .replace(/<path fill="#00000000"[^>]*\/>/, "")
    .replace(/stroke="#000000"/, `style="stroke:${color}"`);
}
